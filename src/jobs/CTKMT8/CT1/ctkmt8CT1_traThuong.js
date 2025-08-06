const cron = require("node-cron");
const moment = require("moment");
const db = require("../../../config/connectMySQL");
const axios = require("axios");

module.exports = () => {
  cron.schedule('5-59/10 * * * * *', async () => { // Test: chạy sau Job 1 khoảng 5 giây
    console.log("[CRON] Bắt đầu trả thưởng CTKM...");

    const startDate = moment("2025-08-01");
    const endDate = moment("2025-08-15").endOf("day");
    const today = moment();

    function formatMoney(number) {
      return Number(number).toLocaleString('en-US');
    }

    if (!today.isBetween(startDate, endDate, null, "[]")) {
      console.log("[CRON] Không nằm trong thời gian diễn ra chương trình.");
      return;
    }

    try {
      const [rows] = await db.promise().query(
        `SELECT * FROM ctkm_flash_sale_t8 WHERE IS_REWARDED = 'N'`
      );

      if (rows.length === 0) {
        console.log("[CRON] Không có khoản nào cần trả thưởng.");
        return;
      }

      const authResSecond = await axios.get(`http://${process.env.IP_SERVER}:${process.env.PORT_ACCOUNT}/auth/token`, {
        headers: {
          "grant-type": "client_credentials",
          "Authorization": "Basic " + process.env.TOKEN_ACCOUNT
        }
      });

      let rewardedCount = 0;

      for (let row of rows) {
        try {
          // 🔹 Lấy token push notification & số tài khoản nhận thưởng
          const [userInfo] = await db.promise().query(
            `SELECT 
                u.BANK_ACCOUNT_VNFITE,
                d.TOKEN
             FROM tbl_user_utility u
             LEFT JOIN tbl_user_device d 
               ON u.USER_ID = d.USER_ID AND d.IS_DELETED = 'N'
             WHERE u.USER_ID = ?
             LIMIT 1`,
            [row.USER_ID]
          );

          const token = userInfo.length > 0 ? userInfo[0].TOKEN : null;
          const bankAccount = userInfo.length > 0 ? userInfo[0].BANK_ACCOUNT_VNFITE : null;

          // 🔹 Cập nhật lãi suất & lợi nhuận mới
          const [updateResult] = await db.promise().query(
            `UPDATE tbl_user_investment_holding_product
             SET INTEREST_RATE = ?, TOTAL_PROFIT = ?
             WHERE INVESTMENT_CODE = ?`,
            [row.NEW_INTEREST_RATE, row.NEW_TOTAL_PROFIT, row.INVESTMENT_CODE]
          );

          if (updateResult.affectedRows > 0) {
            // 🔹 Đánh dấu đã trả thưởng
            const [rewardUpdate] = await db.promise().query(
              `UPDATE ctkm_flash_sale_t8
               SET IS_REWARDED = 'Y', UPDATED_AT = NOW()
               WHERE ID = ?`,
              [row.ID]
            );
            if (row.PRODUCT_ID == '37752337-3ba3-4543-b7a4-bcf95d511ff3' || row.PRODUCT_ID == '6e4bf0cf-73c9-4f7b-b483-467f64905762') {
                const plusMoneyRes = await axios.put(`http://${process.env.IP_SERVER}:${process.env.PORT_ACCOUNT}/api/v2/account/${bankAccount}`, {
                    "fluctuatedAmount": row.NEW_TOTAL_PROFIT - row.OLD_TOTAL_PROFIT,
                    "plus": true,
                    "source": "VNFFITE_CAPITAL"
                  }, {
                    headers: {
                      requestId: "1111",
                      Authorization: "Bearer " + authResSecond.data.data.accessToken
                    }
                  })
                if(plusMoneyRes?.data?.result?.isOK != true) {
                    console.log("Cộng tiền Fail: ", plusMoneyRes?.data)
                }
            }

            if (rewardUpdate.affectedRows > 0) {
              console.log(`[REWARD] Đã trả thưởng cho ${row.FULL_NAME} | Lãi mới: ${formatMoney(row.NEW_TOTAL_PROFIT)} | STK: ${bankAccount || "Không có"}`);

              // 🔹 Gửi push notification nếu có token
              if (token) {
                try {
                  // Push thông báo chính
                  await axios.post(
                    'https://service.vnfite.com.vn/push-notification/v2/notification/pushNotification',
                    {
                      alias: "tikluy",
                      fcmToken: token,
                      title: "Trả thưởng FLASH SALE",
                      body: `Chúc mừng! Bạn đã nhận thêm 2% lãi suất từ TIKLUY\nChúc mừng Bạn đã thỏa mãn điều kiện chương trình "Tặng lãi suất ngay – Tiền vào tận tay" với:\nKhoản đầu tư: ${row.PRODUCT_NAME}\nMã đầu tư: ${row.INVESTMENT_CODE}\nCảm ơn Bạn đã tin tưởng đồng hành cùng TIKLUY trong chương trình ưu đãi đặc biệt lần này!`
                    }
                  );

                  // Nếu đúng PRODUCT_ID → gửi thêm thông báo "Trả thêm tiền lãi từ CTKM"
                  if (row.PRODUCT_ID == '37752337-3ba3-4543-b7a4-bcf95d511ff3' || row.PRODUCT_ID == '6e4bf0cf-73c9-4f7b-b483-467f64905762') {
                    await axios.post(
                      'https://service.vnfite.com.vn/push-notification/v2/notification/pushNotification',
                      {
                        alias: "tikluy",
                        fcmToken: token,
                        title: "Trả thêm tiền lãi từ CTKM",
                        body: `Bạn đã nhận thêm ${formatMoney(row.NEW_TOTAL_PROFIT - row.OLD_TOTAL_PROFIT)} VNĐ tiền lãi từ chương trình FLASH SALE cho sản phẩm ${row.PRODUCT_NAME}.`
                      }
                    );
                  }

                  console.log(`[PUSHED] Gửi noti thành công tới: ${row.FULL_NAME}`);
                } catch (error) {
                  console.log("push noti failed: ", JSON.stringify(error));
                }
              } else {
                console.log(`[PUSH] Không tìm thấy token cho ${row.FULL_NAME}`);
              }

              rewardedCount++;
            }
          }
        } catch (err) {
          console.error(`[ERROR] Lỗi khi trả thưởng cho ${row.FULL_NAME}:`, err.message);
        }
      }

      console.log(`[CRON] Hoàn thành trả thưởng cho ${rewardedCount} khoản.`);
    } catch (err) {
      console.error("[CRON] Lỗi khi lấy danh sách trả thưởng:", err.message);
    }
  });
};
