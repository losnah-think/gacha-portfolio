/**
 * [Scratch Lottery] Router
 * Base: /api/v2/scratch
 *
 * POST /start     — 복권 세션 시작 (5장 발급)
 * POST /unlock    — 티켓 잠금 해제 (광고 시청 후)
 * POST /reveal    — 복권 긁기 (포인트 적립)
 * POST /refresh   — 전체 새로고침 (5장 완료 후 광고 시청)
 * GET  /stats     — 복권 통계 조회
 */
import express from 'express';
import {
    startScratchSession,
    unlockScratchTicket,
    revealScratchTicket,
    refreshScratchSession,
    getScratchStats,
    getPrizeTable,
} from '../../services/scratchService.js';

const router = express.Router();

// ─── Error Mapping ──────────────────────────────────────────────────────────
const ERROR_STATUS_MAP = {
    MISSING_USER_KEY: 400,
    MISSING_SESSION_ID: 400,
    MISSING_TICKET_ID: 400,
    USER_NOT_FOUND: 404,
    SESSION_NOT_FOUND: 404,
    TICKET_NOT_FOUND: 404,
    SESSION_NOT_ACTIVE: 400,
    SESSION_EXPIRED: 400,
    SESSION_NOT_COMPLETED: 400,
    TICKET_ALREADY_READY: 400,
    TICKET_ALREADY_UNLOCKED: 400,
    TICKET_ALREADY_REVEALED: 400,
    TICKET_STILL_LOCKED: 400,
    AD_VERIFICATION_FAILED: 403,
    DAILY_SESSION_LIMIT: 429,
};

const toErrorResponse = (code, message) => ({
    resultType: 'FAIL',
    error: { code, message: message || code },
});

const normalizeScratchWalletFields = (payload) => {
    if (!payload || typeof payload !== 'object') return payload;

    const points = payload.userPoints ?? payload.points ?? payload.currentPoints ?? payload.balancePoints;
    if (points == null) return payload;

    return {
        ...payload,
        userPoints: points,
        points,
        pointCount: points,
        currentPoints: points,
        balancePoints: points,
    };
};

// ─── Routes ─────────────────────────────────────────────────────────────────

/** * GET /api/v2/scratch/config
 * 현재 확률 테이블 조회 (프론트엔드 표시용)
 */
router.get('/config', async (req, res) => {
    try {
        const prizeTable = await getPrizeTable();
        res.set('Cache-Control', 'public, max-age=300'); // 5분 캐시
        return res.json({
            resultType: 'SUCCESS',
            data: { prizeTable },
        });
    } catch (error) {
        console.error('[scratch/config]', error);
        return res.status(500).json(toErrorResponse('INTERNAL_ERROR', error.message));
    }
});

/** * POST /api/v2/scratch/start
 * 복권 세션 시작
 */
router.post('/start', async (req, res) => {
    const { userKey } = req.body || {};
    if (!userKey) {
        return res.status(400).json(toErrorResponse('MISSING_USER_KEY', 'userKey가 필요합니다.'));
    }

    try {
        const data = normalizeScratchWalletFields(await startScratchSession(userKey));
        return res.json({
            resultType: 'SUCCESS',
            points: data.points,
            pointCount: data.pointCount,
            currentPoints: data.currentPoints,
            balancePoints: data.balancePoints,
            data,
        });
    } catch (error) {
        const code = error.code || error.message || 'INTERNAL_ERROR';
        const status = ERROR_STATUS_MAP[code] || 500;
        if (status === 500) console.error('[scratch/start]', error);
        return res.status(status).json(toErrorResponse(code, error.message));
    }
});

/**
 * POST /api/v2/scratch/unlock
 * 광고 시청 후 티켓 잠금 해제
 */
router.post('/unlock', async (req, res) => {
    const { userKey, sessionId, ticketId, adVerification } = req.body || {};
    if (!userKey || !sessionId || ticketId == null) {
        return res.status(400).json(toErrorResponse('MISSING_PARAMS', 'userKey, sessionId, ticketId가 필요합니다.'));
    }

    try {
        const data = await unlockScratchTicket({
            userKey,
            sessionId,
            ticketId: Number(ticketId),
            adVerification,
        });
        return res.json({ resultType: 'SUCCESS', data });
    } catch (error) {
        const code = error.code || error.message || 'INTERNAL_ERROR';
        const status = ERROR_STATUS_MAP[code] || 500;
        if (status === 500) console.error('[scratch/unlock]', error);
        return res.status(status).json(toErrorResponse(code, error.message));
    }
});

/**
 * POST /api/v2/scratch/reveal
 * 복권 긁기 — 포인트 적립
 */
router.post('/reveal', async (req, res) => {
    const { userKey, sessionId, ticketId } = req.body || {};
    if (!userKey || !sessionId || ticketId == null) {
        return res.status(400).json(toErrorResponse('MISSING_PARAMS', 'userKey, sessionId, ticketId가 필요합니다.'));
    }

    try {
        const data = normalizeScratchWalletFields(await revealScratchTicket({
            userKey,
            sessionId,
            ticketId: Number(ticketId),
        }));
        return res.json({
            resultType: 'SUCCESS',
            points: data.points,
            pointCount: data.pointCount,
            currentPoints: data.currentPoints,
            balancePoints: data.balancePoints,
            data,
        });
    } catch (error) {
        const code = error.code || error.message || 'INTERNAL_ERROR';
        const status = ERROR_STATUS_MAP[code] || 500;
        if (status === 500) console.error('[scratch/reveal]', error);
        return res.status(status).json(toErrorResponse(code, error.message));
    }
});

/**
 * POST /api/v2/scratch/refresh
 * 5장 완료 후 광고 시청 → 새 세션
 */
router.post('/refresh', async (req, res) => {
    const { userKey, sessionId, adVerification } = req.body || {};
    if (!userKey || !sessionId) {
        return res.status(400).json(toErrorResponse('MISSING_PARAMS', 'userKey, sessionId가 필요합니다.'));
    }

    try {
        const data = normalizeScratchWalletFields(await refreshScratchSession({ userKey, sessionId, adVerification }));
        return res.json({
            resultType: 'SUCCESS',
            points: data.points,
            pointCount: data.pointCount,
            currentPoints: data.currentPoints,
            balancePoints: data.balancePoints,
            data,
        });
    } catch (error) {
        const code = error.code || error.message || 'INTERNAL_ERROR';
        const status = ERROR_STATUS_MAP[code] || 500;
        if (status === 500) console.error('[scratch/refresh]', error);
        return res.status(status).json(toErrorResponse(code, error.message));
    }
});

/**
 * GET /api/v2/scratch/stats
 * 복권 통계 조회
 */
router.get('/stats', async (req, res) => {
    const { userKey } = req.query;
    if (!userKey) {
        return res.status(400).json(toErrorResponse('MISSING_USER_KEY', 'userKey가 필요합니다.'));
    }

    try {
        const data = await getScratchStats(userKey);
        return res.json({ resultType: 'SUCCESS', data });
    } catch (error) {
        const code = error.code || error.message || 'INTERNAL_ERROR';
        const status = ERROR_STATUS_MAP[code] || 500;
        if (status === 500) console.error('[scratch/stats]', error);
        return res.status(status).json(toErrorResponse(code, error.message));
    }
});

export default router;
