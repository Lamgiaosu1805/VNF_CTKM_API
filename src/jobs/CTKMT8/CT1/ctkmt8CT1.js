const cron = require("node-cron");
const moment = require("moment");
const db = require("../../../config/connectMySQL");

module.exports = () => {
  const createTableIfNotExists = async () => {
    await db.promise().query(`
      CREATE TABLE IF NOT EXISTS ctkm_flash_sale_t8 (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        INVESTMENT_CODE VARCHAR(100) NOT NULL,
        USER_ID VARCHAR(100) NOT NULL,
        FULL_NAME VARCHAR(255),
        PRODUCT_ID VARCHAR(100) NOT NULL,
        PRODUCT_NAME VARCHAR(255),
        AMOUNT BIGINT,
        START_DATE DATETIME,
        OLD_INTEREST_RATE FLOAT,
        NEW_INTEREST_RATE FLOAT,
        OLD_TOTAL_PROFIT BIGINT,
        NEW_TOTAL_PROFIT BIGINT,
        IS_REWARDED ENUM('Y','N') DEFAULT 'N',
        CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
        UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_investment (INVESTMENT_CODE)
      )
    `);
  };

  cron.schedule('*/10 * * * *', async () => { // Test mỗi 10 giây
    console.log("[CRON] Bắt đầu kiểm tra ưu đãi tích lũy...");

    const startDate = moment("2025-08-01");
    const endDate = moment("2025-08-15").endOf("day");
    const today = moment();

    if (!today.isBetween(startDate, endDate, null, "[]")) {
      console.log("[CRON] Không nằm trong thời gian diễn ra chương trình.");
      return;
    }

    await createTableIfNotExists();

    const allowedIds = [
      '9901eace-16a5-48ce-a0a9-39a886a4c620',
      'dfaa0359-d4c1-484c-934b-f89085e607f9',
      'ef7514b3-46c0-44e2-b5cb-4eb5125e04f8',
      '726e5848-0d51-4ced-9a84-bc325923c848',
      'a51b0e23-87e4-4ff0-8651-a1a0015d42c4',
      'b27d4ab4-b0af-4a7e-bdb5-c52a7fd2433c',
      '37752337-3ba3-4543-b7a4-bcf95d511ff3',
      '6e4bf0cf-73c9-4f7b-b483-467f64905762'
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
          t.INVESTMENT_HOLDING_PRODUCT_ID
       FROM tbl_user_investment_holding_product t
       LEFT JOIN tbl_identification_info i ON t.USER_ID = i.USER_ID
       LEFT JOIN tbl_investment_holding_product p ON t.INVESTMENT_HOLDING_PRODUCT_ID = p.ID
       WHERE t.IS_DELETED = 'N'
         AND t.AMOUNT >= 5000000
         AND t.STATUS = 0
         AND t.INTEREST_RATE_UNIT = 1
         AND t.START_DATE BETWEEN ? AND ?
         AND t.INVESTMENT_HOLDING_PRODUCT_ID IN (?)
      `,
      [startDate.format("YYYY-MM-DD"), endDate.format("YYYY-MM-DD"), allowedIds]
    );

    if (results.length === 0) {
      console.log("[CRON] Không tìm thấy khoản đầu tư đủ điều kiện.");
      return;
    }

    let insertedCount = 0;

    for (let row of results) {
      try {
        const amount = parseFloat(row.AMOUNT);
        const oldInterestRate = parseFloat(row.INTEREST_RATE);
        const newInterestRate = oldInterestRate + 2;
        const oldTotalProfit = parseFloat(row.TOTAL_PROFIT);

        const days = (oldTotalProfit / 0.95 * 365 * 100) / (amount * oldInterestRate);
        const extraProfit = (amount * 2 / 100 / 365) * days * 0.95;
        const newTotalProfit = oldTotalProfit + extraProfit;

        const [insertResult] = await db.promise().query(
          `INSERT IGNORE INTO ctkm_flash_sale_t8 
            (INVESTMENT_CODE, USER_ID, FULL_NAME, PRODUCT_NAME, AMOUNT, START_DATE, 
             OLD_INTEREST_RATE, NEW_INTEREST_RATE, OLD_TOTAL_PROFIT, NEW_TOTAL_PROFIT, IS_REWARDED, PRODUCT_ID)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'N', ?)`,
          [
            row.INVESTMENT_CODE,
            row.USER_ID,
            row.FULL_NAME || '',
            row.PRODUCT_NAME || '',
            amount,
            row.START_DATE,
            oldInterestRate,
            newInterestRate,
            oldTotalProfit,
            newTotalProfit,
            row.INVESTMENT_HOLDING_PRODUCT_ID
          ]
        );

        if (insertResult.affectedRows > 0) {
          console.log(`[DB] Thêm mới: ${row.FULL_NAME} | Lãi cũ: ${oldTotalProfit} | Lãi mới: ${newTotalProfit}`);
          insertedCount++;
        }
      } catch (err) {
        console.error("[DB] Lỗi khi lưu dữ liệu:", err);
      }
    }

    console.log(`[CRON] Hoàn thành. Đã thêm mới ${insertedCount} khoản vào DB.`);
  });
};
