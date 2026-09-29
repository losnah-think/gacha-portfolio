/**
 * [Reward Gacha] Router
 * Base: /api/v2/reward-gacha
 *
 * 2?�계 Pre-roll ?�름:
 *   1. POST /pre-roll  ??백엔?�에??결과�?먼�? 결정 ??drawId + prize 반환 (?�켓 미차�?
 *   2. POST /confirm   ??drawId�??�?�된 결과�??�정, ?�켓 차감 + ?�인???�립
 *
 * (구형 ?�일?�출 ?�환)
 *   POST /draw         ??기존 1?�계 ?�출 ?�환 ?��?
 *   POST /ad-draw      ??리워??광고 ???�인??지�?
 *   GET  /config       ???�률 ?�이�?조회
 */
import express from 'express';
import { deductTicket, applyRewardActivity } from '../../services/userService.js';
import { getTicketBalance, getUserDocRef, logUserAction } from '../../utils/helpers.js';
import { firestore, FieldValue } from '../../lib/firebaseAdmin.js';
import { REWARD_GACHA_CONFIG } from '../../config/rewardGacha.js';

// ?�?�?� Prize Table (Firestore-backed, 5�?캐시) ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
let _prizeCache = null;

const getPrizeTable = async () => {
    if (_prizeCache && Date.now() < _prizeCache.expiresAt) return _prizeCache.table;
    try {
        const snap = await firestore.collection('app_config').doc('reward_gacha_config').get();
        if (snap.exists && Array.isArray(snap.data().prizeTable) && snap.data().prizeTable.length > 0) {
            _prizeCache = { table: snap.data().prizeTable, expiresAt: Date.now() + 5 * 60 * 1000 };
            return _prizeCache.table;
        }
    } catch (e) {
        console.warn('[reward-gacha] prize table fetch failed, using default:', e.message);
    }
    return REWARD_GACHA_CONFIG.PRIZE_TABLE;
};

const rollPrize = async () => {
    const table = await getPrizeTable();
    const r = Math.random();
    let cum = 0;
    for (const entry of table) {
        cum += entry.chance;
        if (r < cum) return { label: entry.label, points: entry.points, rarity: entry.rarity };
    }
    return { label: table[0].label, points: table[0].points, rarity: table[0].rarity };
};

const genDrawId = () => `rg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/** ?�인???�립 + point_history (?�랜??��) */
const grantPrizePoints = async (userKey, prize, drawId) => {
    const userRef = getUserDocRef(userKey);
    const histRef = userRef.collection('point_history').doc(`rgacha_${drawId}`);

    return firestore.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        const d = snap.exists ? snap.data() : {};
        const newPoints = (d.points ?? 0) + prize.points;

        tx.set(userRef, { points: newPoints, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        tx.set(histRef, {
            type: 'POINT_GRANT',
            source: 'REWARD_GACHA',
            points: prize.points,
            description: `캡슐 뽑기 ${prize.label} ?�첨`,
            rarity: prize.rarity,
            drawId,
            createdAt: FieldValue.serverTimestamp(),
        });

        return newPoints;
    });
};

// ?�?�?� Router ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
const router = express.Router();

const ERROR_STATUS_MAP = {
    MISSING_USER_KEY: 400,
    MISSING_DRAW_ID: 400,
    MISSING_DRAW_TYPE: 400,
    INSUFFICIENT_TICKETS: 400,
    DRAW_NOT_FOUND: 404,
    DRAW_ALREADY_CONFIRMED: 409,
    DRAW_EXPIRED: 410,
    USER_NOT_FOUND: 404,
    DUPLICATE_REQUEST: 409,
    REWARD_ACTIVITY_DUPLICATED: 200,
    RATE_LIMIT_EXCEEDED: 429,
};

const toError = (code, message) => ({ resultType: 'FAIL', error: { code, message: message || code } });

const makeWallet = (points, tickets, addedPoints = 0) => ({
    balancePoints: points,
    currentPoints: points,
    pointCount: points,
    points,
    addedPoints,
    grantedPoints: addedPoints,
    tickets,
});

// ?�?�?� GET /config ?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�?�
router.get('/config', async (req, res) => {
    try {
        const table = await getPrizeTable();
        res.set('Cache-Control', 'public, max-age=300');
        return res.json({ resultType: 'SUCCESS', data: { prizeTable: table } });
    } catch (e) {
        return res.status(500).json(toError('INTERNAL_ERROR', e.message));
    }
});

/**
 * POST /api/v2/reward-gacha/pre-roll
 *
 * 백엔?�에??결과�?먼�? 결정?�고 ?�론?�에 줍니??
 * ?�켓 차감 ?�음. ?�론?�는 ??prize�??�니메이?�을 보여줍니??
 *
 * Body:  { userKey }
 * Response: { drawId, prize: { label, points, rarity } }
 * TTL: 5�?(reward_gacha_pending 컬렉??
 */
router.post('/pre-roll', async (req, res) => {
    const { userKey } = req.body || {};
    if (!userKey) return res.status(400).json(toError('MISSING_USER_KEY', 'userKey가 ?�요?�니??'));

    try {
        const prize = await rollPrize();
        const drawId = genDrawId();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5�?TTL

        await firestore.collection('reward_gacha_pending').doc(drawId).set({
            userKey: String(userKey),
            prize,
            confirmed: false,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt,
        });

        return res.json({
            resultType: 'SUCCESS',
            data: { drawId, prize },
        });
    } catch (e) {
        console.error('[reward-gacha/pre-roll]', e);
        return res.status(500).json(toError('INTERNAL_ERROR', e.message));
    }
});

/**
 * POST /api/v2/reward-gacha/confirm
 *
 * pre-roll?�서 발급??drawId�??�켓 차감 + ?�인???�립 ?�정.
 * ?�론?�는 ?�니메이??종료 ????API�??�출?�니??
 *
 * Body:  { userKey, drawId, drawType? }
 * Response: { prize, points, tickets, ... }
 */
router.post('/confirm', async (req, res) => {
    const { userKey, drawId, drawType = 'ticket' } = req.body || {};
    if (!userKey) return res.status(400).json(toError('MISSING_USER_KEY', 'userKey가 ?�요?�니??'));
    if (!drawId) return res.status(400).json(toError('MISSING_DRAW_ID', 'drawId가 ?�요?�니??'));

    try {
        const pendingRef = firestore.collection('reward_gacha_pending').doc(drawId);
        const pendingSnap = await pendingRef.get();

        if (!pendingSnap.exists) return res.status(404).json(toError('DRAW_NOT_FOUND', '?�효?��? ?��? drawId?�니??'));

        const pending = pendingSnap.data();
        if (pending.userKey !== String(userKey)) return res.status(404).json(toError('DRAW_NOT_FOUND', '권한???�습?�다.'));
        if (pending.confirmed) return res.status(409).json(toError('DRAW_ALREADY_CONFIRMED', '?��? ?�정??뽑기?�니??'));

        const now = new Date();
        const expiresAt = pending.expiresAt?.toDate ? pending.expiresAt.toDate() : new Date(pending.expiresAt);
        if (now > expiresAt) return res.status(410).json(toError('DRAW_EXPIRED', '뽑기 ?�효?�간??만료?�었?�니??'));

        const prize = pending.prize;

        // ?�켓 차감
        const ticketResult = await deductTicket(userKey, { requestId: `confirm_${drawId}` });
        const tickets = ticketResult.tickets;

        // ?�인???�립
        const points = await grantPrizePoints(userKey, prize, drawId);

        // pending ?�정 처리
        await pendingRef.update({ confirmed: true, confirmedAt: FieldValue.serverTimestamp() });

        logUserAction(userKey, 'REWARD_GACHA_CONFIRM', { drawId, drawType, prize, points }).catch(() => {});

        return res.json({
            resultType: 'SUCCESS',
            ...makeWallet(points, tickets, prize.points),
            data: { drawId, drawType, prize, ...makeWallet(points, tickets, prize.points) },
        });

    } catch (error) {
        const code = error.code || error.message || 'INTERNAL_ERROR';
        const status = ERROR_STATUS_MAP[code] ?? 500;
        if (status === 500) console.error('[reward-gacha/confirm]', error);
        return res.status(status).json(toError(code, error.message));
    }
});

/**
 * POST /api/v2/reward-gacha/draw  (?�위 ?�환 ??1?�계 ?�일 ?�출)
 *
 * drawId�??�기�?pre-roll 결과�??�용. ?�으�?즉시 roll+confirm.
 *
 * Body:  { userKey, drawType, requestId?, drawId? }
 */
router.post('/draw', async (req, res) => {
    const { userKey, drawType = 'ticket', requestId, drawId: clientDrawId, adVerification } = req.body || {};
    if (!userKey) return res.status(400).json(toError('MISSING_USER_KEY', 'userKey가 ?�요?�니??'));

    try {
        let tickets, points, prize = null;

        if (drawType === 'ticket') {
            // pre-roll drawId가 ?�으�?�?결과�??�용, ?�으�?즉시 roll
            if (clientDrawId) {
                const pendingRef = firestore.collection('reward_gacha_pending').doc(clientDrawId);
                const pendingSnap = await pendingRef.get();

                if (pendingSnap.exists && !pendingSnap.data().confirmed && pendingSnap.data().userKey === String(userKey)) {
                    const pending = pendingSnap.data();
                    const expiresAt = pending.expiresAt?.toDate ? pending.expiresAt.toDate() : new Date(pending.expiresAt);

                    if (new Date() <= expiresAt) {
                        prize = pending.prize;
                        await pendingRef.update({ confirmed: true, confirmedAt: FieldValue.serverTimestamp() });
                    }
                }
            }

            if (!prize) prize = await rollPrize(); // fallback: 즉시 roll

            const drawId = clientDrawId || requestId || genDrawId();
            const ticketResult = await deductTicket(userKey, { requestId: requestId || `draw_${drawId}` });
            tickets = ticketResult.tickets;
            points = await grantPrizePoints(userKey, prize, drawId);

            logUserAction(userKey, 'REWARD_GACHA_DRAW', { drawType, drawId, prize, points }).catch(() => {});

        } else if (drawType === 'bonus') {
            const drawId = requestId || genDrawId();
            prize = await rollPrize();
            points = await grantPrizePoints(userKey, prize, drawId);
            const snap = await getUserDocRef(userKey).get();
            tickets = getTicketBalance(snap.exists ? snap.data() : {});

            logUserAction(userKey, 'REWARD_GACHA_BONUS_DRAW', { drawId, prize, points }).catch(() => {});

        } else if (drawType === 'ad_interstitial') {
            const raw = await applyRewardActivity({
                userKey, activityType: 'AD_INTERSTITIAL',
                idempotencyKey: requestId, adVerification,
            });
            tickets = raw.tickets ?? 0;
            points = raw.currentPoints ?? raw.points ?? 0;

        } else {
            return res.status(400).json(toError('INVALID_DRAW_TYPE', `?????�는 drawType: ${drawType}`));
        }

        return res.json({
            resultType: 'SUCCESS',
            ...makeWallet(points, tickets, prize?.points ?? 0),
            data: { drawType, prize, ...makeWallet(points, tickets, prize?.points ?? 0) },
        });

    } catch (error) {
        const code = error.code || error.message || 'INTERNAL_ERROR';
        const status = ERROR_STATUS_MAP[code] ?? 500;
        if (status === 500) console.error('[reward-gacha/draw]', error);
        return res.status(status).json(toError(code, error.message));
    }
});

/**
 * POST /api/v2/reward-gacha/ad-draw
 */
router.post('/ad-draw', async (req, res) => {
    const { userKey, adGroupId, adType, requestId, adVerification } = req.body || {};
    if (!userKey) return res.status(400).json(toError('MISSING_USER_KEY', 'userKey가 ?�요?�니??'));

    const activityType = adType === 'rewarded' ? 'AD_LONG' : 'AD_SHORT';

    try {
        const raw = await applyRewardActivity({
            userKey, activityType,
            idempotencyKey: requestId,
            adVerification: adVerification || (adGroupId ? { adGroupId } : undefined),
        });

        const points = raw.currentPoints ?? raw.points ?? 0;
        const addedPoints = raw.addedPoints ?? 0;
        const tickets = raw.tickets ?? 0;

        return res.json({
            resultType: 'SUCCESS',
            ...makeWallet(points, tickets, addedPoints),
            data: { adType, adGroupId, ...makeWallet(points, tickets, addedPoints) },
        });

    } catch (error) {
        const code = error.code || error.message || 'INTERNAL_ERROR';
        if (code === 'REWARD_ACTIVITY_DUPLICATED') {
            try {
                const snap = await getUserDocRef(userKey).get();
                const d = snap.exists ? snap.data() : {};
                const points = d.points ?? 0;
                const tickets = getTicketBalance(d);
                return res.status(200).json({
                    resultType: 'SUCCESS',
                    ...makeWallet(points, tickets),
                    data: { duplicated: true, ...makeWallet(points, tickets) },
                });
            } catch (e) { /* fall through */ }
        }
        const status = ERROR_STATUS_MAP[code] ?? 500;
        if (status === 500) console.error('[reward-gacha/ad-draw]', error);
        return res.status(status).json(toError(code, error.message));
    }
});

export default router;
