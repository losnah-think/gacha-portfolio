import express from 'express';
import { firestore } from '../../lib/firebaseAdmin.js';
import { GACHA_PROMOTION_CONFIG } from '../../config/gachaPromotion.js';
import { resolveImageUrl } from '../../utils/imageUrl.js';


const router = express.Router();

/**
 * GET /api/v2/promotions
 * 활성 프로모션(배너, 팝업 등) 리스트 조회
 */
router.get('/', async (req, res) => {
    try {
        const { userKey } = req.query;
        const promotions = [];

        // 1. Firestore에서 배너/팝업 프로모션 가져오기
        const promotionsRef = firestore.collection('promotions');
        const snapshot = await promotionsRef
            .where('active', '==', true)
            .get();

        snapshot.forEach(doc => {
            const data = doc.data();
            promotions.push({
                id: doc.id,
                title: data.title || '',
                description: data.description || '',
                imageUrl: resolveImageUrl(data.imageUrl || ''),
                linkUrl: data.linkUrl || '',
                priority: data.priority || 0,
                type: data.type || 'banner'
            });
        });

        // 2. 활동 프로모션 일괄 추가 (GACHA_PROMOTION_CONFIG에서 활성화된 것들)
        const activityPromos = GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS;
        Object.entries(activityPromos).forEach(([key, config]) => {
            if (!config.active) return;

            // 이미 명시적으로 추가된 것들이나 중복 방지 (기존 하드코딩된 ID들 대응)
            const id = key.toLowerCase();

            // 중복 체크 (id 기준)
            if (promotions.some(p => p.id === id)) return;

            let type = config.type || 'activity';
            if (!config.type) {
                if (key.includes('ATTENDANCE')) type = 'attendance';
                else if (key.includes('SHARE')) type = 'share';
                else if (key.includes('PULL')) type = 'pull';
                else if (key.includes('CHAT') || key.includes('WORDS')) type = 'chat';
            }

            promotions.push({
                id: id,
                promotionCode: config.promotionCode,
                title: config.title,
                description: config.description || `${config.minCashReward || 0}~${config.maxCashReward || 0}원 토스 포인트 지급`,
                imageUrl: resolveImageUrl(config.imageUrl || ''),
                linkUrl: config.linkUrl || '',
                priority: config.isJackpot ? 95 : (key.includes('ATTENDANCE') ? 80 : 70),
                type: type,
                goal: config.goal,
                reward: {
                    min: config.minCashReward,
                    max: config.maxCashReward
                }
            });
        });

        // 사용자별 진행 상황 및 보상 여부 추가
        if (userKey) {
            try {
                const userRef = firestore.collection('users').doc(String(userKey));
                const [userDoc, claimedSnap] = await Promise.all([
                    userRef.get(),
                    userRef.collection('claimed_promotions').get()
                ]);

                const claimedCodes = new Set();
                if (!claimedSnap.empty) {
                    claimedSnap.forEach(doc => claimedCodes.add(doc.id));
                }

                // userKey가 있지만 신규/미존재 유저일 경우 기본 status 설정
                if (!userDoc.exists) {
                    for (const promo of promotions) {
                        promo.status = 'ACTIVE';
                        promo.statusText = '참여 가능';
                    }
                }

                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const consecutiveAttendance = userData.consecutiveLoginDays || userData.consecutiveAttendanceCount || 0;
                    const lottoCount = userData.lottoCount || 0;
                    const pullCount = userData.pullCount || 0;
                    const chatCount = userData.chatCount || 0;
                    const shareCount = userData.shareCount || 0;

                    for (const promo of promotions) {
                        // 1. Status Check
                        const promoId = promo.id || '';
                        const actualCode = promo.promotionCode || promoId;
                        const isClaimed = claimedCodes.has(actualCode);

                        // 2. Progress Calculation
                        let currentCount = 0;
                        let hasGoal = false;

                        if (promo.type === 'attendance') {
                            currentCount = consecutiveAttendance;
                            hasGoal = true;
                        } else if (promo.type === 'milestone') {
                            if (promoId.includes('lotto')) currentCount = lottoCount;
                            else if (promoId.includes('collector') || promoId.includes('pull') || promoId.includes('adventure') || promoId.includes('gacha')) currentCount = pullCount;
                            hasGoal = true;
                        } else if (promo.type === 'chat') {
                            currentCount = chatCount;
                            hasGoal = true;
                        } else if (promo.type === 'share') {
                            currentCount = shareCount;
                            hasGoal = true;
                        }

                        if (hasGoal && promo.goal) {
                            const goal = promo.goal;
                            const isGoalMet = currentCount >= goal;

                            promo.progress = {
                                current: currentCount,
                                goal: goal,
                                percentage: Math.min(100, Math.round((currentCount / goal) * 100))
                            };

                            if (isClaimed) promo.status = 'COMPLETED';
                            else if (isGoalMet) promo.status = 'CLAIMABLE';
                            else promo.status = 'IN_PROGRESS';
                        } else {
                            promo.status = isClaimed ? 'COMPLETED' : 'ACTIVE';
                        }

                        // Friendly status text
                        if (promo.status === 'COMPLETED') promo.statusText = '지급 완료';
                        else if (promo.status === 'CLAIMABLE') promo.statusText = '보상 받기 가능';
                        else if (promo.status === 'IN_PROGRESS') promo.statusText = '진행 중';
                        else if (promo.status === 'ACTIVE') promo.statusText = '참여 가능';
                    }
                }
            } catch (err) {
                console.error('[Promotions] Error fetching user context:', err);
            }
        }

        // 우선순위 정렬 (보상 가능 항목 우선 -> 우선순위)
        promotions.sort((a, b) => {
            if (a.status === 'CLAIMABLE' && b.status !== 'CLAIMABLE') return -1;
            if (a.status !== 'CLAIMABLE' && b.status === 'CLAIMABLE') return 1;
            return (b.priority || 0) - (a.priority || 0);
        });

        res.json({
            success: true,
            data: promotions
        });
    } catch (error) {
        console.error('[Promotions] Error fetching:', error);
        res.status(500).json({
            success: false,
            error: 'FETCH_FAILED',
            message: error.message
        });
    }
});

export default router;
