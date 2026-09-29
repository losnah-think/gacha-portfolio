/**
 * [Ladder] 사다리타기 게임 라우터
 * Base: /api/v2/ladder
 *
 * POST /play — 사다리 1회 플레이 (무료, 일 3회 제한 → 포인트 보상)
 * 확률(가중치): 1P(50%) / 2P(40%) / 3P(14%) / 5P(5%) / 10P(1%)
 */
import express from 'express';
import { logUserAction } from '../../utils/helpers.js';
import { playLadder } from '../../services/ladderService.js';

const router = express.Router();

const toErrorResponse = (code, message) => ({
    resultType: 'FAIL',
    data: null,
    error: { code, message: message || code },
});

// ─── POST /api/v2/ladder/play ────────────────────────────────────────────────
router.post('/play', async (req, res) => {
    const userKey = req.get('x-user-key') || req.body?.userKey;
    if (!userKey) {
        return res.status(400).json(toErrorResponse('MISSING_USER_KEY', 'userKey가 필요합니다.'));
    }

    try {
        const result = await playLadder(userKey);

        logUserAction(userKey, 'LADDER_PLAY', {
            pointsAwarded: result.points,
            totalPoints: result.newPointsTotal,
            playsToday: result.playsToday,
        }).catch(() => { });

        return res.json({ resultType: 'SUCCESS', data: result, error: null });
    } catch (error) {
        if (error.code === 'DAILY_LIMIT_EXCEEDED' || error.message === 'DAILY_LIMIT_EXCEEDED') {
            return res.status(429).json(toErrorResponse('DAILY_LIMIT_EXCEEDED', '오늘의 사다리 게임 횟수를 모두 사용했어요.'));
        }
        console.error('[ladder/play]', error);
        return res.status(500).json(toErrorResponse('INTERNAL_ERROR', '사다리 게임에 실패했습니다.'));
    }
});

export default router;
