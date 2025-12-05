// AN TÂM TIKLUY – SINH LỜI ĐỈNH CAO
const cron = require("node-cron");
const moment = require("moment-timezone");
const db = require("../../config/connectMySQL");
const axios = require("axios");


const PROGRAM_START = moment.tz("2025-11-28 00:00:00", "Asia/Ho_Chi_Minh");
const PROGRAM_END = moment.tz("2025-12-23 23:59:59", "Asia/Ho_Chi_Minh");

module.exports = () => {
    const createTableIfNotExists = async () => {
        await db.promise().query(`
      CREATE TABLE IF NOT EXISTS ctkm_6 (
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
        CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
        UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_investment (INVESTMENT_CODE)
      )
    `);
    };
    function formatMoney(number) {
        return Number(number).toLocaleString('en-US');
    }

    // Hàm tính thưởng
    const calculateReward = (amount, period) => {
        let percent = 0;
        if (period >= 1 && period < 3) {
            percent = 0.01
        }
        else if (period >= 3 && period <= 6) {
            percent = 0.015;
        } else if (period >= 9) {
            percent = 0.02;
        }
        const reward = amount * percent * (period / 12);
        return { percent, reward: Math.floor(reward) };
    };

    cron.schedule("*/10 * * * *", async () => {
        const now = moment.tz("Asia/Ho_Chi_Minh");


        console.log("🔍 Checking ctkm AN TÂM TIKLUY – SINH LỜI ĐỈNH CAO", now.format("YYYY-MM-DD HH:mm:ss"));
        if (now.isBefore(PROGRAM_START) || now.isAfter(PROGRAM_END)) {
            console.log("[CRON] Không nằm trong thời gian diễn ra chương trình.");
            return
        };

        await createTableIfNotExists();

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
         AND t.INTEREST_RATE_PERIOD >= 1
         AND t.START_DATE BETWEEN ? AND ?
         AND t.INVESTMENT_HOLDING_PRODUCT_ID IN (?)
      `,
            [PROGRAM_START.format("YYYY-MM-DD HH:mm:ss"), PROGRAM_END.format("YYYY-MM-DD HH:mm:ss"), allowedIds]
        );
        const authResSecond = await axios.get(`http://${process.env.IP_SERVER}:${process.env.PORT_ACCOUNT}/auth/token`, {
            headers: {
                "grant-type": "client_credentials",
                "Authorization": "Basic " + process.env.TOKEN_ACCOUNT
            }
        });

        for (const row of results) {
            const { percent, reward } = calculateReward(row.AMOUNT, row.INTEREST_RATE_PERIOD);

            if (reward > 0) {
                // check nếu đã tồn tại
                const [exist] = await db
                    .promise()
                    .query(
                        `SELECT 1 FROM ctkm_6 WHERE INVESTMENT_CODE = ? LIMIT 1`,
                        [row.INVESTMENT_CODE]
                    );

                if (exist.length > 0) {
                    console.log(`[SKIP] ${row.INVESTMENT_CODE} đã được insert trước đó.`);
                    continue;
                }

                // insert mới
                await db.promise().query(
                    `INSERT INTO ctkm_6 
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
                        percent,
                        reward,
                    ]
                );
                console.log(
                    `[SAVE] ${row.USER_ID} - ${row.AMOUNT} - ${row.INTEREST_RATE_PERIOD} tháng => Thưởng: ${reward}`
                );
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
                try {
                    const plusMoneyRes = await axios.put(`http://${process.env.IP_SERVER}:${process.env.PORT_ACCOUNT}/api/v2/account/${bankAccount}`, {
                        "fluctuatedAmount": reward,
                        "plus": true,
                        "source": "VNFFITE_CAPITAL",
                        "content": `Ưu đãi cộng tiền về tài khoản CTKM AN TÂM TIKLUY – SINH LỜI ĐỈNH CAO của khoản đầu tư ${row.INVESTMENT_CODE}`
                    }, {
                        headers: {
                            requestId: "ctkm_6",
                            Authorization: "Bearer " + authResSecond.data.data.accessToken
                        }
                    })
                    if (plusMoneyRes?.data?.result?.isOK != true) {
                        console.log("Cộng tiền Fail: ", plusMoneyRes?.data)
                    }
                    else {
                        console.log(`Đã trả tiền ưu đãi về tài khoản ${bankAccount}`)
                    }
                } catch (err) {
                    console.error(`[API] Lỗi khi cộng tiền cho ${row.USER_ID}:`, err.message);
                }
                if (token) {
                    try {
                        await axios.post(
                            'https://service.vnfite.com.vn/push-notification/v2/notification/pushNotification',
                            {
                                alias: "tikluy",
                                fcmToken: token,
                                title: "AN TÂM TIKLUY – SINH LỜI ĐỈNH CAO",
                                body: `Chúc mừng bạn đã nhận được ưu đãi ${formatMoney(reward)} VNĐ vào tài khoản TIKLUY\nKhoản đầu tư: ${row.PRODUCT_NAME}\nMã đầu tư: ${row.INVESTMENT_CODE}\nCảm ơn Bạn đã tin tưởng đồng hành cùng TIKLUY !`
                            }
                        );
                        console.log(`[PUSHED] Gửi noti thành công tới: ${row.FULL_NAME}`);
                    } catch (error) {
                        console.log("push noti failed: ", JSON.stringify(error));
                    }
                } else {
                    console.log(`[PUSH] Không tìm thấy token cho ${row.FULL_NAME}`);
                }
            }
        }
    });
};
