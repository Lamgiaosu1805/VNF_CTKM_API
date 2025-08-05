const cron = require("node-cron");
const moment = require("moment");
const db = require("../../../config/connectMySQL");
const axios = require("axios");

module.exports = () => {
  cron.schedule('5-59/10 * * * *', async () => {
    console.log("[CRON] Bắt đầu kiểm tra ưu đãi tích lũy...22222");

    const startDate = moment("2025-08-01");
    const endDate = moment("2025-08-15").endOf("day");
    const today = moment();

    if (!today.isBetween(startDate, endDate, null, "[]")) {
      console.log("[CRON] Không nằm trong thời gian diễn ra chương trình.");
      return;
    }

    console.log("ĐÃ trả thưởng")
  });
};
