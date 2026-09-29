import express from 'express';
import {
    getUserPersonaPreferences,
    calculateCategoryPreferences,
    getPersonaRanking,
    getCategoryRanking,
    getUserPersonaRank
} from '../../services/personaPreferenceService.js';

const router = express.Router();

/**
 * @route GET /api/persona-preference/my-preferences
 * @desc 사용자의 페르소나 선호도 조회
 * @query userKey
 */
router.get('/my-preferences', async (req, res) => {
    const { userKey } = req.query;

    if (!userKey) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: 'userKey is required'
        });
    }

    try {
        const preferences = await getUserPersonaPreferences(userKey);
        const categoryPreferences = await calculateCategoryPreferences(userKey);

        res.json({
            resultType: 'SUCCESS',
            data: {
                ...preferences,
                categoryPreferences
            }
        });
    } catch (error) {
        console.error('[PersonaPreferenceAPI] Failed to get preferences:', error);
        res.status(500).json({ resultType: 'FAIL', error: error.message });
    }
});

/**
 * @route GET /api/persona-preference/ranking/persona/:personaId
 * @desc 특정 페르소나의 랭킹 조회
 * @param personaId
 * @query limit
 */
router.get('/ranking/persona/:personaId', async (req, res) => {
    const { personaId } = req.params;
    const { limit = 20 } = req.query;

    try {
        const rankings = await getPersonaRanking(personaId, Number(limit) || 20);

        res.json({
            resultType: 'SUCCESS',
            data: {
                personaId,
                rankings
            }
        });
    } catch (error) {
        console.error('[PersonaPreferenceAPI] Failed to get persona ranking:', error);
        res.status(500).json({ resultType: 'FAIL', error: error.message });
    }
});

/**
 * @route GET /api/persona-preference/ranking/category/:category
 * @desc 특정 카테고리의 랭킹 조회
 * @param category
 * @query limit
 */
router.get('/ranking/category/:category', async (req, res) => {
    const { category } = req.params;
    const { limit = 20 } = req.query;

    try {
        const rankings = await getCategoryRanking(category, Number(limit) || 20);

        res.json({
            resultType: 'SUCCESS',
            data: {
                category,
                rankings
            }
        });
    } catch (error) {
        console.error('[PersonaPreferenceAPI] Failed to get category ranking:', error);
        res.status(500).json({ resultType: 'FAIL', error: error.message });
    }
});

/**
 * @route GET /api/persona-preference/my-rank/:personaId
 * @desc 특정 페르소나에서의 내 순위 조회
 * @param personaId
 * @query userKey
 */
router.get('/my-rank/:personaId', async (req, res) => {
    const { personaId } = req.params;
    const { userKey } = req.query;

    if (!userKey) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: 'userKey is required'
        });
    }

    try {
        const rankInfo = await getUserPersonaRank(userKey, personaId);

        res.json({
            resultType: 'SUCCESS',
            data: rankInfo
        });
    } catch (error) {
        console.error('[PersonaPreferenceAPI] Failed to get user persona rank:', error);
        res.status(500).json({ resultType: 'FAIL', error: error.message });
    }
});

export default router;
