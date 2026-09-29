import express from 'express';
import { getRecommendedFontConfig } from '../../utils/helpers.js';
import { normalizeStorageItem } from '../media/storage.js';
import { processGachaPull } from '../../services/gachaService.js';

const router = express.Router();

/**
 * POST /api/v2/gacha/family
 * 손자/손녀 페르소나 전용 상담 API (Refactored)
 */
router.post('/', async (req, res) => {
    const { userKey, personaId, persona, situation, context, theme } = req.body || {};

    // 손자/손녀 중 하나로 고정 (V2 전용)
    const targetPersona = personaId || persona || "손자";
    const targetSituation = situation || context || theme || "행운의 조언";

    if (!userKey) return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_USER_KEY' });

    try {
        const result = await processGachaPull(userKey, targetPersona, targetSituation, req.body);
        const { id, item, tickets, promotion, activityPromotion, userMetadata, zodiacRanking } = result;

        return res.json({
            resultType: 'SUCCESS',
            data: {
                ...normalizeStorageItem({ id, ...item }, 'advice'),
                zodiacRanking
            },
            isAI: true,
            tickets,
            promotion,
            activityPromotion,
            uiConfig: getRecommendedFontConfig(userMetadata.birthdate)
        });
    } catch (error) {
        console.error('[adviceFamily] Gacha Pull failed:', error);

        if (error.message === 'INSUFFICIENT_TICKETS') {
            return res.status(403).json({
                resultType: 'FAIL',
                error: 'INSUFFICIENT_TICKETS',
                currentTickets: error.currentTickets ?? 0,
                purchaseRequired: true,
                message: '티켓이 부족해요! 상점에서 티켓을 구매하거나, 광고를 시청해서 충전해보세요.',
                actions: [
                    { type: 'NAVIGATE', target: '/shop', label: '상점으로 이동' },
                    { type: 'NAVIGATE', target: '/reward', label: '광고 시청하기' },
                ]
            });
        }

        return res.status(500).json({
            resultType: 'FAIL',
            error: 'GACHA_PULL_FAILED',
            message: '가족 페르소나 조언 생성 중 오류가 발생했습니다.'
        });
    }
});

export default router;
