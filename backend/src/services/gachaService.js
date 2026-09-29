import { firestore, FieldValue } from '../lib/firebaseAdmin.js';
import { getKstDateKey, loadAndSyncUserMetadata, logUserAction, getZodiacSign, makeSnippet } from '../utils/helpers.js';
import { deductTicket, invalidateSyncStatsCache } from './userService.js';
import { generateOneShot, generateOneShotFable } from './aiGenerator.js';
import { generateOneShotV3 } from './aiGeneratorV3.js';
import { claimUserPromotionInternal, checkAndClaimActivityReward } from './promotionService.js';
import { PROMOTION_CONFIG } from '../config/promotion.js';
import { updateRankingCount } from './rankingService.js';
import { getPersonaImagePath, CANONICAL_PERSONA_MAP, PERSONA_NAME_MAP, getPersonaCategory } from '../utils/imageUrl.js';
import { getPersonaVoice } from '../config/personaVoices.js';
import { recordPersonaUsage, updatePersonaRanking } from './personaPreferenceService.js';
import { getRandomBaseFortune } from './aiGenerator.js';
import { invalidateSummaryCache } from '../routes/media/storage.js';

let gachaContentsPool = [];

// [FIX §1.3-13] 프론트는 /gacha 응답 후 별도로 POST /user/reward(GACHA_PULL, +1P)를 호출한다.
// draw 응답 시점의 잔액은 아직 그 +1P가 반영되기 전이라 GACHA_PULL 응답과 어긋나(값이 튐).
// draw 잔액에 GACHA_PULL 예정 포인트를 projectedDelta로 미리 더해 두 응답의 balancePoints를 일치시킨다.
// (POINTS_PER_ACTIVITY.GACHA_PULL 과 동일해야 함)
const GACHA_PULL_POINT_PROJECTION = 1;

const getCurrentPointBalance = async (userKey, projectedDelta = 0) => {
    const userSnap = await firestore.collection('users').doc(String(userKey)).get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const basePoints = userData.points ?? userData.currentPoints ?? userData.balancePoints ?? 0;
    const points = basePoints + projectedDelta;

    return {
        points,
        pointCount: points,
        currentPoints: points,
        balancePoints: points,
    };
};

/**
 * Update locally cached gacha contents
 */
export const setGachaContents = (contents) => {
    gachaContentsPool = contents;
};

const buildGachaLogDetails = ({
    canonicalId,
    personaName,
    group,
    situation,
    itemType,
    isLotto = false,
    checkType = null,
    grade,
    rewardAmount = 0,
    fortuneScore = 0,
    rankPoints = 0,
    isAI = true,
    userMetadata = {}
}) => ({
    personaId: canonicalId,
    personaName,
    category: isLotto ? 'lotto' : getPersonaCategory(canonicalId),
    type: itemType,
    group: group || null,
    situation: situation || null,
    isLotto,
    checkType,
    grade,
    rewardAmount,
    fortuneScore,
    rankPoints,
    isAI,
    user_gender: userMetadata.gender || 'unknown',
    user_segment: userMetadata.segment || 'unknown'
});

/**
 * Core Gacha Logic meant to be shared across routes
 * Handling Ticket -> AI -> Save -> Reward
 */
const processGachaPullInternal = async (userKey, personaId, situation, reqBody = {}) => {
    const { group, requestId } = reqBody; // [V3] Extract group
    const todayKey = getKstDateKey();
    // 0. Canonicalize PersonaId
    const canonicalId = CANONICAL_PERSONA_MAP[personaId] || personaId;
    const personaName = PERSONA_NAME_MAP[canonicalId] ||
        (canonicalId.includes('_') ? canonicalId.split('_').pop().replace(/_/g, ' ') : canonicalId);

    // 1. Daily Fortune Consistency
    const userMetadata = await loadAndSyncUserMetadata(userKey, reqBody);

    let fixedFortuneData = null;
    const fortuneRef = firestore.collection('users').doc(String(userKey)).collection('daily_fortunes').doc(todayKey);

    try {
        const fortuneDoc = await fortuneRef.get();
        if (fortuneDoc.exists) {
            fixedFortuneData = fortuneDoc.data();
        } else {
            const newBase = getRandomBaseFortune();
            fixedFortuneData = {
                score: newBase.score,
                grade: newBase.grade,
                text: newBase.text,
                createdAt: new Date().toISOString()
            };
            await fortuneRef.set(fixedFortuneData);
        }
    } catch (e) {
        console.error('Failed to get/set daily fortune:', e);
    }

    // 2. Identify Type & Deduct Ticket
    const isLotto = !!(
        canonicalId.includes('lotto') ||
        canonicalId.includes('추첨기') ||
        (group && group.includes('lotto')) ||
        situation.includes('로또') ||
        situation.includes('복권') ||
        situation.includes('연금복권') ||
        situation.includes('pension')
    );

    // [HEAL] If requestId is used and ticket already deducted, this will return the cached result
    const ticketResult = await deductTicket(userKey, { ...reqBody, isLotto });

    try {
        // 3. AI Generation
        let aiResult = await generateOneShot(personaName, situation, userMetadata, null, canonicalId);
        const { content, fortune, share, grade } = aiResult;

        // 4. Save to Contents
        const generatedItem = {
            userKey: String(userKey),
            type: (canonicalId === 'fortune_타로_점술가' || canonicalId === 'mystic_fortune_teller' || (canonicalId && canonicalId.startsWith('daily_'))) ? 'fortune' : 'advice',
            grade: grade || 'NORMAL',
            personaId: canonicalId,
            personaName: personaName,
            situation: situation,
            imageUrl: getPersonaImagePath(canonicalId),
            title: aiResult.title || `${personaName}의 조언`,
            content: content || '',
            summary: `${personaName}\n${makeSnippet(content, 42)}`,
            fortune: fortune || null,
            share: share || null,
            isAIGenerated: true,
            createdAt: new Date().toISOString(),
            timestamp: Date.now(),
            rarity: (grade || 'NORMAL').toLowerCase(),
            date: todayKey,
            isUsed: false,
            isV2: true
        };

        // 5. Special Promotion Logic (Consolidated)
        const codesToClaim = [];
        codesToClaim.push(PROMOTION_CONFIG.LIVE_CODE || PROMOTION_CONFIG.TEST_CODE);

        const isAnimal = ['dog', 'cat', 'puppy', 'kitten', '진돗개', '고양이', '길냥이', 'pet'].some(k => canonicalId.includes(k));
        const isSeniorTopic = ['은퇴', '노후', '연금', '건강', '질병', '약', '병원', '자식', '결혼', '손자', '손녀', '며느리', '사위', '미래', '일자리', '재취업', '창업', '귀농', '상속', '유산'].some(k => {
            if (k === '연금' && situation.includes('연금복권')) return false;
            return situation.includes(k);
        });
        const isJobStress = ['상사', '동료', '후임', '고객', '파견', '야근', '월급', '퇴사', '이직', '업무', '회사', '직장', '회식', '스트레스', '취업', '면접'].some(k => situation.includes(k));

        if (grade === 'DIAMOND' || grade === 'diamond') {
            codesToClaim.push(PROMOTION_CONFIG.GACHA_CARD_DIAMOND_CODE);
        } else if (grade === 'PLATINUM' || grade === 'platinum') {
            codesToClaim.push(PROMOTION_CONFIG.GACHA_CARD_PLATINUM_CODE);
        }

        if (isAnimal) codesToClaim.push(PROMOTION_CONFIG.ANIMAL_SPECIAL_LIVE_CODE || PROMOTION_CONFIG.ANIMAL_SPECIAL_TEST_CODE);
        if (isSeniorTopic) codesToClaim.push(PROMOTION_CONFIG.SENIOR_SPECIAL_LIVE_CODE || PROMOTION_CONFIG.SENIOR_SPECIAL_TEST_CODE);
        if (isJobStress) codesToClaim.push(PROMOTION_CONFIG.JOB_STRESS_SPECIAL_LIVE_CODE || PROMOTION_CONFIG.JOB_STRESS_SPECIAL_TEST_CODE);

        const uniqueCodes = [...new Set(codesToClaim)].filter(c => c && !c.includes('PLACEHOLDER'));
        let promotionAmount = 0;
        let hasClaimed = false;

        const claimPromises = uniqueCodes.map(code =>
            claimUserPromotionInternal(userKey, code).catch(err => {
                if (err.message !== 'ALREADY_CLAIMED') {
                    console.error(`[GachaPull] Promotion claim FAILED for ${userKey}, code=${code}:`, err.message);
                }
                return null;
            })
        );
        const claimResults = await Promise.all(claimPromises);

        for (const result of claimResults) {
            if (result && result.amount > 0) {
                promotionAmount += result.amount;
                hasClaimed = true;
            }
        }

        generatedItem.isRewardEligible = uniqueCodes.length > 0 || isLotto;
        generatedItem.rewardStatus = hasClaimed ? 'CLAIMED' : (generatedItem.isRewardEligible ? 'AVAILABLE' : 'NONE');
        generatedItem.rewardAmount = promotionAmount;

        const docRef = await firestore.collection('contents').add(generatedItem);
        // 새 아이템 저장 후 summary 캐시 무효화 (보관함 화면에서 즉시 최신 카운트 표시)
        invalidateSummaryCache(userKey);

        let promotionData = null;
        if (promotionAmount > 0) {
            promotionData = { amount: promotionAmount, message: `${promotionAmount}원이 지급되었습니다!` };
        }

        // 6. Activity Rewards
        const checkType = isLotto ? 'DAILY_CHECK_LOTTO'
            : (generatedItem.type === 'fortune' ? 'DAILY_CHECK_FORTUNE' : 'DAILY_CHECK_ADVICE');
        const activityReward = await checkAndClaimActivityReward(userKey, checkType, ticketResult.pullCount);

        const rankPoints = calculateRankPoints(grade, fortune?.score);

        // 6-1. 운세 보기 프로모션 (FORTUNE_VIEW)
        const fortuneViewReward = await checkAndClaimActivityReward(userKey, 'FORTUNE_VIEW', 1);

        // [LOGGING] Record User Action
        await logUserAction(userKey, 'GACHA_PULL', {
            ...buildGachaLogDetails({
                canonicalId,
                personaName,
                group,
                situation,
                itemType: generatedItem.type,
                isLotto,
                checkType,
                grade,
                rewardAmount: promotionAmount,
                fortuneScore: fortune?.score || 0,
                rankPoints,
                isAI: true,
                userMetadata,
            })
        });

        // 7. Update Ranking (Cumulative Score)
        await recordRanking(userKey, userMetadata, grade, canonicalId, fortune?.score);

        // [FIX §1.3-13] 뒤이어 호출될 GACHA_PULL(+1P)을 미리 반영해 잔액 정합
        const wallet = await getCurrentPointBalance(userKey, GACHA_PULL_POINT_PROJECTION);

        const finalResult = {
            id: docRef.id,
            item: generatedItem,
            tickets: ticketResult.tickets,
            ...wallet,
            promotion: promotionData || ticketResult.promotion,
            activityReward: activityReward,
            activityPromotion: fortuneViewReward,
            userMetadata,
            zodiacRanking: getDailyZodiacRanking(todayKey)
        };

        // [IDEMPOTENCY] Finalize for future retries
        if (requestId) {
            await firestore.collection('idempotency_keys').doc(String(requestId)).set({
                userKey,
                status: 'SUCCESS',
                resultType: 'GACHA_PULL',
                fullResult: finalResult,
                createdAt: FieldValue.serverTimestamp()
            }, { merge: true }).catch(() => { });
        }

        return finalResult;
    } catch (error) {
        error.ticketDeducted = true;
        throw error;
    }
};

/**
 * [FAIL-SAFE WRAPPER]
 * Guarantees a response even if the internal logic crashes.
 */
export const processGachaPull = async (userKey, personaId, situation, reqBody = {}) => {
    const { requestId } = reqBody;

    // [Idempotency Fast Path]
    if (requestId) {
        try {
            const idempRef = firestore.collection('idempotency_keys').doc(String(requestId));
            const idempSnap = await idempRef.get();
            if (idempSnap.exists) {
                const data = idempSnap.data();
                if (data.status === 'SUCCESS' && data.resultType === 'GACHA_PULL' && data.fullResult) {
                    console.log(`[processGachaPull] Returning cached result for ${requestId}`);
                    return data.fullResult;
                }
            }
        } catch (e) {
            console.error('[processGachaPull] Idempotency check failed:', e);
        }
    }

    try {
        return await processGachaPullInternal(userKey, personaId, situation, reqBody);
    } catch (error) {
        // [CRITICAL] If ticket error, bubble up so 403 can be sent
        if (error.message === 'INSUFFICIENT_TICKETS') throw error;
        if (error.code === 'INSUFFICIENT_TICKETS') throw error; // Just in case

        console.error(`[processGachaPull] CRASH RECOVERED: ${error.message}`, error);

        // [REFUND TICKET]
        // [REFUND TICKET]
        if (error.ticketDeducted) {
            try {
                const userRef = firestore.collection('users').doc(String(userKey));
                await firestore.runTransaction(async (tx) => {
                    const doc = await tx.get(userRef);
                    if (doc.exists) {
                        const data = doc.data();
                        const currentTotal = data.ticketsTotal !== undefined ? data.ticketsTotal : (data.tickets || 0);
                        const newTotal = currentTotal + 1;
                        tx.update(userRef, {
                            ticketsTotal: newTotal,
                            tickets: newTotal,
                            ticket: newTotal,
                            updatedAt: new Date()
                        });
                    }
                });
                console.log(`[processGachaPull] Refunded ticket for ${userKey} due to error`);
            } catch (refundError) {
                console.error(`[processGachaPull] Failed to refund ticket: ${refundError}`);
            }
        }

        // [EMERGENCY RESPONSE with AUTO-SAVE]
        let currentTickets = 0;
        try {
            const userDoc = await firestore.collection('users').doc(String(userKey)).get();
            const userData = userDoc.data() || {};
            currentTickets = userData.ticketsTotal ?? userData.tickets ?? 0;
        } catch (e) {
            console.error('Failed to fetch tickets for fallback:', e);
        }

        const todayKey = getKstDateKey();

        const fallbackItem = {
            id: 'fallback_item_' + Date.now(),
            userKey: String(userKey),
            type: 'advice',
            grade: 'NORMAL',
            personaId: 'fortune_goddess',
            personaName: '행운의 여신',
            situation: situation,
            imageUrl: "https://example.invalid/example-project.firebasestorage.app/images/personas/fortune_goddess.png",
            title: "긴급! 행운의 여신의 축복",
            content: "시스템 정렬이 잠시 어긋났지만, 행운의 여신이 당신의 티켓과 정성을 소중히 여겨 직접 특별한 축복을 보냈습니다. 이 행운의 메시지는 보관함에 안전하게 저장되었습니다.",
            summary: "행운의 여신\n당신의 티켓은 안전하게 행운으로 교환되었습니다.",
            fortune: {
                score: 95,
                description: "위기를 기회로 바꾸는 강력한 행운이 찾아옵니다. 지금의 작은 불편함이 더 큰 행운의 전조가 될 것입니다.",
                details: {
                    love: Math.floor(Math.random() * 31) + 70,
                    health: Math.floor(Math.random() * 31) + 70,
                    wealth: Math.floor(Math.random() * 31) + 70
                }
            },
            isAIGenerated: false,
            createdAt: new Date().toISOString(),
            timestamp: Date.now(),
            rarity: 'platinum',
            date: todayKey,
            isUsed: false,
            isV2: true,
            isRewardEligible: false,
            rewardStatus: 'NONE',
            rewardAmount: 0
        };

        // [RECOVERY] Save the fallback response to Firestore
        let recoveryId = 'fallback_' + Date.now();
        try {
            const docRef = await firestore.collection('contents').add(fallbackItem);
            recoveryId = docRef.id;
            console.log(`[processGachaPull] Emergency fallback saved: ${recoveryId}`);
        } catch (saveError) {
            console.error('[processGachaPull] Emergency save failed:', saveError);
        }

        // [FIX §1.3-13] 폴백 응답도 GACHA_PULL(+1P) 예정분을 반영해 정합 유지
        const wallet = await getCurrentPointBalance(userKey, GACHA_PULL_POINT_PROJECTION);

        return {
            id: recoveryId,
            item: fallbackItem,
            tickets: currentTickets,
            ...wallet,
            promotion: null,
            activityReward: null,
            userMetadata: {},
            zodiacRanking: getDailyZodiacRanking(todayKey)
        };
    }
};

/**
 * Generate a deterministic zodiac ranking for the day
 */
export const getDailyZodiacRanking = (todayKey) => {
    const signs = [
        "물병자리", "물고기자리", "양자리", "황소자리", "쌍둥이자리",
        "게자리", "사자자리", "처녀자리", "천칭자리", "전갈자리",
        "사수자리", "염소자리"
    ];

    // Simple deterministic PRNG based on the date string (YYYY-MM-DD)
    let seed = 0;
    for (let i = 0; i < todayKey.length; i++) {
        seed = ((seed << 5) - seed) + todayKey.charCodeAt(i);
        seed |= 0;
    }

    // Mulberry32 PRNG
    const mulberry = (s) => {
        return function () {
            let t = s += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    }

    const rand = mulberry(seed);

    // Assign scores (60~100) and sort
    const rankedList = signs.map(sign => ({
        sign,
        score: Math.floor(rand() * 39) + 60 // 60~98 (만점 100 방지)
    })).sort((a, b) => b.score - a.score);

    // Add rank (handle ties if any, but rand() is likely unique enough)
    return rankedList.map((item, index) => ({
        ...item,
        rank: index + 1
    }));
};

/**
 * Calculate Ranking Points based on grade AND fortune score
 * Base Score: Fortune Score (60~100)
 * Grade Bonus:
 * - Diamond: +500
 * - Platinum: +200
 * - Gold: +50
 * - Silver: +10
 * - Normal: +1
 */
/**
 * Calculate Ranking Points based on grade AND fortune score
 * Base Score: Fortune Score (60~100)
 * Grade Bonus:
 * - Diamond: +500
 * - Platinum: +200
 * - Gold: +50
 * - Silver: +10
 * - Normal: +1
 */
const calculateRankPoints = (grade, fortuneScore = 0) => {
    const g = (grade || '').toUpperCase();
    let bonus = 0;

    if (g === 'DIAMOND') bonus = 500;
    else if (g === 'PLATINUM') bonus = 200;
    else if (g === 'GOLD') bonus = 50;
    else if (g === 'SILVER') bonus = 10;
    else bonus = 1;

    const base = fortuneScore > 0 ? fortuneScore : 60;
    return base + bonus;
};

/**
 * 실시간 랭킹 기록 (별도 동기화 없이 실행)
 */
const recordRanking = async (userKey, userMetadata, grade = 'NORMAL', personaId = null, fortuneScore = 0) => {
    const nickname = userMetadata?.nickname || userMetadata?.name || '익명';
    const points = calculateRankPoints(grade, fortuneScore);
    const userRef = firestore.collection('users').doc(String(userKey));
    const category = personaId ? getPersonaCategory(personaId) : 'advice';

    // [Optimized] adViewsTotal, consultCount를 userMetadata에 포함시켜 ranking doc에 저장
    // → getUserRanking/getTopRankings에서 users 컬렉션 재조회 불필요 (N+1 제거)
    const userSnap = await userRef.get();
    const ud = userSnap.exists ? userSnap.data() : {};
    const enrichedMetadata = {
        ...userMetadata,
        adViewsTotal: ud.adViewsTotal || 0,
        consultCount: ud.consultCount || 0,
        characterLevel: ud.characterLevel || 1,
        characterExp: ud.characterExp || 0,
    };

    // 1. 전체 랭킹 업데이트
    await updateRankingCount(userKey, nickname, points, enrichedMetadata);

    await logUserAction(userKey, 'RANKING_SCORE_APPLIED', {
        personaId,
        category,
        grade: (grade || 'NORMAL').toUpperCase(),
        fortuneScore: fortuneScore || 0,
        rankPoints: points,
        adViewsTotal: enrichedMetadata.adViewsTotal || 0,
        consultCount: enrichedMetadata.consultCount || 0,
        rewardScore: (enrichedMetadata.adViewsTotal || 0) * 2 + (enrichedMetadata.consultCount || 0) * 5,
        user_gender: enrichedMetadata.gender || 'unknown',
        user_segment: enrichedMetadata.segment || 'unknown'
    });

    // 2. 유저 문서에 등급별 카운트 업데이트 (Global Sync)
    const upperGrade = (grade || 'NORMAL').toUpperCase();
    const userUpdates = { updatedAt: FieldValue.serverTimestamp() };
    if (upperGrade === 'DIAMOND') userUpdates.diamondCount = FieldValue.increment(1);
    if (upperGrade === 'PLATINUM') userUpdates.platinumCount = FieldValue.increment(1);

    await userRef.set(userUpdates, { merge: true });

    // 다이아/플래티넘 획득 시 syncUserStats 캐시 무효화 (다음 /status 호출 시 즉시 반영)
    if (upperGrade === 'DIAMOND' || upperGrade === 'PLATINUM') {
        invalidateSyncStatsCache(userKey);
    }

    // 🎴 첫 레어 카드(골드 이상) 프로모션 — await
    if (['GOLD', 'PLATINUM', 'DIAMOND'].includes(upperGrade)) {
        try {
            const result = await checkAndClaimActivityReward(userKey, 'FIRST_RARE_CARD', 1);
            if (result && !result.alreadyClaimed && !result.error) {
                console.log(`[DNU] 🎴 첫 레어 카드 보상 지급! userKey=${userKey} grade=${upperGrade} amount=${result.amount}`);
            }
        } catch (e) {
            console.error(`[DNU] 첫 레어 카드 보상 실패: userKey=${userKey}`, e.message);
        }
    }

    // 3. 페르소나 사용 기록
    if (personaId) {
        await Promise.all([
            recordPersonaUsage(userKey, personaId, grade),
            updatePersonaRanking(userKey, personaId, nickname, points, userMetadata)
        ]);
    }
};

/**
 * Determine Random Grade based on probability
 * Diamond(1%), Platinum(4%), Gold(15%), Silver(30%), Normal(50%)
 */
const determineRandomGrade = () => {
    const rand = Math.random();
    if (rand > 0.995) return 'DIAMOND';
    if (rand > 0.95) return 'PLATINUM';
    if (rand > 0.85) return 'GOLD';
    if (rand > 0.50) return 'SILVER';
    return 'NORMAL';
};

/**
 * Static Gacha Pull Logic (Random Item from Pool)
 */
export const processStaticGachaPull = async (userKey, reqBody = {}) => {
    const todayKey = getKstDateKey();

    if (!gachaContentsPool || gachaContentsPool.length === 0) {
        console.warn('[StaticGacha] Pool is empty. Using Hardcoded Fallback.');
        // Hardcoded Fallback Item
        const fallbackItem = {
            personaId: 'fortune_ goddess',
            personaName: '행운의 여신',
            content: "마음을 편안하게 가지세요. 행운은 준비된 자에게 찾아옵니다.",
            imageUrl: "https://example.invalid/example-project.firebasestorage.app/images/personas/fortune_goddess.png"
        };
        // Use this as the "random" selection
        gachaContentsPool = [fallbackItem];
    }

    // 1. Ticket Deduction
    const ticketResult = await deductTicket(userKey);

    // 2. Select Random Item
    const pickedItem = gachaContentsPool[Math.floor(Math.random() * gachaContentsPool.length)];
    const personaId = pickedItem.personaId || 'anonymous';
    const personaName = pickedItem.personaName || '조언가';

    // 3. Random Grade
    const randomGrade = determineRandomGrade();

    // Simulate Score based on Grade for Fortune
    let minScore = 60, maxScore = 100;
    if (randomGrade === 'DIAMOND') { minScore = 96; maxScore = 100; }
    else if (randomGrade === 'PLATINUM') { minScore = 90; maxScore = 95; }
    else if (randomGrade === 'GOLD') { minScore = 80; maxScore = 89; }
    else if (randomGrade === 'SILVER') { minScore = 70; maxScore = 79; }
    else { minScore = 60; maxScore = 69; }

    const randomScore = Math.floor(Math.random() * (maxScore - minScore + 1)) + minScore;

    const randomFortune = {
        score: randomScore,
        description: "무난하고 평온한 하루입니다.",
        details: {
            love: Math.floor(Math.random() * 31) + 60,
            health: Math.floor(Math.random() * 31) + 60,
            wealth: Math.floor(Math.random() * 31) + 60
        }
    };

    // 4. Save to Contents
    const savedItem = {
        ...pickedItem,
        userKey: String(userKey),
        type: 'advice',
        rarity: randomGrade.toLowerCase(),
        grade: randomGrade.toUpperCase(),
        fortune: randomFortune,
        summary: `${personaName}\n${makeSnippet(pickedItem.content, 42)}`,
        createdAt: new Date().toISOString(),
        timestamp: Date.now(),
        date: todayKey,
        isStatic: true,
        isUsed: false,
        imageUrl: pickedItem.imageUrl || getPersonaImagePath(personaId)
    };

    const docRef = await firestore.collection('contents').add(savedItem);
    invalidateSummaryCache(userKey);

    // 5. Promotion Logic
    const codesToClaim = [PROMOTION_CONFIG.LIVE_CODE || PROMOTION_CONFIG.TEST_CODE];
    if (randomGrade === 'DIAMOND') {
        codesToClaim.push(PROMOTION_CONFIG.GACHA_CARD_DIAMOND_CODE);
    } else if (randomGrade === 'PLATINUM') {
        codesToClaim.push(PROMOTION_CONFIG.GACHA_CARD_PLATINUM_CODE);
    }

    const uniqueCodes = [...new Set(codesToClaim)].filter(c => c && !c.includes('PLACEHOLDER'));
    let promotionAmount = 0;

    // [성능 개선] 병렬 처리
    const claimPromises = uniqueCodes.map(code => claimUserPromotionInternal(userKey, code).catch(e => {
        console.error(`[StaticGacha] Claim failed for ${code}:`, e.message);
        return null;
    }));
    const claimResults = await Promise.all(claimPromises);

    for (const result of claimResults) {
        if (result && result.amount > 0) {
            promotionAmount += (result.amount || 0);
        }
    }

    let promotionData = null;
    if (promotionAmount > 0) {
        promotionData = { amount: promotionAmount, message: `${promotionAmount}원이 지급되었습니다!` };
    }

    // 6. Activity Rewards
    const activityReward = await checkAndClaimActivityReward(userKey, 'DAILY_CHECK_ADVICE', ticketResult.pullCount);

    const rankPoints = calculateRankPoints(randomGrade, 0);

    // [LOGGING] Record User Action
    await logUserAction(userKey, 'GACHA_PULL', {
        ...buildGachaLogDetails({
            canonicalId: personaId,
            personaName,
            itemType: 'advice',
            isLotto: getPersonaCategory(personaId) === 'lotto',
            checkType: 'DAILY_CHECK_ADVICE',
            grade: randomGrade,
            rewardAmount: promotionAmount,
            rankPoints,
            isAI: false,
        })
    });

    // 랭킹 업데이트
    await recordRanking(userKey, { nickname: '익명' }, randomGrade, personaId);

    const wallet = await getCurrentPointBalance(userKey);

    return {
        id: docRef.id,
        item: savedItem,
        tickets: ticketResult.tickets,
        ...wallet,
        activityPromotion: activityReward,
        zodiacRanking: getDailyZodiacRanking(todayKey)
    };
};

/**
 * Fable Pull Logic (Story Generation)
 */
export const processFablePull = async (userKey, personaId, situation, reqBody = {}) => {
    const todayKey = getKstDateKey();
    // [FIX §2.3-1/§2.4] 프론트는 personaId(예: 'socrates')를 보내므로 캐노니컬 이름으로 정규화해야
    // 우화가 '소크라테스' 어투로 생성된다. (기존엔 'socrates' 영문 id 그대로 사용)
    const canonicalId = CANONICAL_PERSONA_MAP[personaId] || personaId;
    const personaDisplayName = PERSONA_NAME_MAP[canonicalId] ||
        (canonicalId.includes('_') ? canonicalId.split('_').pop().replace(/_/g, ' ') : canonicalId);

    // 0. Determine Grade
    const grade = determineRandomGrade();

    const userMetadata = await loadAndSyncUserMetadata(userKey, reqBody);

    // 1. Fetch Persona description (Firestore → 보이스 표 순으로 폴백)
    let personaDescription = '';
    try {
        const personaDoc = await firestore.collection('personas').doc(canonicalId).get();
        if (personaDoc.exists) {
            personaDescription = personaDoc.data().description || '';
        }
    } catch (err) { }
    if (!personaDescription) {
        const voice = getPersonaVoice(personaId, personaDisplayName);
        if (voice) personaDescription = voice.voice;
    }

    // 2. Ticket Deduction
    const ticketResult = await deductTicket(userKey);

    // 3. AI Generation
    const aiResult = await generateOneShotFable(personaDisplayName, situation, userMetadata, personaDescription);

    // 4. Save to Fables
    const generatedItem = {
        userKey: String(userKey),
        type: 'fable',
        rarity: grade.toLowerCase(),
        grade: grade, // [Added] Grade for Fables
        personaId: canonicalId,
        personaName: personaDisplayName,
        situation: situation,
        title: `${personaDisplayName}의 우화`,
        content: aiResult.content || '',
        moral: aiResult.moral || '',
        summary: `${personaDisplayName}\n${makeSnippet(aiResult.content, 42)}`,
        createdAt: new Date().toISOString(),
        timestamp: Date.now(),
        date: todayKey,
        isV2: true,
        imageUrl: getPersonaImagePath(canonicalId)
    };

    const docRef = await firestore.collection('fables').add(generatedItem);
    invalidateSummaryCache(userKey);

    // 5. Fable Special Promotion (Plus Grade Promotion)
    let promotionAmount = 0;
    const codesToClaim = [];

    // Existing Fable Promo
    const fableCode = PROMOTION_CONFIG.FABLE_SPECIAL_LIVE_CODE || PROMOTION_CONFIG.FABLE_SPECIAL_TEST_CODE;
    if (fableCode) codesToClaim.push(fableCode);

    // [Standardized] Grade Based Promotion
    if (grade === 'DIAMOND') {
        codesToClaim.push(PROMOTION_CONFIG.GACHA_CARD_DIAMOND_CODE);
    } else if (grade === 'PLATINUM') {
        codesToClaim.push(PROMOTION_CONFIG.GACHA_CARD_PLATINUM_CODE);
    }

    const uniqueCodes = [...new Set(codesToClaim)].filter(c => c && !c.includes('PLACEHOLDER'));

    // [성능 개선] 병렬 처리
    const claimPromises = uniqueCodes.map(code => claimUserPromotionInternal(userKey, code).catch(e => {
        console.error(`[FableGacha] Claim failed for ${code}:`, e.message);
        return null;
    }));
    const claimResults = await Promise.all(claimPromises);

    for (const result of claimResults) {
        if (result && result.amount > 0) {
            promotionAmount += (result.amount || 0);
        }
    }

    let promotionData = null;
    if (promotionAmount > 0) {
        promotionData = { amount: promotionAmount, message: `${promotionAmount}원이 지급되었습니다!` };
    }

    // 6. Activity Rewards
    const activityReward = await checkAndClaimActivityReward(userKey, 'DAILY_CHECK_ADVICE', ticketResult.pullCount);

    const rankPoints = calculateRankPoints(grade, 0);

    // [LOGGING] Record User Action
    await logUserAction(userKey, 'GACHA_PULL_FABLE', {
        ...buildGachaLogDetails({
            canonicalId,
            personaName: personaDisplayName,
            situation,
            itemType: 'fable',
            grade,
            rewardAmount: promotionAmount,
            rankPoints,
            isAI: true,
            userMetadata,
        }),
        title: generatedItem.title,
    });

    // 랭킹 업데이트
    await recordRanking(userKey, userMetadata, grade, canonicalId);

    // [FIX §1.3-13] 우화도 /gacha 경유 시 GACHA_PULL(+1P)이 뒤따르므로 정합 반영
    const wallet = await getCurrentPointBalance(userKey, GACHA_PULL_POINT_PROJECTION);

    return {
        id: docRef.id,
        item: generatedItem,
        tickets: ticketResult.tickets,
        ...wallet,
        promotion: promotionData || ticketResult.promotion,
        activityReward,
        userMetadata,
        zodiacRanking: getDailyZodiacRanking(todayKey)
    };
};

