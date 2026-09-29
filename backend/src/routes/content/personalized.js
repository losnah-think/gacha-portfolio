import express from 'express';
import {
    getPersonalizedRankings,
    getExpRankings,
    getRecommendedPersonas,
    getRecommendedSituations,
    getUserActivitySummary
} from '../../services/personalizedRecommendationService.js';

const router = express.Router();

/**
 * @route GET /api/personalized/rankings
 * @desc 사용자 맞춤 랭킹 조회 (전체, 연령대, 성별, 선호 페르소나, 경험치)
 * @query userKey, type (daily/weekly/monthly/exp), limit
 */
router.get('/rankings', async (req, res) => {
    const { userKey, type = 'daily', limit = 20 } = req.query;

    if (!userKey) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: 'userKey is required'
        });
    }

    try {
        let personalizedData;
        if (type === 'exp') {
            personalizedData = await getExpRankings(userKey, Number(limit));
        } else {
            personalizedData = await getPersonalizedRankings(userKey, type, Number(limit));
        }

        res.json({
            resultType: 'SUCCESS',
            data: personalizedData
        });
    } catch (error) {
        console.error('[PersonalizedAPI] Failed to get personalized rankings:', error);
        const status = error.message === 'USER_NOT_FOUND' ? 404 : 500;
        const code = error.message === 'USER_NOT_FOUND' ? 'USER_NOT_FOUND' : 'INTERNAL_ERROR';
        res.status(status).json({ resultType: 'FAIL', error: { code, message: error.message } });
    }
});

/**
 * @route GET /api/personalized/recommended-personas
 * @desc 사용자 맞춤 추천 페르소나
 * @query userKey, limit
 */
router.get('/recommended-personas', async (req, res) => {
    const { userKey, limit = 10 } = req.query;

    if (!userKey) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: 'userKey is required'
        });
    }

    try {
        const recommendedPersonas = await getRecommendedPersonas(userKey, Number(limit));

        res.json({
            resultType: 'SUCCESS',
            data: recommendedPersonas
        });
    } catch (error) {
        console.error('[PersonalizedAPI] Failed to get recommended personas:', error);
        res.status(500).json({ resultType: 'FAIL', error: error.message });
    }
});

/**
 * @route GET /api/personalized/recommended-situations
 * @desc 사용자 맞춤 추천 상황
 * @query userKey, limit
 */
router.get('/recommended-situations', async (req, res) => {
    const { userKey, limit = 10 } = req.query;

    if (!userKey) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: 'userKey is required'
        });
    }

    try {
        const recommendedSituations = await getRecommendedSituations(userKey, Number(limit));

        res.json({
            resultType: 'SUCCESS',
            data: recommendedSituations
        });
    } catch (error) {
        console.error('[PersonalizedAPI] Failed to get recommended situations:', error);
        res.status(500).json({ resultType: 'FAIL', error: error.message });
    }
});

/**
 * @route GET /api/personalized/activity-summary
 * @desc 사용자 활동 요약 통계
 * @query userKey
 */
router.get('/activity-summary', async (req, res) => {
    const { userKey } = req.query;

    if (!userKey) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: 'userKey is required'
        });
    }

    try {
        const summary = await getUserActivitySummary(userKey);

        res.json({
            resultType: 'SUCCESS',
            data: summary
        });
    } catch (error) {
        console.error('[PersonalizedAPI] Failed to get activity summary:', error);
        res.status(500).json({ resultType: 'FAIL', error: error.message });
    }
});

export default router;
