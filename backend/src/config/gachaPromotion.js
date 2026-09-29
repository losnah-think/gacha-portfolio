import { PROMOTION_CONFIG } from './promotion.js';

/**
 * 🎡 Gacha Service Promotion Configuration
 * 광고 캠페인 및 서비스 내 프로모션 설정
 */
export const GACHA_PROMOTION_CONFIG = {
    /**
     * 🎁 활동 기반 자동 리워드 (Toss 포인트 지급용)
     */
    ACTIVITY_PROMOTIONS: {
        // 1. 기운을 모아서 포인트로 변경하기
        POINT_CONVERSION: {
            active: true,
            promotionCode: PROMOTION_CONFIG.REFUND_LIVE_CODE,
            title: "기운을 모아서 포인트로 변경하기",
            description: "모은 기운(포인트)을 토스 포인트로 환급받으세요!",
            imageUrl: "https://example.invalid/example-project.firebasestorage.app/images/promotions/promo_refund.png",
            type: "refund"
        },
        // 📅 [Daily] 페르소나 미션
        DAILY_CHAT_LUCY: { active: true, daily: true, promotionCode: PROMOTION_CONFIG.DAILY_CHAT_LUCY_CODE, title: "연애 상담사 루시와 대화", description: "루시와 대화하고 1~3원을 받으세요!", rewardDistribution: { type: 'range', min: 1, max: 3 }, type: "chat", personaId: "v3_lucy" },
        DAILY_CHAT_MONG: { active: true, daily: true, promotionCode: PROMOTION_CONFIG.DAILY_CHAT_MONG_CODE, title: "꿈 해몽사 몽선생과 대화", description: "몽선생과 대화하고 1~3원을 받으세요!", rewardDistribution: { type: 'range', min: 1, max: 3 }, type: "chat", personaId: "dream_interpreter" },
        DAILY_CHAT_ARCANA: { active: true, daily: true, promotionCode: PROMOTION_CONFIG.DAILY_CHAT_ARCANA_CODE, title: "타로 마스터 아르카나와 대화", description: "아르카나와 대화하고 1~3원을 받으세요!", rewardDistribution: { type: 'range', min: 1, max: 3 }, type: "chat", personaId: "tarot_master" },
        DAILY_CHAT_MONEYKING: { active: true, daily: true, promotionCode: PROMOTION_CONFIG.DAILY_CHAT_MONEYKING_CODE, title: "재테크 멘토 머니킹과 대화", description: "머니킹과 대화하고 1~3원을 받으세요!", rewardDistribution: { type: 'range', min: 1, max: 3 }, type: "chat", personaId: "finance_advisor" },
        DAILY_CHAT_CHILDLOVE: { active: true, daily: true, promotionCode: PROMOTION_CONFIG.DAILY_CHAT_CHILDLOVE_CODE, title: "육아 멘토 아이사랑과 대화", description: "아이사랑과 대화하고 1~3원을 받으세요!", rewardDistribution: { type: 'range', min: 1, max: 3 }, type: "chat", personaId: "parenting_coach" },
        DAILY_CHAT_PASS: { active: true, daily: true, promotionCode: PROMOTION_CONFIG.DAILY_CHAT_PASS_CODE, title: "면접관 코치 합격신과 대화", description: "합격신과 대화하고 1~3원을 받으세요!", rewardDistribution: { type: 'range', min: 1, max: 3 }, type: "chat", personaId: "interview_coach" },

        // 📅 [Daily] 카테고리 미션
        DAILY_CHECK_LOTTO: { active: false, daily: true, promotionCode: PROMOTION_CONFIG.DAILY_CHECK_LOTTO_CODE, title: "로또 결과 확인", description: "로또 결과를 확인하고 1~3원을 받으세요!", rewardDistribution: { type: 'range', min: 1, max: 3 }, type: "check", category: "lotto" },
        DAILY_CHECK_FORTUNE: { active: false, daily: true, promotionCode: PROMOTION_CONFIG.DAILY_CHECK_FORTUNE_CODE, title: "운세 결과 확인", description: "운세 결과를 확인하고 1~3원을 받으세요!", rewardDistribution: { type: 'range', min: 1, max: 3 }, type: "check", category: "fortune" },
        DAILY_CHECK_ADVICE: { active: false, daily: true, promotionCode: PROMOTION_CONFIG.DAILY_CHECK_ADVICE_CODE, title: "조언 결과 확인", description: "조언 결과를 확인하고 1~3원을 받으세요!", rewardDistribution: { type: 'range', min: 1, max: 3 }, type: "check", category: "advice" },
        DAILY_CHECK_LOVE: { active: false, daily: true, promotionCode: PROMOTION_CONFIG.DAILY_CHECK_LOVE_CODE, title: "연애 결과 확인", description: "연애 결과를 확인하고 1~3원을 받으세요!", rewardDistribution: { type: 'range', min: 1, max: 3 }, type: "check", category: "love" },

        // 🎰 등급별 카드 뽑기
        GACHA_CARD_DIAMOND: {
            active: false, // [일시정지 2026-03-04]
            promotionCode: PROMOTION_CONFIG.GACHA_CARD_DIAMOND_CODE,
            title: "다이아 등급 카드",
            description: "다이아 등급 카드를 뽑으면 최대 10원을 드려요!",
            rewardDistribution: { type: 'range', min: 1, max: 10 },
            imageUrl: "https://example.invalid/example-project.firebasestorage.app/images/promotions/promo_card_diamond.png",
            type: "milestone",
            goal: 1
        },
        GACHA_CARD_PLATINUM: {
            active: false, // [일시정지 2026-03-04]
            promotionCode: PROMOTION_CONFIG.GACHA_CARD_PLATINUM_CODE,
            title: "플래티넘 등급 카드",
            description: "플래티넘 등급 카드를 뽑으면 최대 3원을 드려요!",
            rewardDistribution: { type: 'range', min: 1, max: 3 },
            imageUrl: "https://example.invalid/example-project.firebasestorage.app/images/promotions/promo_card_platinum.png",
            type: "milestone",
            goal: 1
        },

        // 🎉 첫 로그인 (DNU) 프로모션 — 최대 1,000원
        FIRST_LOGIN: {
            active: true,
            promotionCode: PROMOTION_CONFIG.FIRST_LOGIN_CODE,
            title: "가차 첫 방문 보상",
            description: "첫 로그인을 축하해요! 최대 1,000원을 받을 수 있어요!",
            // 확률 기반 보상 분포
            rewardDistribution: {
                type: 'jackpot',
                tiers: [
                    { chance: 0.000001, amount: 1000 }, // 0.0001%
                    { chance: 0.0005, amount: 100 }, // 0.05%
                ],
                fallback: { min: 1, max: 10 }           // 나머지 → 1~10원
            },
            type: "first_login",
            goal: 1
        },

        // 🎰 첫 가챠 (DNU) 프로모션 — 최대 1,000원
        FIRST_GACHA: {
            active: false, // 2026-03-07 프로모션 종료
            promotionCode: PROMOTION_CONFIG.FIRST_GACHA_CODE,
            title: "첫 가챠 보상",
            description: "첫 가챠를 축하해요! 최대 1,000원을 받을 수 있어요!",
            rewardDistribution: {
                type: 'jackpot',
                tiers: [
                    { chance: 0.000001, amount: 1000 }, // 0.0001%
                    { chance: 0.0005, amount: 100 }, // 0.05%
                ],
                fallback: { min: 1, max: 10 }           // 나머지 → 1~10원
            },
            type: "first_gacha",
            goal: 1
        },

        // 💬 첫 상담 (DNU) 프로모션 — 최대 1,000원
        FIRST_CHAT: {
            active: true,
            promotionCode: PROMOTION_CONFIG.FIRST_CHAT_CODE,
            title: "첫 상담 보상",
            description: "첫 상담을 축하해요! 최대 1,000원을 받을 수 있어요!",
            rewardDistribution: {
                type: 'jackpot',
                tiers: [
                    { chance: 0.000001, amount: 1000 }, // 0.0001%
                    { chance: 0.0005, amount: 100 }, // 0.05%
                ],
                fallback: { min: 1, max: 10 }           // 나머지 → 1~10원
            },
            type: "first_chat",
            goal: 1
        },

        // 💸 첫 리워드 전환 (DNU) 프로모션 — 최대 1,000원
        FIRST_REFUND: {
            active: true,
            promotionCode: PROMOTION_CONFIG.FIRST_REFUND_CODE,
            title: "첫 리워드 전환 보상",
            description: "첫 포인트 전환을 축하해요! 최대 1,000원을 받을 수 있어요!",
            rewardDistribution: {
                type: 'jackpot',
                tiers: [
                    { chance: 0.000001, amount: 1000 },
                    { chance: 0.0005, amount: 100 },
                ],
                fallback: { min: 1, max: 10 }
            },
            type: "first_refund",
            goal: 1
        },

        // 🎴 첫 레어 카드 획득 (골드 이상) 프로모션 — 최대 1,000원
        FIRST_RARE_CARD: {
            active: true,
            promotionCode: PROMOTION_CONFIG.FIRST_RARE_CARD_CODE,
            title: "첫 레어 카드 보상",
            description: "골드 이상 카드를 처음 뽑았어요! 최대 1,000원을 받을 수 있어요!",
            rewardDistribution: {
                type: 'jackpot',
                tiers: [
                    { chance: 0.000001, amount: 1000 },
                    { chance: 0.0005, amount: 100 },
                ],
                fallback: { min: 1, max: 10 }
            },
            type: "first_rare_card",
            goal: 1
        },

        // 🃏 카드 10개 모으기 (1회성) — 최대 1,000원
        COLLECT_10_CARDS: {
            active: true,
            promotionCode: PROMOTION_CONFIG.COLLECT_10_CARDS_CODE,
            title: "카드 10개 수집 달성",
            description: "카드 10개를 모았어요! 최대 1,000원을 받을 수 있어요!",
            rewardDistribution: {
                type: 'jackpot',
                tiers: [
                    { chance: 0.000001, amount: 1000 },
                    { chance: 0.0005, amount: 100 },
                ],
                fallback: { min: 1, max: 10 }
            },
            type: "milestone",
            goal: 10
        },

        // 🎯 리워드 메뉴 가차 뽑기 10회/50회 달성
        GACHA_10: {
            active: true,
            promotionCode: PROMOTION_CONFIG.REWARD_GACHA_10_CODE,
            title: "리워드메뉴 가차뽑기 10번 달성",
            description: "리워드메뉴 가차를 10번 뽑으면 최대 1,000원을 받을 수 있어요!",
            rewardDistribution: {
                type: 'jackpot',
                tiers: [
                    { chance: 0.0001, amount: 1000 },  // 0.01%
                    { chance: 0.0099, amount: 100 },   // 0.99%
                ],
                fallback: { min: 1, max: 10 }          // 99% → 1~10원
            },
            type: "milestone",
            goal: 10
        },
        GACHA_50: {
            active: true,
            promotionCode: PROMOTION_CONFIG.REWARD_GACHA_50_CODE,
            title: "리워드메뉴 가차뽑기 50번 달성",
            description: "리워드메뉴 가차를 50번 뽑으면 최대 1,000원을 받을 수 있어요!",
            rewardDistribution: {
                type: 'jackpot',
                tiers: [
                    { chance: 0.0001, amount: 1000 },  // 0.01%
                    { chance: 0.0099, amount: 100 },   // 0.99%
                ],
                fallback: { min: 1, max: 10 }          // 99% → 1~10원
            },
            type: "milestone",
            goal: 50
        },

        // 🔮 운세 보기 프로모션 (1~10원 99%, 100원 0.99%, 1000원 0.01%)
        FORTUNE_VIEW: {
            active: true,
            promotionCode: PROMOTION_CONFIG.FORTUNE_VIEW_CODE,
            title: "운세 보기",
            description: "운세를 확인하고 최대 1,000원을 받을 수 있어요!",
            rewardDistribution: {
                type: 'jackpot',
                tiers: [
                    { chance: 0.0001, amount: 1000 },  // 0.01%
                    { chance: 0.0099, amount: 100 },   // 0.99%
                ],
                fallback: { min: 1, max: 10 }          // 99% → 1~10원
            },
            type: "fortune",
            goal: 1
        },

        // 🔮 더 자세한 운세 보기 프로모션 (1~10원 99%, 100원 0.99%, 1000원 0.01%)
        FORTUNE_DETAIL_VIEW: {
            active: true,
            promotionCode: PROMOTION_CONFIG.FORTUNE_DETAIL_VIEW_CODE,
            title: "더 자세한 운세 보기",
            description: "자세한 운세를 확인하고 최대 1,000원을 받을 수 있어요!",
            rewardDistribution: {
                type: 'jackpot',
                tiers: [
                    { chance: 0.0001, amount: 1000 },  // 0.01%
                    { chance: 0.0099, amount: 100 },   // 0.99%
                ],
                fallback: { min: 1, max: 10 }          // 99% → 1~10원
            },
            type: "fortune_detail",
            goal: 1
        }

    }
};
