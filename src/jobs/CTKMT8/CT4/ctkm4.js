//CHƯƠNG TRÌNH “MỞ APP TIKLUY – NHẬN THƯỞNG EASY”

const cron = require("node-cron");
const moment = require("moment-timezone");
const db = require("../../../config/connectMySQL"); // chỉnh lại path nếu khác

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
// Helpers
// ======================
async function initTable() {
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
    console.log("✅ Bảng tbl_promo_reward đã sẵn sàng");
}

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
    // chỉ insert, chưa cộng ví
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
            "SELECT 1 FROM tbl_identification_info WHERE USER_ID=? AND STATUS=1 AND IS_DELETED='N' LIMIT 1",
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

async function getInvestments(userId) {
    const [rows] = await db
        .promise()
        .query(
            `SELECT * FROM tbl_user_investment_holding_product 
       WHERE USER_ID=? 
         AND STATUS=0 
         AND IS_DELETED='N' 
         AND CREATED_DATE BETWEEN ? AND ?`,
            [
                userId,
                PROGRAM_START.format("YYYY-MM-DD HH:mm:ss"),
                PROGRAM_END.format("YYYY-MM-DD HH:mm:ss"),
            ]
        );
    return rows.map((r) => ({
        amount: Number(r.AMOUNT),
        term: Number(r.INTEREST_RATE_PERIOD),
    }));
}

// ======================
// Main job
// ======================
module.exports = () => {
    // Khởi tạo bảng khi start job
    initTable();

    // 5 phút chạy 1 lần
    cron.schedule("0 */5 * * * *", async () => {
        const now = moment.tz("Asia/Ho_Chi_Minh");
        if (now.isBefore(PROGRAM_START) || now.isAfter(PROGRAM_END)) return;

        console.log("🔍 Checking promotion at", now.format("YYYY-MM-DD HH:mm:ss"));

        const [users] = await db
            .promise()
            .query("SELECT * FROM tbl_user WHERE IS_DELETED='N'");

        for (const user of users) {
            const createdAt = moment(user.CREATED_DATE);

            // ====================
            // Mission 1: eKYC
            // ====================
            if (
                createdAt.isBetween(PROGRAM_START, PROGRAM_END, null, "[]") &&
                (await getUserEKYC(user.ID)) &&
                !(await hasReward(user.ID, 1))
            ) {
                await insertReward(user.ID, 1, MISSIONS[0].reward);
            }

            // ====================
            // Mission 2: referral
            // ====================
            if (!(await hasReward(user.ID, 2))) {
                const referrals = await getReferrals(user);
                const referralsEKYC = [];
                for (const ref of referrals) {
                    if (await getUserEKYC(ref.ID)) referralsEKYC.push(ref);
                }

                if (referralsEKYC.length >= 2) {
                    const isNewUser = createdAt.isBetween(
                        PROGRAM_START,
                        PROGRAM_END,
                        null,
                        "[]"
                    );

                    // check nếu user được giới thiệu
                    const [checkRef] = await db
                        .promise()
                        .query(
                            "SELECT 1 FROM tbl_user_utility WHERE USER_ID=? AND REFERRAL_CODE IS NOT NULL",
                            [user.ID]
                        );
                    const wasReferred = checkRef.length > 0;

                    if (isNewUser && wasReferred) {
                        await insertReward(user.ID, 2, MISSIONS[1].reward);
                    } else {
                        const invests = await getInvestments(user.ID);
                        if (invests.some((i) => i.amount >= 1000000 && i.term >= 1)) {
                            await insertReward(user.ID, 2, MISSIONS[1].reward);
                        }
                    }
                }
            }

            // ====================
            // Missions 3-6: đầu tư
            // ====================
            const invests = await getInvestments(user.ID);

            if (
                !(await hasReward(user.ID, 3)) &&
                invests.some((i) => i.amount >= 500000 && i.term >= 1)
            ) {
                if (await hasReward(user.ID, 2)) {
                    await insertReward(user.ID, 3, MISSIONS[2].reward);
                }
            }

            if (
                !(await hasReward(user.ID, 4)) &&
                invests.some((i) => i.amount >= 1000000 && i.term >= 3)
            ) {
                if (await hasReward(user.ID, 3)) {
                    await insertReward(user.ID, 4, MISSIONS[3].reward);
                }
            }

            if (
                !(await hasReward(user.ID, 5)) &&
                invests.some((i) => i.amount >= 2000000 && i.term >= 6)
            ) {
                if (await hasReward(user.ID, 4)) {
                    await insertReward(user.ID, 5, MISSIONS[4].reward);
                }
            }

            if (
                !(await hasReward(user.ID, 6)) &&
                invests.some((i) => i.amount >= 5000000 && i.term >= 9)
            ) {
                if (await hasReward(user.ID, 5)) {
                    await insertReward(user.ID, 6, MISSIONS[5].reward);
                }
            }
        }
    });
};
