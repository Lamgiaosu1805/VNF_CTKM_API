const cron = require("node-cron");
// const { processHopDongChuaTai } = require("../services/contract");
const { default: axios } = require("axios");

module.exports = () => {
    cron.schedule("*/4 * * * *", async () => {
        try {
            const response = await axios.get(`http://42.113.122.119:9999/auth/token`, {
                headers: {
                    'grant-type': "client_credentials",
                    Authorization: "Basic " + process.env.TOKEN_ACCOUNT
                }
            })

            // const addMoneyResponse = await axios.put(`http://42.113.122.119:8888/api/v2/account/VNC0000000016`, {
            //     "fluctuatedAmount": 1000000,
            //     "plus": true,
            //     "source": "VNFFITE_CAPITAL"
            // }, {
            //     headers: {
            //         requestId: "12312312",
            //         Authorization: "Bearer " + response.data.data.accessToken
            //     }
            // })
            // console.log(addMoneyResponse.data)
        } catch (error) {
            console.log(error)
        }
    });
}