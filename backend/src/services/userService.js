import { firestore, FieldValue } from '../lib/firebaseAdmin.js';
import { getKstDateKey, getUserDocRef, logUserAction, getTicketBalance, getKstWeekKey, getKstMonthKey, invalidateMetadataCache } from '../utils/helpers.js';
import { getPersonaCategory } from '../utils/imageUrl.js';
import { updateDailyMissionProgress } from './promotionService.js';
import { checkAndClaimActivityReward, claimPromotionByCode } from './promotionService.js';
import { validateNickname } from '../utils/validation.js';
import { getRefundConfig } from './refundConfigService.js';
import { PROMOTION_CONFIG } from '../config/promotion.js';

// ─── In-memory TTL cache for syncUserStats ───────────────────────────────────
// user_persona_preferences는 가챠 뽑기 시에만 변경되므로,
// 5분 TTL로 캐시하면 GET /status 호출마다 발생하는 Firestore read를 대폭 줄일 수 있다.
const _syncStatsCache = new Map(); // userKey → { value, expiresAt }
const SYNC_STATS_TTL_MS = 5 * 60 * 1000; // 5분

const CONVERSION_REWARD_MIN = 1;
const CONVERSION_REWARD_MAX = 8;

const calculateConversionReward = () => (
    Math.floor(Math.random() * (CONVERSION_REWARD_MAX - CONVERSION_REWARD_MIN + 1)) + CONVERSION_REWARD_MIN
);

const executeConversionPromotionReward = async ({ userKey, promotionCode }) => {
    const { getPromotionKey, executePromotion } = await import('../utils/tossClient.js');
    const amount = calculateConversionReward();
    const tossKey = await getPromotionKey(userKey);

    await executePromotion(userKey, promotionCode, tossKey, amount);

    return { amount, tossKey, status: 'SUCCESS' };
};

export const invalidateSyncStatsCache = (userKey) => {
    _syncStatsCache.delete(String(userKey));
};
// ─────────────────────────────────────────────────────────────────────────────

const PAID_TICKETS_PER_UNIT = 5;
const DEFAULT_AD_REWARD_TICKETS = 1;
const DEFAULT_SHARE_REWARD_TICKETS = 2;

/**
 * 닉네임 변경 및 랭킹 동기화
 * @param {string} userKey 
 * @param {string} newNickname 
 */
export const updateUserNickname = async (userKey, newNickname) => {
    const validation = validateNickname(newNickname);
    if (!validation.isValid) {
        const err = new Error(validation.message);
        err.code = validation.code;
        throw err;
    }
    const finalNickname = validation.trimmedNickname;

    const userRef = getUserDocRef(userKey);

    const result = await firestore.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) throw new Error('USER_NOT_FOUND');

        const userData = userSnap.data();
        if (userData.nickname === finalNickname) {
            return {
                userKey,
                nickname: finalNickname,
                updatedAt: userData.updatedAt?.toDate().toISOString() || new Date().toISOString()
            };
        }

        const today = getKstDateKey();
        const week = getKstWeekKey();
        const month = getKstMonthKey();
        const segment = userData.segment || 'unknown';
        const gender = userData.gender || 'unknown';

        const rankingRefs = [
            firestore.collection('rankings').doc(`daily_${today}`).collection('users').doc(userKey),
            firestore.collection('rankings').doc(`weekly_${week}`).collection('users').doc(userKey),
            firestore.collection('rankings').doc(`monthly_${month}`).collection('users').doc(userKey)
        ];

        // [V3] Also sync segment and gender based rankings if they exist
        if (segment && segment !== 'unknown') {
            rankingRefs.push(firestore.collection('rankings').doc(`daily_${today}_segment_${segment}`).collection('users').doc(userKey));
            rankingRefs.push(firestore.collection('rankings').doc(`weekly_${week}_segment_${segment}`).collection('users').doc(userKey));
            rankingRefs.push(firestore.collection('rankings').doc(`monthly_${month}_segment_${segment}`).collection('users').doc(userKey));
        }
        if (gender && (gender === 'male' || gender === 'female')) {
            rankingRefs.push(firestore.collection('rankings').doc(`daily_${today}_gender_${gender}`).collection('users').doc(userKey));
            rankingRefs.push(firestore.collection('rankings').doc(`weekly_${week}_gender_${gender}`).collection('users').doc(userKey));
            rankingRefs.push(firestore.collection('rankings').doc(`monthly_${month}_gender_${gender}`).collection('users').doc(userKey));
        }

        const rankingSnaps = await Promise.all(rankingRefs.map(ref => tx.get(ref)));

        // 1. Update User Profile
        tx.update(userRef, {
            nickname: finalNickname,
            _nicknameUserSet: true,
            updatedAt: FieldValue.serverTimestamp()
        });

        // 2. Update Current Rankings (Denormalized Nickname)
        rankingSnaps.forEach((snap, index) => {
            if (snap.exists) {
                tx.update(rankingRefs[index], { nickname: finalNickname, updatedAt: FieldValue.serverTimestamp() });
            }
        });

        // 3. Log Action
        // We can't log inside transaction if we want to be safe, but since logging is async/fire-and-forget in helper, it's fine to call after or here (but verify helper logic)
        // Helper creates new doc, so it's a write. Independent write. Better to do it outside transaction or just let it float.

        return {
            userKey,
            nickname: finalNickname,
            updatedAt: new Date().toISOString()
        };
    });

    // 트랜잭션 완료 후 메타데이터 캐시 무효화 (즉시 새 닉네임 반영)
    invalidateMetadataCache(userKey);
    return result;
};


/**
 * 중앙 집중형 출석/연속 접속 정규화 로직
 * @param {object} tx - Firestore Transaction (optional)
 * @param {object} userRef - Firestore DocumentReference
 * @param {object} dbData - Current user data
 * @returns {object} { updates, consecutiveLoginDays, attendanceCount }
 */
export const processAttendanceUpdate = async (userKey, dbData, tx = null) => {
    const today = getKstDateKey();
    const lastLoginDate = dbData.lastLoginDate || '';
    let consecutiveLoginDays = dbData.consecutiveLoginDays || 0;
    let attendanceCount = dbData.attendanceCount || 0;
    const updates = { updatedAt: FieldValue.serverTimestamp() };
    let didAttendToday = false;

    if (lastLoginDate !== today) {
        // 어제 날짜 계산
        const yesterday = getKstDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));

        if (lastLoginDate === yesterday) {
            consecutiveLoginDays += 1;
        } else {
            consecutiveLoginDays = 1;
        }

        attendanceCount += 1;

        updates.consecutiveLoginDays = consecutiveLoginDays;
        updates.attendanceCount = attendanceCount;
        updates.lastLoginDate = today;
        didAttendToday = true;

        // 최고 기록 갱신
        if (consecutiveLoginDays > (dbData.maxAttendanceStreak || 0)) {
            updates.maxAttendanceStreak = consecutiveLoginDays;
        }

        // 출석일 로그 (중복 방지용)
        // void logUserAction(userKey, 'ATTENDANCE_STAY_SYNC', { consecutiveLoginDays, attendanceCount });
    }

    return { updates, consecutiveLoginDays, attendanceCount, didAttendToday, attendanceDate: today };
};

/**
 * 전용 일일 티켓 자동 충전 및 신규 유저 초기화 로직
 * (트랜잭션 없이 /sync 나 /status 에서 호출 가능)
 */
export const processDailyRecharge = async (userKey, dbData, updates = {}) => {
    const today = getKstDateKey();
    const lastDailyDate = dbData.lastDailyDate || '';

    // 이미 오늘 충전했다면 종료
    if (lastDailyDate === today) return updates;

    const dailyBonus = 1;
    let currentTickets = getTicketBalance(dbData);
    let newTotal = 0;

    // 신규 유저 체크 (모든 티켓 필드가 없거나, 한 번도 일일 티켓을 받은 적이 없는 경우)
    if ((dbData.ticketsTotal === undefined && dbData.tickets === undefined && dbData.ticket === undefined) || !dbData.lastDailyDate) {
        newTotal = 2; // 가입 환영(1) + 일일 보너스(1)
    } else {
        newTotal = currentTickets + dailyBonus;
    }

    // 업데이트 객체에 추가
    updates.ticketsTotal = newTotal;
    updates.tickets = newTotal; // V1 호환
    updates.ticket = newTotal;  // 레거시
    updates.lastDailyDate = today;
    updates.ticketsDaily = (dbData.ticketsDaily || 0) + dailyBonus;
    updates.updatedAt = FieldValue.serverTimestamp();

    // DB 반영
    await getUserDocRef(userKey).set(updates, { merge: true });

    await logUserAction(userKey, 'DAILY_TICKET_AUTO_SYNC', { ticketsAwarded: dailyBonus, total: newTotal });

    return updates;
};

export const applyDailyTicket = async (userKey, profileData = {}, guestUserKey = null) => {
    const todayKey = getKstDateKey();
    const userRef = getUserDocRef(userKey);
    const guestRef = (guestUserKey && guestUserKey !== userKey) ? getUserDocRef(guestUserKey) : null;

    return firestore.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        let guestTickets = 0;

        // 1. 게스트 데이터 마이그레이션 체크
        if (guestRef) {
            const guestSnap = await tx.get(guestRef);
            if (guestSnap.exists) {
                guestTickets = guestSnap.data()?.ticketsTotal || 0;
                console.log(`[applyDailyTicket] Migrating ${guestTickets} tickets from guest ${guestUserKey} to ${userKey}`);
                tx.update(guestRef, { ticketsTotal: 0, migratedTo: userKey, updatedAt: FieldValue.serverTimestamp() });
            }
        }

        const data = snap.exists ? snap.data() : {};

        const isRealNameLikely = (str, realName) => {
            if (!str) return false;
            // 프론트나 Toss에서 name과 동일하게 nickname을 넘길 경우만 차단
            if (realName && str.trim() === String(realName).trim()) return true;
            return false;
        };

        const safeProfileData = { ...profileData };
        // [Privacy Fix] 만약 들어온 프로필 닉네임이 실명(Toss name) 이면 제거
        if (isRealNameLikely(safeProfileData.nickname, data.name || safeProfileData.name)) {
            delete safeProfileData.nickname;
        }

        // 이미 닉네임이 있는 경우 덮어쓰기 방지
        if (data.nickname && safeProfileData.nickname) {
            delete safeProfileData.nickname;
        }

        const lastDailyDate = data?.lastDailyDate || null;

        let currentTickets = getTicketBalance(data);
        const dailyBonus = 1;

        // 게스트 티켓 합산
        if (guestTickets > 0) {
            currentTickets += guestTickets;
        }

        if (lastDailyDate === todayKey) {
            // 이미 오늘 티켓을 받음 - 업데이트만 진행
            const updates = {
                ticketsTotal: currentTickets,
                updatedAt: FieldValue.serverTimestamp(),
                ...safeProfileData
            };
            tx.set(userRef, updates, { merge: true });
            return {
                alreadyClaimed: true,
                tickets: currentTickets,
                // 프론트엔드가 이전 데이터를 덮어쓰는 버그 방지 - 새로 제공받은 프로필도 병합해서 응답
                data: { ...data, ...safeProfileData, ticketsTotal: currentTickets }
            };
        }

        // --- [개선] 출석 및 연속 접속 로직 통합 ---
        const attResult = await processAttendanceUpdate(userKey, data, tx);
        const updates = {
            ...attResult.updates,
            ...safeProfileData,
            lastDailyDate: todayKey,
            ticketsDaily: (data.ticketsDaily || 0) + dailyBonus,
            updatedAt: FieldValue.serverTimestamp()
        };

        if (attResult.didAttendToday) {
            tx.set(userRef.collection('attendance_history').doc(todayKey), {
                userKey: String(userKey),
                date: todayKey,
                source: 'sync',
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
        }

        let newTotal = 0;
        if (!snap.exists || (data.ticketsTotal === undefined && data.tickets === undefined && data.ticket === undefined)) {
            newTotal = Math.max(2, currentTickets + dailyBonus);
            if (!snap.exists) updates.createdAt = FieldValue.serverTimestamp();
            updates.ticketsPaid = data.ticketsPaid || 0;
        } else {
            newTotal = currentTickets + dailyBonus;
        }

        updates.ticketsTotal = newTotal;
        updates.tickets = newTotal;
        updates.ticket = newTotal;

        tx.set(userRef, updates, { merge: true });

        // 로그 기록
        await logUserAction(userKey, 'DAILY_TICKET_AWARDED', { ticketsAwarded: dailyBonus, total: newTotal });

        // [개선] 프로모션 미션 체크
        // - 연속 접속(streak): 3/5/7/10일처럼 "연속" 의미가 있는 단기 미션
        // - 누적 출석(attendanceCount): 30일/100일처럼 월 경계를 넘어 이어지는 장기 미션
        const streak = attResult.consecutiveLoginDays || 1;
        const totalAttendance = attResult.attendanceCount || 1;
        await checkAndClaimActivityReward(userKey, 'ATTENDANCE_3_DAYS', streak);
        await checkAndClaimActivityReward(userKey, 'ATTENDANCE_5_DAYS', streak);
        await checkAndClaimActivityReward(userKey, 'ATTENDANCE_7_DAYS', streak);
        await checkAndClaimActivityReward(userKey, 'ATTENDANCE_10_DAYS', streak);
        await checkAndClaimActivityReward(userKey, 'ATTENDANCE_30_DAYS', totalAttendance);
        await checkAndClaimActivityReward(userKey, 'ATTENDANCE_100_DAYS', totalAttendance);

        invalidateMetadataCache(userKey);

        return {
            alreadyClaimed: false,
            tickets: newTotal,
            data: { ...data, ...updates, ticketsTotal: newTotal }
        };
    });
};

export const deductTicket = async (userKey, reqBody = {}) => {
    const { requestId } = reqBody;
    const todayKey = getKstDateKey();
    const userRef = getUserDocRef(userKey);
    let dailyLogDetails = null;

    const result = await firestore.runTransaction(async (tx) => {
        // [Idempotency Check]
        if (requestId) {
            const idempRef = firestore.collection('idempotency_keys').doc(requestId);
            const idempSnap = await tx.get(idempRef);
            if (idempSnap.exists) {
                const idempData = idempSnap.data();
                // If already processed, return the cached result
                if (idempData.userKey === userKey && idempData.status === 'SUCCESS') {
                    console.log(`[Idempotency] Request ${requestId} already processed. Returning cached data.`);
                    return idempData.result;
                }
                throw new Error('DUPLICATE_REQUEST');
            }
        }

        const snap = await tx.get(userRef);
        const data = snap.exists ? snap.data() : {};
        const lastDailyDate = data?.lastDailyDate || null;
        let ticketsTotal = getTicketBalance(data); // Use Unified Balance

        const updates = { updatedAt: FieldValue.serverTimestamp() };

        // 데일리 티켓 체크
        if (lastDailyDate !== todayKey) {
            const dailyBonus = 1;
            // [개선] ticketsTotal이 없으면 레거시 tickets 필드라도 확인
            // getTicketBalance handles this, but for clarity:

            if (!snap.exists || (data.ticketsTotal === undefined && data.tickets === undefined && data.ticket === undefined)) {
                // 완전 신규 유저: 기본 2개 (가입 1 + 데일리 1)
                ticketsTotal = 2;
                updates.createdAt = FieldValue.serverTimestamp();
            } else {
                // 기존 유저: (이미 있는 수량) + 데일리 보너스
                ticketsTotal = ticketsTotal + dailyBonus;
            }
            updates.lastDailyDate = todayKey;
            updates.ticketsDaily = (data.ticketsDaily || 0) + dailyBonus;
            updates.ticketsTotal = ticketsTotal;

            // 로그용 데이터 준비
            dailyLogDetails = {
                ticketsAwarded: dailyBonus,
                totalAfter: ticketsTotal,
                migratedFromLegacy: data.ticketsTotal === undefined && data.tickets !== undefined
            };
        }

        if (ticketsTotal <= 0) {
            const err = new Error('INSUFFICIENT_TICKETS');
            err.currentTickets = ticketsTotal;
            throw err;
        }

        const finalTickets = ticketsTotal - 1;
        const pullCount = (data.pullCount || 0) + 1;
        const lottoCount = reqBody.isLotto ? (data.lottoCount || 0) + 1 : (data.lottoCount || 0);

        // [Sync] V1 호환을 위해 tickets 필드도 같이 업데이트
        tx.set(userRef, {
            ...updates,
            ticketsTotal: finalTickets,
            tickets: finalTickets,
            ticket: finalTickets,
            pullCount: pullCount,
            lottoCount: lottoCount
        }, { merge: true });

        const resData = { tickets: finalTickets, pullCount: pullCount, lottoCount: lottoCount };

        // [Idempotency] Mark as SUCCESS
        if (requestId) {
            tx.set(firestore.collection('idempotency_keys').doc(requestId), {
                userKey,
                status: 'SUCCESS',
                result: resData,
                createdAt: FieldValue.serverTimestamp()
            });
        }

        invalidateMetadataCache(userKey);

        return resData;
    });

    // [Post-Transaction] Logs & External API Calls
    if (dailyLogDetails) {
        logUserAction(userKey, 'DAILY_TICKET_AWARDED', dailyLogDetails).catch(() => console.error('Log failed'));
    }

    // [Async] 프로모션 미션 체크 (뽑기) - 트랜잭션 외부에서 실행
    checkAndClaimActivityReward(userKey, 'GACHA_10', result.pullCount).catch(() => { });
    checkAndClaimActivityReward(userKey, 'GACHA_50', result.pullCount).catch(() => { });
    checkAndClaimActivityReward(userKey, 'GACHA_100', result.pullCount).catch(() => { });

    if (result.lottoCount) {
        // 로또 관련 프로모션이 현재 비활성 상태라면 실행되지 않음
        checkAndClaimActivityReward(userKey, 'LOTTO_100', result.lottoCount).catch(() => { });
    }

    return result;
};

// ==========================================
// [V3] Chat Related Services
// ==========================================

export const deductChatTicket = async (userKey, reqBody = {}) => {
    const { requestId } = reqBody;
    const todayKey = getKstDateKey();
    const userRef = getUserDocRef(userKey);

    return firestore.runTransaction(async (tx) => {
        // [Idempotency Check]
        if (requestId) {
            const idempRef = firestore.collection('idempotency_keys').doc(requestId);
            const idempSnap = await tx.get(idempRef);
            if (idempSnap.exists) {
                const idempData = idempSnap.data();
                if (idempData.userKey === userKey && idempData.status === 'SUCCESS') {
                    return idempData.result;
                }
                throw new Error('DUPLICATE_REQUEST');
            }
        }

        const snap = await tx.get(userRef);
        const data = snap.exists ? snap.data() : {};
        const lastDailyDate = data?.lastDailyDate || null;
        let ticketsTotal = getTicketBalance(data);

        const updates = { updatedAt: FieldValue.serverTimestamp() };

        // 데일리 티켓 체크 (미수령 시 자동 수령)
        if (lastDailyDate !== todayKey) {
            const dailyBonus = 1;
            if (!snap.exists || (data.ticketsTotal === undefined && data.tickets === undefined && data.ticket === undefined)) {
                ticketsTotal = 2; // 가입 1 + 데일리 1
                updates.createdAt = FieldValue.serverTimestamp();
            } else {
                ticketsTotal = ticketsTotal + dailyBonus;
            }
            updates.lastDailyDate = todayKey;
            updates.ticketsDaily = (data.ticketsDaily || 0) + dailyBonus;
            updates.ticketsTotal = ticketsTotal;
            await logUserAction(userKey, 'DAILY_TICKET_AWARDED_VIA_CHAT', { ticketsAwarded: dailyBonus, totalAfter: ticketsTotal });
        }

        if (ticketsTotal <= 0) {
            const err = new Error('INSUFFICIENT_TICKETS');
            err.code = 'INSUFFICIENT_TICKETS';
            err.currentTickets = ticketsTotal;
            throw err;
        }

        const finalTickets = ticketsTotal - 1;
        const chatCount = (data.chatCount || 0) + 1;

        tx.set(userRef, {
            ...updates,
            ticketsTotal: finalTickets,
            tickets: finalTickets,
            ticket: finalTickets,
            chatCount: chatCount
        }, { merge: true });

        const resData = { tickets: finalTickets, chatCount: chatCount };

        // [Idempotency]
        if (requestId) {
            tx.set(firestore.collection('idempotency_keys').doc(requestId), {
                userKey,
                status: 'SUCCESS',
                result: resData,
                createdAt: FieldValue.serverTimestamp()
            });
        }

        // [Async] 프로모션 미션 체크 (대화)
        checkAndClaimActivityReward(userKey, 'CHAT_USAGE', resData.chatCount).catch(() => { });

        // 💬 첫 상담 프로모션 (chatCount === 1이면 = 첫 상담) — await
        if (chatCount === 1) {
            try {
                const result = await checkAndClaimActivityReward(userKey, 'FIRST_CHAT', 1);
                if (result && !result.alreadyClaimed && !result.error) {
                    console.log(`[DNU] 💬 첫 상담 보상 지급! userKey=${userKey} amount=${result.amount}`);
                }
            } catch (e) {
                console.error(`[DNU] 첫 상담 보상 실패: userKey=${userKey}`, e.message);
            }
        }

        invalidateMetadataCache(userKey);

        return resData;
    });
};

export const applyPaidTickets = async ({ userKey, productId, quantity = 1 }) => {
    const userRef = getUserDocRef(userKey);

    // [Config] Map Product IDs to Ticket Counts — Firestore products 컬렉션 기준 (2026-03-02 동기화)
    const PRODUCT_TICKETS_MAP = {
        'example-product-1': 5,  // 티켓 5장 충전하기 (990원)
        'example-product-2': 10, // 티켓 10장 충전하기 (1,980원)
        'example-product-4': 20, // 티켓 20장 충전하기 (3,300원)
        'example-product-3': 3,  // 티켓 3장 충전하기 (660원, 비활성)
    };

    const ticketsPerUnit = PRODUCT_TICKETS_MAP[productId] || PAID_TICKETS_PER_UNIT;
    const addCount = ticketsPerUnit * Number(quantity || 1);

    return firestore.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        const data = snap.exists ? snap.data() : {};

        // [Sync] Get unified balance & add
        const currentTickets = getTicketBalance(data);
        const newTotal = currentTickets + addCount;

        const updates = {
            ticketsTotal: newTotal,
            tickets: newTotal, // [Sync] V1 Compatible
            ticket: newTotal, // [Sync] Legacy Singular
            ticketsPaid: FieldValue.increment(addCount),
            updatedAt: FieldValue.serverTimestamp()
        };

        if (!snap.exists) {
            updates.createdAt = FieldValue.serverTimestamp();
        }
        tx.set(userRef, updates, { merge: true });
        await logUserAction(userKey, 'PURCHASE_TICKETS_SUCCESS', { productId: productId || 'unknown', quantity, ticketsAdded: addCount, total: newTotal });
        invalidateMetadataCache(userKey);
    });
};

export const applyAdRewardTickets = async ({ userKey, tickets, rewardId }) => {
    const userRef = getUserDocRef(userKey);
    const addTickets = Number.isFinite(tickets) ? tickets : DEFAULT_AD_REWARD_TICKETS;

    let logDetails = null;

    try {
        const result = await firestore.runTransaction(async (tx) => {
            const userSnap = await tx.get(userRef);
            const userData = userSnap.exists ? userSnap.data() : {};

            // 중복 보상 체크 (rewardId가 있을 경우)
            if (rewardId) {
                const rewardLogRef = firestore.collection('adRewards').doc(rewardId);
                const rewardLogSnap = await tx.get(rewardLogRef);
                if (rewardLogSnap.exists) {
                    return { applied: false, reason: 'ALREADY_REWARDED' };
                }
            }

            const currentTickets = getTicketBalance(userData);
            const newTotal = currentTickets + addTickets;

            const updates = {
                ticketsTotal: newTotal,
                tickets: newTotal,
                ticket: newTotal,
                ticketsAds: FieldValue.increment(addTickets),
                updatedAt: FieldValue.serverTimestamp()
            };

            if (!userSnap.exists) {
                updates.createdAt = FieldValue.serverTimestamp();
            }

            // 보상 상세 기록
            if (rewardId) {
                tx.set(firestore.collection('adRewards').doc(rewardId), {
                    userKey,
                    tickets: addTickets,
                    createdAt: FieldValue.serverTimestamp()
                });
            }

            tx.set(userRef, updates, { merge: true });

            logDetails = {
                ticketsAwarded: addTickets,
                rewardId: rewardId || 'manual_or_legacy',
                totalAfter: newTotal,
                timestamp: new Date().toISOString()
            };

            return { applied: true, tickets: newTotal };
        });

        // 로깅 (트랜잭션 성공 후 별도 처리)
        if (result.applied && logDetails) {
            logUserAction(userKey, 'AD_REWARD_AWARDED', logDetails).catch(err => {
                console.error(`[applyAdRewardTickets] Logging failed for ${userKey}:`, err);
            });
        }

        return result;

    } catch (error) {
        console.error(`[applyAdRewardTickets] Transaction failed for ${userKey}:`, error);
        throw error;
    }
};


export const applyShareReward = async ({ userKey, tickets, shareId }) => {
    const userRef = getUserDocRef(userKey);
    const addTickets = Number.isFinite(tickets) ? tickets : DEFAULT_SHARE_REWARD_TICKETS;
    const todayKey = getKstDateKey();

    return firestore.runTransaction(async (tx) => {
        // 1. 모든 읽기(Read) 작업을 먼저 수행
        const userSnap = await tx.get(userRef);
        const userData = userSnap.exists ? userSnap.data() : {};

        let shareLogSnap = null;
        if (shareId) {
            const shareLogRef = firestore.collection('shareRewards').doc(shareId);
            shareLogSnap = await tx.get(shareLogRef);
            if (shareLogSnap.exists) {
                return { applied: false, reason: 'ALREADY_REWARDED' };
            }
        }

        // 2. 비즈니스 로직 계산
        const currentTickets = getTicketBalance(userData);
        const newTotal = currentTickets + addTickets;

        const updates = {
            ticketsTotal: newTotal,
            tickets: newTotal, // [Sync] V1 Compatible
            ticket: newTotal, // [Sync] Legacy Singular
            ticketsShare: FieldValue.increment(addTickets),
            shareCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp()
        };

        if (!userSnap.exists) {
            updates.createdAt = FieldValue.serverTimestamp();
        }

        // 3. 모든 쓰기(Write) 작업을 나중에 수행
        if (shareId) {
            tx.set(firestore.collection('shareRewards').doc(shareId), {
                userKey,
                tickets: addTickets,
                createdAt: FieldValue.serverTimestamp(),
                date: todayKey
            });
        }

        tx.set(userRef, updates, { merge: true });

        // 4. 로깅 (비동기지만 대기하여 확실히 기록)
        await logUserAction(userKey, 'SHARE_REWARD_AWARDED', {
            ticketsAwarded: addTickets,
            shareId,
            total: newTotal
        });

        // [Fix] Return updated tickets as requested
        return { applied: true, tickets: newTotal };
    });
};

export const applyAdRewardPoints = async ({ userKey, points, rewardId, source, adFormat }) => {
    const userRef = firestore.collection('users').doc(String(userKey));
    const now = new Date();
    const today = getKstDateKey();
    const addPoints = Number(points) || 1; // Default 1 point

    // [V3] points must be 1 or 2 (Updated based on adConfig)
    if (addPoints !== 1 && addPoints !== 2) {
        throw new Error('INVALID_POINTS_VALUE');
    }

    let logDetails = null;

    try {
        const result = await firestore.runTransaction(async (tx) => {
            const userSnap = await tx.get(userRef);
            const userData = userSnap.exists ? userSnap.data() : {};
            // const today = getKstDateKey(); // Moved to top

            // 1. Daily Stats Update
            let dailySum = userData.pointsDailyDate === today ? (userData.pointsDailySum || 0) : 0;
            const DAILY_GOAL = 10; // UI Goal

            // 사용자 수 감소에 맞춰 일일 감쇄 없이 요청된 포인트를 그대로 지급한다.
            const multiplier = 1;
            const finalPoints = addPoints;

            if (rewardId) {
                const rewardLogRef = firestore.collection('adRewards').doc(rewardId);
                const rewardLogSnap = await tx.get(rewardLogRef);
                if (rewardLogSnap.exists) {
                    return { applied: false, reason: 'ALREADY_REWARDED' };
                }
            }

            const currentPoints = userData.points || 0;
            const newTotal = currentPoints + finalPoints;
            const newDailySum = dailySum + finalPoints;

            const updates = {
                points: newTotal,
                pointsDailySum: newDailySum,
                pointsDailyDate: today,
                updatedAt: FieldValue.serverTimestamp()
            };

            if (!userSnap.exists) {
                updates.createdAt = FieldValue.serverTimestamp();
            }

            // [V3] Record History
            const historyId = rewardId || `hist_p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const historyRef = userRef.collection('point_history').doc(historyId);
            // const now = new Date(); // Moved to top

            tx.set(historyRef, {
                type: 'POINT_GRANT',
                source: source || (addPoints >= 2 ? 'AD_LONG' : 'AD_SHORT'),
                points: finalPoints,
                description: addPoints >= 2 ? '긴 광고 시청 보상' : '짧은 광고 시청 보상',
                multiplier,
                createdAt: FieldValue.serverTimestamp()
            });

            if (rewardId) {
                tx.set(firestore.collection('adRewards').doc(rewardId), {
                    userKey,
                    points: addPoints,
                    type: 'POINTS',
                    createdAt: FieldValue.serverTimestamp()
                });
            }

            tx.set(userRef, updates, { merge: true });

            logDetails = {
                pointsAwarded: finalPoints,
                source: source || (addPoints >= 2 ? 'AD_LONG' : 'AD_SHORT'),
                rewardId: historyId,
                totalAfter: newTotal,
                dailyAfter: newDailySum,
                multiplier,
                adFormat: adFormat || (addPoints >= 2 ? 'LONG' : 'SHORT'),
                timestamp: now.toISOString()
            };

            return {
                applied: true,
                grantedPoints: finalPoints,
                balancePoints: newTotal,
                dailyCurrentPoints: newDailySum,
                dailyGoalPoints: DAILY_GOAL,
                progressPercent: Math.min(100, Math.floor((newDailySum / DAILY_GOAL) * 100)),
                multiplier,
                historyId: historyId,
                createdAt: now.toISOString()
            };
        });

        if (result.applied && logDetails) {
            // 포인트 크기에 따라 로그 액션 구분 (1P vs 2P)
            const actionName = addPoints >= 2 ? 'AD_REWARD_3P_AWARDED' : 'AD_REWARD_POINTS_AWARDED';
            logUserAction(userKey, actionName, logDetails).catch(err => {
                console.error(`[applyAdRewardPoints] Logging failed for ${userKey}:`, err);
            });
        }

        return result;

    } catch (error) {
        console.error(`[applyAdRewardPoints] Transaction failed for ${userKey}:`, error);
        throw error;
    }
};

export const getDailyRewardProgress = async (userKey) => {
    const userRef = getUserDocRef(userKey);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const today = getKstDateKey();

    const dailySum = userData.pointsDailyDate === today ? (userData.pointsDailySum || 0) : 0;
    const DAILY_GOAL = 10;
    const totalPoints = userData.points ?? userData.currentPoints ?? 0;

    return {
        date: today,
        points: totalPoints,
        pointCount: totalPoints,
        balancePoints: totalPoints,
        currentPoints: totalPoints,
        dailyCurrentPoints: dailySum,
        goalPoints: DAILY_GOAL,
        dailyGoalPoints: DAILY_GOAL,
        progressPercent: Math.min(100, Math.floor((dailySum / DAILY_GOAL) * 100)),
        updatedAt: userData.updatedAt ? (userData.updatedAt.toDate ? userData.updatedAt.toDate().toISOString() : new Date().toISOString()) : new Date().toISOString()
    };
};

export const getRewardHistory = async (userKey, cursor, limit = 20) => {
    const userRef = getUserDocRef(userKey);
    const limitNum = Number(limit) || 20;

    let pointQuery = userRef.collection('point_history')
        .orderBy('createdAt', 'desc')
        .limit(limitNum);

    let promotionQuery = userRef.collection('claimed_promotions')
        .orderBy('claimedAt', 'desc')
        .limit(limitNum);

    if (cursor) {
        const cursorDate = new Date(cursor);
        pointQuery = pointQuery.startAfter(cursorDate);
        promotionQuery = promotionQuery.startAfter(cursorDate);
    }

    const [pointSnap, promotionSnap] = await Promise.all([
        pointQuery.get(),
        promotionQuery.get()
    ]);

    const pointGrantHistory = pointSnap.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            type: data.type || 'POINT_GRANT',
            source: data.source,
            points: data.points,
            description: data.description,
            createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : null) : null
        };
    });

    const promotionReturnHistory = promotionSnap.docs.map(doc => {
        const data = doc.data();
        // claimPromotionByCode는 cashReward, claimUserPromotionInternal은 amount 필드 사용
        const amount = data.cashReward || data.promoResult?.amount || data.amount || data.rewardAmount || 0;
        return {
            id: doc.id,
            type: 'PROMOTION_RETURN',
            amount,
            currency: 'KRW',
            status: data.status || 'COMPLETED',
            description: data.description || '토스 프로모션 혜택 리턴',
            createdAt: data.claimedAt ? (data.claimedAt.toDate ? data.claimedAt.toDate().toISOString() : null) : null
        };
    });

    // Simple cursor based on the oldest item's timestamp
    let nextCursor = null;
    const allItems = [...pointGrantHistory, ...promotionReturnHistory]
        .filter(i => i.createdAt)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (allItems.length >= limitNum) {
        nextCursor = allItems[allItems.length - 1].createdAt;
    }

    return {
        pointGrantHistory,
        promotionReturnHistory,
        nextCursor
    };
};

export const processRefund = async ({ userKey, amount, promotionCode }) => {
    const userRef = getUserDocRef(userKey);
    const refundAmount = Number(amount);

    if (!refundAmount || refundAmount <= 0) {
        throw new Error('INVALID_REFUND_AMOUNT');
    }

    try {
        const refundConfig = await getRefundConfig();
        const { minPoints, maxPoints, pointUnit, enabled, promotionCode: configuredCode } = refundConfig;

        if (!enabled) {
            throw new Error('REFUND_DISABLED');
        }

        if (!Number.isInteger(refundAmount)) {
            throw new Error('INVALID_REFUND_AMOUNT');
        }

        if (refundAmount % pointUnit !== 0) {
            throw new Error('INVALID_REFUND_UNIT');
        }

        if (refundAmount < minPoints) {
            throw new Error('REFUND_BELOW_MIN_POINTS');
        }

        if (Number.isInteger(maxPoints) && refundAmount > maxPoints) {
            throw new Error('REFUND_ABOVE_MAX_POINTS');
        }

        const incomingCode = typeof promotionCode === 'string' && promotionCode.trim() ? promotionCode.trim() : null;

        if (incomingCode && !configuredCode) {
            throw new Error('PROMOTION_CODE_NOT_ALLOWED');
        }

        if (configuredCode && incomingCode && incomingCode !== configuredCode) {
            throw new Error('INVALID_PROMOTION_CODE');
        }

        const result = await firestore.runTransaction(async (tx) => {
            const userSnap = await tx.get(userRef);
            if (!userSnap.exists) throw new Error('USER_NOT_FOUND');

            const userData = userSnap.data();
            const currentPoints = userData.points || 0;

            if (currentPoints < minPoints) {
                throw new Error('REFUND_BELOW_MIN_POINTS');
            }

            const refundableAmount = Math.floor(currentPoints / pointUnit) * pointUnit;

            if (refundAmount > refundableAmount) {
                throw new Error('INSUFFICIENT_POINTS');
            }

            if (currentPoints < refundAmount) {
                throw new Error('INSUFFICIENT_POINTS');
            }

            const today = getKstDateKey();
            const refundsToday = userData.refundsDailyDate === today ? (userData.refundsDailyCount || 0) : 0;
            const newRefundsCount = refundsToday + 1;
            const newTotal = currentPoints - refundAmount;

            tx.update(userRef, {
                points: newTotal,
                refundsDailyCount: newRefundsCount,
                refundsDailyDate: today,
                updatedAt: FieldValue.serverTimestamp()
            });

            return {
                success: true,
                points: newTotal,
                refundAmount,
                pointUnit,
                minPoints,
                maxPoints,
                refundsDailyCount: newRefundsCount,
                promotionCode: configuredCode || null
            };
        });

        // 💸 포인트 전환 시 실시간 Toss 프로모션 보상 지급 (1~8원 균등 랜덤)
        let promotionResult = null;
        if (result.promotionCode) {
            try {
                const reward = await executeConversionPromotionReward({
                    userKey,
                    promotionCode: result.promotionCode
                });

                // 고유 ID로 클레임 기록 (중복 지급 허용)
                const claimId = `REFUND_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                await firestore.collection('users').doc(String(userKey))
                    .collection('claimed_promotions').doc(claimId)
                    .set({
                        claimedAt: FieldValue.serverTimestamp(),
                        amount: reward.amount,
                        tossKey: reward.tossKey,
                        status: 'SUCCESS',
                        type: 'REFUND_REWARD',
                        promotionCode: result.promotionCode
                    });

                promotionResult = { amount: reward.amount, status: reward.status };
                console.log(`[processRefund] 💸 Promotion reward ${reward.amount} KRW sent to user ${userKey}`);
            } catch (promoErr) {
                console.error(`[processRefund] Promotion reward failed for ${userKey}, rolling back ${refundAmount}P:`, promoErr.message);

                // [ROLLBACK] Toss 실패 시 차감된 포인트 복원
                try {
                    await firestore.runTransaction(async (tx) => {
                        const snap = await tx.get(userRef);
                        const data = snap.exists ? snap.data() : {};
                        const currentPoints = data.points || 0;
                        const today = getKstDateKey();
                        const currentRefundsCount = data.refundsDailyDate === today ? (data.refundsDailyCount || 0) : 0;

                        tx.update(userRef, {
                            points: currentPoints + refundAmount,
                            refundsDailyCount: Math.max(0, currentRefundsCount - 1),
                            updatedAt: FieldValue.serverTimestamp()
                        });

                        // 롤백 히스토리 기록
                        const rollbackHistId = `refund_rb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                        tx.set(userRef.collection('point_history').doc(rollbackHistId), {
                            type: 'POINT_REFUND_ROLLBACK',
                            points: refundAmount,
                            description: `환전 실패 → 포인트 복원 (${refundAmount}P)`,
                            originalError: promoErr.message,
                            createdAt: FieldValue.serverTimestamp()
                        });
                    });
                    console.log(`[processRefund] Rollback SUCCESS: ${refundAmount}P restored for ${userKey}`);
                } catch (rollbackErr) {
                    console.error(`[processRefund] CRITICAL: Rollback FAILED for ${userKey}: ${rollbackErr.message}`);
                }

                // 포인트가 복원되었으므로 클라이언트에 실패를 명확히 반환
                const wrappedErr = new Error('PROMOTION_PROVIDER_UNAVAILABLE');
                wrappedErr.originalError = promoErr.message;
                throw wrappedErr;
            }
        }

        await logUserAction(userKey, 'POINTS_REFUNDED', {
            refundAmount,
            totalAfter: result.points,
            pointUnit: result.pointUnit,
            minPoints: result.minPoints,
            maxPoints: result.maxPoints,
            promotionCode: result.promotionCode || null,
            promotionReward: promotionResult
        });

        // 💸 첫 리워드 전환 프로모션 (refundsDailyCount가 1이고 첫 전환인 경우) — await
        if (result.refundsDailyCount === 1) {
            try {
                const { checkAndClaimActivityReward } = await import('./promotionService.js');
                const r = await checkAndClaimActivityReward(userKey, 'FIRST_REFUND', 1);
                if (r && !r.alreadyClaimed && !r.error) {
                    console.log(`[DNU] 💸 첫 리워드 전환 보상 지급! userKey=${userKey} amount=${r.amount}`);
                }
            } catch (e) {
                console.error(`[DNU] 첫 리워드 전환 보상 실패: userKey=${userKey}`, e.message);
            }
        }

        return { ...result, promotionReward: promotionResult };

    } catch (error) {
        console.error(`[processRefund] Transaction failed for ${userKey}:`, error);
        throw error;
    }
};

/**
 * Update user's latest interaction preferences
 * @param {string} userKey
 * @param {object} prefs { persona, situation, theme }
 */
export const updateUserPreferences = async (userKey, { persona, situation, theme }) => {
    try {
        const userRef = getUserDocRef(userKey);
        const updates = { updatedAt: FieldValue.serverTimestamp() };

        if (persona) updates.lastPersona = persona;
        if (situation) updates.lastSituation = situation;
        if (theme) {
            updates.lastTheme = theme;
            // 최근 테마 5개 유지 (배열 추가)
            updates.recentThemes = FieldValue.arrayUnion(theme);
        }

        // 먼저 업데이트
        await userRef.set(updates, { merge: true });

        // 배열 길이 제한 (5개) - 별도 트랜잭션 없이 간단히 처리
        // (arrayUnion은 중복 제거를 하므로, 순서 보장을 위해선 가져와서 재정렬 필요하지만,
        //  여기선 단순 집합 유지를 위해 arrayUnion 사용 후 필요시 정리)
    } catch (error) {
        console.error('Error updating user preferences:', error);
    }
};

/**
 * Sync diamond/platinum counts from persona preferences to the main user document
 */
export const syncUserStats = async (userKey, dbData) => {
    const cacheKey = String(userKey);
    const now = Date.now();
    const cached = _syncStatsCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
        // 캐시 히트: diamondCount가 이미 최신이면 빈 객체 반환, 아니면 캐시된 업데이트 반환
        if (cached.value.diamondCount !== undefined && cached.value.diamondCount === dbData.diamondCount &&
            cached.value.platinumCount !== undefined && cached.value.platinumCount === dbData.platinumCount) {
            return {};
        }
        return cached.value;
    }

    try {
        const prefRef = firestore.collection('user_persona_preferences').doc(String(userKey));
        const prefSnap = await prefRef.get();
        if (!prefSnap.exists) {
            // 문서 없으면 캐시에 빈값 저장 후 반환
            _syncStatsCache.set(cacheKey, { value: {}, expiresAt: now + SYNC_STATS_TTL_MS });
            return {};
        }

        const prefData = prefSnap.data();
        const personas = prefData.personas || {};

        // [Compat] 일부 문서는 `personas.xxx.grades.diamond` 형태의 평면 키를 사용함.
        // 신규/정상 문서의 nested map(`personas: { ... }`)과 legacy flat key를 모두 합산하되,
        // persona+grade 중복 카운트는 1회만 반영한다.
        const gradeByPersona = new Map();

        const ensurePersona = (personaId) => {
            if (!gradeByPersona.has(personaId)) {
                gradeByPersona.set(personaId, { diamond: 0, platinum: 0 });
            }
            return gradeByPersona.get(personaId);
        };

        Object.entries(personas).forEach(([personaId, stats]) => {
            if (!stats?.grades || typeof stats.grades !== 'object') return;
            const bucket = ensurePersona(personaId);
            bucket.diamond = Math.max(bucket.diamond, Number(stats.grades.diamond || 0));
            bucket.platinum = Math.max(bucket.platinum, Number(stats.grades.platinum || 0));
        });

        Object.entries(prefData).forEach(([key, value]) => {
            const match = key.match(/^personas\.([^\.]+)\.grades\.(diamond|platinum)$/);
            if (!match) return;
            const personaId = match[1];
            const grade = match[2];
            const bucket = ensurePersona(personaId);
            bucket[grade] = Math.max(bucket[grade], Number(value || 0));
        });

        let totalDiamond = 0;
        let totalPlatinum = 0;

        gradeByPersona.forEach((grades) => {
            totalDiamond += Number(grades.diamond || 0);
            totalPlatinum += Number(grades.platinum || 0);
        });

        const updates = {};
        if (dbData.diamondCount === undefined || dbData.diamondCount !== totalDiamond) {
            updates.diamondCount = totalDiamond;
        }
        if (dbData.platinumCount === undefined || dbData.platinumCount !== totalPlatinum) {
            updates.platinumCount = totalPlatinum;
        }

        // 캐시에 계산된 값 저장 (가챠 뽑기 시 invalidateSyncStatsCache 호출로 무효화됨)
        const cachedValue = { diamondCount: totalDiamond, platinumCount: totalPlatinum };
        _syncStatsCache.set(cacheKey, { value: cachedValue, expiresAt: now + SYNC_STATS_TTL_MS });

        if (Object.keys(updates).length > 0) {
            updates.updatedAt = FieldValue.serverTimestamp();
            await getUserDocRef(userKey).set(updates, { merge: true });
            return updates;
        }
    } catch (error) {
        console.error('[syncUserStats] Failed:', error);
    }
    return {};
};

export const syncUserStatsDirectly = async (userKey) => {
    const userRef = getUserDocRef(userKey);
    const snap = await userRef.get();
    if (!snap.exists) return null;
    return await syncUserStats(userKey, snap.data());
};

/**
 * [V2] [POST] 광고 리워드 클레임 (통합 포인트 지급)
 */
export const applyAdRewardClaim = async ({ userKey, adType, rewardId }) => {
    // short: 1P, long: 2P
    const addPoints = adType === 'long' ? 2 : 1;
    const source = adType === 'long' ? 'AD_LONG' : 'AD_SHORT';
    const adFormat = adType === 'long' ? 'LONG' : 'SHORT';

    // Use existing applyAdRewardPoints logic which now supports history and no daily limit
    const result = await applyAdRewardPoints({ userKey, points: addPoints, rewardId, source, adFormat });

    if (result.applied) {
        return {
            pointsAdded: addPoints,
            totalPoints: result.balancePoints,
            totalTickets: result.dailyCurrentPoints // Placeholder or relevant balance
        };
    }
    return result;
};

/**
 * [V2] [GET] 사용자 포인트 현황
 */
export const getUserPointsStatus = async (userKey) => {
    const userRef = getUserDocRef(userKey);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw new Error('USER_NOT_FOUND');

    const userData = userSnap.data();
    return {
        points: userData.points || 0,
        convertibleUnit: 10,
        updatedAt: userData.updatedAt ? (userData.updatedAt.toDate ? userData.updatedAt.toDate().toISOString() : new Date().toISOString()) : new Date().toISOString()
    };
};

/**
 * [V2] [POST] 포인트 -> 프로모션 코드 전환 (10P -> 1 Promo Code)
 *
 * 안전한 순서: 포인트 차감(트랜잭션) → Toss API 지급 → 실패 시 롤백
 */
export const convertPointsToTickets = async ({ userKey, pointsToUse }) => {
    const userRef = getUserDocRef(userKey);
    const CONVERSION_UNIT = 10;  // 10포인트 = 1회 전환
    const TARGET_PROMOTION_CODE = PROMOTION_CONFIG.REFUND_LIVE_CODE;
    const pointsAmount = Number(pointsToUse) || 0;

    // 입력값 검증: 10의 배수여야 함
    if (pointsAmount <= 0 || pointsAmount % CONVERSION_UNIT !== 0) {
        throw new Error('INVALID_POINTS_AMOUNT');
    }

    // ── 1단계: 트랜잭션으로 포인트 차감 + 클레임 마킹 (Toss 호출 전) ─────
    const historyId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let deductedPoints = 0;

    const txResult = await firestore.runTransaction(async (tx) => {
        const uSnap = await tx.get(userRef);
        if (!uSnap.exists) throw new Error('USER_NOT_FOUND');

        const uData = uSnap.data();
        const latestPoints = uData.points || 0;

        if (latestPoints < pointsAmount) {
            throw new Error('INSUFFICIENT_POINTS');
        }

        // 멱등성: PENDING 상태는 이전 요청 진행 중 → 대기 안내
        // [FIX] SUCCESS 상태여도 재수령 허용 (반복 가능한 프로모션)
        const claimDocId = `${TARGET_PROMOTION_CODE}_${Date.now()}`;
        const claimRef = userRef.collection('claimed_promotions').doc(claimDocId);

        // PENDING 체크: 최근 10초 이내 PENDING이 있으면 대기
        const recentClaims = await tx.get(
            userRef.collection('claimed_promotions')
                .where('status', '==', 'PENDING')
        );
        const pendingForThis = recentClaims.docs.filter(d => d.data().promotionCode === TARGET_PROMOTION_CODE);
        if (pendingForThis.length > 0) {
            const pendingDoc = pendingForThis[0].data();
            const pendingAt = pendingDoc.claimedAt?.toDate?.() || new Date(0);
            const elapsed = Date.now() - pendingAt.getTime();
            if (elapsed < 10000) { // 10초 이내 PENDING이면 대기
                return {
                    usedPoints: 0,
                    promotionCode: TARGET_PROMOTION_CODE,
                    alreadyClaimed: true,
                    message: '프로모션 처리가 진행 중입니다. 잠시 후 다시 확인해주세요.',
                    currentPoints: latestPoints
                };
            }
        }

        const newPoints = latestPoints - pointsAmount;

        const today = getKstDateKey();
        const refundsToday = uData.refundsDailyDate === today ? (uData.refundsDailyCount || 0) : 0;
        const newRefundsCount = refundsToday + 1;

        // 포인트 차감 및 당일 전환 횟수 기록
        tx.update(userRef, {
            points: newPoints,
            refundsDailyCount: newRefundsCount,
            refundsDailyDate: today,
            updatedAt: FieldValue.serverTimestamp()
        });

        // 포인트 히스토리 기록
        tx.set(userRef.collection('point_history').doc(historyId), {
            type: 'POINT_CONVERT_PROMOTION',
            points: -pointsAmount,
            promotionCode: TARGET_PROMOTION_CODE,
            description: `포인트를 프로모션 코드로 전환 (${pointsAmount}P)`,
            createdAt: FieldValue.serverTimestamp()
        });

        // claimed_promotions에 PENDING 상태로 마킹 (중복 방지)
        tx.set(claimRef, {
            promotionCode: TARGET_PROMOTION_CODE,
            claimedAt: FieldValue.serverTimestamp(),
            pointsUsed: pointsAmount,
            status: 'PENDING',
        });

        return {
            usedPoints: pointsAmount,
            newPoints,
            newRefundsCount,
            promotionCode: TARGET_PROMOTION_CODE,
            claimDocId,
        };
    });

    // 멱등성 응답 (이미 완료됨)
    if (txResult.alreadyClaimed) return txResult;

    deductedPoints = txResult.usedPoints;
    const newRefundsCount = txResult.newRefundsCount;

    // ── 2단계: Toss 프로모션 API 직접 호출 ──────
    let promoResult;
    try {
        const reward = await executeConversionPromotionReward({
            userKey,
            promotionCode: TARGET_PROMOTION_CODE
        });

        promoResult = { amount: reward.amount, status: reward.status };

        // 성공: claimed_promotions 상태를 SUCCESS로 업데이트
        await userRef.collection('claimed_promotions').doc(txResult.claimDocId).set({
            status: 'SUCCESS',
            promoResult,
            cashReward: reward.amount, // 프론트엔드/히스토리 연동용
            amount: reward.amount,
            completedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        console.log(`[Conversion] SUCCESS: ${pointsAmount}P converted for ${userKey}, reward: ${reward.amount} KRW`);
    } catch (err) {
        // ── 3단계: Toss 실패 시 포인트 롤백 ─────────────────────────────
        console.error(`[Conversion] Toss API failed for ${userKey}: ${err.message}, rolling back ${deductedPoints}P`);

        try {
            await firestore.runTransaction(async (tx) => {
                const uSnap = await tx.get(userRef);
                const uData = uSnap.exists ? uSnap.data() : {};
                const currentPoints = uData.points || 0;

                const today = getKstDateKey();
                let currentRefundsCount = uData.refundsDailyDate === today ? (uData.refundsDailyCount || 0) : 0;

                // 포인트 복원 및 카운트 원복
                tx.update(userRef, {
                    points: currentPoints + deductedPoints,
                    refundsDailyCount: Math.max(0, currentRefundsCount - 1),
                    updatedAt: FieldValue.serverTimestamp()
                });

                // 히스토리에 롤백 기록
                tx.set(userRef.collection('point_history').doc(`${historyId}_rollback`), {
                    type: 'POINT_CONVERT_ROLLBACK',
                    points: deductedPoints,
                    promotionCode: TARGET_PROMOTION_CODE,
                    description: `프로모션 전환 실패 → 포인트 복원 (${deductedPoints}P)`,
                    originalError: err.message,
                    createdAt: FieldValue.serverTimestamp()
                });

                // claimed_promotions 상태를 FAILED로 업데이트 (재시도 가능)
                tx.set(userRef.collection('claimed_promotions').doc(txResult.claimDocId), {
                    status: 'FAILED',
                    error: err.message,
                    failedAt: FieldValue.serverTimestamp()
                }, { merge: true });
            });

            console.log(`[Conversion] Rollback SUCCESS: ${deductedPoints}P restored for ${userKey}`);
        } catch (rollbackErr) {
            console.error(`[Conversion] CRITICAL: Rollback FAILED for ${userKey}: ${rollbackErr.message}`);
        }

        throw err; // 원본 Toss 에러를 클라이언트에 반환
    }

    return {
        usedPoints: pointsAmount,
        newPoints: txResult.newPoints,
        // [FIX §1.3-1] 프론트(App.tsx:2353)가 balancePoints/currentPoints/points 순으로
        // 전환 후 잔여 포인트(절대값)를 읽으므로 표준 필드로 함께 내려준다.
        balancePoints: txResult.newPoints,
        currentPoints: txResult.newPoints,
        points: txResult.newPoints,
        promotionCode: TARGET_PROMOTION_CODE,
        promoResult,
        message: `${pointsAmount}포인트를 프로모션 코드로 성공적으로 전환했습니다.`
    };
};

// ══════════════════════════════════════════════════════════════════════════════
// [Phase 2] 리워드 활동 — 경험치/레벨/포인트 통합 처리
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 레벨 → 다음 레벨까지 필요한 EXP 계산
 * 🎮 RPG 스타일 기하급수적 성장 곡선
 *
 *   Lv 1:   65      Lv 6:  189     Lv 15:  582
 *   Lv 2:   88      Lv 7:  218     Lv 20: 1024
 *   Lv 3:  111      Lv 8:  251     Lv 25: 1846
 *   Lv 4:  136      Lv 9:  287     Lv 30: 3435
 *   Lv 5:  162      Lv 10: 326     Lv 50: 25335
 */
const getExpToNext = (level) => {
    return Math.round(50 * Math.pow(1.15, level - 1) + level * 15);
};

/**
 * EXP 획득량 (activityType별)
 */
const EXP_PER_ACTIVITY = {
    AD_SHORT: 15,
    AD_LONG: 15,
    CONSULT: 15,
    GACHA_PULL: 5, // Decrease EXP for Gacha pull
};

/**
 * 포인트 획득량 (activityType별)
 */
const POINTS_PER_ACTIVITY = {
    AD_SHORT: 1,
    AD_LONG: 2,
    CONSULT: 0, // Phase 3에서 결정
    GACHA_PULL: 1, // 가차 뽑으면 1포인트
};

/** 유효한 activityType 목록 */
const VALID_ACTIVITY_TYPES = new Set(['AD_SHORT', 'AD_LONG', 'CONSULT', 'GACHA_PULL', 'AD_TICKET', 'AD_INTERSTITIAL']);

/**
 * [Phase 2] 리워드 활동 적재
 * POST /api/v2/reward/activity
 *
 * @param {string} userKey
 * @param {string} activityType  AD_SHORT | AD_LONG | CONSULT | AD_TICKET
 * @param {number} amount        클라이언트 제공 포인트 (검증 후 서버 값으로 덮어씀)
 * @param {string} [idempotencyKey]  중복 호출 방지 키 (rewardId 또는 클라이언트 UUID)
 * @returns {Promise<object>}
 */
export const applyRewardActivity = async ({ userKey, activityType, amount, adFormat, idempotencyKey, pullId, personaId, adVerification }) => {
    const userRef = firestore.collection('users').doc(String(userKey));
    const today = getKstDateKey();
    const now = new Date();
    const idempKey = idempotencyKey || pullId || null; // pullId도 멱등키로 사용

    // Type definition and base rewards
    const REWARD_CONFIG = {
        AD_SHORT: { p: 0, exp: 3 }, // 짧은 광고: 포인트 없음, 티켓 1장만 지급
        AD_LONG: { p: 2, exp: 3 },
        CONSULT: { p: 0, exp: 15 },
        GACHA_PULL: { p: 1, exp: 5 }, // 가차 뽑으면 1포인트 상향 반영
        AD_TICKET: { p: 0, exp: 0 },
        AD_INTERSTITIAL: { p: 0, exp: 0 }, // 전면 광고 시청 → 티켓 1장 (AD_TICKET과 동일)
    };

    // AD_INTERSTITIAL → AD_TICKET 으로 정규화 (내부 처리 통일)
    const type = activityType === 'AD_INTERSTITIAL' ? 'AD_TICKET' : activityType; // 내부 코드가 'type' 변수명을 사용하므로 alias 추가
    const config = REWARD_CONFIG[type];
    if (!config) throw new Error('INVALID_ACTIVITY_TYPE');

    const addPoints = config.p;
    const addExp = config.exp;

    // idempotency 키 (클라이언트 재시도 보호)
    const idempRef = idempKey
        ? firestore.collection('reward_activity_idem').doc(idempKey)
        : null;

    try {
        const result = await firestore.runTransaction(async (tx) => {
            // ── 0. Idempotency 체크 ──────────────────────────────────────
            if (idempRef) {
                const idempSnap = await tx.get(idempRef);
                if (idempSnap.exists) {
                    const cached = idempSnap.data();
                    if (cached.userKey === String(userKey) && cached.status === 'SUCCESS') {
                        return { ...cached.result, _duplicated: true };
                    }
                    throw new Error('REWARD_ACTIVITY_DUPLICATED');
                }
            }

            // ── 1. 유저 데이터 읽기 (없으면 최소 문서 auto-create) ──────────
            const userSnap = await tx.get(userRef);
            let ud = userSnap.exists ? userSnap.data() : {};
            const isNewUser = !userSnap.exists;

            // ── 1-1. persona_exp 선행 읽기 (GACHA_PULL + personaId) ──────
            let personaExpSnap = null;
            let personaExpRef = null;
            if (type === 'GACHA_PULL' && personaId) {
                personaExpRef = userRef.collection('persona_exp').doc(personaId);
                personaExpSnap = await tx.get(personaExpRef);
            }

            // ── 모든 읽기 완료 — 이후부터 쓰기 가능 ──────────────────────

            // 신규 유저면 기본 문서 생성 (트랜잭션 내 write, 아래 updates에서 merge)
            if (isNewUser) {
                tx.set(userRef, {
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                    tickets: 2,
                    ticketsTotal: 2,
                    ticket: 2,
                    points: 0,
                    characterLevel: 1,
                    characterExp: 0,
                }, { merge: true });

                // 🎉 첫 로그인 프로모션 자동 지급 (트랜잭션 외부, await)
                try {
                    const { checkAndClaimActivityReward } = await import('./promotionService.js');
                    const result = await checkAndClaimActivityReward(userKey, 'FIRST_LOGIN', 1);
                    if (result && !result.alreadyClaimed && !result.error) {
                        console.log(`[DNU] 🎉 첫 로그인 보상 지급! userKey=${userKey} amount=${result.amount}`);
                    }
                } catch (e) {
                    console.error(`[DNU] 첫 로그인 보상 실패: userKey=${userKey}`, e.message);
                }
            }

            // 🎰 첫 가챠 프로모션 (pullCount 0일 때) — await
            if (type === 'GACHA_PULL' && (ud.pullCount || 0) === 0) {
                try {
                    const { checkAndClaimActivityReward } = await import('./promotionService.js');
                    const result = await checkAndClaimActivityReward(userKey, 'FIRST_GACHA', 1);
                    if (result && !result.alreadyClaimed && !result.error) {
                        console.log(`[DNU] 🎰 첫 가챠 보상 지급! userKey=${userKey} amount=${result.amount}`);
                    }
                } catch (e) {
                    console.error(`[DNU] 첫 가챠 보상 실패: userKey=${userKey}`, e.message);
                }
            }

            // 🃏 카드 10개 모으기 프로모션 (pullCount가 9→10이 되는 시점) — 1회성
            if (type === 'GACHA_PULL' && (ud.pullCount || 0) === 9) {
                try {
                    const { checkAndClaimActivityReward } = await import('./promotionService.js');
                    const result = await checkAndClaimActivityReward(userKey, 'COLLECT_10_CARDS', 10);
                    if (result && !result.alreadyClaimed && !result.error) {
                        console.log(`[Milestone] 🃏 카드 10개 달성 보상 지급! userKey=${userKey} amount=${result.amount}`);
                    }
                } catch (e) {
                    console.error(`[Milestone] 카드 10개 달성 보상 실패: userKey=${userKey}`, e.message);
                }
            }

            // ── 2. 포인트 계산 ───────────────────────────────────────────
            const currentPoints = ud.points || 0;
            const dailySum = ud.pointsDailyDate === today ? (ud.pointsDailySum || 0) : 0;

            // 일일 획득량과 무관하게 활동별 기본 보상을 그대로 지급한다.
            const multiplier = 1;
            const finalPoints = addPoints > 0 ? addPoints : 0;
            const newPoints = currentPoints + finalPoints;

            // ── 3. EXP / 레벨 계산 ─────────
            let characterLevel = ud.characterLevel || 1;
            let characterExp = ud.characterExp || 0;

            const finalExp = addExp > 0 ? addExp : 0;
            characterExp += finalExp;

            // 레벨업 루프
            let expToNext = getExpToNext(characterLevel);
            while (characterExp >= expToNext) {
                characterExp -= expToNext;
                characterLevel += 1;
                expToNext = getExpToNext(characterLevel);
            }

            // ── 4. 일일/총계 광고 시청 카운터 ────────────────────────────
            const isAdActivity = type === 'AD_SHORT' || type === 'AD_LONG' || type === 'AD_TICKET';
            const todayAdKey = `adViewsDate_${today}`;
            const adViewsDaily = isAdActivity
                ? (ud.adViewsDate === today ? (ud.adViewsDaily || 0) + 1 : 1)
                : (ud.adViewsDate === today ? (ud.adViewsDaily || 0) : 0);
            const adViewsTotal = isAdActivity
                ? (ud.adViewsTotal || 0) + 1
                : (ud.adViewsTotal || 0);

            // ── 5. 상담 카운터 ────────────────────────────────────────────
            const consultCount = type === 'CONSULT'
                ? (ud.consultCount || 0) + 1
                : (ud.consultCount || 0);

            // ── 5-1. 가차 카운터 ──────────────────────────────────────────
            const gachaPullCount = type === 'GACHA_PULL'
                ? (ud.pullCount || 0) + 1
                : (ud.pullCount || 0);

            // ── 6. 일일 포인트 합산 ──────────────────────────────────────
            const pointsDailySum = ud.pointsDailyDate === today
                ? (ud.pointsDailySum || 0) + finalPoints
                : finalPoints;

            // ── 6-1. 짧은 광고(AD_SHORT) / 티켓 광고(AD_TICKET) 시청 시 뽑기 티켓 1회 지급 ─────────
            let addedTickets = 0;
            let newTicketTotal = getTicketBalance(ud);
            if (type === 'AD_SHORT' || type === 'AD_TICKET') {
                addedTickets = DEFAULT_AD_REWARD_TICKETS; // 1회
                newTicketTotal += addedTickets;
            }

            // ── 7. 업데이트 객체 구성 ────────────────────────────────────
            const updates = {
                points: newPoints,
                pointsDailySum,
                pointsDailyDate: today,
                characterLevel,
                characterExp,
                updatedAt: FieldValue.serverTimestamp(),
            };

            if (isAdActivity) {
                updates.adViewsDaily = adViewsDaily;
                updates.adViewsTotal = adViewsTotal;
                updates.adViewsDate = today; // 날짜 기준 리셋용
                // 뽑기 티켓 +1
                updates.ticketsTotal = newTicketTotal;
                updates.tickets = newTicketTotal;
                updates.ticket = newTicketTotal;
                updates.ticketsAds = FieldValue.increment(addedTickets);
            }
            if (type === 'CONSULT') {
                updates.consultCount = consultCount;
            }
            if (type === 'GACHA_PULL') {
                updates.pullCount = gachaPullCount;

                // [Daily Mission] Update category check mission progress
                if (personaId) {
                    const category = getPersonaCategory(personaId);
                    updateDailyMissionProgress(userKey, 'check', category).catch(err => console.error('[DailyMission] Category update fail:', err));
                }
            }

            tx.set(userRef, updates, { merge: true });

            // ── 8. 포인트 히스토리 기록 ──────────────────────────────────
            const ACTIVITY_DESC = {
                AD_SHORT: '짧은 광고 시청 보상',
                AD_LONG: '긴 광고 시청 보상',
                AD_TICKET: '광고 보고 티켓 받기',
                AD_INTERSTITIAL: '광고 보고 티켓 받기',
                CONSULT: '상담 완료 보상',
                GACHA_PULL: '카드 뽑기 경험치',
            };
            // 포인트가 있거나 GACHA_PULL(EXP-only), AD_TICKET(Tickets-only)이면 기록
            if (finalPoints > 0 || type === 'GACHA_PULL' || type === 'AD_TICKET') {
                const histId = idempKey || `ra_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                const histRef = userRef.collection('point_history').doc(histId);
                tx.set(histRef, {
                    type: type === 'GACHA_PULL' ? 'EXP_GRANT' : 'POINT_GRANT',
                    source: type,
                    points: finalPoints,
                    exp: finalExp,
                    multiplier,
                    description: ACTIVITY_DESC[type] || type,
                    ...(personaId ? { personaId } : {}),
                    createdAt: FieldValue.serverTimestamp(),
                });
            }

            // ── 8-1. 페르소나별 EXP (GACHA_PULL + personaId) ─────────────
            let personaProfiles = null;
            if (type === 'GACHA_PULL' && personaId && personaExpRef) {
                const pe = personaExpSnap && personaExpSnap.exists
                    ? personaExpSnap.data()
                    : { characterLevel: 1, characterExp: 0 };

                let pLevel = pe.characterLevel || 1;
                let pExp = (pe.characterExp || 0) + finalExp;
                let pExpToNext = getExpToNext(pLevel);
                let pLeveledUp = false;
                while (pExp >= pExpToNext) {
                    pExp -= pExpToNext;
                    pLevel += 1;
                    pExpToNext = getExpToNext(pLevel);
                    pLeveledUp = true;
                }
                tx.set(personaExpRef, {
                    characterLevel: pLevel,
                    characterExp: pExp,
                    updatedAt: FieldValue.serverTimestamp(),
                }, { merge: true });

                personaProfiles = {
                    [personaId]: {
                        characterLevel: pLevel,
                        characterExp: pExp,
                        expToNext: pExpToNext,
                        leveledUp: pLeveledUp,
                    }
                };
            }

            // ── 9. 통계 기록 (광고 포맷별) ───────────────────────────────
            if (type.startsWith('AD_')) {
                // adFormat 누락 시 activityType에서 추론
                const AD_FORMAT_FALLBACK = { AD_SHORT: 'short', AD_LONG: 'long', AD_TICKET: 'short' };
                const resolvedFormat = adFormat || AD_FORMAT_FALLBACK[type] || null;
                const statsRef = firestore.collection('daily_stats').doc(today);
                const formatKey = resolvedFormat ? `ad_claim_${resolvedFormat.toLowerCase()}` : 'ad_claim_unknown';
                tx.set(statsRef, {
                    [formatKey]: FieldValue.increment(1),
                    total_ad_claims: FieldValue.increment(1),
                    updatedAt: FieldValue.serverTimestamp()
                }, { merge: true });
            }

            // ── 10. Idempotency 레코드 저장 ───────────────────────────────
            const prevLevel = ud.characterLevel || 1;
            const leveledUp = characterLevel > prevLevel;

            const finalResult = {
                currentPoints: newPoints,  // 최신 포인트 (POST /reward에서 사용)
                points: newPoints,  // 호환성
                addedPoints: finalPoints,
                grantedPoints: finalPoints,  // 호환성
                multiplier,
                characterLevel,
                characterExp,
                addedExp: finalExp,  // 이번 호출에서 추가된 EXP (누적 아님)
                expToNext: getExpToNext(characterLevel),
                adViewsDaily,
                adViewsTotal,
                consultCount,
                gachaPullCount,
                tickets: isAdActivity ? newTicketTotal : getTicketBalance(ud),
                addedTickets: addedTickets || 0,
                leveledUp,
                ...(personaProfiles ? { personaProfiles } : {}),
            };

            if (idempRef) {
                tx.set(idempRef, {
                    userKey: String(userKey),
                    status: 'SUCCESS',
                    result: finalResult,
                    createdAt: FieldValue.serverTimestamp(),
                });
            }

            return finalResult;
        });

        // 로그 (트랜잭션 외부) — result 객체에서 값 참조 (스코프 버그 수정)
        if (!result._duplicated) {
            const ACTION_NAME_MAP = {
                AD_SHORT: 'REWARD_ACTIVITY_AD_SHORT',
                AD_LONG: 'REWARD_ACTIVITY_AD_LONG',
                AD_TICKET: 'REWARD_ACTIVITY_AD_TICKET',
                AD_INTERSTITIAL: 'REWARD_ACTIVITY_AD_TICKET',
                CONSULT: 'REWARD_ACTIVITY_CONSULT',
                GACHA_PULL: 'REWARD_ACTIVITY_GACHA_PULL',
            };
            const actionName = ACTION_NAME_MAP[type] || `REWARD_ACTIVITY_${type}`;
            const AD_FORMAT_FALLBACK = { AD_SHORT: 'short', AD_LONG: 'long', AD_TICKET: 'short' };
            const adFormatResolved = type.startsWith('AD_') ? (adFormat || adVerification?.mode || AD_FORMAT_FALLBACK[type] || 'UNKNOWN') : undefined;
            const placementId = adVerification?.placementId || undefined;

            logUserAction(userKey, actionName, {
                activityType: type,
                adFormat: adFormatResolved,
                ...(placementId ? { placementId } : {}),
                ...(adVerification ? { adVerification } : {}),
                addedPoints: result.addedPoints,
                multiplier: result.multiplier,
                levelAfter: result.characterLevel,
                totalPoints: result.points,
                ...(personaId ? { personaId } : {}),
                ...(result.leveledUp ? { leveledUp: true } : {}),
            }).catch(() => { });
        }

        const { _duplicated, ...cleanResult } = result;
        return cleanResult;

    } catch (error) {
        console.error(`[applyRewardActivity] Failed for ${userKey}:`, error.message);
        throw error;
    }
};

/**
 * [Phase 2] 리워드 프로필 조회
 * GET /api/v2/reward/profile?userKey=...
 *
 * @param {string} userKey
 * @returns {Promise<object>}
 */
export const getRewardProfile = async (userKey) => {
    const userRef = getUserDocRef(userKey);
    const userSnap = await userRef.get();

    // user 미존재 시 실패 대신 안전한 기본값으로 200 반환 (프론트 교력 가능)
    const ud = userSnap.exists ? userSnap.data() : {};
    const today = getKstDateKey();

    const totalPoints = ud.points ?? ud.currentPoints ?? ud.balancePoints ?? 0;
    const characterLevel = ud.characterLevel || 1;
    const characterExp = ud.characterExp || 0;

    return {
        points: totalPoints,
        pointCount: totalPoints,
        currentPoints: totalPoints,
        balancePoints: totalPoints,
        characterLevel,
        characterExp,
        expToNext: getExpToNext(characterLevel),
        adViewsDaily: ud.adViewsDate === today ? (ud.adViewsDaily || 0) : 0,
        adViewsTotal: ud.adViewsTotal || 0,
        consultCount: ud.consultCount || 0,
        tickets: getTicketBalance(ud),
        _isNewUser: !userSnap.exists, // 프론트 참고용
    };
};

// ══════════════════════════════════════════════════════════════════════════════
// [Phase 3] 가차 확률 보정 계산
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 기본 희귀도 가중치 (boost 없음 기준, 합 = 1.0)
 * diamond  1.0 %
 * platinum 5.0 %
 * gold    29.0 %
 * silver  30.0 %
 * normal  35.0 %
 */
const BASE_RARITY_WEIGHTS = {
    diamond: 0.010,
    platinum: 0.050,
    gold: 0.290,
    silver: 0.300,
    normal: 0.350,
};

/** 최대 보정 상한 (percentage point) */
const DIAMOND_BOOST_CAP = 3.0;   // +3 pp → diamond 최대 4 %
const PLATINUM_BOOST_CAP = 10.0;  // +10 pp → platinum 최대 15 %

/**
 * 레벨·광고·상담 수치를 받아 보정 수치를 산출한다.
 *
 * 공식 (percentage point 단위):
 *   diamond_raw  = level*0.05  + adTotal*0.003 + consult*0.04
 *   platinum_raw = level*0.15  + adTotal*0.007 + consult*0.10
 *
 * 각각 CAP 적용 후, 증가분만큼 gold/silver/normal을 비율 차감.
 * 마지막으로 전체 합이 1.0이 되도록 정규화한다.
 *
 * @param {number} characterLevel
 * @param {number} adViewsTotal
 * @param {number} consultCount
 * @returns {{ diamondBoostPct, platinumBoostPct, rarityWeights }}
 */
const calcProbabilityBoost = (characterLevel, adViewsTotal, consultCount) => {
    const lv = Math.max(0, characterLevel - 1); // Lv1 = boost 0
    const ads = Math.max(0, adViewsTotal || 0);
    const con = Math.max(0, consultCount || 0);

    // 1. 원시 보정값 계산 (percentage point)
    const rawDiamond = lv * 0.05 + ads * 0.003 + con * 0.04;
    const rawPlatinum = lv * 0.15 + ads * 0.007 + con * 0.10;

    // 2. CAP 적용
    const diamondBoostPct = parseFloat(Math.min(rawDiamond, DIAMOND_BOOST_CAP).toFixed(2));
    const platinumBoostPct = parseFloat(Math.min(rawPlatinum, PLATINUM_BOOST_CAP).toFixed(2));

    // 3. 새 diamond / platinum 가중치
    const newDiamond = BASE_RARITY_WEIGHTS.diamond + diamondBoostPct / 100;
    const newPlatinum = BASE_RARITY_WEIGHTS.platinum + platinumBoostPct / 100;

    // 4. 하위 등급(gold/silver/normal)에서 증가분 차감
    //    비율 차감: 세 등급의 기존 합 대비 균등 감소
    const totalBoost = diamondBoostPct / 100 + platinumBoostPct / 100;
    const lowerBase = BASE_RARITY_WEIGHTS.gold + BASE_RARITY_WEIGHTS.silver + BASE_RARITY_WEIGHTS.normal;
    const reductionRatio = Math.min(1, totalBoost / lowerBase);

    const newGold = BASE_RARITY_WEIGHTS.gold * (1 - reductionRatio);
    const newSilver = BASE_RARITY_WEIGHTS.silver * (1 - reductionRatio);
    const newNormal = BASE_RARITY_WEIGHTS.normal * (1 - reductionRatio);

    // 5. 정규화 (floating-point 오차 제거)
    const rawSum = newDiamond + newPlatinum + newGold + newSilver + newNormal;
    const norm = 1 / rawSum;

    const round3 = (v) => Math.round(v * norm * 1000) / 1000;

    const diamond = round3(newDiamond);
    const platinum = round3(newPlatinum);
    const gold = round3(newGold);
    const silver = round3(newSilver);

    // normal은 잔여값으로 확정 → 합 = 1.000
    const normal = parseFloat((1 - diamond - platinum - gold - silver).toFixed(3));

    return {
        diamondBoostPct,
        platinumBoostPct,
        rarityWeights: { diamond, platinum, gold, silver, normal },
    };
};

/**
 * [Phase 3] 가차 확률 보정 조회
 * GET /api/v2/reward/probability?userKey=...
 *
 * @param {string} userKey
 * @returns {Promise<object>}
 */
export const getProbabilityBoost = async (userKey) => {
    const userRef = getUserDocRef(userKey);
    const userSnap = await userRef.get();

    // user 미존재 시 boost 0% 기본값 반환 (404 대신 안전한 기본값)
    const ud = userSnap.exists ? userSnap.data() : {};

    const characterLevel = ud.characterLevel || 1;
    const characterExp = ud.characterExp || 0;
    const adViewsTotal = ud.adViewsTotal || 0;
    const consultCount = ud.consultCount || 0;

    const { diamondBoostPct, platinumBoostPct, rarityWeights } = calcProbabilityBoost(
        characterLevel, adViewsTotal, consultCount
    );

    return {
        diamondBoostPct,
        platinumBoostPct,
        rarityWeights,
        characterLevel,
        characterExp,
        expToNext: getExpToNext(characterLevel),
        // 가차 draw API 연계용 스냅샷 필드 (Phase 4 대비)
        _inputSnapshot: { characterLevel, adViewsTotal, consultCount },
    };
};

/**
 * 외부(가차 서비스 등)에서 직접 보정 가중치만 꺼내 쓸 수 있도록 순수 함수도 export
 */
export { calcProbabilityBoost };
