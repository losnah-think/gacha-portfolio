import express from 'express';
import { firestore } from '../../lib/firebaseAdmin.js';
import { getKstDateKey, logUserAction, loadAndSyncUserMetadata, getZodiacSign, getTicketBalance } from '../../utils/helpers.js';
import { enrichZodiacFortuneSections, generateZodiacFortune } from '../../services/aiGenerator.js';
import { deductTicket } from '../../services/userService.js';
import { PROMOTION_CONFIG } from '../../config/promotion.js';
import { claimUserPromotionInternal } from '../../services/promotionService.js';
import { normalizeStorageItem } from '../media/storage.js';
import { getDailyZodiacRanking } from '../../services/gachaService.js';

const router = express.Router();

/**
 * POST /api/v2/fortune/zodiac
 * 별자리 운세 생성 API
 */
router.post('/zodiac', async (req, res) => {
    const { userKey, zodiacSign, category } = req.body;
    const fortuneCategory = category || 'total';

    // KST 시간대 기준으로 18시 이후인지 체크
    const now = new Date();
    const kstTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const kstHour = kstTime.getHours();

    let targetDateKey = getKstDateKey(kstTime);
    let isTomorrow = false;

    // 18시 이후면 내일의 운세를 타겟으로 함
    if (kstHour >= 18) {
        const tomorrow = new Date(kstTime);
        tomorrow.setDate(tomorrow.getDate() + 1);
        targetDateKey = getKstDateKey(tomorrow);
        isTomorrow = true;
    }

    try {
        // 1. 유저 메타데이터 및 별자리 먼저 확정
        const userMetadata = await loadAndSyncUserMetadata(userKey, req.body);
        const targetZodiac = zodiacSign || getZodiacSign(userMetadata.birthdate);

        // 2. 확정된 별자리와 날짜+카테고리로 이미 생성된 운세가 있는지 확인
        // 카테고리 지정 시: category 필드 매칭, 전체운(total): category 없는 기존 문서도 포함
        let existingSnap;
        if (fortuneCategory !== 'total') {
            existingSnap = await firestore.collection('fortunes')
                .where('userKey', '==', String(userKey))
                .where('zodiacSign', '==', targetZodiac)
                .where('date', '==', targetDateKey)
                .where('category', '==', fortuneCategory)
                .limit(1)
                .get();
        } else {
            // 전체운: category=='total' 또는 category 필드 없는 기존 문서 모두 검색
            const snap1 = await firestore.collection('fortunes')
                .where('userKey', '==', String(userKey))
                .where('zodiacSign', '==', targetZodiac)
                .where('date', '==', targetDateKey)
                .where('category', '==', 'total')
                .limit(1)
                .get();
            if (!snap1.empty) {
                existingSnap = snap1;
            } else {
                // 기존 문서(category 필드 없음) 호환
                const snap2 = await firestore.collection('fortunes')
                    .where('userKey', '==', String(userKey))
                    .where('zodiacSign', '==', targetZodiac)
                    .where('date', '==', targetDateKey)
                    .limit(1)
                    .get();
                // category 필드가 없거나 'total'인 문서만 매칭
                const legacyDoc = snap2.docs.find(d => !d.data().category || d.data().category === 'total');
                existingSnap = legacyDoc ? { empty: false, docs: [legacyDoc] } : { empty: true, docs: [] };
            }
        }

        if (!existingSnap.empty) {
            const doc = existingSnap.docs[0];
            const docData = { ...doc.data() };

            // 캐시 데이터에도 금지 표현 sanitization 적용
            const BANNED_PHRASE = /(?:알\s*수\s*없는\s*)?(?:조언가|점술가|전문가|운세사|선생님)[^,\n]*[,]?\s*/gi;
            if (docData.summary) docData.summary = docData.summary.replace(BANNED_PHRASE, '').trim();
            if (docData.content) docData.content = docData.content.replace(BANNED_PHRASE, '').trim();

            // [FIX] 오늘의 운세 "종합" 1일 1티켓 정책:
            // 같은 날 이미 생성된 운세(캐시) 재조회는 티켓을 추가 차감하지 않는다.
            // (생성 시점에만 1장 차감 — 아래 신규 생성 경로 참고)
            const cachedUserSnap = await firestore.collection('users').doc(String(userKey)).get();
            const currentTickets = getTicketBalance(cachedUserSnap.exists ? cachedUserSnap.data() : {});

            // [추가] 오늘의/내일의 운세 확인 프로모션 자동 지급 시도
            let promotionResult = null;

            let promoCode = PROMOTION_CONFIG.FORTUNE_LIVE_CODE || PROMOTION_CONFIG.FORTUNE_TEST_CODE;
            if (isTomorrow) {
                // 내일의 운세일 경우 전용 코드 사용
                promoCode = PROMOTION_CONFIG.TOMORROW_FORTUNE_LIVE_CODE || PROMOTION_CONFIG.TOMORROW_FORTUNE_TEST_CODE;
            }

            if (promoCode && promoCode !== 'TEST_PLACEHOLDER_CODE') {
                try {
                    promotionResult = await claimUserPromotionInternal(userKey, promoCode);
                    console.log(`[fortune/zodiac] Auto-promotion claim success for ${userKey} (Tomorrow: ${isTomorrow})`);
                } catch (pe) {
                    // 이미 받았거나 예산 소진 등은 조용히 넘어감
                }
            }

            const enrichedDocData = enrichZodiacFortuneSections(docData, {
                isTomorrow,
                fixedScore: docData.score ?? docData.ratings?.total?.score,
                category: fortuneCategory
            });

            return res.json({
                resultType: 'SUCCESS',
                // [FIX §2.2] 프론트(App.tsx:1565)가 json.data.tickets(현재 절대 티켓)를 읽으므로 포함
                // 재조회는 차감이 없으므로 현재 잔액을 그대로 반환
                data: { ...normalizeStorageItem({ id: doc.id, ...enrichedDocData }, 'fortune'), tickets: currentTickets },
                tickets: currentTickets,
                isExisting: true,
                isTomorrow,
                targetDate: targetDateKey,
                promotion: promotionResult
            });
        }

        // 3. 없으면 새로 생성 진행 (티켓 차감)
        const ticketResult = await deductTicket(userKey);

        // AI 생성 (내일의 운세 여부 전달 + 결정적 점수 전달)
        const dailyRankings = getDailyZodiacRanking(targetDateKey);
        const zodiacLuck = dailyRankings.find(r => r.sign === targetZodiac);
        const fixedScore = zodiacLuck ? zodiacLuck.score : null;

        const fortune = await generateZodiacFortune(targetZodiac, userMetadata, isTomorrow, fixedScore, fortuneCategory);

        const fortuneData = {
            userKey: String(userKey),
            type: 'zodiac_fortune',
            rarity: 'normal',
            zodiacSign: targetZodiac,
            date: targetDateKey,
            category: fortuneCategory,
            isTomorrow,
            ...enrichZodiacFortuneSections(fortune, {
                isTomorrow,
                fixedScore,
                category: fortuneCategory
            }),
            // [FIX] '알 수 없는 조언가' 유출 방지 — 오늘의 운세 페르소나 명시
            personaName: '오늘의 운세',
            persona: '오늘의 운세',
            createdAt: new Date().toISOString(),
            timestamp: Date.now(),
            imageUrl: 'images/personas/daily_fortune.png' // Default daily fortune persona image
        };

        const docRef = await firestore.collection('fortunes').add(fortuneData);

        await logUserAction(userKey, 'GENERATE_ZODIAC_FORTUNE', {
            zodiacSign,
            id: docRef.id
        });

        // [추가] 오늘의/내일의 운세 확인 프로모션 자동 지급 시도 (신규 생성 시)
        let promotionResult = null;

        let promoCode = PROMOTION_CONFIG.FORTUNE_LIVE_CODE || PROMOTION_CONFIG.FORTUNE_TEST_CODE;
        if (isTomorrow) {
            promoCode = PROMOTION_CONFIG.TOMORROW_FORTUNE_LIVE_CODE || PROMOTION_CONFIG.TOMORROW_FORTUNE_TEST_CODE;
        }

        if (promoCode && promoCode !== 'TEST_PLACEHOLDER_CODE') {
            try {
                promotionResult = await claimUserPromotionInternal(userKey, promoCode);
                console.log(`[fortune/zodiac] Auto-promotion claim success (NEW) for ${userKey} (Tomorrow: ${isTomorrow})`);
            } catch (pe) { }
        }

        res.json({
            resultType: 'SUCCESS',
            // [FIX §2.2] 프론트가 json.data.tickets를 읽으므로 포함
            data: { ...normalizeStorageItem({ id: docRef.id, ...fortuneData }, 'fortune'), tickets: ticketResult.tickets },
            tickets: ticketResult.tickets,
            promotion: promotionResult
        });
    } catch (error) {
        if (error.message === 'INSUFFICIENT_TICKETS') {
            return res.status(403).json({
                resultType: 'FAIL',
                // [FIX §2.2] 프론트(App.tsx:1633)가 json.error?.code / json.error?.message 를 읽으므로 객체로 반환
                error: {
                    code: 'INSUFFICIENT_TICKETS',
                    message: '티켓이 부족해요! 상점에서 티켓을 구매하거나, 광고를 시청해서 충전해보세요.'
                },
                currentTickets: error.currentTickets ?? 0,
                purchaseRequired: true,
                actions: [
                    { type: 'NAVIGATE', target: '/shop', label: '상점으로 이동' },
                    { type: 'NAVIGATE', target: '/reward', label: '광고 시청하기' },
                ]
            });
        }
        console.error('Fortune generation failed:', error);
        res.status(500).json({ resultType: 'FAIL', error: { code: 'FORTUNE_GEN_FAILED', message: '운세 생성에 실패했어요. 잠시 후 다시 시도해 주세요.' } });
    }
});

// ─── Fortune Config Cache ─────────────────────────────────────────────────────
const DEFAULT_PERSONA_ID = 'daily_일상_운세';
const DEFAULT_CONFIG = {
    categoryPersonaMap: {
        total:    'daily_일상_운세',
        love:     'daily_일상_운세',
        wealth:   'daily_일상_운세',
        business: 'daily_일상_운세',
        health:   'daily_일상_운세',
        exam:     'daily_일상_운세',
    },
    defaultPersonaId: DEFAULT_PERSONA_ID,
};
let _fortuneConfigCache = null;
let _fortuneConfigCachedAt = 0;
const FORTUNE_CONFIG_TTL_MS = 10 * 60 * 1000; // 10분

/**
 * GET /api/v2/fortune/config
 * 운세 카테고리별 페르소나 매핑 설정 반환
 */
router.get('/config', async (req, res) => {
    const now = Date.now();

    // 캐시 유효 시 바로 반환
    if (_fortuneConfigCache && (now - _fortuneConfigCachedAt) < FORTUNE_CONFIG_TTL_MS) {
        return res.json({ resultType: 'SUCCESS', data: _fortuneConfigCache });
    }

    try {
        const snap = await firestore.collection('config').doc('fortune').get();

        if (!snap.exists) {
            return res.status(404).json({
                resultType: 'FAIL',
                data: null,
                error: { code: 'CONFIG_NOT_FOUND', message: '운세 설정을 불러올 수 없습니다' },
            });
        }

        const { categoryPersonaMap, defaultPersonaId } = snap.data();
        const config = {
            categoryPersonaMap: categoryPersonaMap || DEFAULT_CONFIG.categoryPersonaMap,
            defaultPersonaId: defaultPersonaId || DEFAULT_PERSONA_ID,
        };

        _fortuneConfigCache = config;
        _fortuneConfigCachedAt = now;

        return res.json({ resultType: 'SUCCESS', data: config });
    } catch (error) {
        console.error('[fortune/config] 설정 조회 실패:', error);
        // Firestore 오류 시 기본값 fallback
        return res.json({ resultType: 'SUCCESS', data: DEFAULT_CONFIG });
    }
});

export default router;
