/**
 * [Lotto Machine] Router
 * Base: /api/v2/lotto
 *
 * POST /draw      — 티켓 1장 소모 후 6개 번호 반환
 * GET  /history   — 뽑기 히스토리 조회 (향후)
 */
import express from 'express';
import { drawLottoNumbers, getLottoHistory } from '../../services/lottoService.js';

const router = express.Router();

// ─── Error Mapping ───────────────────────────────────────────────────────────
const ERROR_STATUS_MAP = {
    MISSING_USER_KEY: 400,
    USER_NOT_FOUND: 404,
    INSUFFICIENT_TICKETS: 402,
    DAILY_LIMIT_EXCEEDED: 429,
    INTERNAL_ERROR: 500,
};

const toErrorResponse = (code, message) => ({
    resultType: 'FAIL',
    data: null,
    error: { code, message: message || code },
});

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v2/lotto/draw
 * 티켓 1장 소모 → 1~45 중 6개 번호 서버 생성 → 히스토리 저장
 */
router.post('/draw', async (req, res) => {
    const { userKey } = req.body || {};
    if (!userKey) {
        return res.status(400).json(toErrorResponse('MISSING_USER_KEY', 'userKey가 필요합니다.'));
    }

    try {
        const data = await drawLottoNumbers(String(userKey));
        return res.json({ resultType: 'SUCCESS', data, error: null });
    } catch (error) {
        const code = error.code || error.message || 'INTERNAL_ERROR';
        const status = ERROR_STATUS_MAP[code] || 500;

        if (status === 500) {
            console.error('[lotto/draw] Unexpected error:', error);
        }

        const MESSAGE_MAP = {
            INSUFFICIENT_TICKETS: '티켓이 부족해요',
            DAILY_LIMIT_EXCEEDED: '오늘 로또 뽑기 한도를 모두 사용했어요',
            USER_NOT_FOUND: '유저를 찾을 수 없어요',
        };

        return res.status(status).json(toErrorResponse(code, MESSAGE_MAP[code] || error.message));
    }
});

/**
 * GET /api/v2/lotto/history
 * 로또 뽑기 히스토리 조회
 */
router.get('/history', async (req, res) => {
    const { userKey, limit } = req.query || {};
    if (!userKey) {
        return res.status(400).json(toErrorResponse('MISSING_USER_KEY', 'userKey가 필요합니다.'));
    }

    try {
        const data = await getLottoHistory(String(userKey), limit ? Number(limit) : 20);
        return res.json({ resultType: 'SUCCESS', data, error: null });
    } catch (error) {
        console.error('[lotto/history] Unexpected error:', error);
        return res.status(500).json(toErrorResponse('INTERNAL_ERROR', error.message));
    }
});

export default router;
