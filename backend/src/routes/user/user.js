import express from 'express';
import { firestore, FieldValue } from '../../lib/firebaseAdmin.js';
import { getUserDocRef, logUserAction, getKstDateKey, getTicketBalance, safeNickname } from '../../utils/helpers.js';
import {
    applyDailyTicket,
    applyAdRewardTickets,
    applyAdRewardPoints,
    processRefund,
    applyShareReward,
    processAttendanceUpdate,

    processDailyRecharge,
    updateUserNickname,
    syncUserStats,
    applyAdRewardClaim,
    getUserPointsStatus,
    convertPointsToTickets,
    applyRewardActivity,
} from '../../services/userService.js';
import { checkAndClaimActivityReward } from '../../services/promotionService.js';
import { generateRandomNickname } from '../../utils/nicknameGenerator.js';
import { AD_CONFIG } from '../../config/adConfig.js';

const router = express.Router();

const STANDARD_AD_ACTIONS = new Set([
    'AD_WATCH_START',
    'MARKETING_BANNER_RENDERED',
    'BANNER_VIEWABLE',
    'BANNER_IMPRESSION',
    'MARKETING_BANNER_IMPRESSION',
    'BANNER_CLICK',
    'MARKETING_BANNER_CLICK',
    'MARKETING_BANNER_NOFILL',
    'MARKETING_BANNER_RENDER_FAIL'
]);

const AD_ACTION_ALIAS_MAP = {
    BANNER_IMPRESSION: ['MARKETING_BANNER_IMPRESSION'],
    MARKETING_BANNER_IMPRESSION: ['BANNER_IMPRESSION'],
    BANNER_CLICK: ['MARKETING_BANNER_CLICK'],
    MARKETING_BANNER_CLICK: ['BANNER_CLICK']
};

const normalizeActionName = (value = '') =>
    String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[-\s]+/g, '_');

/**
 * POST /nickname
 */
router.post('/nickname', async (req, res) => {
    const { userKey, nickname } = req.body || {};
    if (!userKey || !nickname) return res.status(400).json({ resultType: 'FAIL', error: { code: 'MISSING_PARAMS', message: 'UserKey and Nickname are required' } });

    try {
        const result = await updateUserNickname(userKey, nickname);
        res.json({
            resultType: 'SUCCESS',
            data: result
        });
    } catch (error) {
        if (error.code) {
            res.status(400).json({ resultType: 'FAIL', error: { code: error.code, message: error.message } });
        } else {
            console.error('[Nickname Update Error]', error);
            res.status(500).json({ resultType: 'FAIL', error: { code: 'INTERNAL_ERROR', message: error.message } });
        }
    }
});

/**
 * GET /status
 * 티켓 현황 조회
 */
const getTicketStatus = async (req, res) => {
    const userKey = req.query.userKey || req.query.userkey; // Support lowercase
    if (!userKey) return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_USER_KEY' });

    // Prevent Caching
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    try {
        const snap = await getUserDocRef(userKey).get();
        let data = snap.exists ? snap.data() : {};

        // [병렬 처리] 일일 티켓 충전 + 다이아/플래티넘 카운트 동기화를 동시에 실행
        // processDailyRecharge는 tickets 필드를 변경하고, syncUserStats는 diamondCount를 변경 → 충돌 없음
        const [rechargeResult, statUpdates] = await Promise.all([
            processDailyRecharge(userKey, data),
            syncUserStats(userKey, data)
        ]);
        if (rechargeResult.ticketsTotal !== undefined) {
            data = { ...data, ...rechargeResult };
        }
        if (Object.keys(statUpdates).length > 0) {
            data = { ...data, ...statUpdates };
        }

        const ticketCount = getTicketBalance(data);
        const pointsCount = data.points ?? data.currentPoints ?? data.balancePoints ?? 0;

        // 닉네임 복호화
        const decryptedNickname = await safeNickname(data.nickname, userKey);

        const responseData = {
            ...data,
            nickname: decryptedNickname,
            tickets: ticketCount,
            points: pointsCount,
            pointCount: pointsCount,
            currentPoints: pointsCount,
            balancePoints: pointsCount,
        };

        res.json({
            resultType: 'SUCCESS',
            success: true,
            tickets: ticketCount, // Unified Balance (Top-level for legacy)
            points: pointsCount,
            pointCount: pointsCount,
            currentPoints: pointsCount,
            balancePoints: pointsCount,
            data: responseData, // [FIX] Frontend expects 'data.tickets' to be latest
            success: responseData, // Keep for backwards compat
            adConfig: AD_CONFIG // [NEW] Send Ad unit IDs & settings to frontend
        });
    } catch (error) {
        res.status(500).json({ resultType: 'FAIL', error: 'TICKET_STATUS_FAILED' });
    }
};

/**
 * GET /status (or GET /)
 * 티켓 현황 조회
 */
router.get('/status', getTicketStatus);
router.get('/', getTicketStatus);
router.get('/tickets', getTicketStatus); // [Restore] Legacy endpoint for V1 clients

/**
 * POST /claim-daily
 * 일일 티켓 수령
 */
router.post('/claim-daily', async (req, res) => {
    const { userKey, profileData, guestUserKey } = req.body || {};
    if (!userKey) return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_USER_KEY' });

    try {
        const result = await applyDailyTicket(userKey, profileData, guestUserKey);
        res.json({
            resultType: 'SUCCESS',
            success: true,
            tickets: result.tickets, // [Sync] V1 Compatible Top-level
            data: { // [FIX] Frontend expects 'data.tickets'
                ...(result.data || {}),  // 서버에 업데이트된 최신 프로필 정보 합치기
                tickets: result.tickets,
                message: result.alreadyClaimed ? 'Already claimed' : 'Daily ticket awarded',
                promotion: result.promotion
            }
        });
    } catch (error) {
        res.status(500).json({ resultType: 'FAIL', error: error.message });
    }
});

/**
 * POST /reward  ← 통합 광고 보상 단일 엔드포인트 (#1 Critical)
 *
 * 기존 3중 폴백(/api/user/reward/points → /api/v2/reward/activity → /api/v2/user/reward)을
 * 이 엔드포인트 하나로 통합. 기존 엔드포인트는 호환성 유지를 위해 유지됩니다.
 *
 * Body:
 *   - userKey        {string}  필수
 *   - activityType   {string}  AD_SHORT | AD_LONG | CONSULT | GACHA_PULL (기본: AD_SHORT)
 *   - amount         {number}  클라이언트 제안값 (서버가 검증 후 덮어씀)
 *   - adFormat       {string}  선택적 포맷 정보
 *   - idempotencyKey {string}  중복 호출 방지 UUID (권장)
 *   - pullId         {string}  뽑기 고유 ID (GACHA_PULL 멱등성용)
 *   - personaId      {string}  페르소나별 EXP 관리용 (GACHA_PULL)
 *   - tickets        {number}  [레거시] 하위 호환용 필드 (무시됨)
 *
 * Response (정규화됨):
 *   { resultType, data: { points, addedPoints, tickets, message, balancePoints, grantedPoints, ... } }
 */
router.post('/reward', async (req, res) => {
    const { userKey, activityType, amount, adFormat, idempotencyKey, pullId, personaId, adVerification } = req.body || {};
    if (!userKey) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: { code: 'MISSING_PARAMS', message: 'userKey가 필요합니다.' }
        });
    }
    if (!activityType) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: { code: 'MISSING_PARAMS', message: 'activityType이 필요합니다.' }
        });
    }

    try {
        const raw = await applyRewardActivity({ userKey, activityType, amount, adFormat, idempotencyKey, pullId, personaId, adVerification });

        if (raw && raw.applied === false) {
            return res.status(409).json({
                resultType: 'FAIL',
                error: { code: raw.reason || 'ACTION_NOT_ALLOWED', message: '이미 보상받았거나 처리할 수 없습니다.' }
            });
        }

        // 응답 정규화: 어떤 서비스 로직에서 와도 일관된 필드명 반환 (#2)
        const data = {
            points: raw.currentPoints ?? raw.points ?? raw.balancePoints ?? 0,
            pointCount: raw.currentPoints ?? raw.points ?? raw.balancePoints ?? 0,
            currentPoints: raw.currentPoints ?? raw.points ?? raw.balancePoints ?? 0,
            addedPoints: raw.addedPoints ?? raw.grantedPoints ?? raw.pointsAdded ?? (amount || 0),
            tickets: raw.tickets ?? raw.ticketCount ?? 0,
            addedTickets: raw.addedTickets ?? 0,
            message: raw.message || (activityType === 'GACHA_PULL' ? '경험치가 적립됐어요!' : '보상이 지급됐어요!'),
            // 하위 호환: 기존 필드명을 사용하는 클라이언트 코드도 동작하도록 alias 유지
            balancePoints: raw.currentPoints ?? raw.points ?? 0,
            grantedPoints: raw.addedPoints ?? raw.grantedPoints ?? 0,
            // EXP / Level 필드
            characterLevel: raw.characterLevel,
            characterExp: raw.characterExp,
            addedExp: raw.addedExp,         // 이번 활동으로 추가된 EXP
            expToNext: raw.expToNext,
            leveledUp: raw.leveledUp ?? false,
            // 활동 카운터
            adViewsDaily: raw.adViewsDaily,
            adViewsTotal: raw.adViewsTotal,
            consultCount: raw.consultCount,
            gachaPullCount: raw.gachaPullCount,
            // 페르소나별 프로필 (GACHA_PULL + personaId)
            ...(raw.personaProfiles ? { personaProfiles: raw.personaProfiles } : {}),
        };

        return res.json({ resultType: 'SUCCESS', data });

    } catch (error) {
        const code = error.code || error.message || 'INTERNAL_ERROR';
        const status = code === 'RATE_LIMIT_EXCEEDED' ? 429
            : code === 'INVALID_ACTIVITY_TYPE' ? 400
                : code === 'REWARD_ACTIVITY_DUPLICATED' ? 200
                    : 500;

        // DUPLICATED는 에러가 아닌 기적립 안내 (200)
        if (code === 'REWARD_ACTIVITY_DUPLICATED') {
            let latestPoints = 0;
            let latestTickets = 0;
            try {
                const latestSnap = await getUserDocRef(userKey).get();
                const latestData = latestSnap.exists ? latestSnap.data() : {};
                latestPoints = latestData.points ?? latestData.currentPoints ?? latestData.balancePoints ?? 0;
                latestTickets = getTicketBalance(latestData);
            } catch (e) { }

            return res.status(200).json({
                resultType: 'SUCCESS',
                points: latestPoints,
                pointCount: latestPoints,
                currentPoints: latestPoints,
                balancePoints: latestPoints,
                tickets: latestTickets,
                data: {
                    duplicated: true,
                    message: '이미 적립된 활동입니다.',
                    points: latestPoints,
                    pointCount: latestPoints,
                    currentPoints: latestPoints,
                    balancePoints: latestPoints,
                    tickets: latestTickets,
                }
            });
        }

        return res.status(status).json({
            resultType: 'FAIL',
            error: { code, message: error.message }
        });
    }
});

/**
 * POST /sync
 */
router.post('/sync', async (req, res) => {
    const { userKey, name, nickname, phone, email, gender, birthdate, birthday, nationality } = req.body;
    if (!userKey) return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_USER_KEY' });
    try {
        const userRef = getUserDocRef(userKey);
        const snap = await userRef.get();
        const dbData = snap.exists ? snap.data() : {};

        const updates = { updatedAt: FieldValue.serverTimestamp() };

        // [Privacy Fix] 실명이 닉네임으로 노출되는 것을 방지. Name과 동일하면 차단.
        const isRealNameLikely = (str, realName) => {
            if (!str) return false;
            if (realName && str.trim() === String(realName).trim()) return true;
            return false;
        };

        if (dbData.nickname) {
            // Respect existing nickname; do not overwrite or randomize in sync
        } else if (nickname && !isRealNameLikely(nickname, name || dbData.name)) {
            // Use incoming nickname if it's not matching the real name
            updates.nickname = nickname;
        } else {
            // Generate random nickname for new users or if incoming is a real name
            updates.nickname = generateRandomNickname();
        }

        // --- [개선] 통합 출석/연속 접속 로직 사용 ---
        const attResult = await processAttendanceUpdate(userKey, dbData);
        Object.assign(updates, attResult.updates);

        // [추가] 일일 티켓 자동 충전 및 신규 유저 초기화
        await processDailyRecharge(userKey, { ...dbData, ...updates }, updates);
        // [추가] 다이아/플래티넘 카운트 동기화
        const statUpdates = await syncUserStats(userKey, { ...dbData, ...updates });
        Object.assign(updates, statUpdates);

        if (name) updates.name = name;
        // nickname handled above
        if (phone) updates.phone = phone;
        if (email) updates.email = email;
        if (gender) updates.gender = gender;

        const birth = birthdate || birthday;
        if (birth) {
            updates.birthdate = birth;
            updates.birthday = birth;
        }

        if (nationality) updates.nationality = nationality;

        await userRef.set(updates, { merge: true });

        if (attResult.didAttendToday) {
            const attendanceDate = attResult.attendanceDate || getKstDateKey();
            await userRef.collection('attendance_history').doc(attendanceDate).set({
                userKey: String(userKey),
                date: attendanceDate,
                source: 'sync',
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
        }

        // --- 활동 보상 프로모션 체크: 출석 (연속 접속일 기준) ---
        let activityPromotions = [];
        const streak = attResult.consecutiveLoginDays || dbData.consecutiveLoginDays || 1;

        if (streak) {
            // [병렬 처리] 출석 보상 3개를 동시에 체크
            const [day3, day5, day10] = await Promise.all([
                checkAndClaimActivityReward(userKey, 'ATTENDANCE_3_DAYS', streak),
                checkAndClaimActivityReward(userKey, 'ATTENDANCE_5_DAYS', streak),
                checkAndClaimActivityReward(userKey, 'ATTENDANCE_10_DAYS', streak)
            ]);

            if (day3) activityPromotions.push({ type: 'ATTENDANCE_3_DAYS', ...day3 });
            if (day5) activityPromotions.push({ type: 'ATTENDANCE_5_DAYS', ...day5 });
            if (day10) activityPromotions.push({ type: 'ATTENDANCE_10_DAYS', ...day10 });
        }


        const finalData = { ...dbData, ...updates, consecutiveLoginDays: attResult.consecutiveLoginDays || dbData.consecutiveLoginDays };
        const currentTickets = getTicketBalance(finalData);
        const currentPoints = finalData.points || 0;

        res.json({
            resultType: 'SUCCESS',
            success: true,
            tickets: currentTickets, // Unified Balance
            points: currentPoints,
            data: { // [FIX] Frontend expects 'data.tickets'
                ...finalData,
                tickets: currentTickets,
                points: currentPoints,
                promotions: activityPromotions
            },
            adConfig: AD_CONFIG // [NEW] Central ad meta
        });
    } catch (error) {
        res.status(500).json({ resultType: 'FAIL', error: error.message });
    }
});

/**
 * POST /reward/claim
 */
router.post('/reward/claim', async (req, res) => {
    const { userKey, tickets, rewardId } = req.body || {};
    if (!userKey) return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_USER_KEY' });
    try {
        const result = await applyAdRewardTickets({ userKey, tickets: Number(tickets || 1), rewardId });
        res.json({ resultType: 'SUCCESS', ...result });
    } catch (error) {
        res.status(500).json({ resultType: 'FAIL', error: error.message });
    }
});

/**
 * POST /reward/points
 * 광고 보상 포인트 지급 (1P/3P)
 */
router.post('/reward/points', async (req, res) => {
    const { userKey, points, rewardId, source, adFormat } = req.body || {};
    if (!userKey) return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_USER_KEY' });
    try {
        const resolvedPoints = points !== undefined ? Number(points) : 1;
        const resolvedAdFormat = adFormat || (resolvedPoints >= 3 ? 'LONG' : 'SHORT');
        const result = await applyAdRewardPoints({
            userKey,
            points: resolvedPoints,
            rewardId,
            source,
            adFormat: resolvedAdFormat
        });

        // [V3 Support] If result has extended data, return it
        if (result.applied) {
            res.json({
                resultType: 'SUCCESS',
                data: result
            });
        } else {
            // Usually daily limit or already rewarded
            res.status(409).json({ resultType: 'FAIL', error: result.reason || 'ACTION_NOT_ALLOWED' });
        }
    } catch (error) {
        if (error.message === 'INVALID_POINTS_VALUE') {
            return res.status(400).json({ resultType: 'FAIL', error: error.message });
        }
        res.status(500).json({ resultType: 'FAIL', error: error.message });
    }
});

/**
 * [V2] POST /ad-reward/claim
 * 광고 리워드 통합 클레임 (adType: short/long)
 */
router.post('/ad-reward/claim', async (req, res) => {
    const { userKey, adType, rewardId } = req.body || {};
    if (!userKey || !adType) return res.status(400).json({
        resultType: 'FAIL',
        error: { code: 'MISSING_PARAMS', message: 'userKey와 adType이 필요합니다.' }
    });

    try {
        const result = await applyAdRewardClaim({ userKey, adType, rewardId });
        if (result.applied === false) {
            return res.status(409).json({
                resultType: 'FAIL',
                error: { code: result.reason || 'ACTION_NOT_ALLOWED', message: '이미 보상받았거나 처리할 수 없습니다.' }
            });
        }
        res.json({ resultType: 'SUCCESS', data: result });
    } catch (error) {
        res.status(500).json({
            resultType: 'FAIL',
            error: { code: 'INTERNAL_ERROR', message: error.message }
        });
    }
});

/**
 * POST /reward  ← 통합 광고 보상 단일 엔드포인트 (#1 Critical)
 *
 * 기존 3중 폴백(/api/user/reward/points → /api/v2/reward/activity → 로컬)을
 * 이 하나의 엔드포인트로 대체합니다. 기존 엔드포인트는 호환성 유지를 위해 유지됩니다.
 *
 * Body:
 *   - userKey       {string}  필수
 *   - activityType  {string}  AD_SHORT | AD_LONG | CONSULT (기본: AD_SHORT)
 *   - amount        {number}  클라이언트 제안값 (서버 검증 후 덮어씀)
 *   - adFormat      {string}  선택적 포맷 정보
 *   - idempotencyKey {string} 중복 호출 방지 UUID (권장)
 *
 * Response (정규화됨):
 *   {
 *     resultType: 'SUCCESS',
 *     data: {
 *       points,        ← 최종 잔액
 *       addedPoints,   ← 이번에 추가된 포인트
 *       tickets,       ← 최종 티켓 잔액
 *       message
 *     }
 *   }
 *
 * NOTE: 통합 핸들러는 위 POST /reward 에 있습니다.
 */
// (중복 제거: POST /reward 통합 핸들러는 파일 상단에 정의됨)

/**
 * [V2] GET /points
 * 사용자 포인트 현황 조회
 */
router.get('/points', async (req, res) => {
    const { userKey } = req.query;
    if (!userKey) return res.status(400).json({
        resultType: 'FAIL',
        error: { code: 'MISSING_USER_KEY', message: 'userKey가 필요합니다.' }
    });

    try {
        const data = await getUserPointsStatus(userKey);
        res.json({ resultType: 'SUCCESS', data });
    } catch (error) {
        const status = error.message === 'USER_NOT_FOUND' ? 404 : 500;
        res.status(status).json({
            resultType: 'FAIL',
            error: { code: error.message === 'USER_NOT_FOUND' ? 'USER_NOT_FOUND' : 'INTERNAL_ERROR', message: error.message }
        });
    }
});

/**
 * [V2] POST /points/convert
 * 포인트 -> 토스포인트 전환
 * Body: { userKey, points }
 * Response: { resultType, data: { usedPoints, newPoints, promotionCode, message } }
 */
router.post('/points/convert', async (req, res) => {
    const { userKey, points } = req.body || {};
    if (!userKey || points === undefined || points === null) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: { code: 'MISSING_PARAMS', message: 'userKey와 points가 필요합니다.' }
        });
    }

    try {
        const result = await convertPointsToTickets({ userKey, pointsToUse: points });
        return res.json({ resultType: 'SUCCESS', data: result });
    } catch (error) {
        const errorMap = {
            'INSUFFICIENT_POINTS': { status: 400, message: '포인트가 부족합니다.' },
            'USER_NOT_FOUND': { status: 404, message: '사용자를 찾을 수 없습니다.' },
            'INVALID_POINTS_AMOUNT': { status: 400, message: '포인트는 10의 배수여야 합니다.' },
            'POINTS_RACE_CONDITION': { status: 409, message: '포인트 잔액이 변경되었습니다. 다시 시도해주세요.' }
        };

        const errorInfo = errorMap[error.message] || { status: 500, message: '포인트 전환 처리 중 오류가 발생했습니다.' };
        const status = errorInfo.status;

        console.error(`[Points Convert] Error for ${userKey}:`, error.message);

        return res.status(status).json({
            resultType: 'FAIL',
            error: { code: error.message, message: errorInfo.message }
        });
    }
});

/**
 * POST /refund
 * 포인트 환급 신청 (토스 포인트 전환)
 */
router.post('/refund', async (req, res) => {
    const { userKey, amount, promotionCode } = req.body || {};
    if (!userKey || !amount) return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_PARAMS' });
    try {
        const result = await processRefund({ userKey, amount: Number(amount), promotionCode });
        res.json({ resultType: 'SUCCESS', ...result });
    } catch (error) {
        const knownErrors = new Set([
            'INVALID_REFUND_AMOUNT',
            'INVALID_REFUND_UNIT',
            'INSUFFICIENT_POINTS',
            'REFUND_BELOW_MIN_POINTS',
            'REFUND_ABOVE_MAX_POINTS',
            'REFUND_DISABLED',
            'INVALID_PROMOTION_CODE',
            'PROMOTION_CODE_NOT_ALLOWED',
            'USER_NOT_FOUND',
            'PROMOTION_PROVIDER_UNAVAILABLE' // Toss 실패 → 포인트 롤백 완료
        ]);
        const statusCode = knownErrors.has(error.message) ? 400 : 500;
        const errorMessages = {
            'PROMOTION_PROVIDER_UNAVAILABLE': '포인트 전환에 일시적인 오류가 발생했습니다. 포인트는 복구되었습니다. 잠시 후 다시 시도해 주세요.'
        };
        res.status(statusCode).json({
            resultType: 'FAIL',
            error: { code: error.message, message: errorMessages[error.message] || error.message }
        });
    }
});

/**
 * POST /share/reward/claim
 */
router.post('/share/reward/claim', async (req, res) => {
    const { userKey, tickets, shareId } = req.body || {};
    if (!userKey) return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_USER_KEY' });
    try {
        const result = await applyShareReward({ userKey, tickets: Number(tickets || 2), shareId });

        // Toss 공유 보상 프로모션 체크 (3원 등)
        let promotionResult = null;
        if (result.applied) {
            promotionResult = await checkAndClaimActivityReward(userKey, 'SHARE_REWARD');
        }

        res.json({
            resultType: 'SUCCESS',
            ...result,
            promotion: promotionResult
        });
    } catch (error) {
        res.status(500).json({ resultType: 'FAIL', error: error.message });
    }
});

/**
 * POST /log
 * 클라이언트 이벤트 직접 로깅 (예: AD_WATCH_START)
 */
router.post('/log', async (req, res) => {
    const {
        userKey,
        action,
        event,
        details,
        timestamp,
        platform,
        adType,
        variant,
        adGroupId,
        slotId,
        placementId,
        rewardType
    } = req.body || {};

    const incomingAction = action || event;
    if (!userKey || !incomingAction) {
        return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_PARAMS' });
    }

    try {
        const normalizedAction = normalizeActionName(incomingAction);
        const normalizedEvent = normalizeActionName(event || normalizedAction);

        const mergedDetails = {
            ...(details || {}),
            event: normalizedEvent,
            clientTimestamp: timestamp || null,
            platform: platform || (details && details.platform) || null,
            adType: adType || (details && details.adType) || null,
            variant: variant || (details && details.variant) || null,
            adGroupId: adGroupId || (details && details.adGroupId) || null,
            slotId: slotId || (details && details.slotId) || null,
            placementId: placementId || (details && details.placementId) || null,
            rewardType: rewardType || (details && details.rewardType) || null
        };

        const actionsToLog = new Set([normalizedAction]);
        if (normalizedEvent) actionsToLog.add(normalizedEvent);

        const allAliases = new Set();
        for (const actionName of Array.from(actionsToLog)) {
            const aliases = AD_ACTION_ALIAS_MAP[actionName] || [];
            aliases.forEach(alias => allAliases.add(alias));
        }
        allAliases.forEach(alias => actionsToLog.add(alias));

        for (const actionName of actionsToLog) {
            const aliasOf = actionName === normalizedAction
                ? null
                : ((AD_ACTION_ALIAS_MAP[normalizedAction] || []).includes(actionName) ? normalizedAction : null);

            await logUserAction(userKey, actionName, {
                ...mergedDetails,
                primaryAction: normalizedAction,
                actionFromEvent: normalizedEvent,
                aliasOf
            });
        }

        res.json({
            resultType: 'SUCCESS',
            success: true,
            data: {
                loggedAction: normalizedAction,
                loggedEvent: normalizedEvent,
                loggedActions: Array.from(actionsToLog),
                isStandardAdAction: STANDARD_AD_ACTIONS.has(normalizedAction)
            }
        });
    } catch (error) {
        res.status(500).json({ resultType: 'FAIL', error: error.message });
    }
});

export default router;

