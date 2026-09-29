/**
 * [Roulette] 포인트 룰렛 라우터
 * Base: /api/v2/roulette
 *
 * POST /spin — 룰렛 돌리기 (티켓 1장 소모 → 포인트 보상)
 * 확률: 1P(50%) / 2P(40%) / 3P(9%) / 5P(0.8%) / 10P(0.2%)
 */
import express from 'express';
import { firestore, FieldValue } from '../../lib/firebaseAdmin.js';
import { getKstDateKey, getUserDocRef, logUserAction } from '../../utils/helpers.js';
import { deductTicket } from '../../services/userService.js';
import { spinRoulette } from '../../services/contentGeneratorService.js';

const router = express.Router();

const toErrorResponse = (code, message) => ({
  resultType: 'FAIL',
  data: null,
  error: { code, message: message || code },
});

// ─── POST /api/v2/roulette/spin ─────────────────────────────────────────────
router.post('/spin', async (req, res) => {
  const userKey = req.get('x-user-key') || req.body?.userKey;
  if (!userKey) {
    return res.status(400).json(toErrorResponse('MISSING_USER_KEY', 'userKey가 필요합니다.'));
  }

  try {
    // 1. 티켓 차감 (1장)
    const ticketResult = await deductTicket(userKey);

    // 2. 룰렛 스핀 (확률 기반 포인트 결정)
    const spinResult = spinRoulette();

    // 3. 포인트 지급 (트랜잭션)
    const userRef = getUserDocRef(userKey);
    const dateKey = getKstDateKey();

    const pointsResult = await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const data = snap.exists ? snap.data() : {};
      const currentPoints = data.points || 0;
      const newPoints = currentPoints + spinResult.points;
      const rouletteCount = (data.rouletteCount || 0) + 1;
      const roulettePointsTotal = (data.roulettePointsTotal || 0) + spinResult.points;

      tx.set(userRef, {
        points: newPoints,
        rouletteCount,
        roulettePointsTotal,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return { points: newPoints, rouletteCount, roulettePointsTotal };
    });

    // 4. 로그 기록
    logUserAction(userKey, 'ROULETTE_SPIN', {
      pointsAwarded: spinResult.points,
      totalPoints: pointsResult.points,
      tickets: ticketResult.tickets,
      date: dateKey,
    }).catch(() => {});

    return res.json({
      resultType: 'SUCCESS',
      data: {
        pointsAwarded: spinResult.points,
        totalPoints: pointsResult.points,
        tickets: ticketResult.tickets,
        rouletteCount: pointsResult.rouletteCount,
      },
      error: null,
    });
  } catch (error) {
    console.error('[roulette/spin]', error);
    if (error.message === 'INSUFFICIENT_TICKETS') {
      return res.status(403).json(toErrorResponse('INSUFFICIENT_TICKETS', '티켓이 부족합니다.'));
    }
    const code = error.message || 'INTERNAL_ERROR';
    return res.status(500).json(toErrorResponse(code, '룰렛 돌리기에 실패했습니다.'));
  }
});

export default router;
