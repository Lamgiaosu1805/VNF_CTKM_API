const cron = require("node-cron");
const db = require("../config/connectMySQL");
const { default: axios } = require("axios");

module.exports = () => {
  const allowedRunDates = [
    '2025-06-22',
    '2025-06-24',
    '2025-06-29',
    '2025-07-06',
    '2025-07-13',
    '2025-07-16'
  ];
  cron.schedule("35 8 * * *", async () => {
    const now = new Date();
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);

    // Nếu sau ngày cuối hoặc không nằm trong danh sách cho phép
    const maxDate = '2025-07-16';
    if (today > maxDate) {
      console.log('[RewardPayoutJob] ❌ Job không khả dụng sau ngày 16/07/2025.');
      return;
    }

    if (!allowedRunDates.includes(today)) {
      console.log(`[RewardPayoutJob] ⚠️ Hôm nay (${today}) không phải lịch chạy job.`);
      return;
    }

    console.log(`[RewardPayoutJob] ✅ Bắt đầu xử lý vào lúc 21h ngày ${today}...`);
    console.log("\n[RewardPayoutJob] Bắt đầu xử lý trả thưởng...");
    try {
      const authRes = await axios.post('https://service.tikluy.com.vn/cms/auth/cms', {
        username: process.env.AUTH_USERNAME,
        password: process.env.AUTH_PASSWORD,
        deviceId: "12dfaf12"
      }, {
        headers: {
          transactionId: "12okdsol1"
        }
      })
      const authResSecond = await axios.get('http://42.113.122.155:8888/auth/token', {
        headers: {
          "grant-type": "client_credentials",
          "Authorization": "Basic " + process.env.TOKEN_ACCOUNT
        }
      })
      // console.log(authResSecond.data)
      const pendingRewards = await getPendingRewards();

      for (const reward of pendingRewards) {
        const token = await getUserFirebaseToken(reward.user_id);

        // if(token == "fNTNjVtvfkvMmhhg1exVJD:APA91bGTHYnt_mZsgP1Ju8zxG-FhqDDhILONe5n-nbbNGVD4DlJLhgyZ_zkM5yWxNNE-7Q5gt6uF6vhS2GhVD_4rH5Mu-zPjiPWgMDuyq-ZR1xsMflH0794") {

          // 📌 Log thông tin chuẩn bị gọi API
          console.log("🎯 Trả thưởng:", {
            user_id: reward.user_id,
            name: reward.full_name,
            account: reward.bank_account,
            amount: reward.reward_amount,
            type: reward.reward_type,
            token: token || "Không có token"
          });
          try {
            const plusMoneyRes = await axios.put(`http://42.113.122.155:8888/api/v2/account/${reward.bank_account}`, {
              "fluctuatedAmount": reward.reward_amount,
              "plus": true,
              "source": "VNFFITE_CAPITAL"
            }, {
              headers: {
                requestId: "1111",
                Authorization: "Bearer " + authResSecond.data.data.accessToken
              }
            })
            if(plusMoneyRes?.data?.result?.isOK == true) {
              await markRewardAsSuccess(reward.id);
              console.log(`✅ Đã cập nhật trạng thái success cho reward ID: ${reward.id}`);
              try {
                await axios.post('https://service.tikluy.com.vn/cms/notification/create-export', {
                  "type": 1,
                  "title": "Trả thưởng CTKM",
                  "content1": `Bạn đã được cộng ${formatMoney(reward.reward_amount)} VNĐ qua chương trình giới thiệu bạn bè của TIKLUY. Thời gian chương trình: 15/06/2025 – 15/07/2025`,
                  "content2": `Số dư TK: ${formatMoney(plusMoneyRes?.data?.data)} VNĐ`,
                  "amount": reward.reward_amount,
                  "userId": reward.user_id,
                  "category": "IN"
                }, {
                  headers: {
                    transactionId: "CTKM",
                    Authorization: "Bearer " + authRes.data.data.authInfo.accessToken
                  }
                })
              } catch (error) {
                console.log("Lỗi thêm thông báo: ", JSON.stringify(error))
              }
              try {
                await axios.post('https://service.vnfite.com.vn/push-notification/v2/notification/pushNotification', {
                  "alias": "tikluy",
                  "fcmToken": token,
                  "title": "Trả thưởng CTKM",
                  "body": `Bạn đã được cộng ${formatMoney(reward.reward_amount)} VNĐ qua chương trình giới thiệu bạn bè của TIKLUY\nThời gian chương trình: 15/06/2025 – 15/07/2025`
                })
              } catch (error) {
                console.log("push noti failed: ", JSON.stringify(error))
              }
            } else {
              console.log(`❌ Lỗi trả thưởng cho reward ID: ${reward.id}`);
            }
          } catch (error) {
            console.log(error)
          } 
        // } 
      }
      console.log("[RewardPayoutJob] ✅ Đã xử lý xong trả thưởng.");
    } catch (error) {
      console.error("❌ Lỗi trong RewardPayoutJob:", error);
    }
  });
};

async function getPendingRewards() {
  const sql = `
    SELECT id, user_id, full_name, bank_account, reward_amount, reward_type
    FROM referral_reward_logs
    WHERE status = 'pending'
  `;
  return new Promise((resolve, reject) => {
    db.query(sql, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

function formatMoney(number) {
  return Number(number).toLocaleString('en-US');
}

async function getUserFirebaseToken(userId) {
  const sql = `
    SELECT TOKEN FROM tbl_user_device
    WHERE USER_ID = ? AND IS_DELETED = 'N'
    LIMIT 1
  `;
  return new Promise((resolve, reject) => {
    db.query(sql, [userId], (err, results) => {
      if (err) return reject(err);
      if (results.length === 0) return resolve(null);
      resolve(results[0].TOKEN);
    });
  });
}

async function markRewardAsSuccess(rewardId) {
  const sql = `
    UPDATE referral_reward_logs
    SET status = 'success', sent_at = NOW()
    WHERE id = ?
  `;
  return new Promise((resolve, reject) => {
    db.query(sql, [rewardId], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}