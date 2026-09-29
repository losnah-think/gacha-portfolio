import express from 'express';
import { getDailyRewardProgress, getRewardHistory } from '../../services/userService.js';

const router = express.Router();

/**
 * GET /api/v3/reward/daily-progress
 * 오늘의 리워드 진행도 조회
 */
router.get('/daily-progress', async (req, res) => {
    const { userKey } = req.query;
    if (!userKey) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: { code: 'MISSING_USER_KEY', message: 'userKey가 필요합니다.' }
        });
    }

    try {
        const data = await getDailyRewardProgress(userKey);
        // 가차 직후 뒤로가기 시 최신 포인트가 덮어써지지 않도록 캐시 비활성화
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.json({
            resultType: 'SUCCESS',
            data
        });
    } catch (error) {
        console.error('[rewardV3] daily-progress error:', error);
        res.status(500).json({
            resultType: 'FAIL',
            error: { code: 'INTERNAL_ERROR', message: error.message }
        });
    }
});

/**
 * GET /api/v3/reward/history
 * 리워드 히스토리 조회
 */
router.get('/history', async (req, res) => {
    const { userKey, cursor, limit } = req.query;
    if (!userKey) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: { code: 'MISSING_USER_KEY', message: 'userKey가 필요합니다.' }
        });
    }

    try {
        const data = await getRewardHistory(userKey, cursor, limit);
        // 히스토리는 변경 빈도 낮음 → 1분 SWR (#7)
        res.set('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=120');
        res.json({
            resultType: 'SUCCESS',
            data
        });
    } catch (error) {
        console.error('[rewardV3] history error:', error);
        res.status(500).json({
            resultType: 'FAIL',
            error: { code: 'INTERNAL_ERROR', message: error.message }
        });
    }
});

export default router;
