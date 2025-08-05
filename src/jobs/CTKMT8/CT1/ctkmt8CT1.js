const cron = require("node-cron");
const moment = require("moment");
const db = require("../../../config/connectMySQL");
const axios = require("axios");

module.exports = () => {
  cron.schedule('*/10 * * * *', async () => {
    console.log("[CRON] Bắt đầu kiểm tra ưu đãi tích lũy...");

    const startDate = moment("2025-08-01");
    const endDate = moment("2025-08-15").endOf("day");
    const today = moment();

    if (!today.isBetween(startDate, endDate, null, "[]")) {
      console.log("[CRON] Không nằm trong thời gian diễn ra chương trình.");
      return;
    }

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
            t.*, 
            i.FULL_NAME, 
            p.TITLE AS PRODUCT_NAME 
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
      console.log(results)
      console.log(results.length)
  });
};
