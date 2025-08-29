// “TIKLUY LỘC VÀNG – NHẬN NGÀN ƯU ĐÃI”
const cron = require("node-cron");
const moment = require("moment");
const db = require("../../../config/connectMySQL");
const axios = require("axios");

function calculateReward(amount, months) {
    let reward = 0;
    let key = "";
  
    if (months >= 12) {
      if (amount >= 10000000 && amount < 50000000) { reward = 300000; key = "12m_10-50"; }
      else if (amount >= 50000000 && amount < 100000000) { reward = 500000; key = "12m_50-100"; }
      else if (amount >= 100000000 && amount < 200000000) { reward = 1000000; key = "12m_100-200"; }
      else if (amount >= 200000000 && amount < 500000000) { reward = 1500000; key = "12m_200-500"; }
      else if (amount >= 500000000) { reward = 2000000; key = "12m_500+"; }
    } else if (months >= 6) {
      if (amount >= 10000000 && amount < 50000000) { reward = 200000; key = "6m_10-50"; }
      else if (amount >= 50000000 && amount < 100000000) { reward = 300000; key = "6m_50-100"; }
      else if (amount >= 100000000 && amount < 200000000) { reward = 500000; key = "6m_100-200"; }
      else if (amount >= 200000000 && amount < 500000000) { reward = 1000000; key = "6m_200-500"; }
      else if (amount >= 500000000) { reward = 1500000; key = "6m_500+"; }
    } else if (months >= 3) {
      if (amount >= 10000000 && amount < 50000000) { reward = 100000; key = "3m_10-50"; }
      else if (amount >= 50000000 && amount < 100000000) { reward = 200000; key = "3m_50-100"; }
      else if (amount >= 100000000 && amount < 200000000) { reward = 300000; key = "3m_100-200"; }
      else if (amount >= 200000000 && amount < 500000000) { reward = 500000; key = "3m_200-500"; }
      else if (amount >= 500000000) { reward = 1000000; key = "3m_500+"; }
    }
  
    return { reward, key };
  }
  function formatMoney(money) {
    return money.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
module.exports = () => {
    const createTableIfNotExists = async () => {
        await db.promise().query(`
          CREATE TABLE IF NOT EXISTS ctkm_3 (
            ID INT AUTO_INCREMENT PRIMARY KEY,
            INVESTMENT_CODE VARCHAR(100) NOT NULL,
            USER_ID VARCHAR(100) NOT NULL,
            FULL_NAME VARCHAR(255),
            PRODUCT_ID VARCHAR(100) NOT NULL,
            PRODUCT_NAME VARCHAR(255),
            AMOUNT BIGINT,
            START_DATE DATETIME,
            REWARD_MONEY BIGINT,
            CONDITION_KEY VARCHAR(100) NOT NULL,
            CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
            UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_investment (INVESTMENT_CODE),
            UNIQUE KEY unique_user_condition (USER_ID, CONDITION_KEY)
          );
        `);
      };

      

  cron.schedule("*/10 * * * *", async () => {
    console.log("STARTING...");
    const startDate = moment("2025-09-21");
    const endDate = moment("2025-09-30").endOf("day");
    const today = moment();

    if (!today.isBetween(startDate, endDate, null, "[]")) {
      console.log("[CRON] Không nằm trong thời gian diễn ra chương trình.");
      return;
    }

    await createTableIfNotExists();

    const allowedIds = [
      "b27d4ab4-b0af-4a7e-bdb5-c52a7fd2433c",
      "dfaa0359-d4c1-484c-934b-f89085e607f9"
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
         AND t.INTEREST_RATE_PERIOD >= 3
         AND t.START_DATE BETWEEN ? AND ?
         AND t.INVESTMENT_HOLDING_PRODUCT_ID IN (?)
      `,
      [startDate.format("YYYY-MM-DD"), endDate.format("YYYY-MM-DD"), allowedIds]
    );
    const authResSecond = await axios.get(`http://${process.env.IP_SERVER}:${process.env.PORT_ACCOUNT}/auth/token`, {
        headers: {
          "grant-type": "client_credentials",
          "Authorization": "Basic " + process.env.TOKEN_ACCOUNT
        }
    });

    for (const row of results) {
        const { reward, key } = calculateReward(row.AMOUNT, row.INTEREST_RATE_PERIOD);
        if (reward <= 0) continue;
  
        // check user đã nhận trong cùng condition chưa
        const [existCond] = await db.promise().query(
          `SELECT 1 FROM ctkm_3 WHERE USER_ID = ? AND CONDITION_KEY = ? LIMIT 1`,
          [row.USER_ID, key]
        );
        if (existCond.length > 0) {
          console.log(`[SKIP] ${row.USER_ID} đã nhận quà cho điều kiện ${key} rồi.`);
          continue;
        }
  
        // check nếu đã insert theo investment_code thì skip
        const [exist] = await db.promise().query(
          `SELECT 1 FROM ctkm_3 WHERE INVESTMENT_CODE = ? LIMIT 1`,
          [row.INVESTMENT_CODE]
        );
        if (exist.length > 0) {
          console.log(`[SKIP] ${row.INVESTMENT_CODE} đã được insert.`);
          continue;
        }
  
        await db.promise().query(
          `INSERT INTO ctkm_3 
          (INVESTMENT_CODE, USER_ID, FULL_NAME, PRODUCT_ID, PRODUCT_NAME, AMOUNT, START_DATE, REWARD_MONEY, CONDITION_KEY)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.INVESTMENT_CODE,
            row.USER_ID,
            row.FULL_NAME,
            row.INVESTMENT_HOLDING_PRODUCT_ID,
            row.PRODUCT_NAME,
            row.AMOUNT,
            row.START_DATE,
            reward,
            key
          ]
        );
  
        console.log(`[SAVE] ${row.USER_ID} - ${row.AMOUNT} - ${row.INTEREST_RATE_PERIOD} tháng => Thưởng: ${reward}`);
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
                "content": `Ưu đãi cộng tiền về tài khoản CTKM TIKLUY LỘC VÀNG – NHẬN NGÀN ƯU ĐÃI của khoản đầu tư ${row.INVESTMENT_CODE}`
              }, {
                headers: {
                  requestId: "ctkm_3",
                  Authorization: "Bearer " + authResSecond.data.data.accessToken
                }
              })
            if(plusMoneyRes?.data?.result?.isOK != true) {
                console.log("Cộng tiền Fail: ", plusMoneyRes?.data)
            }
            else {
                console.log(`Đã trả tiền ưu đãi về tài khoản ${bankAccount}`)
            }
        } catch (err) {
            console.error(`[API] Lỗi khi cộng tiền cho ${row.USER_ID}:`, err.message);
        }
        if(token) {
            try {
                await axios.post(
                    'https://service.vnfite.com.vn/push-notification/v2/notification/pushNotification',
                    {
                      alias: "tikluy",
                      fcmToken: token,
                      title: "TIKLUY LỘC VÀNG – NHẬN NGÀN ƯU ĐÃI",
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
  });
};
