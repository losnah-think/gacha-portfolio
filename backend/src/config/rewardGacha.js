/**
 * 캡슐 뽑기 머신 (Reward Gacha) Configuration
 *
 * Firestore app_config/reward_gacha_config 에 prizeTable 배열을 저장하면
 * 서버 재배포 없이 확률/상품 변경 가능. (캐시 TTL: 5분)
 */

export const REWARD_GACHA_CONFIG = {
    // 확률 테이블 기본값 — 합계 = 1.0
    // Firestore app_config/reward_gacha_config.prizeTable 이 있으면 덮어씀
    PRIZE_TABLE: [
        { rarity: 'common',    label: '1P',  points: 1,  chance: 0.50  },
        { rarity: 'common',    label: '2P',  points: 2,  chance: 0.30  },
        { rarity: 'rare',      label: '3P',  points: 3,  chance: 0.12  },
        { rarity: 'epic',      label: '5P',  points: 5,  chance: 0.06  },
        { rarity: 'legendary', label: '10P', points: 10, chance: 0.02  },
    ],
};
