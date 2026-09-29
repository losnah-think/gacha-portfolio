/**
 * Lotto Machine Service
 *
 * Firestore Collection: lotto_history/{drawId}
 * - userKey, numbers, drawnAt, ticketsAfter
 */
import { firestore, FieldValue } from '../lib/firebaseAdmin.js';
import { getKstDateKey, getUserDocRef, getTicketBalance, logUserAction, invalidateMetadataCache } from '../utils/helpers.js';
import { invalidateSummaryCache } from '../routes/media/storage.js';

const LOTTO_PERSONA_ID = 'lotto_generator';
const LOTTO_PERSONA_NAME = '로또번호 추첨기';

const LOTTO_CONFIG = {
    DAILY_LIMIT: 10,   // 하루 최대 뽑기 횟수
    NUMBERS_COUNT: 6,  // 한 번에 뽑는 번호 수
    MIN_NUMBER: 1,
    MAX_NUMBER: 45,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** 고유 drawId 생성 */
const genDrawId = () => {
    const seg = () => Math.random().toString(36).slice(2, 8);
    return `lotto_${seg()}${seg()}${Date.now().toString(36)}`;
};

/**
 * 1~45 범위에서 비복원 무작위 6개 추출 → 오름차순 정렬
 */
const pickNumbers = () => {
    const pool = Array.from({ length: LOTTO_CONFIG.MAX_NUMBER }, (_, i) => i + 1);
    const picked = [];
    for (let i = 0; i < LOTTO_CONFIG.NUMBERS_COUNT; i++) {
        const idx = Math.floor(Math.random() * (pool.length - i)) + i;
        [pool[i], pool[idx]] = [pool[idx], pool[i]];
        picked.push(pool[i]);
    }
    return picked.sort((a, b) => a - b);
};

const buildLottoStorageHistory = ({ userKey, drawId, numbers, drawnAt, timestamp, ticketsAfter, dateKey }) => ({
    userKey: String(userKey),
    type: 'lotto',
    title: '행운의 로또 번호',
    summary: `추천 번호: ${numbers.join(', ')}`,
    content: `이번 추첨 번호는 ${numbers.join(', ')} 입니다.`,
    numbers,
    drawId,
    personaId: LOTTO_PERSONA_ID,
    persona: LOTTO_PERSONA_NAME,
    personaName: LOTTO_PERSONA_NAME,
    category: 'lotto',
    v3Group: 'lotto',
    rarity: 'normal',
    grade: 'NORMAL',
    rewardStatus: 'NONE',
    ticketsAfter,
    date: dateKey,
    dateKey,
    timestamp,
    createdAt: drawnAt,
});

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * 로또 뽑기
 *
 * 1. 유저 조회 및 티켓 확인
 * 2. 일일 한도 확인
 * 3. 티켓 차감 + 번호 생성 + 히스토리 저장 (트랜잭션)
 *
 * @param {string} userKey
 * @returns {{ numbers: number[], tickets: number, drawId: string, drawnAt: string }}
 */
export const drawLottoNumbers = async (userKey) => {
    const todayKey = getKstDateKey();
    const userRef = getUserDocRef(String(userKey));
    const drawId = genDrawId();
    const historyRef = firestore.collection('lotto_history').doc(drawId);
    const storageHistoryRef = userRef.collection('history').doc(drawId);

    return await firestore.runTransaction(async (tx) => {
        // 1. 유저 조회
        const snap = await tx.get(userRef);
        if (!snap.exists) {
            const err = new Error('USER_NOT_FOUND');
            err.code = 'USER_NOT_FOUND';
            throw err;
        }

        const data = snap.data();
        const currentTickets = getTicketBalance(data);

        // 2. 티켓 확인
        if (currentTickets < 1) {
            const err = new Error('INSUFFICIENT_TICKETS');
            err.code = 'INSUFFICIENT_TICKETS';
            throw err;
        }

        // 3. 일일 한도 확인
        const dailyDrawCount = (data.lottoDailyCount || 0);
        const lastLottoDate = data.lastLottoDate || null;
        const effectiveDailyCount = lastLottoDate === todayKey ? dailyDrawCount : 0;

        if (effectiveDailyCount >= LOTTO_CONFIG.DAILY_LIMIT) {
            const err = new Error('DAILY_LIMIT_EXCEEDED');
            err.code = 'DAILY_LIMIT_EXCEEDED';
            throw err;
        }

        // 4. 번호 생성
        const numbers = pickNumbers();
        const ticketsAfter = currentTickets - 1;
        const drawnAtMs = Date.now();
        const drawnAt = new Date(drawnAtMs).toISOString();

        // 5. 유저 티켓 차감 + 일일 카운터 업데이트
        tx.set(userRef, {
            ticketsTotal: ticketsAfter,
            tickets: ticketsAfter,
            ticket: ticketsAfter,
            lottoDailyCount: lastLottoDate === todayKey ? FieldValue.increment(1) : 1,
            lastLottoDate: todayKey,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        // 6. 히스토리 저장
        tx.set(historyRef, {
            userKey: String(userKey),
            numbers,
            drawnAt: FieldValue.serverTimestamp(),
            ticketsAfter,
            dateKey: todayKey,
        });

        tx.set(storageHistoryRef, buildLottoStorageHistory({
            userKey,
            drawId,
            numbers,
            drawnAt: FieldValue.serverTimestamp(),
            timestamp: drawnAtMs,
            ticketsAfter,
            dateKey: todayKey,
        }), { merge: true });

        return { numbers, tickets: ticketsAfter, drawId, drawnAt };
    }).then(async (result) => {
        // 트랜잭션 성공 후 캐시 무효화 + 액션 로그
        invalidateMetadataCache(String(userKey));
        invalidateSummaryCache(String(userKey));
        logUserAction(String(userKey), 'LOTTO_DRAW', {
            drawId: result.drawId,
            numbers: result.numbers,
            ticketsAfter: result.tickets,
            personaId: LOTTO_PERSONA_ID,
            personaName: LOTTO_PERSONA_NAME,
            category: 'lotto',
            type: 'lotto',
            ticketsUsed: 1,
        });
        return result;
    });
};

/**
 * 로또 히스토리 조회 (최신순)
 *
 * @param {string} userKey
 * @param {number} [limit=20]
 * @returns {{ history: object[], total: number }}
 */
export const getLottoHistory = async (userKey, limit = 20) => {
    const snap = await firestore
        .collection('lotto_history')
        .where('userKey', '==', String(userKey))
        .orderBy('drawnAt', 'desc')
        .limit(limit)
        .get();

    const history = snap.docs.map(doc => ({
        drawId: doc.id,
        numbers: doc.data().numbers,
        drawnAt: doc.data().drawnAt?.toDate?.()?.toISOString() ?? null,
    }));

    return { history, total: snap.size };
};
