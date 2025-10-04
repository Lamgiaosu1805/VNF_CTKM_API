// CHƯƠNG TRÌNH “MỞ APP TIKLUY – NHẬN THƯỞNG EASY”

const cron = require("node-cron");
const moment = require("moment-timezone");
const db = require("../../../config/connectMySQL");

// ======================
// Config CTKM
// ======================
const PROGRAM_START = moment.tz("2025-09-20 00:00:00", "Asia/Ho_Chi_Minh");
const PROGRAM_END = moment.tz("2025-10-31 23:59:59", "Asia/Ho_Chi_Minh");

const MISSIONS = [
    { id: 1, reward: 25000 },
    { id: 2, reward: 25000 },
    { id: 3, reward: 30000 },
    { id: 4, reward: 35000 },
    { id: 5, reward: 40000 },
    { id: 6, reward: 45000 },
];

// ======================
// Init tables
// ======================
async function initTables() {
    await db.promise().query(`
    CREATE TABLE IF NOT EXISTS tbl_promo_reward (
      ID VARCHAR(40) PRIMARY KEY DEFAULT (UUID()),
      USER_ID VARCHAR(40) NOT NULL,
      MISSION_ID INT NOT NULL,
      AMOUNT DECIMAL(18,2) NOT NULL,
      IS_PAID ENUM('Y','N') DEFAULT 'N',
      PAID_DATE DATETIME NULL,
      CREATED_DATE DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

    await db.promise().query(`
    CREATE TABLE IF NOT EXISTS tbl_promo_investment_log (
      ID VARCHAR(40) PRIMARY KEY DEFAULT (UUID()),
      USER_ID VARCHAR(40) NOT NULL,
      INVEST_ID VARCHAR(40) NOT NULL,
      MISSION_ID INT NOT NULL,
      CREATED_DATE DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_invest (USER_ID, INVEST_ID)
    )
  `);

    console.log("✅ Bảng tbl_promo_reward & tbl_promo_investment_log đã sẵn sàng");
}

// ======================
// Helpers
// ======================
async function hasReward(userId, missionId) {
    const [rows] = await db
        .promise()
        .query("SELECT 1 FROM tbl_promo_reward WHERE USER_ID=? AND MISSION_ID=?", [
            userId,
            missionId,
        ]);
    return rows.length > 0;
}

async function insertReward(userId, missionId, amount) {
    await db
        .promise()
        .query(
            "INSERT INTO tbl_promo_reward (USER_ID, MISSION_ID, AMOUNT, CREATED_DATE) VALUES (?, ?, ?, NOW())",
            [userId, missionId, amount]
        );
    console.log(`📥 Insert reward USER ${userId}, mission ${missionId}, amount ${amount}`);
}

async function getUserEKYC(userId) {
    const [rows] = await db
        .promise()
        .query(
            "SELECT 1 FROM tbl_identification_info WHERE USER_ID=? AND IS_DELETED='N' LIMIT 1",
            [userId]
        );
    return rows.length > 0;
}

async function getReferrals(user) {
    const [rows] = await db
        .promise()
        .query(
            `SELECT u.* 
       FROM tbl_user u
       JOIN tbl_user_utility uu ON uu.USER_ID = u.ID
       WHERE uu.REFERRAL_CODE = ? 
         AND u.IS_DELETED='N' 
         AND u.CREATED_DATE BETWEEN ? AND ?`,
            [
                user.USER_NAME,
                PROGRAM_START.format("YYYY-MM-DD HH:mm:ss"),
                PROGRAM_END.format("YYYY-MM-DD HH:mm:ss"),
            ]
        );
    return rows;
}

async function getAvailableInvestments(userId) {
    const [rows] = await db.promise().query(
        `SELECT t.* 
       FROM tbl_user_investment_holding_product t
      WHERE t.USER_ID=? 
        AND t.STATUS=0 
        AND t.IS_DELETED='N' 
        AND t.INTEREST_RATE_UNIT=1
        AND t.CREATED_DATE BETWEEN ? AND ?
        AND NOT EXISTS (
          SELECT 1 FROM tbl_promo_investment_log l
          WHERE l.USER_ID=t.USER_ID 
            AND l.INVEST_ID=t.ID
        )
      ORDER BY t.CREATED_DATE ASC`,
        [
            userId,
            PROGRAM_START.format("YYYY-MM-DD HH:mm:ss"),
            PROGRAM_END.format("YYYY-MM-DD HH:mm:ss"),
        ]
    );

    return rows.map((r) => ({
        id: r.ID,
        amount: Number(r.AMOUNT),
        term: Number(r.INTEREST_RATE_PERIOD),
    }));
}

// ======================
// Missions 3 → 6 (investment)
// ======================
async function processInvestmentMissions(user) {
    const rewards = [
        { missionId: 3, minAmount: 500000, minTerm: 1, reward: 30000 },
        { missionId: 4, minAmount: 1000000, minTerm: 3, reward: 35000 },
        { missionId: 5, minAmount: 2000000, minTerm: 6, reward: 40000 },
        { missionId: 6, minAmount: 5000000, minTerm: 9, reward: 45000 },
    ];

    const investments = await getAvailableInvestments(user.ID);

    for (const mission of rewards) {
        // Nếu user đã có reward mốc này thì bỏ qua
        if (await hasReward(user.ID, mission.missionId)) continue;

        // Tìm 1 khoản đầu tư thoả điều kiện mốc
        const inv = investments.find(
            (i) => i.amount >= mission.minAmount && i.term >= mission.minTerm
        );

        if (inv) {
            // Thêm reward
            await insertReward(user.ID, mission.missionId, mission.reward);

            // Log lại khoản đầu tư đã dùng cho mốc này
            await db.promise().query(
                "INSERT INTO tbl_promo_investment_log (USER_ID, INVEST_ID, MISSION_ID) VALUES (?, ?, ?)",
                [user.ID, inv.id, mission.missionId]
            );

            console.log(`✅ User ${user.ID} đạt mốc ${mission.missionId} với investment ${inv.id}`);
            return; // mỗi lần job chỉ cho ăn 1 mốc
        }
    }
}

// ======================
// Main job
// ======================
module.exports = () => {
    initTables();
    //Chạy 5p 1 lần
    cron.schedule("0 */5 * * * *", async () => {
        const now = moment.tz("Asia/Ho_Chi_Minh");
        if (now.isBefore(PROGRAM_START) || now.isAfter(PROGRAM_END)) return;

        console.log("🔍 Checking promotion at", now.format("YYYY-MM-DD HH:mm:ss"));

        const [users] = await db.promise().query("SELECT * FROM tbl_user WHERE IS_DELETED='N'");

        for (const user of users) {
            const createdAt = moment(user.CREATED_DATE);

            // Mission 1: eKYC
            if (
                createdAt.isBetween(PROGRAM_START, PROGRAM_END, null, "[]") &&
                (await getUserEKYC(user.ID)) &&
                !(await hasReward(user.ID, 1))
            ) {
                await insertReward(user.ID, 1, MISSIONS[0].reward);
            }

            // Mission 2: referral
            if (!(await hasReward(user.ID, 2))) {
                const referrals = await getReferrals(user);
                const referralsEKYC = [];
                for (const ref of referrals) {
                    if (await getUserEKYC(ref.ID)) referralsEKYC.push(ref);
                }

                if (referralsEKYC.length >= 2) {
                    const isNewUser = createdAt.isBetween(PROGRAM_START, PROGRAM_END, null, "[]");

                    const [checkRef] = await db
                        .promise()
                        .query(
                            "SELECT 1 FROM tbl_user_utility WHERE USER_ID=? AND REFERRAL_CODE IS NOT NULL AND REFERRAL_CODE <> ''",
                            [user.ID]
                        );
                    const wasReferred = checkRef.length > 0;

                    if (isNewUser && wasReferred) {
                        await insertReward(user.ID, 2, MISSIONS[1].reward);
                    } else {
                        const investments = await getAvailableInvestments(user.ID);
                        if (investments.some((i) => i.amount >= 1000000 && i.term >= 1)) {
                            await insertReward(user.ID, 2, MISSIONS[1].reward);
                        }
                    }
                }
            }

            // Mission 3 → 6
            await processInvestmentMissions(user);
        }
    });
};
