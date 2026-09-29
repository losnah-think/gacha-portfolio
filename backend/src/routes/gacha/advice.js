import express from 'express';
import { getRecommendedFontConfig, loadAndSyncUserMetadata } from '../../utils/helpers.js';
import { normalizeStorageItem } from '../media/storage.js';
import { processGachaPull, processStaticGachaPull } from '../../services/gachaService.js';

const router = express.Router();

/**
 * POST /
 * 가차-조언/운세 뽑기 (V1 Legacy & Fallback Support)
 */
router.post('/', async (req, res) => {
    const { personaId, persona_id, situation, context, persona, userKey } = req.body || {};
    const targetPersona = personaId || persona_id || persona;
    const targetSituation = situation || context;

    if (!userKey) {
        return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_USER_KEY' });
    }

    // 1. AI Pull Try
    if (targetPersona && targetSituation) {
        try {
            const result = await processGachaPull(userKey, targetPersona, targetSituation, req.body);
            const { id, item, tickets, points, pointCount, currentPoints, balancePoints, promotion, activityPromotion, userMetadata } = result;

            return res.json({
                resultType: 'SUCCESS',
                points,
                pointCount,
                currentPoints,
                balancePoints,
                data: {
                    ...normalizeStorageItem({ id, ...item }, 'advice'),
                    points,
                    pointCount,
                    currentPoints,
                    balancePoints,
                },
                isAI: true,
                tickets,
                promotion,
                activityPromotion,
                uiConfig: getRecommendedFontConfig(userMetadata.birthdate)
            });
        } catch (error) {
            console.error('[adviceV1] AI Generation fallback to static:', error.message);
            if (error.message === 'INSUFFICIENT_TICKETS') {
                return res.status(403).json({
                    resultType: 'FAIL',
                    error: 'INSUFFICIENT_TICKETS',
                    currentTickets: error.currentTickets
                });
            }
            // Continue to static fallback
        }
    }

    // 2. Static Fallback
    try {
        const userMetadata = await loadAndSyncUserMetadata(userKey, req.body);
        const result = await processStaticGachaPull(userKey, req.body);
        const { id, item, tickets, points, pointCount, currentPoints, balancePoints, promotion, activityPromotion } = result;

        return res.json({
            resultType: 'SUCCESS',
            points,
            pointCount,
            currentPoints,
            balancePoints,
            data: { id, ...item, points, pointCount, currentPoints, balancePoints },
            tickets,
            promotion,
            activityPromotion,
            uiConfig: getRecommendedFontConfig(userMetadata.birthdate)
        });
    } catch (error) {
        console.error('[adviceV1] Static Fallback failed:', error);
        if (error.message === 'INSUFFICIENT_TICKETS') {
            return res.status(403).json({
                resultType: 'FAIL',
                error: 'INSUFFICIENT_TICKETS',
                currentTickets: error.currentTickets
            });
        }
        return res.status(500).json({ resultType: 'FAIL', error: 'GACHA_PULL_FAILED' });
    }
});

export default router;
