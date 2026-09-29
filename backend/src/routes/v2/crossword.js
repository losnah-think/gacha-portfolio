/**
 * [Crossword] 단어찾기 퍼즐 라우터
 * Base: /api/v2/crossword
 *
 * POST /generate   — 새 랜덤 퍼즐 생성 (세션 발급)
 * POST /unlock     — 티켓 1장 소모하여 잠금해제
 * POST /submit     — 단어 찾기 제출 (서버 검증 + 포인트 지급)
 * POST /claim-free — 단어찾기 전용 일일 무료 티켓 수령
 */
import express from 'express';
import {
  generatePuzzle,
  unlockPuzzle,
  submitWord,
  claimFreeTicket,
} from '../../services/crosswordService.js';

const router = express.Router();

// ─── Error Mapping ──────────────────────────────────────────────────────────
const ERROR_STATUS_MAP = {
  MISSING_USER_KEY: 400,
  MISSING_SESSION_ID: 400,
  MISSING_PARAMS: 400,
  NOT_UNLOCKED: 400,
  ALREADY_FOUND: 400,
  ALREADY_SOLVED: 400,
  ALREADY_UNLOCKED: 200,
  ALREADY_CLAIMED: 409,
  INSUFFICIENT_TICKETS: 403,
  SESSION_NOT_FOUND: 404,
  PUZZLE_GENERATION_FAILED: 500,
};

const toErrorResponse = (code, message) => ({
  resultType: 'FAIL',
  data: null,
  error: { code, message: message || code },
});

// ─── POST /api/v2/crossword/generate ────────────────────────────────────────

router.post('/generate', async (req, res) => {
  const userKey = req.get('x-user-key') || req.body?.userKey;
  if (!userKey) {
    return res.status(400).json(toErrorResponse('MISSING_USER_KEY', 'userKey가 필요합니다.'));
  }

  try {
    const data = await generatePuzzle(userKey);
    return res.json({ resultType: 'SUCCESS', data, error: null });
  } catch (error) {
    console.error('[crossword/generate]', error);
    const code = error.message || 'INTERNAL_ERROR';
    const status = ERROR_STATUS_MAP[code] || 500;
    return res.status(status).json(toErrorResponse(code, error.message));
  }
});

// ─── POST /api/v2/crossword/unlock ──────────────────────────────────────────

router.post('/unlock', async (req, res) => {
  const userKey = req.get('x-user-key') || req.body?.userKey;
  if (!userKey) {
    return res.status(400).json(toErrorResponse('MISSING_USER_KEY', 'userKey가 필요합니다.'));
  }

  const { sessionId } = req.body || {};
  if (!sessionId) {
    return res.status(400).json(toErrorResponse('MISSING_SESSION_ID', 'sessionId가 필요합니다.'));
  }

  try {
    const data = await unlockPuzzle(userKey, sessionId);

    // ALREADY_UNLOCKED은 정상 처리 (티켓 미소모)
    if (data.alreadyUnlocked) {
      return res.json({
        resultType: 'SUCCESS',
        data: {
          unlocked: data.unlocked,
          tickets: data.tickets,
          sessionId: data.sessionId,
        },
        error: null,
      });
    }

    return res.json({
      resultType: 'SUCCESS',
      data: {
        unlocked: data.unlocked,
        tickets: data.tickets,
        sessionId: data.sessionId,
      },
      error: null,
    });
  } catch (error) {
    console.error('[crossword/unlock]', error);
    const code = error.message || 'INTERNAL_ERROR';

    if (code === 'INSUFFICIENT_TICKETS') {
      return res.status(403).json(toErrorResponse('INSUFFICIENT_TICKETS', '티켓이 부족합니다.'));
    }

    const status = ERROR_STATUS_MAP[code] || 500;
    return res.status(status).json(toErrorResponse(code, error.message));
  }
});

// ─── POST /api/v2/crossword/submit ──────────────────────────────────────────

router.post('/submit', async (req, res) => {
  const userKey = req.get('x-user-key') || req.body?.userKey;
  if (!userKey) {
    return res.status(400).json(toErrorResponse('MISSING_USER_KEY', 'userKey가 필요합니다.'));
  }

  const { sessionId, wordId, cells } = req.body || {};

  if (!sessionId) {
    return res.status(400).json(toErrorResponse('MISSING_SESSION_ID', 'sessionId가 필요합니다.'));
  }
  if (wordId === undefined || wordId === null) {
    return res.status(400).json(toErrorResponse('MISSING_PARAMS', 'wordId가 필요합니다.'));
  }
  if (!Array.isArray(cells) || cells.length === 0) {
    return res.status(400).json(toErrorResponse('MISSING_PARAMS', 'cells 배열이 필요합니다.'));
  }

  try {
    const data = await submitWord(userKey, sessionId, wordId, cells);
    return res.json({ resultType: 'SUCCESS', data, error: null });
  } catch (error) {
    console.error('[crossword/submit]', error);
    const code = error.message || 'INTERNAL_ERROR';

    if (code === 'NOT_UNLOCKED') {
      return res.status(400).json(toErrorResponse('NOT_UNLOCKED', '퍼즐 잠금해제가 필요합니다.'));
    }
    if (code === 'ALREADY_FOUND') {
      return res.status(400).json(toErrorResponse('ALREADY_FOUND', '이미 찾은 단어입니다.'));
    }
    if (code === 'ALREADY_SOLVED') {
      return res.status(400).json(toErrorResponse('ALREADY_SOLVED', '이미 완료된 퍼즐입니다.'));
    }

    const status = ERROR_STATUS_MAP[code] || 500;
    return res.status(status).json(toErrorResponse(code, error.message));
  }
});

// ─── POST /api/v2/crossword/claim-free ──────────────────────────────────────

router.post('/claim-free', async (req, res) => {
  const userKey = req.get('x-user-key') || req.body?.userKey;
  if (!userKey) {
    return res.status(400).json(toErrorResponse('MISSING_USER_KEY', 'userKey가 필요합니다.'));
  }

  try {
    const data = await claimFreeTicket(userKey);
    return res.json({ resultType: 'SUCCESS', data, error: null });
  } catch (error) {
    console.error('[crossword/claim-free]', error);
    const code = error.message || 'INTERNAL_ERROR';

    if (code === 'ALREADY_CLAIMED') {
      return res.status(409).json(toErrorResponse('ALREADY_CLAIMED', '오늘 이미 수령했습니다.'));
    }

    const status = ERROR_STATUS_MAP[code] || 500;
    return res.status(status).json(toErrorResponse(code, error.message));
  }
});

export default router;
