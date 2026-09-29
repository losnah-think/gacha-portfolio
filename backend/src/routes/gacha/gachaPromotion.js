
import express from 'express';
import { GACHA_PROMOTION_CONFIG } from '../../config/gachaPromotion.js';
import { claimUserPromotionInternal } from '../../services/promotionService.js';
import { getRefundConfig } from '../../services/refundConfigService.js';

const router = express.Router();

/**
 * POST /api/v2/promotion/claim
 * 프로모션 코드 사용 및 보상 청구
 */
router.post('/claim', async (req, res) => {
    const { userKey, promotionCode } = req.body;
    if (!userKey || !promotionCode) {
        return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_PARAMETERS' });
    }

    try {
        const result = await claimUserPromotionInternal(userKey, promotionCode);
        res.json({
            resultType: 'SUCCESS',
            data: result
        });
    } catch (e) {
        const errorMap = {
            'PROMOTION_NOT_FOUND': { status: 404, message: '존재하지 않는 프로모션이에요' },
            'ALREADY_CLAIMED': { status: 409, message: '이미 사용한 프로모션이에요' },
            'EXPIRED': { status: 400, message: '만료된 프로모션이에요' },
            'INACTIVE': { status: 400, message: '사용할 수 없는 프로모션이에요' },
            'MAX_CLAIMS_REACHED': { status: 400, message: '프로모션 사용 가능 횟수를 초과했어요' },
            'NOT_STARTED': { status: 400, message: '아직 시작되지 않은 프로모션이에요' },
            'PROMOTION_PROVIDER_UNAVAILABLE': { status: 503, message: '프로모션 제공자 연결이 원활하지 않아요. 잠시 후 다시 시도해주세요' }
        };

        const errorInfo = errorMap[e.message];
        if (errorInfo) {
            return res.status(errorInfo.status).json({
                resultType: 'FAIL',
                error: e.message,
                message: errorInfo.message
            });
        }

        console.error(`[Promotion] Claim error: ${e.message}`);
        res.status(500).json({ resultType: 'FAIL', error: 'INTERNAL_SERVER_ERROR', message: e.message });
    }
});

/**
 * GET /api/v2/promotion/list
 * 현재 활성화된 가차 서비스 프로모션 리스트 조회 (진성성/진행도 포함)
 */
router.get('/list', async (req, res) => {
    const { userKey } = req.query;

    try {
        let userData = { pullCount: 0, attendanceCount: 0, dailyMissions: { chattedPersonas: [], checkedCategories: [] } };
        let claimedCodes = new Set();

        if (userKey) {
            const { firestore } = await import('../../lib/firebaseAdmin.js');
            const { getUserDocRef, getKstDateKey } = await import('../../utils/helpers.js');

            const today = getKstDateKey();
            const userRef = getUserDocRef(userKey);
            const missionRef = userRef.collection('daily_missions').doc(today);

            const [userSnap, claimsSnap, missionSnap] = await Promise.all([
                userRef.get(),
                userRef.collection('claimed_promotions').get(),
                missionRef.get(),
            ]);

            if (userSnap.exists) {
                userData = { ...userData, ...userSnap.data() };
            }

            if (missionSnap.exists) {
                const md = missionSnap.data();
                userData.dailyMissions = {
                    chattedPersonas: md.chatted_personas || [],
                    checkedCategories: md.checked_categories || []
                };
            }

            claimsSnap.forEach(doc => {
                const cleanId = doc.id.split('_202')[0]; // Remove date suffix for comparison
                claimedCodes.add(cleanId);
                claimedCodes.add(doc.id);
            });
        }

        // 3. 프로모션 리스트 구성 및 진행도 계산
        const activePromotions = Object.entries(GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS)
            .filter(([_, config]) => config.active)
            .map(([key, config]) => {
                const goal = config.goal || 1;
                let current = 0;

                // 유형별 진행도 매칭 (실시간 데이터 반영 확인)
                if (config.type === 'chat') {
                    current = userData.dailyMissions.chattedPersonas.includes(config.personaId) ? 1 : 0;
                } else if (config.type === 'check') {
                    current = userData.dailyMissions.checkedCategories.includes(config.category) ? 1 : 0;
                } else if (key.includes('ATTENDANCE')) {
                    // 단기 미션(3/5/7/10일): 연속 접속일 기준
                    // 장기 미션(30/100일): 누적 전체 출석일 기준 (월 경계 무관)
                    const goalDays = GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS[key]?.goal || 0;
                    if (goalDays <= 10) {
                        current = userData.consecutiveLoginDays || 0;
                    } else {
                        current = userData.attendanceCount || 0;
                    }
                } else if (key.includes('AD_WATCH')) {
                    current = userData.ticketsAds || 0;
                } else if (key.includes('PULL') || key.includes('COLLECTOR') || key.includes('ADVICE') || key.includes('JACKPOT') || key.includes('DIAMOND') || key.includes('GACHA') || config.type === 'milestone') {
                    // Milestone/Grade checks use pullCount or grade-specific data
                    // For GACHA_CARD_DIAMOND/PLATINUM, they are milestones with goal 1. 
                    // Current logic for grade missions uses global counts if available, but here we can just use pullCount as a proxy or specific field.
                    // Actually, GACHA_CARD_DIAMOND should ideally check if the user HAS a diamond card, but let's keep it simple as pullCount for now if that was the intent.
                    // Wait, GACHA_CARD_DIAMOND has goal 1. If user has EVER pulled a diamond card, it should be 1.
                    if (key === 'GACHA_CARD_DIAMOND') current = userData.diamondCount ? 1 : 0;
                    else if (key === 'GACHA_CARD_PLATINUM') current = userData.platinumCount ? 1 : 0;
                    else current = userData.pullCount || 0;
                } else if (key.includes('LOTTO')) {
                    current = userData.lottoCount || 0;
                }

                const isCompleted = current >= goal;
                const isClaimed = claimedCodes.has(config.promotionCode);

                const status = isClaimed ? 'CLAIMED' : (isCompleted ? 'READY' : 'PROGRESS');

                // [수정] 완료 시 '보상 받기' 대신 '완료'로 표시하여 혼선 방지
                let statusText = '진행 중';
                if (status === 'CLAIMED' || status === 'READY') statusText = '완료';

                return {
                    id: key,
                    title: config.title,
                    description: config.description,
                    imageUrl: config.imageUrl,
                    goal: goal,
                    current: Math.min(current, goal),
                    isCompleted,
                    isClaimed,
                    status,
                    statusText,
                    // [수정] 완료된 경우 이동 링크를 비활성화(제거)하여 '완료 처리' 느낌을 줌
                    linkUrl: isCompleted ? null : config.linkUrl,
                    promotionCode: config.promotionCode,
                    isJackpot: config.isJackpot || false
                };
            });

        res.json({
            resultType: 'SUCCESS',
            data: activePromotions
        });
    } catch (e) {
        console.error(`[Promotion List] Error: ${e.message}`);
        res.status(500).json({ resultType: 'FAIL', error: e.message });
    }
});

/**
 * GET /api/v2/promotion/progress
 * 프로모션 진행도 조회 (뽑기 횟수, 출석 횟수 등)
 */
router.get('/progress', async (req, res) => {
    const { userKey } = req.query;
    if (!userKey) return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_USER_KEY' });

    try {
        const { getUserDocRef } = await import('../../utils/helpers.js');
        const snap = await getUserDocRef(userKey).get();
        const data = snap.exists ? snap.data() : {};

        const progress = {
            pullCount: data.pullCount || 0,
            lottoCount: data.lottoCount || 0,
            attendanceCount: data.attendanceCount || 0,
            chatCount: data.chatCount || 0,
            promotions: GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS
        };

        res.json({ resultType: 'SUCCESS', data: progress });
    } catch (e) {
        res.status(500).json({ resultType: 'FAIL', error: e.message });
    }
});

/**
 * GET /api/v2/promotion/refund-config
 * 포인트 환급(전환) 정책 값 조회
 */
router.get('/refund-config', async (req, res) => {
    try {
        const config = await getRefundConfig();

        res.json({
            resultType: 'SUCCESS',
            data: {
                minPoints: config.minPoints,
                maxPoints: config.maxPoints,
                pointUnit: config.pointUnit,
                hasPromotionCode: !!config.promotionCode,
                enabled: config.enabled,
                updatedAt: config.updatedAt
            }
        });
    } catch (error) {
        console.error('[Refund Config] Error:', error);
        res.status(500).json({
            resultType: 'FAIL',
            error: {
                code: 'REFUND_CONFIG_FETCH_FAILED',
                message: '포인트 전환 설정을 불러오지 못했어요.'
            }
        });
    }
});

export default router;
