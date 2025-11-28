module.exports = () => {
    //CTKM tháng 6
    // require('./ctkmt6')();
    // require('./processReferralPayoutsCTKMT6')();
    // require('./julyReferralJob')();

    //CTKM THANG 7
    // require('./CTKMT7/CT1/ctkm1')()

    //CTKM THANG 8
    //--- CT FLASH SALE
    // require('./CTKMT8/CT1/ctkmt8CT1')();
    // require('./CTKMT8/CT1/ctkmt8CT1_traThuong')();

    //CTKM2
    // require('./CTKMT8/CT2/ctkm2')()

    //CTKM3 20/9/2025 - 30/9/2025
    // require('./CTKMT8/CT3/ctkm3')()

    //CTKM4 20/09/2025 đến hết ngày 31/10/2025.
    require('./CTKMT8/CT4/ctkm4')()
    require('./CTKMT8/CT4/payReward')() // trả thưởng

    //CTKM5 15/10 => hết 22/10 TIKLUY cùng Nàng – Gửi ngàn yêu thương
    // require('./CTKMT8/CT5/ctkm5')()
    // require('./CTKMT8/CT5/payRewardCTKM5')()

    //CTKM6 24/10 => hết 24/11 AN TÂM TIKLUY – SINH LỜI ĐỈNH CAO => GIA HẠN từ 28/11 => 23/12/2025
    require('./CTKM6/ctkm6')()

    //CTKM6 20/11 => hết 27/11 FLASH SALE 20/11 – MAY MẮN NHÂN ĐÔI CÙNG TIKLUY
    require('./CTKM7/ctkm7')()
};