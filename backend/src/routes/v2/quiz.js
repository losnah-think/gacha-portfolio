/**
 * [Quiz] O/X 퀴즈 라우터
 * Base: /api/v2/quiz
 *
 * GET  /questions   — 랜덤 O/X 문제 조회 (티켓 1장 차감)
 * POST /submit      — 퀴즈 결과 제출 (서버 채점 + 포인트 지급)
 */
import express from 'express';
import { startQuizSession, submitQuizAnswers } from '../../services/quizService.js';

const router = express.Router();

// ─── Error Mapping ──────────────────────────────────────────────────────────
const ERROR_STATUS_MAP = {
  MISSING_USER_KEY: 400,
  INVALID_SESSION: 400,
  ALREADY_SUBMITTED: 400,
  INSUFFICIENT_TICKETS: 403,
  NO_QUESTIONS_AVAILABLE: 500,
};

const toErrorResponse = (code, message) => ({
  resultType: 'FAIL',
  data: null,
  error: { code, message: message || code },
});

// ─── GET /api/v2/quiz/questions ─────────────────────────────────────────────

router.get('/questions', async (req, res) => {
  const userKey = req.get('x-user-key') || req.query.userKey;
  if (!userKey) {
    return res.status(400).json(toErrorResponse('MISSING_USER_KEY', 'userKey가 필요합니다.'));
  }

  const count = Number(req.query.count) || 10;

  try {
    const data = await startQuizSession(userKey, count);
    return res.json({
      resultType: 'SUCCESS',
      data,
      error: null,
    });
  } catch (error) {
    console.error('[quiz/questions]', error);
    const code = error.message || 'INTERNAL_ERROR';
    const status = ERROR_STATUS_MAP[code] || 500;

    if (code === 'INSUFFICIENT_TICKETS') {
      return res.status(status).json({
        resultType: 'FAIL',
        data: null,
        error: {
          code: 'INSUFFICIENT_TICKETS',
          message: '티켓이 부족합니다',
        },
      });
    }

    return res.status(status).json(toErrorResponse(code, error.message));
  }
});

// ─── POST /api/v2/quiz/submit ───────────────────────────────────────────────

router.post('/submit', async (req, res) => {
  const userKey = req.get('x-user-key') || req.body?.userKey;
  if (!userKey) {
    return res.status(400).json(toErrorResponse('MISSING_USER_KEY', 'userKey가 필요합니다.'));
  }

  const { sessionId, answers } = req.body || {};

  if (!sessionId) {
    return res.status(400).json(toErrorResponse('INVALID_SESSION', '세션 ID가 필요합니다.'));
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json(toErrorResponse('INVALID_ANSWERS', '답안 배열이 필요합니다.'));
  }

  try {
    const data = await submitQuizAnswers(userKey, sessionId, answers);
    return res.json({
      resultType: 'SUCCESS',
      data,
      error: null,
    });
  } catch (error) {
    console.error('[quiz/submit]', error);
    const code = error.message || 'INTERNAL_ERROR';
    const status = ERROR_STATUS_MAP[code] || 500;
    return res.status(status).json(toErrorResponse(code, error.message));
  }
});

export default router;
