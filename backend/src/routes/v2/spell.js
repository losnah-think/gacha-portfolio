/**
 * [Spell] 오늘의 주문 라우터
 * Base: /api/v2/spell
 *
 * POST /today — 오늘의 주문 생성/조회 (티켓 1장 소모, 운세 확인 필수)
 */
import express from 'express';
import { firestore } from '../../lib/firebaseAdmin.js';
import { getKstDateKey } from '../../utils/helpers.js';
import { deductTicket } from '../../services/userService.js';
import { generateSpell } from '../../services/contentGeneratorService.js';

const router = express.Router();

const toErrorResponse = (code, message) => ({
  resultType: 'FAIL',
  data: null,
  error: { code, message: message || code },
});

// ─── POST /api/v2/spell/today ───────────────────────────────────────────────
router.post('/today', async (req, res) => {
  const userKey = req.get('x-user-key') || req.body?.userKey;
  if (!userKey) {
    return res.status(400).json(toErrorResponse('MISSING_USER_KEY', 'userKey가 필요합니다.'));
  }

  const { gender, birthday, ageGroup } = req.body || {};

  try {
    // 1. 이미 생성된 주문이 있으면 캐시 반환 (티켓 미차감)
    const dateKey = getKstDateKey();
    const docId = `${userKey}_${dateKey}`;
    const existing = await firestore.collection('spell_results').doc(docId).get();
    if (existing.exists) {
      const d = existing.data();
      return res.json({
        resultType: 'SUCCESS',
        data: { spell: d.spell, description: d.description, expiresAt: d.expiresAt },
        error: null,
      });
    }

    // 2. 운세를 먼저 봐야만 주문 생성 가능
    const fortuneSnap = await firestore.collection('fortunes')
      .where('userKey', '==', String(userKey))
      .where('date', '==', dateKey)
      .limit(1)
      .get();

    if (fortuneSnap.empty) {
      return res.status(403).json(toErrorResponse('FORTUNE_REQUIRED', '오늘의 운세를 먼저 확인해주세요.'));
    }

    // 3. 티켓 차감 (1장)
    const ticketResult = await deductTicket(userKey);

    // 4. AI 주문 생성
    const data = await generateSpell(userKey, { gender, birthday, ageGroup });

    return res.json({
      resultType: 'SUCCESS',
      data: { ...data, tickets: ticketResult.tickets },
      error: null,
    });
  } catch (error) {
    console.error('[spell/today]', error);
    if (error.message === 'INSUFFICIENT_TICKETS') {
      return res.status(403).json(toErrorResponse('INSUFFICIENT_TICKETS', '티켓이 부족합니다.'));
    }
    const code = error.message || 'INTERNAL_ERROR';
    return res.status(500).json(toErrorResponse(code, '주문 생성에 실패했습니다.'));
  }
});

export default router;
