/**
 * [Talisman] 오늘의 부적 라우터
 * Base: /api/v2/talisman
 *
 * POST /generate — 부적 텍스트 생성/조회
 */
import express from 'express';
import { generateTalisman } from '../../services/contentGeneratorService.js';

const router = express.Router();

const VALID_CATEGORIES = ['ward', 'exam', 'love', 'wealth', 'health'];

const toErrorResponse = (code, message) => ({
  resultType: 'FAIL',
  data: null,
  error: { code, message: message || code },
});

// ─── POST /api/v2/talisman/generate ─────────────────────────────────────────
router.post('/generate', async (req, res) => {
  const userKey = req.get('x-user-key') || req.body?.userKey;
  if (!userKey) {
    return res.status(400).json(toErrorResponse('MISSING_USER_KEY', 'userKey가 필요합니다.'));
  }

  const { category, date } = req.body || {};

  if (!category || !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json(
      toErrorResponse('INVALID_CATEGORY', `카테고리는 ${VALID_CATEGORIES.join(', ')} 중 하나여야 합니다.`)
    );
  }

  try {
    const data = await generateTalisman(userKey, category, date);
    return res.json({
      resultType: 'SUCCESS',
      data,
      error: null,
    });
  } catch (error) {
    console.error('[talisman/generate]', error);
    const code = error.message || 'INTERNAL_ERROR';
    return res.status(500).json(toErrorResponse(code, '부적 생성에 실패했습니다.'));
  }
});

export default router;
