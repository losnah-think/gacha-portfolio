/**
 * 📢 Advertisement Configuration
 */
export const AD_CONFIG = {
    // [Target: 홈 티켓 받기 버튼]
    AD_TICKET: {
        active: true,
        unitId: 'example-ad-unit-5',
        type: 'interstitial',
        displayProbability: 1
    },

    // [Target: 리워드 티켓+포인트 받기 버튼]
    AD_SHORT: {
        active: true,
        unitId: 'example-ad-unit-6',
        type: 'rewarded',
        defaultTickets: 1,
        defaultPoints: 2
    },

    // [Target: 리워드 포인트 버튼 (2P)]
    AD_LONG: {
        active: true,
        unitId: 'example-ad-unit-8',
        type: 'rewarded',
        defaultPoints: 3
    },

    // [V2] Banner Ad Configuration
    BANNER: {
        active: true,
        adGroupId: process.env.AD_BANNER_GROUP_ID || 'example-ad-unit-5',
        textAdGroupId: process.env.AD_BANNER_TEXT_GROUP_ID || 'example-ad-unit-10',
        refreshIntervalMs: 30000
    }
};
