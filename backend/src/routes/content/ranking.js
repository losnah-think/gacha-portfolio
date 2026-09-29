import express from 'express';
import { getTopRankings, getUserRanking } from '../../services/rankingService.js';

const router = express.Router();

/**
 * @route GET /api/ranking/:type
 * @desc 랭킹 조회 (daily, weekly, monthly)
 * @query limit, lastUserKey, segment, gender
 */
router.get(['/daily', '/weekly', '/monthly'], async (req, res) => {
    const type = req.path.replace(/\//g, ''); // Extract 'daily', 'weekly', or 'monthly'
    const { limit = 20, lastUserKey, segment, gender } = req.query;

    try {
        const filters = {};
        if (segment) filters.segment = segment;
        if (gender) filters.gender = gender;

        const rankings = await getTopRankings(
            type,
            Number(limit),
            lastUserKey || null,
            filters
        );

        // 다음 페이지를 위한 정보 추출
        const lastItem = rankings.length > 0 ? rankings[rankings.length - 1] : null;

        res.json({
            resultType: 'SUCCESS',
            data: {
                rankings,
                filters,
                pagination: {
                    hasNext: rankings.length === Number(limit),
                    lastUserKey: lastItem ? lastItem.userKey : null
                }
            }
        });
    } catch (error) {
        console.error(`[RankingAPI] ${type} fetch failed:`, error);
        res.status(500).json({ resultType: 'FAIL', error: error.message });
    }
});

/**
 * @route GET /api/ranking/:period/me
 * @desc 내 랭킹 정보 조회
 * @query userKey, segment, gender
 */
router.get(['/daily/me', '/weekly/me', '/monthly/me'], async (req, res) => {
    const period = req.path.split('/')[1]; // daily, weekly, or monthly
    const { userKey, segment, gender } = req.query;

    if (!userKey) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: 'userKey is required'
        });
    }

    try {
        const filters = {};
        const safeSegment = (segment && segment !== 'unknown' && segment !== 'undefined' && segment !== 'null') ? segment : null;
        const safeGender = (gender && (gender === 'male' || gender === 'female')) ? gender : null;

        if (safeSegment) filters.segment = safeSegment;
        if (safeGender) filters.gender = safeGender;

        const myRank = await getUserRanking(userKey, period, filters);

        if (!myRank) {
            return res.status(404).json({
                resultType: 'FAIL',
                error: {
                    code: 'USER_NOT_FOUND',
                    message: '사용자를 찾을 수 없습니다.'
                }
            });
        }

        res.json({
            resultType: 'SUCCESS',
            data: myRank
        });
    } catch (error) {
        console.error(`[RankingAPI] My rank fetch failed:`, error);
        res.status(500).json({ resultType: 'FAIL', error: error.message });
    }
});

export default router;
