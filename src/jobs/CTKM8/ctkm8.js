//TIKLUY PHÚ QUÝ – RƯỚC TÀI ĐÓN LỘC
const cron = require("node-cron");
const moment = require("moment-timezone");
const db = require("../../config/connectMySQL");

const PROGRAM_START = moment.tz("2025-12-24 00:00:00", "Asia/Ho_Chi_Minh");
const PROGRAM_END = moment.tz("2025-12-31 23:59:59", "Asia/Ho_Chi_Minh");

const MISSIONS = [
    { id: 2, reward: 88000 },
    { id: 3, reward: 128000 },
    { id: 4, reward: 186000 },
    { id: 5, reward: 218000 },
];

async function initTables() {
    await db.promise().query(`
    CREATE TABLE IF NOT EXISTS ctkm8 (
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
    CREATE TABLE IF NOT EXISTS tbl_promo_investment_log_ctkm8 (
      ID VARCHAR(40) PRIMARY KEY DEFAULT (UUID()),
      USER_ID VARCHAR(40) NOT NULL,
      INVEST_ID VARCHAR(40) NOT NULL,
      MISSION_ID INT NOT NULL,
      CREATED_DATE DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_invest (USER_ID, INVEST_ID)
    )
  `);

    console.log("✅ Bảng ctkm8 đã sẵn sàng");
}

async function hasReward(userId, missionId) {
    const [rows] = await db
        .promise()
        .query("SELECT 1 FROM ctkm8 WHERE USER_ID=? AND MISSION_ID=?", [
            userId,
            missionId,
        ]);
    return rows.length > 0;
}

async function insertReward(userId, missionId, amount) {
    await db
        .promise()
        .query(
            "INSERT INTO ctkm8 (USER_ID, MISSION_ID, AMOUNT, CREATED_DATE) VALUES (?, ?, ?, NOW())",
            [userId, missionId, amount]
        );
    console.log(`📥 Insert reward USER ${userId}, mission ${missionId}, amount ${amount}`);
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
          SELECT 1 FROM tbl_promo_investment_log_ctkm8 l
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
async function processInvestmentMissions(user) {
    const rewards = [
        { missionId: 2, minAmount: 10000000, minTerm: 3, reward: 88000 },
        { missionId: 3, minAmount: 50000000, minTerm: 6, reward: 128000 },
        { missionId: 4, minAmount: 100000000, minTerm: 9, reward: 186000 },
        { missionId: 5, minAmount: 200000000, minTerm: 12, reward: 218000 },
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
                "INSERT INTO tbl_promo_investment_log_ctkm8 (USER_ID, INVEST_ID, MISSION_ID) VALUES (?, ?, ?)",
                [user.ID, inv.id, mission.missionId]
            );

            console.log(`[CTKM8] User ${user.ID} đạt mốc ${mission.missionId} với investment ${inv.id}`);
            return; // mỗi lần job chỉ cho ăn 1 mốc
        }
    }
}


module.exports = () => {
    initTables();
    cron.schedule("*/9 * * * *", async () => {
        const now = moment.tz("Asia/Ho_Chi_Minh");
        console.log("🔍 Checking ctkm TIKLUY PHÚ QUÝ – RƯỚC TÀI ĐÓN LỘC", now.format("YYYY-MM-DD HH:mm:ss"));
        if (now.isBefore(PROGRAM_START) || now.isAfter(PROGRAM_END)) {
            console.log("[CRON] Không nằm trong thời gian diễn ra chương trình.");
            return
        };
        const [users] = await db.promise().query("SELECT * FROM tbl_user WHERE IS_DELETED='N'");
        for (const user of users) {
            await processInvestmentMissions(user);
        }
    });
}

