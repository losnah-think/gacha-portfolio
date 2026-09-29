import express from 'express';
import { loadAndSyncUserMetadata, getRecommendedFontConfig } from '../../utils/helpers.js';
import { normalizeStorageItem } from '../media/storage.js';
import { getReflectiveThemes } from '../../utils/reflectiveThemes.js';
import { processFablePull } from '../../services/gachaService.js';

const router = express.Router();

/**
 * GET /recommendations
 * 우화로 읽기 좋은 성찰형 추천 주제 리스트
 */
router.get('/recommendations', async (req, res) => {
    try {
        const { userKey } = req.query;
        let userMetadata = { nickname: '당신' };
        if (userKey) {
            userMetadata = await loadAndSyncUserMetadata(userKey);
        }
        const themes = getReflectiveThemes(userMetadata);
        res.json({ resultType: 'SUCCESS', data: themes });
    } catch (error) {
        console.error('Error generating reflective recommendations:', error);
        res.status(500).json({ resultType: 'FAIL', error: 'THEME_GENERATION_FAILED' });
    }
});

/**
 * POST /
 * 우화 생성 및 보상 지급 (V2 Refactored)
 */
router.post('/', async (req, res) => {
    try {
        const wiseThemes = ['인생의 지혜', '성찰과 성장', '아름다운 동행', '마음의 평화', '용기와 희망', '정직함의 가치'];
        const { userKey, personaId, persona_id, persona, situation, context, theme } = req.body || {};

        const targetPersona = personaId || persona_id || persona || "지혜로운_이솝";
        const targetSituation = situation || context || theme || wiseThemes[Math.floor(Math.random() * wiseThemes.length)];

        if (!userKey) return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_USER_KEY' });

        const result = await processFablePull(userKey, targetPersona, targetSituation, req.body);
        const { id, item, tickets, points, pointCount, currentPoints, balancePoints, promotion, userMetadata, zodiacRanking } = result;

        res.json({
            resultType: 'SUCCESS',
            points,
            pointCount,
            currentPoints,
            balancePoints,
            data: {
                ...normalizeStorageItem({ id, ...item }, 'fable'),
                points,
                pointCount,
                currentPoints,
                balancePoints,
                zodiacRanking
            },
            tickets,
            promotion,
            uiConfig: getRecommendedFontConfig(userMetadata.birthdate)
        });
    } catch (error) {
        console.error('[fable] Fable synthesis failed:', error);

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

        res.status(500).json({ resultType: 'FAIL', error: 'FABLE_GENERATION_FAILED' });
    }
});

export default router;
