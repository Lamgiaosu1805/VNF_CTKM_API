const cron = require("node-cron");
const moment = require("moment");
const db = require("../../../config/connectMySQL");
const axios = require("axios");

module.exports = () => {
  cron.schedule("*/10 * * * * *", async () => {
    console.log("[CRON] Bắt đầu kiểm tra ưu đãi tích lũy...");

    const startDate = moment("2025-07-18");
    const endDate = moment("2025-08-31").endOf("day");
    const today = moment();

    if (!today.isBetween(startDate, endDate, null, "[]")) {
      console.log("[CRON] Không nằm trong thời gian diễn ra chương trình.");
      return;
    }

    try {
      // 1. Tạo bảng log nếu chưa có (đã loại bỏ CREATED_DATE)
      await db.promise().query(`
        CREATE TABLE IF NOT EXISTS tbl_ctkm_t7_1 (
          ID VARCHAR(36) PRIMARY KEY,
          USER_ID VARCHAR(36),
          FULL_NAME VARCHAR(255),
          INVESTMENT_CODE VARCHAR(50),
          PRODUCT_NAME VARCHAR(255),
          oldRate FLOAT,
          bonusRate FLOAT,
          newRate FLOAT,
          oldProfit BIGINT,
          newProfit BIGINT,
          CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const allowedIds = [
        '9901eace-16a5-48ce-a0a9-39a886a4c620',
        'dfaa0359-d4c1-484c-934b-f89085e607f9',
        'ef7514b3-46c0-44e2-b5cb-4eb5125e04f8',
        '726e5848-0d51-4ced-9a84-bc325923c848',
        'a51b0e23-87e4-4ff0-8651-a1a0015d42c4',
        'b27d4ab4-b0af-4a7e-bdb5-c52a7fd2433c'
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

      let inserted = 0;

      for (const item of results) {
        const [logExists] = await db.promise().query(
          `SELECT 1 FROM tbl_ctkm_t7_1 WHERE ID = ?`,
          [item.ID]
        );
        if (logExists.length > 0) continue;

        const period = Number(item.INTEREST_RATE_PERIOD);
        const interest = parseFloat(item.INTEREST_RATE);
        let bonusRate = 0;

        if (period >= 1 && period <= 2) bonusRate = 0.2;
        else if (period >= 3 && period <= 6) bonusRate = 0.5;
        else if (period >= 9 && period <= 12) bonusRate = 1.0;
        else if (period >= 13 && period <= 18) bonusRate = 1.25;
        else if (period >= 24 && period <= 36) bonusRate = 1.5;

        if (bonusRate > 0) {
          const newRate = parseFloat((interest + bonusRate).toFixed(2));
          const amount = parseFloat(item.AMOUNT);
          const oldProfit = Math.floor((amount * interest * period) / 12 / 100);
          const newProfit = Math.floor((amount * newRate * period) / 12 / 100);

          // Insert log (KHÔNG còn CREATED_DATE)
          await db.promise().query(
            `INSERT INTO tbl_ctkm_t7_1
             (ID, USER_ID, FULL_NAME, INVESTMENT_CODE, PRODUCT_NAME, oldRate, bonusRate, newRate, oldProfit, newProfit)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.ID,
              item.USER_ID,
              item.FULL_NAME || "(Không có tên)",
              item.INVESTMENT_CODE || "N/A",
              item.PRODUCT_NAME || "N/A",
              interest,
              bonusRate,
              newRate,
              oldProfit,
              newProfit
            ]
          );

          // Update bảng gốc
          await db.promise().query(
            `UPDATE tbl_user_investment_holding_product
             SET INTEREST_RATE = ?, TOTAL_PROFIT = ?
             WHERE ID = ?`,
            [newRate, newProfit, item.ID]
          );

          // Lấy token thiết bị để gửi push
          const [tokenRows] = await db.promise().query(
            `SELECT TOKEN FROM tbl_user_device 
            WHERE USER_ID = '4e5ee53c-94db-4e24-834f-fa6286c36747' AND IS_DELETED = 'N' 
            LIMIT 1;`,
            [item.USER_ID]
          );
          const token = tokenRows[0]?.TOKEN;

          if (token) {
            try {
              await axios.post('https://service.vnfite.com.vn/push-notification/v2/notification/pushNotification', {
                alias: "tikluy",
                fcmToken: token,
                title: "Trả thưởng CTKM",
                body: `🎉 CHÚC MỪNG QUÝ KHÁCH ĐÃ ĐƯỢC CỘNG THÊM +${bonusRate}% LÃI SUẤT VÀO KHOẢN ĐẦU TƯ!\nKhoản đầu tư ${item.PRODUCT_NAME} mã ${item.INVESTMENT_CODE} của Quý khách với kỳ hạn ${period} tháng đã đủ điều kiện tham gia chương trình “TIKLUY – Càng lâu, lộc về càng sâu”.\nXin trân trọng cảm ơn Quý khách đã tin tưởng và sử dụng TIKLUY!`
              });
              console.log(`[PUSHED] Gửi noti thành công tới: ${item.FULL_NAME}`);
            } catch (error) {
              console.log("push noti failed: ", JSON.stringify(error));
            }
          }

          // In log
          console.log(`[INSERTED] Mã: ${item.INVESTMENT_CODE}, Tên SP: ${item.PRODUCT_NAME}, KH: ${item.FULL_NAME || "?"}`);
          console.log(` - Lãi: ${interest}% → ${newRate}% (cộng thêm ${bonusRate}%)`);
          console.log(` - Lợi nhuận: ${oldProfit.toLocaleString()}đ → ${newProfit.toLocaleString()}đ`);
          console.log("--------------------------------------------------");

          inserted++;
        }
      }

      console.log(`[CRON] Đã cập nhật ${inserted} khoản đầu tư.`);
    } catch (error) {
      console.error("[CRON] Lỗi xử lý ưu đãi tích lũy:", error);
    }
  });
};
