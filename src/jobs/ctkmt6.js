const db = require('../config/connectMySQL');
const cron = require("node-cron");

module.exports = () => {
  createTablesIfNotExist();
  const allowedRunDates = [
    '2025-06-22',
    '2025-06-29',
    '2025-07-06',
    '2025-07-13',
    '2025-07-16'
  ];
  cron.schedule("0 0 * * *", async () => {
    try {
      const now = new Date();
      const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

      // Nếu sau ngày cuối hoặc không nằm trong danh sách cho phép
      const maxDate = '2025-07-16';
      if (today > maxDate) {
        console.log('[ReferralJob] ❌ Job không khả dụng sau ngày 16/07/2025.');
        return;
      }

      if (!allowedRunDates.includes(today)) {
        console.log(`[ReferralJob] ⚠️ Hôm nay (${today}) không phải lịch chạy job.`);
        return;
      }

      console.log(`[ReferralJob] ✅ Bắt đầu xử lý vào lúc 0h ngày ${today}...`);
      const allUsers = await fetchFilteredUsers();
      const loggedUserIds = await getAlreadyLoggedUserIds();

      const newUsers = allUsers
        .filter(u => !loggedUserIds.includes(u.user_id))
        .map(u => ({ ...u, phone_number: u.user_username }));

      await logNewUsers(newUsers);

      const referralMap = {};
      allUsers.forEach(user => {
        const ref = user.ref_username;
        if (!ref) return;
        if (!referralMap[ref]) {
          referralMap[ref] = {
            ref_username: ref,
            ref_full_name: user.ref_full_name,
            ref_bank_account: user.ref_bank_account,
            user_id: user.ref_user_id,
            count: 0
          };
        }
        referralMap[ref].count += 1;
      });

      const previousCounts = await getPreviousReferralCounts();

      const rewardList = Object.values(referralMap).map(item => {
        const oldCount = previousCounts[item.ref_username] || 0;
        const newCount = item.count;
        const addedCount = newCount - oldCount;

        if (addedCount <= 0) return null;

        const perReward = calculateReward(newCount);
        const totalReward = perReward * addedCount;

        return {
          user_id: item.user_id,
          ref_username: item.ref_username,
          reward_type: 'referral',
          reward_amount: totalReward,
          reward_for_count: newCount,
          full_name: item.ref_full_name,
          bank_account: item.ref_bank_account,
          newly_referred: addedCount
        };
      }).filter(Boolean);

      const userRewardList = newUsers.map(user => ({
        user_id: user.user_id,
        ref_username: user.referral_phone,
        reward_type: 'new_user',
        reward_amount: 20000,
        full_name: user.user_full_name,
        bank_account: user.user_bank_account
      }));

      console.log('\n>>> Danh sách người được giới thiệu (20.000đ mỗi người):');
      console.table(
        userRewardList,
        ['user_id', 'full_name', 'bank_account', 'ref_username', 'reward_amount']
      );

      console.log('\n>>> Danh sách người giới thiệu được thưởng (lần này):');
      console.table(
        rewardList,
        ['ref_username', 'full_name', 'bank_account', 'newly_referred', 'reward_for_count', 'reward_amount']
      );

      const totalReferralBonus = rewardList.reduce((sum, r) => sum + r.reward_amount, 0);
      const totalUserBonus = userRewardList.length * 20000;

      console.log('\n>>> TỔNG TIỀN THƯỞNG HỆ THỐNG PHẢI CHI:');
      console.log(`- Người giới thiệu: ${totalReferralBonus.toLocaleString()} VNĐ`);
      console.log(`- Người được giới thiệu: ${totalUserBonus.toLocaleString()} VNĐ`);
      console.log(`- Tổng cộng: ${(totalReferralBonus + totalUserBonus).toLocaleString()} VNĐ`);

      await logRewardUsers([...userRewardList, ...rewardList]);
    } catch (error) {
      console.error("Lỗi logRewardJob:", error);
    }
  });
};

function calculateReward(count) {
  if (count <= 5) return 30000;
  if (count <= 50) return 35000;
  if (count <= 100) return 40000;
  return 45000;
}

function createTablesIfNotExist() {
  const createBonusLogTable = `
    CREATE TABLE IF NOT EXISTS referral_bonus_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      ref_username VARCHAR(20) NOT NULL,
      user_full_name VARCHAR(255),
      user_bank_account VARCHAR(100),
      ref_full_name VARCHAR(255),
      created_date DATETIME,
      phone_number VARCHAR(20),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_once (user_id)
    )
  `;

  const createRewardLogTable = `
    CREATE TABLE IF NOT EXISTS referral_reward_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36),
      ref_username VARCHAR(20),
      reward_type ENUM('referral', 'new_user') NOT NULL,
      reward_amount INT NOT NULL,
      reward_for_count INT DEFAULT NULL,
      full_name VARCHAR(255),
      bank_account VARCHAR(100),
      status ENUM('pending', 'success') DEFAULT 'pending',
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.query(createBonusLogTable, (err) => {
    if (err) console.error("Lỗi tạo bảng referral_bonus_logs:", err);
  });

  db.query(createRewardLogTable, (err) => {
    if (err) console.error("Lỗi tạo bảng referral_reward_logs:", err);
  });
}

async function fetchFilteredUsers() {
  const sql = `
    SELECT
      u.ID AS user_id,
      u.USER_NAME AS user_username,
      u.CREATED_DATE AS created_date,
      IFNULL(i.FULL_NAME, 'Không có') AS user_full_name,
      uu.BANK_ACCOUNT_VNFITE AS user_bank_account,
      uu.REFERRAL_CODE AS referral_phone,

      ref_user.ID AS ref_user_id,
      ref_user.USER_NAME AS ref_username,
      IFNULL(ref_info.FULL_NAME, 'Không có') AS ref_full_name,
      ref_uu.BANK_ACCOUNT_VNFITE AS ref_bank_account
    FROM tbl_user u
    JOIN tbl_user_utility uu ON u.ID = uu.USER_ID
    LEFT JOIN tbl_identification_info i ON u.ID = i.USER_ID
    LEFT JOIN tbl_user ref_user ON uu.REFERRAL_CODE = ref_user.USER_NAME
    LEFT JOIN tbl_user_utility ref_uu ON ref_user.ID = ref_uu.USER_ID
    LEFT JOIN tbl_identification_info ref_info ON ref_user.ID = ref_info.USER_ID
    WHERE u.CREATED_DATE >= '2025-06-15'
      AND uu.BANK_ACCOUNT_VNFITE LIKE 'VNC%'
      AND uu.REFERRAL_CODE IS NOT NULL
      AND uu.REFERRAL_CODE != ''
      AND uu.REFERRAL_CODE != 'false'
      AND ref_uu.BANK_ACCOUNT_VNFITE LIKE 'VNC%'
  `;
  return new Promise((resolve, reject) => {
    db.query(sql, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

async function getAlreadyLoggedUserIds() {
  const sql = 'SELECT user_id FROM referral_bonus_logs';
  return new Promise((resolve, reject) => {
    db.query(sql, (err, results) => {
      if (err) return reject(err);
      resolve(results.map(r => r.user_id));
    });
  });
}

async function getPreviousReferralCounts() {
  const sql = `
    SELECT ref_username, reward_for_count
    FROM referral_reward_logs
    WHERE reward_type = 'referral'
    ORDER BY created_at DESC
  `;
  return new Promise((resolve, reject) => {
    db.query(sql, (err, results) => {
      if (err) return reject(err);
      const latestMap = {};
      for (const row of results) {
        if (!latestMap[row.ref_username]) {
          latestMap[row.ref_username] = row.reward_for_count || 0;
        }
      }
      resolve(latestMap);
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
    INSERT IGNORE INTO referral_bonus_logs 
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

async function logRewardUsers(records) {
  if (!records.length) return;
  const values = records.map(r => [
    r.user_id || null,
    r.ref_username || null,
    r.reward_type,
    r.reward_amount,
    r.reward_for_count || null,
    r.full_name || null,
    r.bank_account || null,
    'pending'
  ]);
  const sql = `
    INSERT INTO referral_reward_logs
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