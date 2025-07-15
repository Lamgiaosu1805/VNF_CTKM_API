const db = require('../config/connectMySQL');
const cron = require("node-cron");

module.exports = () => {
  createTablesIfNotExist();

  // Chạy mỗi phút để test
  cron.schedule("* * * * *", async () => {
    try {
      const today = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());

      // Gỡ comment sau khi test xong
      if (today < '2025-07-01' || today > '2025-07-31') {
        console.log(`[JulyReferralJob] ⚠️ Ngoài khoảng thời gian chạy: ${today}`);
        return;
      }

      console.log(`[JulyReferralJob] ✅ Bắt đầu xử lý vào lúc ${today}...`);

      const allUsers = await fetchFilteredUsers();
      const loggedUserIds = await getAlreadyLoggedUserIds();

      const newUsers = allUsers
        .filter(u => !loggedUserIds.includes(u.user_id))
        .map(u => ({ ...u, phone_number: u.user_username }));

      if (!newUsers.length) {
        console.log('[JulyReferralJob] ❌ Không có user mới nào đủ điều kiện hôm nay.');
        return;
      }

      await logNewUsers(newUsers);
      await logRewardUsers(newUsers);

      console.log(`[JulyReferralJob] ✅ Đã log ${newUsers.length} người dùng.`);
    } catch (err) {
      console.error('[JulyReferralJob] ❌ Lỗi:', err);
    }
  });
};

function createTablesIfNotExist() {
  const createBonusTable = `
    CREATE TABLE IF NOT EXISTS july_referral_bonus_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36),
      ref_username VARCHAR(20),
      user_full_name VARCHAR(255),
      user_bank_account VARCHAR(100),
      ref_full_name VARCHAR(255),
      created_date DATETIME,
      phone_number VARCHAR(20),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_once (user_id)
    )`;

  const createRewardTable = `
    CREATE TABLE IF NOT EXISTS july_referral_reward_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36),
      ref_username VARCHAR(20),
      reward_type ENUM('new_user_july') NOT NULL,
      reward_amount INT NOT NULL,
      reward_for_count INT DEFAULT NULL,
      full_name VARCHAR(255),
      bank_account VARCHAR(100),
      status ENUM('pending', 'success') DEFAULT 'pending',
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`;

  db.query(createBonusTable, (err) => {
    if (err) console.error("Lỗi tạo bảng bonus:", err);
  });

  db.query(createRewardTable, (err) => {
    if (err) console.error("Lỗi tạo bảng reward:", err);
  });
}

async function fetchFilteredUsers() {
  const sql = `
    SELECT DISTINCT
      u.ID AS user_id,
      u.USER_NAME AS user_username,
      u.CREATED_DATE AS created_date,
      IFNULL(i.FULL_NAME, 'Không có') AS user_full_name,
      uu.BANK_ACCOUNT_VNFITE AS user_bank_account,
      uu.REFERRAL_CODE AS ref_username,
      ref_user.ID AS ref_user_id,
      IFNULL(ref_info.FULL_NAME, 'Không có') AS ref_full_name
    FROM tbl_user u
    JOIN tbl_user_utility uu ON u.ID = uu.USER_ID
    JOIN tbl_user_investment_holding_product h ON u.ID = h.USER_ID
    LEFT JOIN tbl_identification_info i ON u.ID = i.USER_ID
    LEFT JOIN tbl_user ref_user ON uu.REFERRAL_CODE = ref_user.USER_NAME
    LEFT JOIN tbl_identification_info ref_info ON ref_user.ID = ref_info.USER_ID
    WHERE u.CREATED_DATE >= '2025-07-01'
      AND uu.BANK_ACCOUNT_VNFITE LIKE 'VNC%'
      AND uu.REFERRAL_CODE IS NOT NULL AND uu.REFERRAL_CODE != ''
      AND h.CREATED_DATE >= '2025-07-01'
      AND h.INVESTMENT_HOLDING_PRODUCT_ID != '812f71f5-c153-4fca-a8e2-7e9e08c5ffdb'
      AND h.INTEREST_RATE_UNIT = 1
      AND h.INTEREST_RATE_PERIOD >= 1
      AND h.AMOUNT >= 1000000
  `;

  return new Promise((resolve, reject) => {
    db.query(sql, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

async function getAlreadyLoggedUserIds() {
  const sql = 'SELECT user_id FROM july_referral_bonus_logs';
  return new Promise((resolve, reject) => {
    db.query(sql, (err, results) => {
      if (err) return reject(err);
      resolve(results.map(r => r.user_id));
    });
  });
}

async function logNewUsers(users) {
  if (!users.length) return;
  const values = users.map(u => [
    u.user_id,
    u.ref_username,
    u.user_full_name,
    u.user_bank_account,
    u.ref_full_name,
    u.created_date,
    u.phone_number
  ]);
  const sql = `
    INSERT IGNORE INTO july_referral_bonus_logs 
    (user_id, ref_username, user_full_name, user_bank_account, ref_full_name, created_date, phone_number)
    VALUES ?
  `;
  return new Promise((resolve, reject) => {
    db.query(sql, [values], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function logRewardUsers(users) {
  if (!users.length) return;
  const values = users.map(u => [
    u.user_id || null,
    u.ref_username || null,
    'new_user_july',
    20000,
    null,
    u.user_full_name || null,
    u.user_bank_account || null,
    'pending'
  ]);
  const sql = `
    INSERT IGNORE INTO july_referral_reward_logs
    (user_id, ref_username, reward_type, reward_amount, reward_for_count, full_name, bank_account, status)
    VALUES ?
  `;
  return new Promise((resolve, reject) => {
    db.query(sql, [values], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}
