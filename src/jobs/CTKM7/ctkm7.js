//FLASH SALE 20/11 – MAY MẮN NHÂN ĐÔI CÙNG TIKLUY
const cron = require("node-cron");
const moment = require("moment-timezone");
const db = require("../../config/connectMySQL");
const axios = require("axios");


const PROGRAM_START = moment.tz("2025-11-20 00:00:00", "Asia/Ho_Chi_Minh");
const PROGRAM_END = moment.tz("2025-11-27 23:59:59", "Asia/Ho_Chi_Minh");

async function initTables() {
    await db.promise().query(`
        CREATE TABLE IF NOT EXISTS ctkm_7 (
          ID INT AUTO_INCREMENT PRIMARY KEY,
          INVESTMENT_CODE VARCHAR(100) NOT NULL,
          USER_ID VARCHAR(100) NOT NULL,
          FULL_NAME VARCHAR(255),
          PRODUCT_ID VARCHAR(100) NOT NULL,
          PRODUCT_NAME VARCHAR(255),
          AMOUNT BIGINT,
          START_DATE DATETIME,
          REWARD_MONEY BIGINT,
          IS_PAID ENUM('Y','N') DEFAULT 'N',
          PAID_DATE DATETIME NULL,
          CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
          UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY unique_investment (INVESTMENT_CODE)
        )
      `);

    console.log("✅ Bảng ctkm7 đã sẵn sàng");
}

module.exports = () => {
    initTables();
    cron.schedule("*/10 * * * *", async () => {
        const now = moment.tz("Asia/Ho_Chi_Minh");
        console.log("🔍 Checking ctkm FLASH SALE 20/11 – MAY MẮN NHÂN ĐÔI CÙNG TIKLUY", now.format("YYYY-MM-DD HH:mm:ss"));
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
               AND t.AMOUNT >= 10000000
               AND t.STATUS = 0
               AND t.INTEREST_RATE_UNIT = 1
               AND t.INTEREST_RATE_PERIOD >= 6
               AND t.START_DATE BETWEEN ? AND ?
               AND t.INVESTMENT_HOLDING_PRODUCT_ID IN (?)
            `,
            [PROGRAM_START.format("YYYY-MM-DD HH:mm:ss"), PROGRAM_END.format("YYYY-MM-DD HH:mm:ss"), allowedIds]
        );
        for (const row of results) {
            const rewardData = 100000; // Thưởng cố định 100,000 VND
            try {
                // Kiểm tra xem đã tồn tại trong bảng ctkm_7 chưa
                const [existing] = await db.promise().query(
                    `SELECT * FROM ctkm_7 WHERE INVESTMENT_CODE = ?`,
                    [row.INVESTMENT_CODE]
                );
                if (existing.length > 0) {
                    console.log(`Đã tồn tại thưởng cho mã đầu tư ${row.INVESTMENT_CODE}, bỏ qua.`);
                    continue;
                }
                // Chèn dữ liệu vào bảng ctkm_7
                await db.promise().query(
                    `INSERT INTO ctkm_7 
                    (INVESTMENT_CODE, USER_ID, FULL_NAME, PRODUCT_ID, PRODUCT_NAME, AMOUNT, START_DATE, REWARD_MONEY) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        row.INVESTMENT_CODE,
                        row.USER_ID,
                        row.FULL_NAME,
                        row.INVESTMENT_HOLDING_PRODUCT_ID,
                        row.PRODUCT_NAME,
                        row.AMOUNT,
                        row.START_DATE,
                        rewardData
                    ]
                );
                console.log(`Thêm thưởng cho mã đầu tư ${row.INVESTMENT_CODE} thành công.`);
            } catch (error) {
                console.error(`Lỗi khi xử lý mã đầu tư ${row.INVESTMENT_CODE}:`, error);
            }
        }
    })
}