//Tên chương trình: “TIKLUY CÀNG LÂU – LỘC VỀ CÀNG SÂU”
// 1.	Phạm vi triển khai: Triển khai trên toàn quốc.

const { default: nodeCron } = require("node-cron")

// 2.	Thời hạn triển khai Chương trình: Từ ngày 18/07/2025 đến hết ngày 31/08/2025.
module.exports = () => {
    nodeCron.schedule("* * * * *", async () => {
        console.log("ABC")
    })
}