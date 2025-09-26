// jobPayReward.js
const cron = require("node-cron");
const moment = require("moment-timezone");
const db = require("../../../config/connectMySQL");
const axios = require("axios");

// format tiền có dấu phẩy
function formatMoney(money) {
    return money.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",").replace(".00", "");
}

async function payRewards() {
    const now = moment.tz("Asia/Ho_Chi_Minh").format("YYYY-MM-DD HH:mm:ss");

    // Lấy danh sách reward chưa trả
    const [rows] = await db.promise().query(
        `SELECT r.*, u.USER_NAME, u.CREATED_DATE, i.FULL_NAME
     FROM tbl_promo_reward r
     JOIN tbl_user u ON u.ID = r.USER_ID
     LEFT JOIN tbl_identification_info i ON u.ID = i.USER_ID
     WHERE r.IS_PAID='N'`
    );

    if (rows.length === 0) {
        console.log("✅ Không có reward nào cần trả thưởng hôm nay");
        return;
    }

    // lấy token cho API cộng tiền
    const authRes = await axios.get(
        `http://${process.env.IP_SERVER}:${process.env.PORT_ACCOUNT}/auth/token`,
        {
            headers: {
                "grant-type": "client_credentials",
                Authorization: "Basic " + process.env.TOKEN_ACCOUNT,
            },
        }
    );
    const accessToken = authRes.data?.data?.accessToken;

    for (const reward of rows) {
        try {
            // 🔹 Lấy số tài khoản + token push notification
            const [userInfo] = await db.promise().query(
                `SELECT 
            u.BANK_ACCOUNT_VNFITE,
            d.TOKEN
         FROM tbl_user_utility u
         LEFT JOIN tbl_user_device d 
           ON u.USER_ID = d.USER_ID AND d.IS_DELETED = 'N'
         WHERE u.USER_ID = ?
         LIMIT 1`,
                [reward.USER_ID]
            );

            const token = userInfo.length > 0 ? userInfo[0].TOKEN : null;
            const bankAccount =
                userInfo.length > 0 ? userInfo[0].BANK_ACCOUNT_VNFITE : null;

            // 🔹 Cộng tiền vào tài khoản
            if (bankAccount) {
                try {
                    const plusMoneyRes = await axios.put(
                        `http://${process.env.IP_SERVER}:${process.env.PORT_ACCOUNT}/api/v2/account/${bankAccount}`,
                        {
                            fluctuatedAmount: reward.AMOUNT,
                            plus: true,
                            source: "VNFFITE_CAPITAL",
                            content: `Ưu đãi cộng tiền về tài khoản CTKM MỞ APP TIKLUY – NHẬN THƯỞNG EASY (mốc ${reward.MISSION_ID})`,
                        },
                        {
                            headers: {
                                requestId: "ctkm_easy",
                                Authorization: "Bearer " + accessToken,
                            },
                        }
                    );

                    if (plusMoneyRes?.data?.result?.isOK !== true) {
                        console.log("❌ Cộng tiền Fail: ", plusMoneyRes?.data);
                        continue;
                    } else {
                        console.log(
                            `💰 Đã cộng ${reward.AMOUNT} vào tài khoản ${bankAccount} (user ${reward.USER_ID})`
                        );
                    }
                } catch (err) {
                    console.error(`[API] Lỗi cộng tiền user ${reward.USER_ID}:`, err.message);
                    continue;
                }
            } else {
                console.log(`[SKIP] User ${reward.USER_ID} chưa có bankAccount`);
                continue;
            }

            // 🔹 Gửi push notification
            if (token) {
                try {
                    await axios.post(
                        "https://service.vnfite.com.vn/push-notification/v2/notification/pushNotification",
                        {
                            alias: "tikluy",
                            fcmToken: token,
                            title: "MỞ APP TIKLUY – NHẬN THƯỞNG EASY",
                            body: `Chúc mừng bạn đã nhận được ${formatMoney(
                                reward.AMOUNT
                            )} VNĐ vào tài khoản TIKLUY 🎉\nMốc thưởng: ${reward.MISSION_ID}\nCảm ơn bạn đã đồng hành cùng TIKLUY!`,
                        }
                    );
                    console.log(`📲 Push noti thành công tới user ${reward.USER_ID}`);
                } catch (error) {
                    console.log("push noti failed: ", JSON.stringify(error));
                }
            }

            // 🔹 Đánh dấu đã trả
            await db.promise().query(
                `UPDATE tbl_promo_reward
         SET IS_PAID='Y', PAID_DATE=?
         WHERE ID=?`,
                [now, reward.ID]
            );

            console.log(
                `✅ Hoàn tất trả thưởng user ${reward.USER_ID}, mission ${reward.MISSION_ID}`
            );
        } catch (err) {
            console.error(`❌ Lỗi khi xử lý reward ${reward.ID}:`, err);
        }
    }
}

module.exports = () => {
    // chạy mỗi ngày lúc 01:00 sáng
    cron.schedule("59 23 * * *", async () => {
        console.log("🔔 Bắt đầu job trả thưởng EASY...");
        await payRewards();
    });
};
