import express from 'express';
import { firestore } from '../../lib/firebaseAdmin.js';
import { getDailyRewardProgress, getRewardProfile, getProbabilityBoost } from '../../services/userService.js';
import { PROMOTION_CONFIG } from '../../config/promotion.js';
import { GACHA_PROMOTION_CONFIG } from '../../config/gachaPromotion.js';
import { safeNickname, getKstDateKey } from '../../utils/helpers.js';
import { resolveImageUrl, getPersonaImagePath, PERSONA_IMAGE_MAP } from '../../utils/imageUrl.js';
import { generateSpell } from '../../services/contentGeneratorService.js';

const router = express.Router();

// ─── 최적화 #1: personas / situations 인메모리 캐시 (5분 TTL) ────────────────
// personas/situations는 거의 바뀌지 않으므로 서버 메모리에 캐싱.
// DAU 1676명 기준 bootstrap 1,369회 × 161 reads 절감 = ~220K reads/일 절약
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분
let _personasCache = null;
let _personasCacheAt = 0;
let _situationsCache = null;
let _situationsCacheAt = 0;

async function getCachedPersonas() {
    const now = Date.now();
    if (_personasCache && now - _personasCacheAt < CACHE_TTL_MS) {
        return _personasCache;
    }
    const snap = await firestore.collection('personas').where('isActive', '!=', false).get();
    _personasCache = snap;
    _personasCacheAt = now;
    return snap;
}

async function getCachedSituations() {
    const now = Date.now();
    if (_situationsCache && now - _situationsCacheAt < CACHE_TTL_MS) {
        return _situationsCache;
    }
    const snap = await firestore.collection('situations').where('isActive', '!=', false).get();
    _situationsCache = snap;
    _situationsCacheAt = now;
    return snap;
}

// 캐시 강제 갱신 (admin API 등에서 호출 가능)
export const invalidateBootstrapCache = () => {
    _personasCacheAt = 0;
    _situationsCacheAt = 0;
};

// ─── 최적화 #2: 필요한 프로모션 코드만 읽기 ────────────────────────────────────
// 전체 claimed_promotions 대신, 현재 활성 프로모션 코드만 조회 (평균 10 → ~5건)
function getActivePromoCodes() {
    const codes = new Set();
    const activityPromos = GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS || {};
    Object.values(activityPromos).forEach(cfg => {
        if (cfg.active && cfg.promotionCode) codes.add(cfg.promotionCode);
    });
    if (PROMOTION_CONFIG.REFUND_PROMOTION_CODE) codes.add(PROMOTION_CONFIG.REFUND_PROMOTION_CODE);
    return Array.from(codes);
}

router.get('/', async (req, res) => {
    const { userKey } = req.query;
    if (!userKey) {
        return res.status(400).json({
            resultType: 'FAIL',
            error: { code: 'MISSING_USER_KEY', message: 'userKey가 필요합니다.' }
        });
    }

    try {
        const userRef = firestore.collection('users').doc(String(userKey));
        const today = getKstDateKey();
        const missionRef = userRef.collection('daily_missions').doc(today);

        // 활성 프로모션 코드만 사용하여 개별 doc 읽기 (전체 컬렉션 읽기 방지)
        const activePromoCodes = getActivePromoCodes();
        const claimDocReads = activePromoCodes.map(code =>
            userRef.collection('claimed_promotions').doc(code).get()
        );

        const [
            userSnap,
            personasSnap,
            situationsSnap,
            missionSnap,
            rewardProfileResult,
            dailyProgressResult,
            probabilityResult,
            ...claimSnaps
        ] = await Promise.allSettled([
            userRef.get(),
            getCachedPersonas(),     // ← 캐시
            getCachedSituations(),   // ← 캐시
            missionRef.get(),
            getRewardProfile(userKey).catch(() => null),
            getDailyRewardProgress(userKey).catch(() => null),
            getProbabilityBoost(userKey).catch(() => null),
            ...claimDocReads,        // ← 전체 컬렉션 대신 개별 doc
        ]);

        // spell은 실패해도 bootstrap 전체를 블로킹하지 않도록 별도 호출
        const spellResult = await generateSpell(userKey).catch(() => null);

        // claimed codes 집계 (개별 doc 방식)
        const claimedCodes = new Set();
        claimSnaps.forEach((snap, i) => {
            if (snap.status === 'fulfilled' && snap.value.exists) {
                claimedCodes.add(activePromoCodes[i]);
            }
        });

        const personas = [];
        if (personasSnap.status === 'fulfilled') {
            personasSnap.value.forEach(doc => {
                const d = doc.data();
                const rawImg = PERSONA_IMAGE_MAP[doc.id] || d.imageUrl || d.image_url || getPersonaImagePath(doc.id);
                const resolvedImg = resolveImageUrl(rawImg);
                personas.push({
                    id: doc.id,
                    name: d.name || '',
                    description: d.description || d.desc || '',
                    desc: d.description || d.desc || '',           // legacy alias
                    category: d.v3Group || d.category || 'advice',
                    imageUrl: resolvedImg,
                    icon: resolvedImg,
                    priority: d.priority || 0,
                });
            });
            personas.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        }

        // ─── 상황 ────────────────────────────────────────────────
        const situations = [];
        if (situationsSnap.status === 'fulfilled') {
            situationsSnap.value.forEach(doc => {
                situations.push({ id: doc.id, ...doc.data() });
            });
        }

        // ─── 사용자 데이터 ─────────────────────────────────────────────
        const userData = userSnap.status === 'fulfilled' && userSnap.value.exists
            ? userSnap.value.data()
            : {};

        const user = {
            tickets: userData.tickets || 0,
            points: userData.points ?? userData.currentPoints ?? 0,
            pointCount: userData.points ?? userData.currentPoints ?? 0,
            currentPoints: userData.points ?? userData.currentPoints ?? 0,
            balancePoints: userData.points ?? userData.currentPoints ?? 0,
            level: userData.characterLevel || userData.level || 1,
            exp: userData.characterExp || userData.exp || 0,
            nickname: await safeNickname(userData.nickname, userKey),
            grade: userData.gachaGrade || userData.grade || 'normal',
            pullCount: userData.pullCount || 0,
            attendanceCount: userData.attendanceCount || 0,
        };

        // ─── 미션 데이터 ──────────────────────────────
        const mData = (missionSnap.status === 'fulfilled' && missionSnap.value.exists)
            ? missionSnap.value.data()
            : { chatted_personas: [], checked_categories: [] };

        // ─── 프로모션 ─────────────────────────────────────────────

        const promotionList = Object.entries(GACHA_PROMOTION_CONFIG.ACTIVITY_PROMOTIONS || {})
            .filter(([, cfg]) => cfg.active)
            .map(([key, cfg]) => {
                const goal = cfg.goal || 1;
                let current = 0;

                if (key.includes('ATTENDANCE')) {
                    const goalDays = cfg.goal || 0;
                    current = goalDays <= 10
                        ? (userData.consecutiveLoginDays || 0)
                        : (userData.attendanceCount || 0);
                } else if (cfg.type === 'chat') {
                    current = mData.chatted_personas.includes(cfg.personaId) ? 1 : 0;
                } else if (cfg.type === 'check') {
                    current = mData.checked_categories.includes(cfg.category) ? 1 : 0;
                } else if (cfg.type === 'milestone') {
                    if (key === 'GACHA_CARD_DIAMOND') current = userData.diamondCount ? 1 : 0;
                    else if (key === 'GACHA_CARD_PLATINUM') current = userData.platinumCount ? 1 : 0;
                    else current = userData.pullCount || 0;
                } else if (key.includes('PULL') || key.includes('ADVICE') || key.includes('GACHA')) {
                    current = userData.pullCount || 0;
                } else if (key.includes('CHAT')) {
                    current = userData.chatCount || 0;
                } else if (key.includes('LOTTO')) {
                    current = userData.lottoCount || 0;
                }

                const isClaimed = claimedCodes.has(cfg.promotionCode);
                const isCompleted = current >= goal;
                const status = isClaimed ? 'CLAIMED' : (isCompleted ? 'READY' : 'PROGRESS');

                return {
                    id: key,
                    title: cfg.title,
                    description: cfg.description,
                    goal,
                    current: Math.min(current, goal),
                    isCompleted,
                    isClaimed,
                    status,
                    promotionCode: cfg.promotionCode,
                };
            });

        const promotionProgress = {
            pullCount: userData.pullCount || 0,
            lottoCount: userData.lottoCount || 0,
            attendanceCount: userData.attendanceCount || 0,
            chatCount: userData.chatCount || 0,
        };

        // ─── 리워드 ───────────────────────────────────────────────
        const reward = {
            profile: rewardProfileResult.status === 'fulfilled' ? rewardProfileResult.value : null,
            daily: dailyProgressResult.status === 'fulfilled' ? dailyProgressResult.value : null,
            probability: probabilityResult.status === 'fulfilled' ? probabilityResult.value : null,
        };

        // [FIX] 사용자별 데이터는 CDN 캐시 금지 (포인트 등 실시간 잔액 정합성)
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        return res.json({
            resultType: 'SUCCESS',
            data: {
                user,
                personas,
                situations,
                promotions: {
                    list: promotionList,
                    progress: promotionProgress,
                    refundCode: PROMOTION_CONFIG.REFUND_PROMOTION_CODE || null,
                },
                reward,
                spell: spellResult || null,
            },
        });

    } catch (error) {
        console.error('[Bootstrap] Error:', error);
        return res.status(500).json({
            resultType: 'FAIL',
            error: { code: 'BOOTSTRAP_FAILED', message: error.message }
        });
    }
});

export default router;
