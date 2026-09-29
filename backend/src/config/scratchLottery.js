/**
 * 복권 긁기 (Scratch Lottery) Configuration
 */

export const SCRATCH_LOTTERY_CONFIG = {
    // 세션당 티켓 수
    TICKETS_PER_SESSION: 3,

    // 세션 만료 시간 (3시간)
    SESSION_EXPIRY_MS: 3 * 60 * 60 * 1000,

    // 일일 최대 세션 수 (0 = 무제한)
    MAX_SESSIONS_PER_WINDOW: 5,

    // 광고 그룹 ID
    AD_GROUP: {
        UNLOCK: 'example-ad-unit-9',   // 개별 티켓 잠금 해제
        REFRESH: 'example-ad-unit-7',   // 전체 새로고침
    },

    // 당첨 확률 분포 — 기본값 (Firestore 설정이 있으면 무시됨, 합계 = 1.0)
    PRIZE_TABLE: [
        { rarity: 'common',    label: '2P',  points: 2,  chance: 0.30  },
        { rarity: 'common',      label: '1P',  points: 1,  chance: 0.50  },
        { rarity: 'rare',      label: '3P',  points: 3,  chance: 0.05  },
        { rarity: 'epic',      label: '5P',  points: 5,  chance: 0.025 },
        { rarity: 'legendary', label: '10P', points: 10, chance: 0.005 },
    ],
};
