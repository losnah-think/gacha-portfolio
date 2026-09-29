import { firestore, FieldValue } from '../lib/firebaseAdmin.js';
import { getKstDateKey, getKstMonthKey, getKstWeekKey, logUserAction, safeNickname } from '../utils/helpers.js';

// ── 리워드 점수 밸런싱 상수 (서버에서만 관리) ────────────────────────────────────
const REWARD_AD_WEIGHT = 2;
const REWARD_CONSULT_WEIGHT = 5;

export const calcRewardScore = (adViewsTotal = 0, consultCount = 0) =>
    (adViewsTotal * REWARD_AD_WEIGHT) + (consultCount * REWARD_CONSULT_WEIGHT);

// ════════════════════════════════════════════════════════════════
// 최적화 #4: 랭킹 배치 버퍼 (60초 주기)
// 가챠 1회당 최대 9번 쓰기 → 60초 내 동일 유저의 모든 갱신을 1회로 통합
// ════════════════════════════════════════════════════════════════
// Buffer 구조: { 'docPath': { userKey, nickname, increment, meta } }
const _rankingBuffer = new Map(); // key: docPath, value: { ref, data }
let _rankingFlushTimer = null;
const RANKING_FLUSH_MS = 60 * 1000; // 60초

function _scheduleRankingFlush() {
    if (_rankingFlushTimer) return;
    _rankingFlushTimer = setTimeout(async () => {
        _rankingFlushTimer = null;
        await _flushRankingBuffer();
    }, RANKING_FLUSH_MS);
}

async function _flushRankingBuffer() {
    if (_rankingBuffer.size === 0) return;

    // 최대 500개씩 배치 커밋 (Firestore 배치 제한)
    const entries = Array.from(_rankingBuffer.entries());
    _rankingBuffer.clear();

    for (let i = 0; i < entries.length; i += 500) {
        const batch = firestore.batch();
        entries.slice(i, i + 500).forEach(([, { ref, data }]) => {
            batch.set(ref, data, { merge: true });
        });
        await batch.commit().catch(e => console.error('[RankingFlush] Batch failed:', e));
    }
    console.log(`[RankingFlush] Flushed ${entries.length} ranking updates`);
}


/**
 * 랭킹 업데이트 (Daily, Weekly, Monthly) — 배치 버퍼 방식
 */
export const updateRankingCount = async (userKey, nickname = '익명', count = 1, userMetadata = {}) => {
    const today = getKstDateKey();
    const week = getKstWeekKey();
    const month = getKstMonthKey();

    const segment = userMetadata.segment || 'unknown';
    const gender = userMetadata.gender || 'unknown';
    const adViewsTotal = userMetadata.adViewsTotal || 0;
    const consultCount = userMetadata.consultCount || 0;
    const rewardScore = calcRewardScore(adViewsTotal, consultCount);
    const characterLevel = Number(userMetadata.characterLevel || 1);
    const characterExp = Number(userMetadata.characterExp || 0);

    const docIds = [
        `daily_${today}`,
        `weekly_${week}`,
        `monthly_${month}`
    ];
    if (segment && segment !== 'unknown') {
        docIds.push(`daily_${today}_segment_${segment}`);
        docIds.push(`weekly_${week}_segment_${segment}`);
        docIds.push(`monthly_${month}_segment_${segment}`);
    }
    if (gender === 'male' || gender === 'female') {
        docIds.push(`daily_${today}_gender_${gender}`);
        docIds.push(`weekly_${week}_gender_${gender}`);
        docIds.push(`monthly_${month}_gender_${gender}`);
    }

    for (const docId of docIds) {
        const path = `rankings/${docId}/users/${userKey}`;
        const existing = _rankingBuffer.get(path);
        if (existing) {
            // 같은 유저의 연속 가챠를 누적 (increment 합산)
            existing.data.count = FieldValue.increment(
                (existing._rawCount || 0) + count
            );
            existing._rawCount = (existing._rawCount || 0) + count;
        } else {
            const ref = firestore.collection('rankings').doc(docId).collection('users').doc(String(userKey));
            _rankingBuffer.set(path, {
                ref,
                _rawCount: count,
                data: {
                    userKey: String(userKey),
                    nickname: nickname || '익명',
                    count: FieldValue.increment(count),
                    adViewsTotal,
                    consultCount,
                    rewardScore,
                    characterLevel,
                    characterExp,
                    segment,
                    gender,
                    updatedAt: FieldValue.serverTimestamp()
                }
            });
        }
    }

    _scheduleRankingFlush();
};


/**
 * 전용 랭킹 조회 (커서 기반 페이징 - 인덱스 최적화)
 * @param {string} type - 'daily' | 'weekly' | 'monthly'
 * @param {number} limit - 가져올 개수
 * @param {string} lastUserKey - 이전 페이지 마지막 항목의 userKey (페이징용)
 * @param {object} filters - { segment?: string, gender?: string } 개인화 필터
 */
export const getTopRankings = async (type = 'daily', limit = 20, lastUserKey = null, filters = {}) => {
    let docId = '';
    const { segment, gender } = filters;

    // Build docId based on filters
    if (type === 'daily') docId = `daily_${getKstDateKey()}`;
    else if (type === 'weekly') docId = `weekly_${getKstWeekKey()}`;
    else if (type === 'monthly') docId = `monthly_${getKstMonthKey()}`;
    else throw new Error('INVALID_RANKING_TYPE');

    // Add segment filter to docId
    if (segment && segment !== 'unknown') {
        docId += `_segment_${segment}`;
    }
    // Add gender filter to docId
    else if (gender && (gender === 'male' || gender === 'female')) {
        docId += `_gender_${gender}`;
    }

    const usersColRef = firestore.collection('rankings').doc(docId).collection('users');

    // 기본적으로 'count'가 0보다 큰 경우만 존재하도록 recordRanking에서 보장하므로 orderBy만 수행
    let query = usersColRef.orderBy('count', 'desc');

    if (lastUserKey) {
        // 커서 기반 페이징: 전 페이지 마지막 유저 문서를 가져와서 그 뒤부터 조회
        // 이 방식은 복합 인덱스 없이도 안정적인 페이징을 보장함
        const lastDoc = await usersColRef.doc(String(lastUserKey)).get();
        if (lastDoc.exists) {
            query = query.startAfter(lastDoc);
        }
    }

    const snapshot = await query.limit(Number(limit)).get();

    // ── ranking doc에 이미 adViewsTotal, consultCount가 저장되어 있으므로
    //    users 컬렉션 재조회 불필요 (N+1 제거, 비용 최적화) ───────────────
    const docs = snapshot.docs;

    const enrichedItems = [];
    for (const doc of docs) {
        const data = doc.data();
        // 랭킹 doc에 저장된 필드 사용 (없으면 0 fallback — 마이그레이션 전 데이터 호환)
        const rawNick = data.nickname;
        data.nickname = await safeNickname(rawNick, doc.id);
        const gachaScore = data.count || 0;
        const adViewsTotal = data.adViewsTotal || 0;
        const consultCount = data.consultCount || 0;
        const rewardScore = data.rewardScore || calcRewardScore(adViewsTotal, consultCount);
        const finalScore = gachaScore + rewardScore;
        enrichedItems.push({ _doc: doc, data, gachaScore, adViewsTotal, consultCount, rewardScore, finalScore });
    }

    // ── 정렬: finalScore 내림순 → rewardScore 내림순 → updatedAt 최신순 ────────
    enrichedItems.sort((a, b) => {
        if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
        if (b.rewardScore !== a.rewardScore) return b.rewardScore - a.rewardScore;
        const aTime = a.data.updatedAt?.toMillis ? a.data.updatedAt.toMillis() : 0;
        const bTime = b.data.updatedAt?.toMillis ? b.data.updatedAt.toMillis() : 0;
        return bTime - aTime;
    });

    // ── rank 번호 재계산 (정렬 후 count API 호출 대신 in-memory 정렬 상대 순위) ──────
    // lastUserKey 기반 페이징 시 startRank 오프셋 계산
    let startRank = 1;
    if (lastUserKey) {
        const lastDoc = await usersColRef.doc(String(lastUserKey)).get();
        if (lastDoc.exists) {
            const lastCount = lastDoc.data().count || 0;
            const higherCountSnap = await usersColRef.where('count', '>', lastCount).count().get();
            startRank = higherCountSnap.data().count + 1;
        }
    }

    const results = [];

    for (let i = 0; i < enrichedItems.length; i++) {
        const item = enrichedItems[i];
        const score = item.finalScore;
        const prevScore = i > 0 ? enrichedItems[i - 1].finalScore : null;
        const rank = prevScore !== null && prevScore === score
            ? results[i - 1].rank   // 동점
            : i + 1 + (startRank - 1);

        results.push({
            ...item.data,
            rank,
            score: item.finalScore,
            gachaScore: item.gachaScore,
            rewardScore: item.rewardScore,
            adViewsTotal: item.adViewsTotal,
            consultCount: item.consultCount,
        });
    }

    return results;
};

/**
 * 랭킹 보상 지급 (Daily, Weekly, Monthly)
 * @param {string} type - 'daily' | 'weekly' | 'monthly'
 * @param {string} targetKey - 보상 대상 기간 키 (예: '2026-02-06' 등)
 */
export const distributeRankingRewards = async (type, targetKey) => {
    const docId = `${type}_${targetKey}`;
    console.log(`[RankingReward] Distributing for ${docId}...`);

    let rewards = [];
    if (type === 'daily') rewards = [5, 3, 1];
    else if (type === 'weekly') rewards = [15, 10, 5];
    else if (type === 'monthly') rewards = [30, 20, 10];
    else return;

    // 상위 3명 조회
    const snapshot = await firestore.collection('rankings')
        .doc(docId)
        .collection('users')
        .orderBy('count', 'desc')
        .orderBy('userKey', 'desc')
        .limit(3)
        .get();

    if (snapshot.empty) {
        console.log(`[RankingReward] No users found for ${docId}.`);
        return;
    }

    for (let i = 0; i < snapshot.docs.length; i++) {
        const doc = snapshot.docs[i];
        const userKey = doc.id;
        const rewardTickets = rewards[i];
        const rank = i + 1;

        try {
            const userRef = firestore.collection('users').doc(userKey);
            await firestore.runTransaction(async (tx) => {
                const userSnap = await tx.get(userRef);
                const data = userSnap.exists ? userSnap.data() : {};

                // [Sync] Get unified balance
                let currentTotal = 0;
                if (data.ticketsTotal !== undefined) currentTotal = Number(data.ticketsTotal);
                else if (data.tickets !== undefined) currentTotal = Number(data.tickets);
                else if (data.ticket !== undefined) currentTotal = Number(data.ticket);

                const newTotal = currentTotal + rewardTickets;

                tx.set(userRef, {
                    ticketsTotal: newTotal,
                    tickets: newTotal,
                    ticket: newTotal,
                    [`rewards_${type}`]: FieldValue.increment(rewardTickets),
                    updatedAt: FieldValue.serverTimestamp()
                }, { merge: true });
            });

            console.log(`[RankingReward] Rewarded ${rewardTickets} tickets to ${userKey} (Rank ${rank}) for ${docId}`);

            // 알림 발송 (비동기 처리)
            try {
                const { sendRankingRewardPush } = await import('./notificationService.js');
                void sendRankingRewardPush(userKey, type, rank, rewardTickets).catch(() => { });
            } catch (e) { }

            // 상세 로그 적재는 중단하고 daily_stats 집계만 유지
            void logUserAction(userKey, 'RANKING_REWARD', {
                type,
                targetKey,
                rank,
                rewardTickets
            });

        } catch (err) {
            console.error(`[RankingReward] Failed for ${userKey}:`, err);
        }
    }
};

/**
 * 특정 유저의 랭킹 정보 조회
 * @param {string} userKey 
 * @param {string} type - 'daily' | 'weekly' | 'monthly'
 * @param {object} filters - { segment?: string, gender?: string } 개인화 필터
 */
export const getUserRanking = async (userKey, type = 'daily', filters = {}) => {
    let docId = '';
    const { segment, gender } = filters;

    // Build docId based on filters
    if (type === 'daily') docId = `daily_${getKstDateKey()}`;
    else if (type === 'weekly') docId = `weekly_${getKstWeekKey()}`;
    else if (type === 'monthly') docId = `monthly_${getKstMonthKey()}`;
    else throw new Error('INVALID_RANKING_TYPE');

    // Add segment filter to docId
    if (segment && segment !== 'unknown') {
        docId += `_segment_${segment}`;
    }
    // Add gender filter to docId
    else if (gender && (gender === 'male' || gender === 'female')) {
        docId += `_gender_${gender}`;
    }

    const userRef = firestore.collection('rankings').doc(docId).collection('users').doc(String(userKey));
    const userDoc = await userRef.get();

    // 항상 users 컬렉션에서 최신 프로필(닉네임 등)을 먼저 조회
    const mainUserRef = firestore.collection('users').doc(String(userKey));
    const mainUserDoc = await mainUserRef.get();

    if (!mainUserDoc.exists) {
        return null; // 사용자 자체가 존재하지 않음
    }

    const mainUserData = mainUserDoc.data();
    let nickname = await safeNickname(mainUserData.nickname, String(userKey));
    let userSegment = mainUserData.segment || 'unknown';
    let userGender = mainUserData.gender || 'unknown';
    let userScore = 0;
    let updatedAt = new Date().toISOString();

    // 리워드 점수 계산 (users 컬렉션 기준 실시간)
    const adViewsTotal = mainUserData.adViewsTotal || 0;
    const consultCount = mainUserData.consultCount || 0;
    const rewardScore = calcRewardScore(adViewsTotal, consultCount);

    // 랭킹 컬렉션에서 실제 점수 가져오기
    if (userDoc.exists) {
        const userData = userDoc.data();
        userScore = userData.count || 0;
        updatedAt = userData.updatedAt ? (userData.updatedAt.toDate ? userData.updatedAt.toDate().toISOString() : userData.updatedAt) : new Date().toISOString();

        // 참고: 여기서 랭킹 컬렉션의 닉네임보다 users 컬렉션의 닉네임을 우선 사용함
    } else {
        // 점수는 0 (아직 해당 기간에 활동 없음)
        userScore = 0;
    }


    // 내 점수보다 높은 점수를 가진 유저 수 + 1이 나의 등수
    // [Optimized] ranking doc에 rewardScore가 저장되어 있으므로 users 재조회 불필요
    // 단, finalScore = count + rewardScore 이므로 Firestore count()로
    // 직접 비교 불가 → count만으로 근사 순위 산출 후 보정
    const finalScore = userScore + rewardScore;

    // count 기준으로 나보다 높은 유저 수를 count() API로 조회 (1 read)
    const usersColRef = firestore.collection('rankings').doc(docId).collection('users');
    const higherCountSnap = await usersColRef.where('count', '>', userScore).count().get();
    let rank = higherCountSnap.data().count + 1;

    // [New] Calculate gap to next rank — count 기준 근사치
    let nextRankGap = 0;
    let nextRankScore = null;
    if (rank > 1) {
        // 나보다 count가 높은 유저 중 가장 낮은 점수 (근접한 다음 순위)
        const nextSnap = await usersColRef
            .where('count', '>', userScore)
            .orderBy('count', 'asc')
            .limit(1)
            .get();
        if (!nextSnap.empty) {
            const nextData = nextSnap.docs[0].data();
            const nextFinal = (nextData.count || 0) + (nextData.rewardScore || calcRewardScore(nextData.adViewsTotal || 0, nextData.consultCount || 0));
            nextRankScore = nextFinal;
            nextRankGap = nextFinal - finalScore;
        }
    }

    return {
        userKey: String(userKey),
        nickname,
        score: userScore + rewardScore,   // finalScore
        gachaScore: userScore,
        rewardScore,
        adViewsTotal: mainUserData.adViewsTotal || 0,
        consultCount: mainUserData.consultCount || 0,
        rank,
        nextRankGap,
        nextRankScore,
        count: userScore, // 하위 호환성
        period: type,
        segment: userSegment,
        gender: userGender,
        filter: filters,
        updatedAt
    };
};
