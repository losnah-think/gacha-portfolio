/**
 * [Phase 2 / 3] Reward Router
 * Base: /api/v2/reward
 *
 * POST /activity      — 광고/상담 활동 적재 (포인트 + EXP + 레벨)
 * GET  /profile       — 리워드 프로필 조회
 * GET  /probability   — 가차 확률 보정 조회 [Phase 3]
 */
import express from 'express';
import { applyRewardActivity, getRewardProfile, getProbabilityBoost } from '../../services/userService.js';
import { AD_CONFIG } from '../../config/adConfig.js';
import { getTicketBalance, getUserDocRef } from '../../utils/helpers.js';

const router = express.Router();

// ──────────────────────────────────────────────────────────────
// 에러 코드 → HTTP 상태 코드 매핑
// ──────────────────────────────────────────────────────────────
const ERROR_STATUS_MAP = {
    INVALID_ACTIVITY_TYPE: 400,
    REWARD_ACTIVITY_DUPLICATED: 409,
    USER_NOT_FOUND: 404,
    PROBABILITY_PROFILE_NOT_FOUND: 404,
    INVALID_USER_KEY: 400,
    BOOST_RULE_NOT_CONFIGURED: 500,
    RATE_LIMIT_EXCEEDED: 429,
};

const toErrorResponse = (code, message) => ({
    resultType: 'FAIL',
    error: { code, message: message || code }
});

/**
 * GET /api/v2/reward/config
 * 리워드 정책(활동별 포인트/티켓 점수 및 텍스트) 반환
 */
router.get('/config', (req, res) => {
    // 캐시 허용 여부: 프론트에서 캐싱하므로 서버는 적절히 Cache-Control 헤더만 내려줘도 무방,
    // 우선 항상 최신 값 가져가도록 no-cache 적용할 수도 있지만, 정적인 편이므로 캐시 허용.
    // 여기서는 최신 반영이 바로 되도록 no-cache (요청대로) 설정하거나 기본 동작을 둡니다.
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    return res.json({
        resultType: 'SUCCESS',
        data: {
            activities: {
                AD_SHORT: {
                    label: '티켓 1장',
                    description: '약 5초 · 티켓 바로 적립',
                    points: 0,
                    tickets: 1,
                    exp: 3
                },
                AD_LONG: {
                    label: '2P',
                    description: '약 15~30초 · 더 많이 쌓여요',
                    points: 2,
                    tickets: 0,
                    exp: 15
                },
                AD_TICKET: {
                    label: '광고 보고 티켓 받기',
                    description: '짧은 영상 보고 티켓 1장을 받아요',
                    points: 0,
                    tickets: 1,
                    exp: 0
                },
                GACHA_PULL: {
                    points: 1,
                    tickets: 0,
                    exp: 5
                },
                CONSULT: {
                    points: 0,
                    tickets: 0,
                    exp: 15
                }
            },
            adConfig: AD_CONFIG,
            conversion: {
                minPoints: 10,
                unit: 10
            }
        }
    });
});

/**
 * POST /api/v2/reward/activity
 * 광고 시청 / 상담 완료 활동 적재
 *
 * Body:
 *   - userKey       {string} 필수
 *   - activityType  {string} AD_SHORT | AD_LONG | CONSULT
 *   - amount        {number} 클라이언트 제안 포인트 (서버가 검증 후 덮어씀)
 *   - idempotencyKey {string} 중복 호출 방지 UUID (선택)
 */
router.post('/activity', async (req, res) => {
    const { userKey, activityType, amount, adFormat, idempotencyKey, adVerification } = req.body || {};

    if (!userKey) {
        return res.status(400).json(toErrorResponse('MISSING_PARAMS', 'userKey가 필요합니다.'));
    }
    if (!activityType) {
        return res.status(400).json(toErrorResponse('MISSING_PARAMS', 'activityType이 필요합니다.'));
    }

    try {
        const raw = await applyRewardActivity({
            userKey,
            activityType,
            amount,
            adFormat,
            idempotencyKey,
            adVerification,
        });

        const points = raw.currentPoints ?? raw.points ?? raw.balancePoints ?? 0;
        const data = {
            ...raw,
            points,
            pointCount: points,
            currentPoints: points,
            balancePoints: points,
            addedPoints: raw.addedPoints ?? raw.grantedPoints ?? raw.pointsAdded ?? (amount || 0),
            grantedPoints: raw.addedPoints ?? raw.grantedPoints ?? raw.pointsAdded ?? (amount || 0),
        };

        return res.json({ resultType: 'SUCCESS', data });

    } catch (error) {
        const code = error.code || error.message || 'INTERNAL_ERROR';
        const status = ERROR_STATUS_MAP[code] || 500;
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
        return res.status(status).json(toErrorResponse(code, error.message));
    }
});

/**
 * GET /api/v2/reward/profile
 * 리워드 프로필 조회 (탭 진입 / 로그인 직후 호출)
 *
 * Query:
 *   - userKey {string} 필수
 */
router.get('/profile', async (req, res) => {
    const { userKey } = req.query;

    if (!userKey) {
        return res.status(400).json(toErrorResponse('MISSING_PARAMS', 'userKey가 필요합니다.'));
    }

    // 캐시 비허용 (항상 최신 수치 반환)
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    try {
        const data = await getRewardProfile(userKey);
        return res.json({ resultType: 'SUCCESS', data });

    } catch (error) {
        const code = error.code || error.message || 'INTERNAL_ERROR';
        const status = ERROR_STATUS_MAP[code] || 500;
        return res.status(status).json(toErrorResponse(code, error.message));
    }
});

/**
 * GET /api/v2/reward/probability
 * 가차 확률 보정 수치 조회 [Phase 3]
 *
 * Query:
 *   - userKey {string} 필수
 *
 * Response data:
 *   diamondBoostPct   — diamond 확률 상승분 (percentage point)
 *   platinumBoostPct  — platinum 확률 상승분 (percentage point)
 *   rarityWeights     — 최종 5등급 가중치 (합 = 1.0)
 *   characterLevel, characterExp, expToNext
 */
router.get('/probability', async (req, res) => {
    const { userKey } = req.query;

    if (!userKey) {
        return res.status(400).json(toErrorResponse('INVALID_USER_KEY', 'userKey가 필요합니다.'));
    }

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    try {
        const data = await getProbabilityBoost(userKey);
        return res.json({ resultType: 'SUCCESS', data });

    } catch (error) {
        const code = error.code || error.message || 'INTERNAL_ERROR';
        const status = ERROR_STATUS_MAP[code] || 500;
        return res.status(status).json(toErrorResponse(code, error.message));
    }
});

export default router;
