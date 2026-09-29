/**
 * Scratch Lottery Service
 *
 * Firestore Collection: scratch_sessions/{sessionId}
 * - userKey, tickets[], revealedCount, totalPointsWon,
 *   status (active|completed|expired), createdAt, completedAt, expiresAt
 */
import { firestore, FieldValue } from '../lib/firebaseAdmin.js';
import { getKstDateKey, logUserAction } from '../utils/helpers.js';
import { SCRATCH_LOTTERY_CONFIG } from '../config/scratchLottery.js';

const { TICKETS_PER_SESSION, SESSION_EXPIRY_MS, MAX_SESSIONS_PER_WINDOW, AD_GROUP } = SCRATCH_LOTTERY_CONFIG;

// ─── Dynamic Prize Table (Firestore-backed with memory cache) ───────────────
const PRIZE_TABLE_DOC = 'scratch_lottery_config'; // Firestore doc ID in 'app_config' collection
let _prizeTableCache = null;  // { table, expiresAt }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

/**
 * Firestore에서 확률 테이블 로드 (캐시 5분)
 * 없으면 scratchLottery.js의 기본값 사용
 */
export const getPrizeTable = async () => {
    if (_prizeTableCache && Date.now() < _prizeTableCache.expiresAt) {
        return _prizeTableCache.table;
    }
    try {
        const snap = await firestore.collection('app_config').doc(PRIZE_TABLE_DOC).get();
        if (snap.exists && Array.isArray(snap.data().prizeTable) && snap.data().prizeTable.length > 0) {
            _prizeTableCache = { table: snap.data().prizeTable, expiresAt: Date.now() + CACHE_TTL_MS };
            return _prizeTableCache.table;
        }
    } catch (e) {
        console.error('[Scratch] Failed to load dynamic prize table:', e.message);
    }
    // fallback to static config
    return SCRATCH_LOTTERY_CONFIG.PRIZE_TABLE;
};

/** 캐시 무효화 (관리자 PUT 후 호출) */
export const invalidatePrizeTableCache = () => { _prizeTableCache = null; };

// ─── Helpers ────────────────────────────────────────────────────────────────

/** crypto.randomUUID polyfill — Node 19+ built-in */
const genSessionId = () => {
    const seg = () => Math.random().toString(36).slice(2, 10);
    return `scratch-${seg()}-${seg()}-${Date.now().toString(36)}`;
};

/** 확률 테이블 기반 상품 결정 (서버사이드) */
const rollPrize = async () => {
    const table = await getPrizeTable();
    const r = Math.random();
    let cumulative = 0;
    for (const entry of table) {
        cumulative += entry.chance;
        if (r < cumulative) {
            return { label: entry.label, points: entry.points, rarity: entry.rarity };
        }
    }
    // fallback (부동소수점 오차 대비)
    return { label: table[0].label, points: table[0].points, rarity: table[0].rarity };
};

/** 세션당 TICKETS_PER_SESSION(=3)장 생성 — ticketId 0은 ready, 나머지는 locked (프론트 TOTAL_TICKETS=3과 일치) */
const generateTickets = async () => {
    const tickets = [];
    for (let i = 0; i < TICKETS_PER_SESSION; i++) {
        const prize = await rollPrize();
        tickets.push({
            ticketId: i,
            status: i === 0 ? 'ready' : 'locked',
            prize, // 서버에 저장 (클라이언트에는 locked 티켓의 prize 미노출)
        });
    }
    return tickets;
};

/** 클라이언트에 보낼 티켓 형태 — locked 티켓은 prize: null */
const sanitizeTickets = (tickets) =>
    tickets.map(t => ({
        ticketId: t.ticketId,
        status: t.status,
        prize: t.status === 'locked' ? null : t.prize,
    }));

/** 세션 만료 확인 */
const isExpired = (session) => {
    if (!session.expiresAt) return false;
    const expires = session.expiresAt.toDate ? session.expiresAt.toDate() : new Date(session.expiresAt);
    return Date.now() > expires.getTime();
};

/** 프론트엔드용 prizeConfig 변환 (chance → weight) */
const toPrizeConfig = (table) =>
    table.map(({ rarity, label, points, chance }) => ({ rarity, label, points, weight: chance }));

// ─── Service Functions ──────────────────────────────────────────────────────

/**
 * 1. 세션 시작 — POST /scratch/start
 *    기존 활성 세션이 있으면 그것을 반환 (새로고침 시 세션 유지)
 */
export const startScratchSession = async (userKey) => {
    if (!userKey) throw Object.assign(new Error('MISSING_USER_KEY'), { code: 'MISSING_USER_KEY' });

    const userRef = firestore.collection('users').doc(String(userKey));
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw Object.assign(new Error('USER_NOT_FOUND'), { code: 'USER_NOT_FOUND' });

    const userData = userSnap.data();
    const userPoints = userData.points || 0;
    const prizeTable = await getPrizeTable();

    // ── 기존 활성 세션 복원 ──
    try {
        const activeSnap = await firestore.collection('scratch_sessions')
            .where('userKey', '==', String(userKey))
            .where('status', '==', 'active')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

        if (!activeSnap.empty) {
            const existingDoc = activeSnap.docs[0];
            const existing = existingDoc.data();

            // 만료 체크
            if (!isExpired(existing)) {
                return {
                    sessionId: existingDoc.id,
                    tickets: sanitizeTickets(existing.tickets),
                    prizeConfig: toPrizeConfig(prizeTable),
                    userPoints,
                    resumed: true,
                };
            }
            // 만료된 세션은 expired 처리
            await existingDoc.ref.update({ status: 'expired' });
        }
    } catch (indexErr) {
        // 인덱스 빌드 중이면 세션 복원 건너뛰고 새 세션 생성
        console.warn('[Scratch] Active session query failed (index building?), creating new session:', indexErr.message);
    }

    // ── 새 세션 생성 ──
    // 일일 세션 제한 체크 (0 = 무제한)
    const today = getKstDateKey();
    if (MAX_SESSIONS_PER_WINDOW > 0) {
        const todayCount = await firestore.collection('scratch_sessions')
            .where('userKey', '==', String(userKey))
            .where('dateKey', '==', today)
            .count().get();
        if (todayCount.data().count >= MAX_SESSIONS_PER_WINDOW) {
            throw Object.assign(new Error('DAILY_SESSION_LIMIT'), {
                code: 'DAILY_SESSION_LIMIT',
                maxSessions: MAX_SESSIONS_PER_WINDOW,
                todayCount: todayCount.data().count,
            });
        }
    }

    const sessionId = genSessionId();
    const tickets = await generateTickets();
    const now = new Date();

    const sessionData = {
        userKey: String(userKey),
        tickets,
        revealedCount: 0,
        totalPointsWon: 0,
        status: 'active',
        dateKey: getKstDateKey(),
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(now.getTime() + SESSION_EXPIRY_MS),
    };

    await firestore.collection('scratch_sessions').doc(sessionId).set(sessionData);

    // 비동기 로그
    logUserAction(userKey, 'SCRATCH_SESSION_START', { sessionId }).catch(() => {});

    return {
        sessionId,
        tickets: sanitizeTickets(tickets),
        prizeConfig: toPrizeConfig(prizeTable),
        userPoints,
        resumed: false,
    };
};

/**
 * 2. 티켓 잠금 해제 — POST /scratch/unlock
 */
export const unlockScratchTicket = async ({ userKey, sessionId, ticketId, adVerification }) => {
    if (!userKey) throw Object.assign(new Error('MISSING_USER_KEY'), { code: 'MISSING_USER_KEY' });
    if (!sessionId) throw Object.assign(new Error('MISSING_SESSION_ID'), { code: 'MISSING_SESSION_ID' });
    if (ticketId == null) throw Object.assign(new Error('MISSING_TICKET_ID'), { code: 'MISSING_TICKET_ID' });

    // ticketId 0은 unlock 불필요 (이미 ready)
    if (ticketId === 0) {
        throw Object.assign(new Error('TICKET_ALREADY_READY'), { code: 'TICKET_ALREADY_READY' });
    }

    // 광고 검증 (adGroupId 확인)
    if (!adVerification || adVerification.adGroupId !== AD_GROUP.UNLOCK) {
        throw Object.assign(new Error('AD_VERIFICATION_FAILED'), { code: 'AD_VERIFICATION_FAILED' });
    }

    const sessionRef = firestore.collection('scratch_sessions').doc(sessionId);

    const result = await firestore.runTransaction(async (tx) => {
        const snap = await tx.get(sessionRef);
        if (!snap.exists) throw Object.assign(new Error('SESSION_NOT_FOUND'), { code: 'SESSION_NOT_FOUND' });

        const session = snap.data();
        if (session.userKey !== String(userKey)) throw Object.assign(new Error('SESSION_NOT_FOUND'), { code: 'SESSION_NOT_FOUND' });
        if (session.status !== 'active') throw Object.assign(new Error('SESSION_NOT_ACTIVE'), { code: 'SESSION_NOT_ACTIVE' });
        if (isExpired(session)) throw Object.assign(new Error('SESSION_EXPIRED'), { code: 'SESSION_EXPIRED' });

        const ticket = session.tickets[ticketId];
        if (!ticket) throw Object.assign(new Error('TICKET_NOT_FOUND'), { code: 'TICKET_NOT_FOUND' });
        if (ticket.status !== 'locked') throw Object.assign(new Error('TICKET_ALREADY_UNLOCKED'), { code: 'TICKET_ALREADY_UNLOCKED' });

        // 상태를 ready로 변경
        const updatedTickets = [...session.tickets];
        updatedTickets[ticketId] = { ...ticket, status: 'ready' };

        tx.update(sessionRef, { tickets: updatedTickets });

        return {
            ticketId: ticket.ticketId,
            status: 'ready',
            prize: ticket.prize,
        };
    });

    // 비동기 로그
    logUserAction(userKey, 'SCRATCH_TICKET_UNLOCK', { sessionId, ticketId }).catch(() => {});

    return result;
};

/**
 * 3. 복권 긁기(reveal) — POST /scratch/reveal
 *    포인트 적립 + 티켓 상태 revealed
 */
export const revealScratchTicket = async ({ userKey, sessionId, ticketId }) => {
    if (!userKey) throw Object.assign(new Error('MISSING_USER_KEY'), { code: 'MISSING_USER_KEY' });
    if (!sessionId) throw Object.assign(new Error('MISSING_SESSION_ID'), { code: 'MISSING_SESSION_ID' });
    if (ticketId == null) throw Object.assign(new Error('MISSING_TICKET_ID'), { code: 'MISSING_TICKET_ID' });

    const sessionRef = firestore.collection('scratch_sessions').doc(sessionId);
    const userRef = firestore.collection('users').doc(String(userKey));

    const result = await firestore.runTransaction(async (tx) => {
        const [sessionSnap, userSnap] = await Promise.all([
            tx.get(sessionRef),
            tx.get(userRef),
        ]);

        if (!sessionSnap.exists) throw Object.assign(new Error('SESSION_NOT_FOUND'), { code: 'SESSION_NOT_FOUND' });
        const session = sessionSnap.data();
        if (session.userKey !== String(userKey)) throw Object.assign(new Error('SESSION_NOT_FOUND'), { code: 'SESSION_NOT_FOUND' });
        if (session.status !== 'active') throw Object.assign(new Error('SESSION_NOT_ACTIVE'), { code: 'SESSION_NOT_ACTIVE' });
        if (isExpired(session)) throw Object.assign(new Error('SESSION_EXPIRED'), { code: 'SESSION_EXPIRED' });

        const ticket = session.tickets[ticketId];
        if (!ticket) throw Object.assign(new Error('TICKET_NOT_FOUND'), { code: 'TICKET_NOT_FOUND' });
        if (ticket.status === 'revealed') throw Object.assign(new Error('TICKET_ALREADY_REVEALED'), { code: 'TICKET_ALREADY_REVEALED' });
        if (ticket.status === 'locked') throw Object.assign(new Error('TICKET_STILL_LOCKED'), { code: 'TICKET_STILL_LOCKED' });

        // 포인트 적립
        const grantedPoints = ticket.prize.points;
        const userData = userSnap.exists ? userSnap.data() : {};
        const basePoints = userData.points ?? userData.currentPoints ?? userData.balancePoints ?? 0;
        const newPoints = basePoints + grantedPoints;

        // 유저 포인트 업데이트 (모든 포인트 필드 동기화)
        tx.set(userRef, {
            points: newPoints,
            currentPoints: newPoints,
            balancePoints: newPoints,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        // 포인트 히스토리 기록
        const historyId = `scratch_${sessionId}_${ticketId}`;
        const historyRef = userRef.collection('point_history').doc(historyId);
        tx.set(historyRef, {
            type: 'POINT_GRANT',
            source: 'SCRATCH_LOTTERY',
            points: grantedPoints,
            description: `복권 긁기 ${ticket.prize.label} 당첨`,
            sessionId,
            ticketId,
            rarity: ticket.prize.rarity,
            createdAt: FieldValue.serverTimestamp(),
        });

        // 세션 업데이트
        const updatedTickets = [...session.tickets];
        updatedTickets[ticketId] = { ...ticket, status: 'revealed' };

        const newRevealedCount = session.revealedCount + 1;
        const newTotalPoints = session.totalPointsWon + grantedPoints;
        const allDone = newRevealedCount >= TICKETS_PER_SESSION;

        const sessionUpdate = {
            tickets: updatedTickets,
            revealedCount: newRevealedCount,
            totalPointsWon: newTotalPoints,
        };

        if (allDone) {
            sessionUpdate.status = 'completed';
            sessionUpdate.completedAt = FieldValue.serverTimestamp();

            // [Optimized] 세션 완료 시 유저별 누적 통계 업데이트 (getScratchStats 1-read 최적화)
            tx.set(userRef, {
                scratchStats: {
                    totalSessions: FieldValue.increment(1),
                    totalTicketsScratched: FieldValue.increment(newRevealedCount),
                    totalPointsEarned: FieldValue.increment(newTotalPoints),
                    lastPlayedAt: FieldValue.serverTimestamp(),
                }
            }, { merge: true });
        }

        tx.update(sessionRef, sessionUpdate);

        return {
            ticketId: ticket.ticketId,
            prize: ticket.prize,
            grantedPoints,
            userPoints: newPoints,
            revealedCount: newRevealedCount,
            allDone,
        };
    });

    // 비동기 로그
    logUserAction(userKey, 'SCRATCH_TICKET_REVEAL', {
        sessionId,
        ticketId,
        grantedPoints: result.grantedPoints,
        rarity: result.prize.rarity,
        label: result.prize.label,
    }).catch(() => {});

    return result;
};

/**
 * 4. 전체 새로고침 — POST /scratch/refresh
 *    5장 모두 완료 + 광고 시청 후 새 세션 발급
 */
export const refreshScratchSession = async ({ userKey, sessionId, adVerification }) => {
    if (!userKey) throw Object.assign(new Error('MISSING_USER_KEY'), { code: 'MISSING_USER_KEY' });
    if (!sessionId) throw Object.assign(new Error('MISSING_SESSION_ID'), { code: 'MISSING_SESSION_ID' });

    // 광고 검증 (adGroupId 확인)
    if (!adVerification || adVerification.adGroupId !== AD_GROUP.REFRESH) {
        throw Object.assign(new Error('AD_VERIFICATION_FAILED'), { code: 'AD_VERIFICATION_FAILED' });
    }

    // 이전 세션 확인
    const prevRef = firestore.collection('scratch_sessions').doc(sessionId);
    const prevSnap = await prevRef.get();
    if (!prevSnap.exists) throw Object.assign(new Error('SESSION_NOT_FOUND'), { code: 'SESSION_NOT_FOUND' });

    const prevSession = prevSnap.data();
    if (prevSession.userKey !== String(userKey)) throw Object.assign(new Error('SESSION_NOT_FOUND'), { code: 'SESSION_NOT_FOUND' });
    if (prevSession.status !== 'completed') throw Object.assign(new Error('SESSION_NOT_COMPLETED'), { code: 'SESSION_NOT_COMPLETED' });

    // ── 일일 세션 제한 체크 (refresh도 새 세션이므로 동일 제한 적용) ──
    const today = getKstDateKey();
    if (MAX_SESSIONS_PER_WINDOW > 0) {
        const todayCount = await firestore.collection('scratch_sessions')
            .where('userKey', '==', String(userKey))
            .where('dateKey', '==', today)
            .count().get();
        if (todayCount.data().count >= MAX_SESSIONS_PER_WINDOW) {
            throw Object.assign(new Error('DAILY_SESSION_LIMIT'), {
                code: 'DAILY_SESSION_LIMIT',
                maxSessions: MAX_SESSIONS_PER_WINDOW,
                todayCount: todayCount.data().count,
            });
        }
    }

    // 유저 정보
    const userRef = firestore.collection('users').doc(String(userKey));
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const userPoints = userData.points || 0;

    // [Optimized] 누적 세션 수: 유저 doc의 scratchStats에서 조회 (count() API 대신 0 read 추가)
    const totalSessionsPlayed = (userData.scratchStats?.totalSessions || 0) + 1;

    // 새 세션 생성
    const newSessionId = genSessionId();
    const tickets = await generateTickets();
    const now = new Date();

    await firestore.collection('scratch_sessions').doc(newSessionId).set({
        userKey: String(userKey),
        tickets,
        revealedCount: 0,
        totalPointsWon: 0,
        status: 'active',
        dateKey: getKstDateKey(),
        previousSessionId: sessionId,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(now.getTime() + SESSION_EXPIRY_MS),
    });

    // 비동기 로그
    logUserAction(userKey, 'SCRATCH_SESSION_REFRESH', {
        previousSessionId: sessionId,
        newSessionId,
        totalSessionsPlayed,
    }).catch(() => {});

    // prizeConfig 조회 (프론트엔드 전달용)
    const prizeTable = await getPrizeTable();

    return {
        sessionId: newSessionId,
        tickets: sanitizeTickets(tickets),
        prizeConfig: toPrizeConfig(prizeTable),
        totalSessionsPlayed,
        userPoints,
    };
};

/**
 * 5. 통계 조회 — GET /scratch/stats
 *    [Optimized] 유저 doc의 scratchStats 필드에서 1 read로 조회
 *    신규 유저(마이그레이션 전)는 기존 방식 fallback
 */
export const getScratchStats = async (userKey) => {
    if (!userKey) throw Object.assign(new Error('MISSING_USER_KEY'), { code: 'MISSING_USER_KEY' });

    // 1) 유저 doc에서 캐시된 통계 조회 (1 read)
    const userRef = firestore.collection('users').doc(String(userKey));
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw Object.assign(new Error('USER_NOT_FOUND'), { code: 'USER_NOT_FOUND' });

    const stats = userSnap.data()?.scratchStats;
    if (stats && stats.totalSessions > 0) {
        return {
            totalSessions: stats.totalSessions || 0,
            totalTicketsScratched: stats.totalTicketsScratched || 0,
            totalPointsEarned: stats.totalPointsEarned || 0,
            prizeDistribution: stats.prizeDistribution || {},
            lastPlayedAt: stats.lastPlayedAt?.toDate ? stats.lastPlayedAt.toDate().toISOString() : (stats.lastPlayedAt || null),
        };
    }

    // 2) Fallback: 마이그레이션 전 유저 — 세션 전체 조회
    const sessionsSnap = await firestore.collection('scratch_sessions')
        .where('userKey', '==', String(userKey))
        .orderBy('createdAt', 'desc')
        .get();

    let totalSessions = 0;
    let totalTicketsScratched = 0;
    let totalPointsEarned = 0;
    let lastPlayedAt = null;
    const prizeDistribution = {};

    sessionsSnap.forEach(doc => {
        const s = doc.data();
        totalSessions++;
        totalTicketsScratched += s.revealedCount || 0;
        totalPointsEarned += s.totalPointsWon || 0;

        if (!lastPlayedAt && s.createdAt) {
            lastPlayedAt = s.createdAt.toDate ? s.createdAt.toDate().toISOString() : s.createdAt;
        }

        if (s.tickets) {
            for (const t of s.tickets) {
                if (t.status === 'revealed' && t.prize) {
                    prizeDistribution[t.prize.label] = (prizeDistribution[t.prize.label] || 0) + 1;
                }
            }
        }
    });

    // Backfill: 유저 doc에 통계 저장 (다음부터 1 read)
    if (totalSessions > 0) {
        userRef.set({
            scratchStats: { totalSessions, totalTicketsScratched, totalPointsEarned, prizeDistribution, lastPlayedAt }
        }, { merge: true }).catch(() => {});
    }

    return {
        totalSessions,
        totalTicketsScratched,
        totalPointsEarned,
        prizeDistribution,
        lastPlayedAt,
    };
};
