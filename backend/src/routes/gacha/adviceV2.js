import express from 'express';
import { getRecommendedFontConfig } from '../../utils/helpers.js';
import { normalizeStorageItem } from '../media/storage.js';
import { processGachaPull, processFablePull } from '../../services/gachaService.js';

import { AD_CONFIG } from '../../config/adConfig.js';

const router = express.Router();

/**
 * POST /
 * 가차-조언/운세 뽑기 (V2 Optimized)
 */
router.post(['/', '/pull'], async (req, res) => {
    const { personaId, persona_id, situation, context, persona, userKey, requestId, contentType, mode, gachaMode } = req.body || {};
    const targetPersona = personaId || persona_id || persona;
    const targetSituation = situation || context;
    // [FIX §2.3-1] quote/fable 구분 신호. 프론트가 body에 contentType(또는 mode/gachaMode)='fable' 전송 시 우화 생성.
    const isFable = (contentType || mode || gachaMode) === 'fable';

    if (!userKey) {
        return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_USER_KEY' });
    }

    if (!targetPersona || !targetSituation) {
        return res.status(400).json({ resultType: 'FAIL', error: 'INVALID_PARAMETERS', message: '페르소나와 상황을 모두 선택해주세요.' });
    }

    try {
        const result = isFable
            ? await processFablePull(userKey, targetPersona, targetSituation, { ...req.body, requestId })
            : await processGachaPull(userKey, targetPersona, targetSituation, { ...req.body, requestId });
        const { id, item, tickets, points, pointCount, currentPoints, balancePoints, promotion, activityPromotion, collectorPromotion, userMetadata, zodiacRanking } = result;

        // [FIX §2.2] 프론트는 data.fontSize(SMALL|MEDIUM|LARGE)를 읽는다. 서버 추천을 enum으로 정규화해 data에 포함.
        const recommendedFont = getRecommendedFontConfig((userMetadata || {}).birthdate);
        const fontSize = recommendedFont.fontSize === 'LARGE' ? 'LARGE' : 'MEDIUM';

        return res.json({
            resultType: 'SUCCESS',
            points,
            pointCount,
            currentPoints,
            balancePoints,
            data: {
                ...normalizeStorageItem({ id, ...item }, isFable ? 'fable' : 'advice'),
                fontSize, // [FIX §2.2] data.fontSize 로 폰트 추천 전달
                points,
                pointCount,
                currentPoints,
                balancePoints,
                zodiacRanking // Include daily zodiac ranking
            },
            isAI: true,
            tickets,
            promotion,
            activityPromotion,
            collectorPromotion,
            uiConfig: recommendedFont,
            adConfig: AD_CONFIG // [NEW] Send ad info to trigger after gacha
        });
    } catch (error) {
        console.error('[adviceV2] Gacha Pull failed:', error);

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
            message: '조언 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
        });
    }
});

export default router;
