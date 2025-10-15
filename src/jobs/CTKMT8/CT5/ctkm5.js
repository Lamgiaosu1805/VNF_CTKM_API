//TIKLUY cùng Nàng – Gửi ngàn yêu thương
const cron = require("node-cron");
const moment = require("moment-timezone");
const db = require("../../../config/connectMySQL");

const PROGRAM_START = moment.tz("2025-10-15 00:00:00", "Asia/Ho_Chi_Minh");
const PROGRAM_END = moment.tz("2025-10-22 23:59:59", "Asia/Ho_Chi_Minh");

async function initTables() {
    await db.promise().query(`
        CREATE TABLE IF NOT EXISTS ctkm_5 (
          ID INT AUTO_INCREMENT PRIMARY KEY,
          INVESTMENT_CODE VARCHAR(100) NOT NULL,
          USER_ID VARCHAR(100) NOT NULL,
          FULL_NAME VARCHAR(255),
          PRODUCT_ID VARCHAR(100) NOT NULL,
          PRODUCT_NAME VARCHAR(255),
          AMOUNT BIGINT,
          START_DATE DATETIME,
          REWARD_PERCENT FLOAT,
          REWARD_MONEY BIGINT,
          IS_PAID ENUM('Y','N') DEFAULT 'N',
          PAID_DATE DATETIME NULL,
          CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
          UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_investment (INVESTMENT_CODE)
        )
      `);

    //     await db.promise().query(`
    //     CREATE TABLE IF NOT EXISTS tbl_promo_investment_log (
    //       ID VARCHAR(40) PRIMARY KEY DEFAULT (UUID()),
    //       USER_ID VARCHAR(40) NOT NULL,
    //       INVEST_ID VARCHAR(40) NOT NULL,
    //       MISSION_ID INT NOT NULL,
    //       CREATED_DATE DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    //       UNIQUE KEY uq_user_invest (USER_ID, INVEST_ID)
    //     )
    //   `);

    console.log("✅ Bảng ctkm5 đã sẵn sàng");
}

// Hàm tính thưởng
const calculateReward = (amount) => {
    const reward = amount * 0.25 / 100;
    return { percent: 0.25 / 100, reward: Math.floor(reward) };
};

module.exports = () => {

    initTables();
    cron.schedule("0 */5 * * * *", async () => {
        const now = moment.tz("Asia/Ho_Chi_Minh");


        console.log("🔍 Checking ctkm TIKLUY cùng Nàng – Gửi ngàn yêu thương", now.format("YYYY-MM-DD HH:mm:ss"));
        if (now.isBefore(PROGRAM_START) || now.isAfter(PROGRAM_END)) {
            console.log("[CRON] Không nằm trong thời gian diễn ra chương trình.");
            return
        };

        const allowedIds = [
            "9901eace-16a5-48ce-a0a9-39a886a4c620",
            "dfaa0359-d4c1-484c-934b-f89085e607f9",
            "ef7514b3-46c0-44e2-b5cb-4eb5125e04f8",
            "726e5848-0d51-4ced-9a84-bc325923c848",
            "a51b0e23-87e4-4ff0-8651-a1a0015d42c4",
            "b27d4ab4-b0af-4a7e-bdb5-c52a7fd2433c",
            "37752337-3ba3-4543-b7a4-bcf95d511ff3",
            "6e4bf0cf-73c9-4f7b-b483-467f64905762",
        ];

        const [results] = await db.promise().query(
            `SELECT 
                t.INVESTMENT_CODE,
                t.USER_ID,
                i.FULL_NAME, 
                p.TITLE AS PRODUCT_NAME,
                t.AMOUNT,
                t.START_DATE,
                t.INTEREST_RATE,
                t.TOTAL_PROFIT,
                t.INVESTMENT_HOLDING_PRODUCT_ID,
                t.INTEREST_RATE_PERIOD
             FROM tbl_user_investment_holding_product t
             LEFT JOIN tbl_identification_info i ON t.USER_ID = i.USER_ID
             LEFT JOIN tbl_investment_holding_product p ON t.INVESTMENT_HOLDING_PRODUCT_ID = p.ID
             WHERE t.IS_DELETED = 'N'
               AND t.AMOUNT >= 5000000
               AND t.STATUS = 0
               AND t.INTEREST_RATE_UNIT = 1
               AND t.INTEREST_RATE_PERIOD >= 3
               AND t.START_DATE BETWEEN ? AND ?
               AND t.INVESTMENT_HOLDING_PRODUCT_ID IN (?)
            `,
            [PROGRAM_START.format("YYYY-MM-DD HH:mm:ss"), PROGRAM_END.format("YYYY-MM-DD HH:mm:ss"), allowedIds]
          );

          for (const row of results) {
            const { reward } = calculateReward(row.AMOUNT);
      
            if (reward > 0) {
              // check nếu đã tồn tại
              const [exist] = await db
                .promise()
                .query(
                  `SELECT 1 FROM ctkm_5 WHERE INVESTMENT_CODE = ? LIMIT 1`,
                  [row.INVESTMENT_CODE]
                );
      
              if (exist.length > 0) {
                console.log(`[SKIP] ${row.INVESTMENT_CODE} đã được insert trước đó.`);
                continue;
              }
      
              // insert mới
              await db.promise().query(
                `INSERT INTO ctkm_5 
                (INVESTMENT_CODE, USER_ID, FULL_NAME, PRODUCT_ID, PRODUCT_NAME, AMOUNT, START_DATE, REWARD_PERCENT, REWARD_MONEY)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  row.INVESTMENT_CODE,
                  row.USER_ID,
                  row.FULL_NAME,
                  row.INVESTMENT_HOLDING_PRODUCT_ID,
                  row.PRODUCT_NAME,
                  row.AMOUNT,
                  row.START_DATE,
                  0.25,
                  reward,
                ]
              );
              console.log(
                `[SAVE] ${row.USER_ID} - ${row.AMOUNT} - ${row.INTEREST_RATE_PERIOD} tháng => Thưởng: ${reward}`
              );
              // 🔹 Lấy token push notification & số tài khoản nhận thưởng
            //   const [userInfo] = await db.promise().query(
            //       `SELECT 
            //           u.BANK_ACCOUNT_VNFITE,
            //           d.TOKEN
            //        FROM tbl_user_utility u
            //        LEFT JOIN tbl_user_device d 
            //          ON u.USER_ID = d.USER_ID AND d.IS_DELETED = 'N'
            //        WHERE u.USER_ID = ?
            //        LIMIT 1`,
            //       [row.USER_ID]
            //     );
      
            //   const token = userInfo.length > 0 ? userInfo[0].TOKEN : null;
            //   const bankAccount = userInfo.length > 0 ? userInfo[0].BANK_ACCOUNT_VNFITE : null;
            //   try {
            //       const plusMoneyRes = await axios.put(`http://${process.env.IP_SERVER}:${process.env.PORT_ACCOUNT}/api/v2/account/${bankAccount}`, {
            //           "fluctuatedAmount": reward,
            //           "plus": true,
            //           "source": "VNFFITE_CAPITAL",
            //           "content": `Ưu đãi cộng tiền về tài khoản CTKM TIKLUY THÔNG MINH RINH ƯU ĐÃI KHỦNG của khoản đầu tư ${row.INVESTMENT_CODE}`
            //         }, {
            //           headers: {
            //             requestId: "ctkm_t8_ct2",
            //             Authorization: "Bearer " + authResSecond.data.data.accessToken
            //           }
            //         })
            //       if(plusMoneyRes?.data?.result?.isOK != true) {
            //           console.log("Cộng tiền Fail: ", plusMoneyRes?.data)
            //       }
            //       else {
            //           console.log(`Đã trả tiền ưu đãi về tài khoản ${bankAccount}`)
            //       }
            //   } catch (err) {
            //       console.error(`[API] Lỗi khi cộng tiền cho ${row.USER_ID}:`, err.message);
            //   }
            //   if(token) {
            //       try {
            //           await axios.post(
            //               'https://service.vnfite.com.vn/push-notification/v2/notification/pushNotification',
            //               {
            //                 alias: "tikluy",
            //                 fcmToken: token,
            //                 title: "TIKLUY THÔNG MINH - RINH ƯU ĐÃI KHỦNG",
            //                 body: `Chúc mừng bạn đã nhận được ưu đãi ${formatMoney(reward)} VNĐ vào tài khoản TIKLUY\nKhoản đầu tư: ${row.PRODUCT_NAME}\nMã đầu tư: ${row.INVESTMENT_CODE}\nCảm ơn Bạn đã tin tưởng đồng hành cùng TIKLUY !`
            //               }
            //           );
            //           console.log(`[PUSHED] Gửi noti thành công tới: ${row.FULL_NAME}`);
            //       } catch (error) {
            //           console.log("push noti failed: ", JSON.stringify(error));
            //       }
            //   } else {
            //       console.log(`[PUSH] Không tìm thấy token cho ${row.FULL_NAME}`);
            //   }
            }
          }
    });
};