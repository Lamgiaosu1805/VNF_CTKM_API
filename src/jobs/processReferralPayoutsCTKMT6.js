const cron = require("node-cron");
const db = require("../config/connectMySQL");

module.exports = () => {
  cron.schedule("*/2 * * * *", async () => {
    console.log("\n[RewardPayoutJob] Bắt đầu xử lý trả thưởng...");

    try {
      const pendingRewards = await getPendingRewards();

      for (const reward of pendingRewards) {
        const token = await getUserFirebaseToken(reward.user_id);

        // 📌 Log thông tin chuẩn bị gọi API
        console.log("🎯 Trả thưởng:", {
          user_id: reward.user_id,
          name: reward.full_name,
          account: reward.bank_account,
          amount: reward.reward_amount,
          type: reward.reward_type,
          token: token || "Không có token"
        });

        // 📌 TODO: Gọi API trả tiền tại đây
        // const isPaymentSuccess = true; // Giả lập kết quả

        // if (isPaymentSuccess) {
        //   await markRewardAsSuccess(reward.id);
        //   console.log(`✅ Đã cập nhật trạng thái success cho reward ID: ${reward.id}`);
        // } else {
        //   console.log(`❌ Lỗi trả thưởng cho reward ID: ${reward.id}`);
        //   // Có thể log lỗi vào bảng khác nếu cần
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