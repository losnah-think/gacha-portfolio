/**
 * Reward Gacha Service
 *
 * 리워드 가차(뽑기) 전용 서비스 — 원자적 트랜잭션 기반.
 *
 * Firestore Collections:
 *   - users/{userKey}                        — 포인트, 티켓, EXP, 레벨
 *   - users/{userKey}/point_history/{drawId}  — 포인트 적립 히스토리
 *   - reward_gacha_draws/{drawId}             — 뽑기 이력 (전체 조회)
 *   - reward_gacha_daily/{userKey}_{dateKey}  — 일별 유저 카운터 (rate limit, 보너스 제한)
 *   - app_config/reward_gacha_config          — 동적 확률 테이블
 */
import { firestore, FieldValue } from '../lib/firebaseAdmin.js';
import { getKstDateKey, logUserAction, getTicketBalance, getExpToNext, normalizeLevel } from '../utils/helpers.js';
import { REWARD_GACHA_CONFIG } from '../config/rewardGacha.js';
import { checkAndClaimActivityReward } from './promotionService.js';

const {
    TICKET_COST,
    MAX_DAILY_TICKET_DRAWS,
    MAX_DAILY_BONUS_DRAWS,
    MAX_DAILY_AD_DRAWS,
    EXP_PER_DRAW,
    MIN_DRAW_INTERVAL_MS,
    AD_GROUP,
} = REWARD_GACHA_CONFIG;

// ─── Dynamic Reward Table (Firestore-backed with memory cache) ──────────────
const REWARD_TABLE_DOC = 'reward_gacha_config';
let _rewardTableCache = null; // { table, expiresAt }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

/**
 * Firestore에서 확률 테이블 로드 (캐시 5분)
 * 없으면 rewardGacha.js의 기본값 사용
 */
export const getRewardTable = async () => {
    if (_rewardTableCache && Date.now() < _rewardTableCache.expiresAt) {
        return _rewardTableCache.table;
    }
    try {
        const snap = await firestore.collection('app_config').doc(REWARD_TABLE_DOC).get();
        if (snap.exists) {
            const data = snap.data();
            if (Array.isArray(data.rewards) && data.rewards.length > 0) {
                _rewardTableCache = { table: data.rewards, expiresAt: Date.now() + CACHE_TTL_MS };
                return _rewardTableCache.table;
            }
        }
    } catch (e) {
        console.error('[RewardGacha] Failed to load dynamic reward table:', e.message);
    }
    return REWARD_GACHA_CONFIG.REWARD_TABLE;
};

/** 캐시 무효화 (관리자 PUT 후 호출) */
export const invalidateRewardTableCache = () => { _rewardTableCache = null; };

// ─── Helpers ────────────────────────────────────────────────────────────────

/** 고유 drawId 생성 */
const genDrawId = () => {
    const seg = () => Math.random().toString(36).slice(2, 10);
    return `rg-${seg()}-${seg()}-${Date.now().toString(36)}`;
};

// getExpToNext는 helpers.js에서 import

/** 확률 테이블(weight 기반) → 보상 결정 */
const rollReward = (table) => {
    const totalWeight = table.reduce((sum, r) => sum + r.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const entry of table) {
        roll -= entry.weight;
        if (roll <= 0) {
            return { label: entry.label, points: entry.points, rarity: entry.rarity };
        }
    }
    // fallback
    const last = table[table.length - 1];
    return { label: last.label, points: last.points, rarity: last.rarity };
};

/** daily counter doc ID */
const dailyDocId = (userKey, dateKey) => `${userKey}_${dateKey}`;

// ─── Throw helper ───────────────────────────────────────────────────────────
const throwErr = (code, message) => {
    throw Object.assign(new Error(message || code), { code });
};

// ═════════════════════════════════════════════════════════════════════════════
//  1. GET /reward-gacha/status
// ═════════════════════════════════════════════════════════════════════════════

export const getRewardGachaStatus = async (userKey) => {
    if (!userKey) throwErr('MISSING_USER_KEY', 'userKey가 필요합니다.');

    const userRef = firestore.collection('users').doc(String(userKey));
    const today = getKstDateKey();
    const dailyRef = firestore.collection('reward_gacha_daily').doc(dailyDocId(userKey, today));

    const [userSnap, dailySnap, rewardTable] = await Promise.all([
        userRef.get(),
        dailyRef.get(),
        getRewardTable(),
    ]);

    if (!userSnap.exists) throwErr('USER_NOT_FOUND', '유저를 찾을 수 없습니다.');
    const ud = userSnap.data();
    const dd = dailySnap.exists ? dailySnap.data() : {};

    // 최근 히스토리 (최근 5건) — 인덱스 빌딩 중이면 빈 배열 반환
    let recentHistory = [];
    try {
        const historySnap = await firestore.collection('reward_gacha_draws')
            .where('userKey', '==', String(userKey))
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();

        recentHistory = historySnap.docs.map(d => {
            const h = d.data();
            return {
                label: h.reward?.label,
                points: h.reward?.points,
                rarity: h.reward?.rarity,
                drawType: h.drawType,
                drawnAt: h.createdAt?.toDate?.() ? h.createdAt.toDate().toISOString() : null,
            };
        });
    } catch (indexErr) {
        console.warn('[RewardGacha] History query failed (index building?):', indexErr.message);
    }

    const todayTicketDraws = dd.ticketDraws || 0;
    const todayBonusDraws = dd.bonusDrawsUsed || 0;
    const todayAdDraws = dd.adDraws || 0;

    const { characterLevel, characterExp, expToNext } = normalizeLevel(ud.characterLevel, ud.characterExp);

    return {
        tickets: getTicketBalance(ud),
        bonusDraws: dd.bonusDraws || 0,
        points: ud.points || 0,
        characterLevel,
        characterExp,
        expToNext,
        todayEarnedPoints: dd.earnedPoints || 0,
        todayDrawCount: dd.drawCount || 0,
        todayTotalDraws: MAX_DAILY_TICKET_DRAWS + MAX_DAILY_BONUS_DRAWS + MAX_DAILY_AD_DRAWS,
        todayTicketDraws,
        todayBonusDraws,
        todayAdDraws,
        maxDailyTicketDraws: MAX_DAILY_TICKET_DRAWS,
        maxDailyBonusDraws: MAX_DAILY_BONUS_DRAWS,
        maxDailyAdDraws: MAX_DAILY_AD_DRAWS,
        rewards: rewardTable,
        recentHistory,
    };
};

// ═════════════════════════════════════════════════════════════════════════════
//  2. POST /reward-gacha/draw
// ═════════════════════════════════════════════════════════════════════════════

export const drawRewardGacha = async ({ userKey, drawType }) => {
    if (!userKey) throwErr('MISSING_USER_KEY', 'userKey가 필요합니다.');
    if (!['ticket', 'bonus', 'ad_interstitial', 'ad_rewarded'].includes(drawType)) {
        throwErr('INVALID_DRAW_TYPE', 'drawType은 ticket, bonus, ad_interstitial, ad_rewarded 중 하나여야 합니다.');
    }

    const userRef = firestore.collection('users').doc(String(userKey));
    const today = getKstDateKey();
    const dailyRef = firestore.collection('reward_gacha_daily').doc(dailyDocId(userKey, today));
    const rewardTable = await getRewardTable();
    const reward = rollReward(rewardTable);
    const drawId = genDrawId();
    const now = new Date();

    const result = await firestore.runTransaction(async (tx) => {
        const [userSnap, dailySnap] = await Promise.all([
            tx.get(userRef),
            tx.get(dailyRef),
        ]);

        if (!userSnap.exists) throwErr('USER_NOT_FOUND', '유저를 찾을 수 없습니다.');
        const ud = userSnap.data();
        const dd = dailySnap.exists ? dailySnap.data() : {};

        // Rate limit: 최소 간격 체크
        if (dd.lastDrawAt) {
            const lastDraw = dd.lastDrawAt.toDate ? dd.lastDrawAt.toDate() : new Date(dd.lastDrawAt);
            if (now.getTime() - lastDraw.getTime() < MIN_DRAW_INTERVAL_MS) {
                throwErr('RATE_LIMITED', '너무 빠른 요청입니다. 잠시 후 다시 시도해주세요.');
            }
        }

        const currentTickets = getTicketBalance(ud);
        const currentPoints = ud.points || 0;
        let newTickets = currentTickets;
        let bonusDraws = dd.bonusDraws || 0;
        const ticketDraws = dd.ticketDraws || 0;
        const bonusDrawsUsed = dd.bonusDrawsUsed || 0;
        const adDraws = dd.adDraws || 0;

        // ── drawType 분기 ──
        if (drawType === 'ticket') {
            if (ticketDraws >= MAX_DAILY_TICKET_DRAWS) {
                throwErr('DAILY_TICKET_LIMIT', `오늘 티켓 뽑기 한도(${MAX_DAILY_TICKET_DRAWS}회)를 모두 사용했어요.`);
            }
            if (currentTickets < TICKET_COST) {
                throwErr('INSUFFICIENT_TICKETS', '티켓이 부족합니다.');
            }
            newTickets = currentTickets - TICKET_COST;
        } else if (drawType === 'bonus') {
            if (bonusDrawsUsed >= MAX_DAILY_BONUS_DRAWS) {
                throwErr('DAILY_BONUS_LIMIT', `오늘 보너스 뽑기 한도(${MAX_DAILY_BONUS_DRAWS}회)를 모두 사용했어요.`);
            }
            if (bonusDraws <= 0) {
                throwErr('NO_BONUS_DRAWS', '보너스 뽑기 횟수가 없습니다.');
            }
            bonusDraws -= 1;
        } else if (drawType === 'ad_interstitial') {
            // 전면형 광고: 티켓 +1 → 즉시 차감 (net 0 변동)
            if (adDraws >= MAX_DAILY_AD_DRAWS) {
                throwErr('DAILY_AD_LIMIT', `오늘 광고 뽑기 한도(${MAX_DAILY_AD_DRAWS}회)를 모두 사용했어요.`);
            }
            // 티켓 변동 없음 (+1 부여 후 즉시 -1 차감 = net 0)
        } else if (drawType === 'ad_rewarded') {
            // 리워드 광고: 티켓 소모 없이 무료 뽑기
            if (adDraws >= MAX_DAILY_AD_DRAWS) {
                throwErr('DAILY_AD_LIMIT', `오늘 광고 뽑기 한도(${MAX_DAILY_AD_DRAWS}회)를 모두 사용했어요.`);
            }
        }

        // ── 포인트 적립 ──
        const newPoints = currentPoints + reward.points;

        // ── EXP / 레벨업 ──
        let characterLevel = ud.characterLevel || 1;
        let characterExp = (ud.characterExp || 0) + EXP_PER_DRAW;
        let expToNext = getExpToNext(characterLevel);
        while (characterExp >= expToNext) {
            characterExp -= expToNext;
            characterLevel += 1;
            expToNext = getExpToNext(characterLevel);
        }

        // ── 유저 업데이트 (원자적) ──
        const rewardGachaPullCount = (ud.rewardGachaPullCount || 0) + 1;
        const prevDailySum = ud.pointsDailyDate === today ? (ud.pointsDailySum || 0) : 0;
        const newDailySum = prevDailySum + reward.points;
        const userUpdate = {
            points: newPoints,
            pointsDailySum: newDailySum,
            pointsDailyDate: today,
            characterLevel,
            characterExp,
            rewardGachaPullCount,
            updatedAt: FieldValue.serverTimestamp(),
        };
        if (drawType === 'ticket') {
            userUpdate.ticketsTotal = newTickets;
            userUpdate.tickets = newTickets;
            userUpdate.ticket = newTickets;
        }
        tx.set(userRef, userUpdate, { merge: true });

        // ── Daily counter 업데이트 ──
        const drawCount = (dd.drawCount || 0) + 1;
        const earnedPoints = (dd.earnedPoints || 0) + reward.points;
        const dailyUpdate = {
            userKey: String(userKey),
            dateKey: today,
            drawCount,
            earnedPoints,
            lastDrawAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };
        if (drawType === 'ticket') {
            dailyUpdate.ticketDraws = ticketDraws + 1;
        } else if (drawType === 'bonus') {
            dailyUpdate.bonusDraws = bonusDraws;
            dailyUpdate.bonusDrawsUsed = bonusDrawsUsed + 1;
        } else if (drawType === 'ad_interstitial' || drawType === 'ad_rewarded') {
            dailyUpdate.adDraws = adDraws + 1;
        }
        tx.set(dailyRef, dailyUpdate, { merge: true });

        // ── 포인트 히스토리 (subcollection) ──
        const histRef = userRef.collection('point_history').doc(drawId);
        tx.set(histRef, {
            type: 'POINT_GRANT',
            source: 'REWARD_GACHA',
            points: reward.points,
            description: `리워드 가차 ${reward.label} 당첨`,
            drawId,
            drawType,
            rarity: reward.rarity,
            createdAt: FieldValue.serverTimestamp(),
        });

        // ── 뽑기 이력 (글로벌 컬렉션) ──
        const drawRef = firestore.collection('reward_gacha_draws').doc(drawId);
        tx.set(drawRef, {
            userKey: String(userKey),
            drawType,
            reward,
            drawId,
            dateKey: today,
            createdAt: FieldValue.serverTimestamp(),
        });

        return {
            reward,
            tickets: newTickets,
            bonusDraws,
            points: newPoints,
            addedPoints: reward.points,
            characterLevel,
            characterExp,
            expToNext: getExpToNext(characterLevel),
            drawId,
            claimedAt: now.toISOString(),
            todayTicketDraws: ticketDraws + (drawType === 'ticket' ? 1 : 0),
            todayBonusDraws: bonusDrawsUsed + (drawType === 'bonus' ? 1 : 0),
            todayAdDraws: adDraws + (['ad_interstitial', 'ad_rewarded'].includes(drawType) ? 1 : 0),
            todayDrawCount: drawCount,
            maxDailyTicketDraws: MAX_DAILY_TICKET_DRAWS,
            maxDailyBonusDraws: MAX_DAILY_BONUS_DRAWS,
            maxDailyAdDraws: MAX_DAILY_AD_DRAWS,
            rewardGachaPullCount,
        };
    });

    // 비동기 로그 (트랜잭션 외부)
    logUserAction(userKey, 'REWARD_GACHA_DRAW', {
        drawId: result.drawId,
        drawType,
        reward: result.reward,
        points: result.addedPoints,
    }).catch(() => {});

    // [New] 클라이언트 요청에 따른 상세 로깅 (GA/Amplitude 대응)
    const rarity = (result.reward?.rarity || 'common').toLowerCase();
    const actionMap = {
        'ticket': 'reward_gacha_draw_click',
        'bonus': 'reward_gacha_draw_click',
        'ad_interstitial': 'reward_gacha_interstitial_ad',
        'ad_rewarded': 'reward_gacha_rewarded_ad'
    };

    const actionName = actionMap[drawType] || 'reward_gacha_unknown';
    const logData = {
        draw_type: drawType,
        points: result.addedPoints,
        rarity: rarity
    };

    if (drawType === 'ticket') logData.draw_count = result.todayTicketDraws;
    if (drawType === 'bonus') logData.bonus_draw = result.todayBonusDraws;

    // 1. 클릭/시청 이벤트 기록
    logUserAction(userKey, actionName, logData).catch(() => {});
    
    // 2. 보상 수령 이벤트 기록 (희귀도별)
    logUserAction(userKey, `reward_gacha_${rarity}`, {
        points: result.addedPoints,
        drawId: result.drawId
    }).catch(() => {});

    // [Async] 프로모션 미션 체크 (리워드 가차 뽑기) — 트랜잭션 외부에서 실행
    checkAndClaimActivityReward(userKey, 'GACHA_10', result.rewardGachaPullCount).catch(() => {});
    checkAndClaimActivityReward(userKey, 'GACHA_50', result.rewardGachaPullCount).catch(() => {});
    checkAndClaimActivityReward(userKey, 'GACHA_100', result.rewardGachaPullCount).catch(() => {});

    return result;
};

// ═════════════════════════════════════════════════════════════════════════════
//  3. POST /reward-gacha/ad-ticket — 전면형 광고 → 티켓 +1
// ═════════════════════════════════════════════════════════════════════════════

export const grantAdTicket = async ({ userKey, adGroupId }) => {
    if (!userKey) throwErr('MISSING_USER_KEY', 'userKey가 필요합니다.');

    // [2026-03-19] 뽑기 후 전면형 광고 → 티켓 부여 차단
    // 홈 > 티켓 받기(applyRewardActivity AD_TICKET)는 별도 경로이므로 영향 없음
    throwErr('AD_TICKET_DISABLED', '전면 광고를 통한 티켓 부여가 비활성화되었습니다.');

    // 광고 그룹 ID 검증
    if (adGroupId && adGroupId !== AD_GROUP.INTERSTITIAL) {
        throwErr('INVALID_AD_GROUP', '잘못된 광고 그룹입니다.');
    }

    const userRef = firestore.collection('users').doc(String(userKey));

    const result = await firestore.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) throwErr('USER_NOT_FOUND', '유저를 찾을 수 없습니다.');

        // 일일 광고 제한 체크
        const today = getKstDateKey();
        const dailyRef = firestore.collection('reward_gacha_daily').doc(dailyDocId(userKey, today));
        const dailySnap = await tx.get(dailyRef);
        const dd = dailySnap.exists ? dailySnap.data() : {};
        const adDraws = dd.adDraws || 0;
        if (adDraws >= MAX_DAILY_AD_DRAWS) {
            throwErr('DAILY_AD_LIMIT', `오늘 광고 뽑기 한도(${MAX_DAILY_AD_DRAWS}회)를 모두 사용했어요.`);
        }

        const ud = userSnap.data();
        const currentTickets = getTicketBalance(ud);
        const newTickets = currentTickets + 1;

        tx.set(userRef, {
            ticketsTotal: newTickets,
            tickets: newTickets,
            ticket: newTickets,
            ticketsAds: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        // ── Daily counter: adDraws 증가 (광고 카운팅 정확성 확보) ──
        tx.set(dailyRef, {
            userKey: String(userKey),
            dateKey: today,
            adDraws: adDraws + 1,
            lastDrawAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        return { tickets: newTickets, addedTickets: 1, todayAdDraws: adDraws + 1 };
    });

    // 비동기 로그
    logUserAction(userKey, 'REWARD_GACHA_AD_TICKET', {
        adGroupId: AD_GROUP.INTERSTITIAL,
        addedTickets: 1,
    }).catch(() => {});

    // [New] 클라이언트 요청에 따른 상세 로깅
    logUserAction(userKey, 'reward_gacha_interstitial_ad', {
        action: 'ticket_grant',
        addedTickets: 1,
        adGroupId: adGroupId || AD_GROUP.INTERSTITIAL
    }).catch(() => {});

    // 일일 광고 카운터 증가 (fire-and-forget)
    const today = getKstDateKey();
    firestore.collection('daily_stats').doc(today).set({
        ad_claim_interstitial_gacha: FieldValue.increment(1),
        total_ad_claims: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => {});

    return {
        tickets: result.tickets,
        addedTickets: result.addedTickets,
        todayAdDraws: result.todayAdDraws,
        message: '전면 광고 시청으로 티켓 1장이 추가되었습니다.',
    };
};

// ═════════════════════════════════════════════════════════════════════════════
//  4. POST /reward-gacha/ad-draw — 리워드 광고 → 무료 뽑기
// ═════════════════════════════════════════════════════════════════════════════

export const adRewardedDraw = async ({ userKey, adGroupId, adCompletionToken }) => {
    if (!userKey) throwErr('MISSING_USER_KEY', 'userKey가 필요합니다.');

    // 광고 그룹 ID 검증
    if (adGroupId && adGroupId !== AD_GROUP.REWARDED) {
        throwErr('INVALID_AD_GROUP', '잘못된 광고 그룹입니다.');
    }

    // adCompletionToken 기본 검증 (비어있으면 허용 — SDK에서 토큰 발급 못하는 경우 대비)
    // 추후 Toss SDK 서버사이드 검증 추가 가능

    const userRef = firestore.collection('users').doc(String(userKey));
    const today = getKstDateKey();
    const dailyRef = firestore.collection('reward_gacha_daily').doc(dailyDocId(userKey, today));
    const rewardTable = await getRewardTable();
    const reward = rollReward(rewardTable);
    const drawId = genDrawId();
    const now = new Date();

    const result = await firestore.runTransaction(async (tx) => {
        const [userSnap, dailySnap] = await Promise.all([
            tx.get(userRef),
            tx.get(dailyRef),
        ]);

        if (!userSnap.exists) throwErr('USER_NOT_FOUND', '유저를 찾을 수 없습니다.');
        const ud = userSnap.data();
        const dd = dailySnap.exists ? dailySnap.data() : {};

        // 일일 광고 제한 체크
        const adDraws = dd.adDraws || 0;
        if (adDraws >= MAX_DAILY_AD_DRAWS) {
            throwErr('DAILY_AD_LIMIT', `오늘 광고 뽑기 한도(${MAX_DAILY_AD_DRAWS}회)를 모두 사용했어요.`);
        }

        // Rate limit
        if (dd.lastDrawAt) {
            const lastDraw = dd.lastDrawAt.toDate ? dd.lastDrawAt.toDate() : new Date(dd.lastDrawAt);
            if (now.getTime() - lastDraw.getTime() < MIN_DRAW_INTERVAL_MS) {
                throwErr('RATE_LIMITED', '너무 빠른 요청입니다. 잠시 후 다시 시도해주세요.');
            }
        }

        const currentPoints = ud.points || 0;
        const newPoints = currentPoints + reward.points;
        const currentTickets = getTicketBalance(ud);

        // EXP / 레벨업
        let characterLevel = ud.characterLevel || 1;
        let characterExp = (ud.characterExp || 0) + EXP_PER_DRAW;
        let expToNext = getExpToNext(characterLevel);
        while (characterExp >= expToNext) {
            characterExp -= expToNext;
            characterLevel += 1;
            expToNext = getExpToNext(characterLevel);
        }

        // 유저 업데이트 (티켓 차감 없음)
        const rewardGachaPullCount = (ud.rewardGachaPullCount || 0) + 1;
        const prevDailySum = ud.pointsDailyDate === today ? (ud.pointsDailySum || 0) : 0;
        const newDailySum = prevDailySum + reward.points;
        tx.set(userRef, {
            points: newPoints,
            pointsDailySum: newDailySum,
            pointsDailyDate: today,
            characterLevel,
            characterExp,
            rewardGachaPullCount,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        // Daily counter
        const drawCount = (dd.drawCount || 0) + 1;
        const earnedPoints = (dd.earnedPoints || 0) + reward.points;
        tx.set(dailyRef, {
            userKey: String(userKey),
            dateKey: today,
            drawCount,
            earnedPoints,
            adDraws: (dd.adDraws || 0) + 1,
            lastDrawAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        // 포인트 히스토리
        const histRef = userRef.collection('point_history').doc(drawId);
        tx.set(histRef, {
            type: 'POINT_GRANT',
            source: 'REWARD_GACHA',
            points: reward.points,
            description: `리워드 광고 가차 ${reward.label} 당첨`,
            drawId,
            drawType: 'ad_rewarded',
            rarity: reward.rarity,
            createdAt: FieldValue.serverTimestamp(),
        });

        // 뽑기 이력
        const drawRef = firestore.collection('reward_gacha_draws').doc(drawId);
        tx.set(drawRef, {
            userKey: String(userKey),
            drawType: 'ad_rewarded',
            reward,
            drawId,
            adGroupId: AD_GROUP.REWARDED,
            dateKey: today,
            createdAt: FieldValue.serverTimestamp(),
        });

        return {
            reward,
            tickets: currentTickets,
            bonusDraws: dd.bonusDraws || 0,
            points: newPoints,
            addedPoints: reward.points,
            characterLevel,
            characterExp,
            expToNext: getExpToNext(characterLevel),
            drawId,
            claimedAt: now.toISOString(),
            todayTicketDraws: dd.ticketDraws || 0,
            todayBonusDraws: dd.bonusDrawsUsed || 0,
            todayAdDraws: (dd.adDraws || 0) + 1,
            todayDrawCount: drawCount,
            maxDailyTicketDraws: MAX_DAILY_TICKET_DRAWS,
            maxDailyBonusDraws: MAX_DAILY_BONUS_DRAWS,
            maxDailyAdDraws: MAX_DAILY_AD_DRAWS,
            rewardGachaPullCount,
        };
    });

    // [Async] 프로모션 미션 체크 (리워드 광고 가차 뽑기)
    checkAndClaimActivityReward(userKey, 'GACHA_10', result.rewardGachaPullCount).catch(() => {});
    checkAndClaimActivityReward(userKey, 'GACHA_50', result.rewardGachaPullCount).catch(() => {});
    checkAndClaimActivityReward(userKey, 'GACHA_100', result.rewardGachaPullCount).catch(() => {});

    // 비동기 로그
    logUserAction(userKey, 'REWARD_GACHA_AD_DRAW', {
        drawId: result.drawId,
        reward: result.reward,
        adGroupId: AD_GROUP.REWARDED,
    }).catch(() => {});

    // [New] 클라이언트 요청에 따른 상세 로깅
    const rarity = (result.reward?.rarity || 'common').toLowerCase();
    logUserAction(userKey, 'reward_gacha_rewarded_ad', {
        action: 'ad_draw',
        points: result.addedPoints,
        rarity: rarity,
        adGroupId: adGroupId || AD_GROUP.REWARDED
    }).catch(() => {});

    logUserAction(userKey, `reward_gacha_${rarity}`, {
        points: result.addedPoints,
        drawId: result.drawId,
        source: 'ad_rewarded'
    }).catch(() => {});

    // 일일 광고 카운터 (fire-and-forget)
    const statsToday = getKstDateKey();
    firestore.collection('daily_stats').doc(statsToday).set({
        ad_claim_rewarded_gacha: FieldValue.increment(1),
        total_ad_claims: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => {});

    return result;
};

// ═════════════════════════════════════════════════════════════════════════════
//  5. POST /reward-gacha/bonus — 광고 시청 → 보너스 뽑기 +1
// ═════════════════════════════════════════════════════════════════════════════

export const grantBonusDraw = async ({ userKey, adType, adCompletionToken }) => {
    if (!userKey) throwErr('MISSING_USER_KEY', 'userKey가 필요합니다.');

    const today = getKstDateKey();
    const dailyRef = firestore.collection('reward_gacha_daily').doc(dailyDocId(userKey, today));
    const userRef = firestore.collection('users').doc(String(userKey));

    const result = await firestore.runTransaction(async (tx) => {
        const [userSnap, dailySnap] = await Promise.all([
            tx.get(userRef),
            tx.get(dailyRef),
        ]);

        if (!userSnap.exists) throwErr('USER_NOT_FOUND', '유저를 찾을 수 없습니다.');
        const dd = dailySnap.exists ? dailySnap.data() : {};
        const currentBonus = dd.bonusDraws || 0;

        // 일일 보너스 제한 체크
        const dailyBonusClaimed = dd.dailyBonusClaimed || 0;
        if (dailyBonusClaimed >= MAX_DAILY_BONUS_DRAWS) {
            throwErr('DAILY_BONUS_LIMIT', `오늘 보너스 뽑기 획득은 최대 ${MAX_DAILY_BONUS_DRAWS}회입니다.`);
        }

        const newBonus = currentBonus + 1;
        tx.set(dailyRef, {
            userKey: String(userKey),
            dateKey: today,
            bonusDraws: newBonus,
            dailyBonusClaimed: dailyBonusClaimed + 1,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        return { bonusDraws: newBonus };
    });

    // 비동기 로그
    logUserAction(userKey, 'REWARD_GACHA_BONUS_GRANT', {
        adType,
        adGroupId: AD_GROUP.BONUS,
        bonusDraws: result.bonusDraws,
    }).catch(() => {});

    // [New] 클라이언트 요청에 따른 상세 로깅
    logUserAction(userKey, 'reward_gacha_bonus_ad_click', {
        adType,
        bonusDraws: result.bonusDraws,
    }).catch(() => {});

    // 일일 광고 카운터 (fire-and-forget)
    firestore.collection('daily_stats').doc(today).set({
        ad_claim_bonus_gacha: FieldValue.increment(1),
        total_ad_claims: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => {});

    return {
        bonusDraws: result.bonusDraws,
        message: '보너스 뽑기 1회가 추가되었습니다.',
    };
};

// ═════════════════════════════════════════════════════════════════════════════
//  6. GET /reward-gacha/history — 뽑기 이력 조회
// ═════════════════════════════════════════════════════════════════════════════

export const getRewardGachaHistory = async (userKey, limit = 5) => {
    if (!userKey) throwErr('MISSING_USER_KEY', 'userKey가 필요합니다.');

    const drawsSnap = await firestore.collection('reward_gacha_draws')
        .where('userKey', '==', String(userKey))
        .orderBy('createdAt', 'desc')
        .limit(Math.min(Number(limit) || 5, 50))
        .get();

    const history = drawsSnap.docs.map(d => {
        const h = d.data();
        return {
            drawId: h.drawId,
            label: h.reward?.label,
            points: h.reward?.points,
            rarity: h.reward?.rarity,
            drawType: h.drawType,
            drawnAt: h.createdAt?.toDate?.() ? h.createdAt.toDate().toISOString() : null,
        };
    });

    // 총 뽑기 수 및 총 포인트 — daily counter 합산
    const dailySnap = await firestore.collection('reward_gacha_daily')
        .where('userKey', '==', String(userKey))
        .get();

    let totalDrawCount = 0;
    let totalEarnedPoints = 0;
    dailySnap.docs.forEach(d => {
        const dd = d.data();
        totalDrawCount += dd.drawCount || 0;
        totalEarnedPoints += dd.earnedPoints || 0;
    });

    return { history, totalDrawCount, totalEarnedPoints };
};

// ═════════════════════════════════════════════════════════════════════════════
//  7. GET /reward-gacha/config — 확률 설정 조회
// ═════════════════════════════════════════════════════════════════════════════

export const getRewardGachaConfig = async () => {
    const rewards = await getRewardTable();
    return {
        rewards,
        ticketCost: TICKET_COST,
        maxDailyTicketDraws: MAX_DAILY_TICKET_DRAWS,
        maxDailyBonusDraws: MAX_DAILY_BONUS_DRAWS,
        maxDailyAdDraws: MAX_DAILY_AD_DRAWS,
    };
};

// ═════════════════════════════════════════════════════════════════════════════
//  8. PUT /admin/reward-gacha/config — 관리자 확률 설정 수정
// ═════════════════════════════════════════════════════════════════════════════

export const updateRewardGachaConfig = async ({ rewards, ticketCost, maxDailyTicketDraws, maxDailyBonusDraws, maxDailyAdDraws }) => {
    if (!Array.isArray(rewards) || rewards.length === 0) {
        throwErr('INVALID_CONFIG', '보상 테이블이 비어있습니다.');
    }

    // 가중치 합 검증
    const totalWeight = rewards.reduce((sum, r) => sum + (r.weight || 0), 0);
    if (totalWeight <= 0) {
        throwErr('INVALID_CONFIG', '가중치 합이 0 이하입니다.');
    }

    // 필수 필드 검증
    for (const r of rewards) {
        if (!r.label || r.points == null || !r.rarity || !r.weight) {
            throwErr('INVALID_CONFIG', '보상 항목에 label, points, rarity, weight가 필요합니다.');
        }
    }

    const configRef = firestore.collection('app_config').doc(REWARD_TABLE_DOC);
    await configRef.set({
        rewards,
        ticketCost: ticketCost ?? TICKET_COST,
        maxDailyTicketDraws: maxDailyTicketDraws ?? MAX_DAILY_TICKET_DRAWS,
        maxDailyBonusDraws: maxDailyBonusDraws ?? MAX_DAILY_BONUS_DRAWS,
        maxDailyAdDraws: maxDailyAdDraws ?? MAX_DAILY_AD_DRAWS,
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // 캐시 무효화
    invalidateRewardTableCache();

    return {
        rewards,
        ticketCost: ticketCost ?? TICKET_COST,
        maxDailyTicketDraws: maxDailyTicketDraws ?? MAX_DAILY_TICKET_DRAWS,
        maxDailyBonusDraws: maxDailyBonusDraws ?? MAX_DAILY_BONUS_DRAWS,
        maxDailyAdDraws: maxDailyAdDraws ?? MAX_DAILY_AD_DRAWS,
    };
};
