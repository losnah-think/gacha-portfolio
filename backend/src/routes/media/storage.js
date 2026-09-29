import express from 'express';
import { firestore } from '../../lib/firebaseAdmin.js';
import { logSystemEvent } from '../../utils/logger.js';
import { getKstDateKey, makeSnippet } from '../../utils/helpers.js';
import { resolveImageUrl, getPersonaImagePath, PERSONA_IMAGE_MAP, CANONICAL_PERSONA_MAP, PERSONA_NAME_MAP } from '../../utils/imageUrl.js';

const router = express.Router();

// ─── 캐릭터 컬렉션에 표시할 허용 캐릭터 목록 ─────────────────────────────
// personaId(canonical) 기준. 여기 없으면 캐릭터 컬렉션에 노출 안 됨.
const ALLOWED_COLLECTION_PERSONAS = new Set([
    'socrates',                   // 소크라테스
    'grandmother',                // 할머니
    'nano_banana',                // 나노 바나나
    'healing_단골_카페_사장님',     // 단골 카페 사장님
    'seollal_moon',               // 설날 보름달
    'king_sejong',                // 세종대왕
    'yi_sun_shin',                // 이순신
    'grandfather',                // 할아버지
    'lotto_generator',            // 로또번호 추첨기
    'v3_lucy',                    // 연애상담사 루시
    'v3_lucky7',                  // 잭팟 슬롯 럭키세븐
    'v3_cupid',                   // 사랑의 요정 큐피트
    'v3_gachabot',                // 가차 마스터 가차트론
    'v3_pachinko',                // 빠찡코 로봇 파치
    'grandson',                   // 손자
    'steve_jobs',                 // 스티브 잡스
    'granddaughter',              // 손녀
    'cat',                        // 길고양이
    'dog',                        // 충직한 진돗개
    'situation_잔소리꾼_엄마',     // 잔소리꾼 엄마
    'family_우리_아빠',            // 우리 아빠
    'taxi',                       // 수다쟁이 택시기사
    'mystic_fortune_teller',      // 타로 점술가
]);
// ─────────────────────────────────────────────────────────────────────────────

// ─── In-memory cache for /summary (per userKey, TTL: 60초) ───────────────────
// /summary 는 9개의 Firestore 쿼리를 병렬로 실행하므로 비용이 크다.
// 가챠 뽑기 이후 Cache-Control: no-cache 헤더를 내려주거나
// 별도로 invalidateSummaryCache(userKey)를 호출하면 즉시 무효화됨.
const _summaryCache = new Map(); // userKey → { data, expiresAt }
const SUMMARY_TTL_MS = 10 * 60_000; // 10분 (invalidateSummaryCache로 즉시 무효화 가능)

/**
 * 이미지가 유효한지 확인 (이모지만 있거나 이미지 없는 경우 제외)
 * @param {string} imageUrl
 * @returns {boolean}
 */
const hasValidImage = (imageUrl) => {
    if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim() === '') {
        return false;
    }

    // 이모지만 포함된 경우 제외 (이모지는 보통 단일 유니코드 문자)
    const trimmedUrl = imageUrl.trim();
    // 만약 URL이 5자 이하이거나, https://example.invalid https://example.invalid 포함하지 않으면 이미지 없는 것으로 판단
    if (trimmedUrl.length < 5 || (!trimmedUrl.includes('http://') && !trimmedUrl.includes('https://'))) {
        return false;
    }

    return true;
};

/**
 * 유효한 이미지를 가진 항목만 필터링
 * @param {array} items
 * @returns {array}
 */
const filterValidImages = (items) => {
    return items.filter(item => hasValidImage(item.imageUrl));
};


export const invalidateSummaryCache = (userKey) => {
    _summaryCache.delete(String(userKey));
};
// ─────────────────────────────────────────────────────────────────────────────

const normalizeGradeKey = (value) => {
    const normalized = String(value ?? 'NORMAL').trim().toUpperCase();
    const allowed = new Set(['DIAMOND', 'PLATINUM', 'GOLD', 'SILVER', 'NORMAL']);
    if (allowed.has(normalized)) return normalized;

    return 'NORMAL';
};

/**
 * Super Normalizer for any history item (advice, fable, fortune, zodiac)
 */
export const normalizeStorageItem = (docOrData, defaultType = 'advice') => {
    const data = typeof docOrData.data === 'function' ? docOrData.data() : docOrData;
    const item = { id: docOrData.id || data.id, ...data };

    if (!item.type) item.type = defaultType;

    let finalCreatedAt = item.createdAt;
    let dateObj = new Date();
    try {
        if (finalCreatedAt && typeof finalCreatedAt.toDate === 'function') {
            dateObj = finalCreatedAt.toDate();
        } else if (finalCreatedAt) {
            const d = new Date(finalCreatedAt);
            if (!isNaN(d.getTime())) dateObj = d;
        } else if (item.timestamp && typeof item.timestamp === 'number') {
            dateObj = new Date(item.timestamp);
        } else if (item.timestamp) {
            const d = new Date(item.timestamp);
            if (!isNaN(d.getTime())) dateObj = d;
        }
    } catch (e) { }

    const normalizedISO = dateObj.toISOString();
    const unixMs = dateObj.getTime();

    item.createdAt = normalizedISO;
    item.timestamp = unixMs; // [Rule 1] Unix Milliseconds

    // Critical: Ensure date always exists in YYYY-MM-DD
    if (!item.date || String(item.date).includes('NaN')) {
        item.date = normalizedISO.split('T')[0];
    }

    // Universal Date Aliases
    const cleanDate = String(item.date);
    const dotDate = cleanDate.replace(/-/g, '. '); // "2026. 02. 05"

    item.displayDate = cleanDate;
    item.regDate = cleanDate;
    item.itemDate = cleanDate;
    item.date_str = cleanDate;
    item.reg_date = cleanDate;
    item.display_date = cleanDate;
    item.item_date = cleanDate;
    item.formattedDate = dotDate;
    item.dateText = dotDate;

    // Legacy/Ancient aliases
    item.regDateFormatted = dotDate;
    item.created_at = normalizedISO;

    // Provide pseudo-timestamp for clients expecting Firestore objects
    item.createdAt_ts = { _seconds: Math.floor(dateObj.getTime() / 1000), _nanoseconds: (dateObj.getTime() % 1000) * 1e6 };

    // [Rule 3] Rarity (Grade) - Lowercase Essential
    const normalizedGrade = normalizeGradeKey(item.grade ?? item.rarity);
    item.rarity = normalizedGrade.toLowerCase();
    item.grade = normalizedGrade; // Maintain legacy Uppercase

    // [FIX] 타입별 기본 페르소나명 — fortune은 '알 수 없는 조언가' 대신 '오늘의 운세'
    const defaultPersonaName = (item.type === 'fable' || defaultType === 'fable')
        ? '지혜로운 이솝'
        : (item.type === 'zodiac_fortune' || defaultType === 'fortune')
            ? '오늘의 운세'
            : '알 수 없는 조언가';

    if (!item.personaId) {
        item.personaId = item.persona || item.itemPersona || item.personaName || defaultPersonaName;
    }

    const normalizePersonaAlias = (value) => {
        if (!value || typeof value !== 'string') return value;
        return value
            .trim()
            .replace(/^fortune[\s_]+/i, '')
            .replace(/\s+/g, ' ');
    };

    const normalizedPersonaId = normalizePersonaAlias(item.personaId);
    const normalizedPersonaName = normalizePersonaAlias(item.personaName);
    const normalizedPersona = normalizePersonaAlias(item.persona);

    // [New Rule] Canonical ID Mapping for Discovery Sync
    // Ensures that even if saved as Korean name, it maps to the correct snake_case ID for discovery screen parity
    if (CANONICAL_PERSONA_MAP[item.personaId]) {
        item.personaId = CANONICAL_PERSONA_MAP[item.personaId];
    } else if (CANONICAL_PERSONA_MAP[normalizedPersonaId]) {
        item.personaId = CANONICAL_PERSONA_MAP[normalizedPersonaId];
    } else if (CANONICAL_PERSONA_MAP[item.personaName]) {
        item.personaId = CANONICAL_PERSONA_MAP[item.personaName];
    } else if (CANONICAL_PERSONA_MAP[normalizedPersonaName]) {
        item.personaId = CANONICAL_PERSONA_MAP[normalizedPersonaName];
    } else if (CANONICAL_PERSONA_MAP[item.persona]) {
        item.personaId = CANONICAL_PERSONA_MAP[item.persona];
    } else if (CANONICAL_PERSONA_MAP[normalizedPersona]) {
        item.personaId = CANONICAL_PERSONA_MAP[normalizedPersona];
    }

    if (PERSONA_NAME_MAP[item.personaId]) {
        item.personaName = PERSONA_NAME_MAP[item.personaId];
    }

    // [Rule 2] Force Full URL Resolution (User Request: "Show images at all costs")
    const mappedPath = getPersonaImagePath(item.personaId);
    let currentUrl = item.imageUrl || '';

    // If no specific URL or if it's a generic ID-based path, use the mapped path
    const isGenericOrMissing = !currentUrl || currentUrl === '' || currentUrl.includes(item.personaId) || currentUrl.includes('null');

    if (isGenericOrMissing || PERSONA_IMAGE_MAP[item.personaId]) {
        currentUrl = mappedPath;
    }

    // Resolve to Full URL
    item.imageUrl = resolveImageUrl(currentUrl);


    // Ensure image_url alias (always matches imageUrl)
    item.image_url = item.imageUrl;
    item.icon = item.imageUrl;

    // [New Rule] Reward Status differentiation
    // If rewardStatus exists in DB, use it; otherwise infer for compatibility
    if (!item.rewardStatus) {
        if (item.hasReward || item.promotionAmount > 0) {
            item.rewardStatus = 'CLAIMED';
        } else if (item.isRewardEligible || item.personaId?.includes('lotto')) {
            item.rewardStatus = 'AVAILABLE';
        } else {
            item.rewardStatus = 'NONE';
        }
    }

    // Friendly text for frontend
    if (item.rewardStatus === 'CLAIMED') {
        item.rewardText = '보상지급 완료';
        item.rewardBadge = 'COMPLETED';
    } else if (item.rewardStatus === 'AVAILABLE') {
        item.rewardText = '보상지급 가능';
        item.rewardBadge = 'ELIGIBLE';
    } else {
        item.rewardText = null;
        item.rewardBadge = null;
    }

    // [Metadata Prep] Identify Persona Name for Summary & Footer
    item.personaName = item.personaName || item.persona || item.personaId || defaultPersonaName;
    if (!item.persona) item.persona = item.personaName;
    if (!item.personaId) item.personaId = item.persona;

    if (item.type === 'advice' && item.personaName) {
        const normalizedTitle = `${item.personaName}의 조언`;
        if (!item.title || /의\s*조언$/i.test(String(item.title)) || /advice/i.test(String(item.title))) {
            item.title = normalizedTitle;
        }
        if (item.summary && typeof item.summary === 'string' && item.summary.includes('\n')) {
            const rest = item.summary.split('\n').slice(1).join('\n');
            item.summary = `${item.personaName}\n${rest}`;
        }
    }

    // [Rule 4] Summary Text - Must handle all types (quote, fable, fortune, zodiac)
    if (!item.summary || !item.summary.includes('\n')) {
        const name = item.personaName;
        // Search for message in various fields
        const msg = item.content || item.moral || item.description || (item.fortune ? item.fortune.description : '') || '지혜로운 말씀';
        // [FIX] 문장 중간 끊김 방지: 단어 경계 스니펫
        item.summary = `${name}\n${makeSnippet(msg, 42)}`;
    }

    // Ensure persona_obj exists
    item.persona_obj = {
        id: item.personaId,
        name: item.personaName,
        imageUrl: item.imageUrl
    };

    // Defend against frontend crash: Ensure uiConfig exists
    if (!item.uiConfig) {
        item.uiConfig = {
            fontFamily: 'GowunBatang-Regular',
            showSpeaker: true,
            fontSize: 'NORMAL',
        };
    }

    // [Rule 5] Clean Data (Remove ###, **, etc.)
    const cleanMarkdown = (text) => {
        if (!text || typeof text !== 'string') return text;
        return text
            .replace(/###\s+/g, '') // Remove ### headers
            .replace(/\*\*/g, '')   // Remove bold **
            .trim();
    };

    if (item.content) item.content = cleanMarkdown(item.content);
    if (item.moral) item.moral = cleanMarkdown(item.moral);
    if (item.title) item.title = cleanMarkdown(item.title);
    if (item.summary) item.summary = cleanMarkdown(item.summary);

    // [RESTORE] Snake_case aliases for frontend compatibility
    item.persona_id = item.personaId;
    item.user_key = item.userKey;

    return item;
};

/**
 * GET /summary
 * 보관함 요약 정보 조회 (전체 수량, 등급별 수량 등)
 */
router.get('/summary', async (req, res) => {
    const userKey = req.query.userKey || req.query.userkey;
    if (!userKey) return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_USER_KEY' });

    // Prevent Caching (client-side)
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    // 서버 인메모리 캐시 조회 (no-cache 헤더 없을 때만 적용)
    const forceRefresh = req.headers['cache-control'] === 'no-cache' || req.query.refresh === '1';
    const cacheKey = String(userKey);
    if (!forceRefresh) {
        const cached = _summaryCache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) {
            return res.json({ resultType: 'SUCCESS', data: cached.data, _cached: true });
        }
    }

    try {
        const collectionConfigs = [
            { name: 'contents', type: 'advice' },
            { name: 'fables', type: 'fable' },
            { name: 'fortunes', type: 'fortune' },
            { name: 'zodiac_fortunes', type: 'zodiac' }
        ];

        const summary = {
            totalCount: 0,
            countsByType: { fortune: 0, lotto: 0, advice: 0, love: 0 },
            countsByGrade: { DIAMOND: 0, PLATINUM: 0, GOLD: 0, SILVER: 0, NORMAL: 0 },
            latestItems: []
        };

        // ─── [QUOTA FIX] Phase 1: 등급/타입 집계 (최소 필드만 조회 + 안전 캡) ───
        // 기존: 전체 문서 무제한 fetch → 2,600건 이상 시 메모리/쿼터 초과
        // 개선: .select() 로 필요 필드만 + .limit(3000) 안전 캡
        const SUMMARY_FIELDS = ['grade', 'rarity', 'personaId', 'category', 'v3Group'];
        const gradeQueryTasks = [];
        collectionConfigs.forEach(col => {
            gradeQueryTasks.push(
                firestore.collection(col.name)
                    .where('userKey', '==', String(userKey))
                    .select(...SUMMARY_FIELDS)
                    .limit(3000)
                    .get()
                    .then(snap => ({ snap, type: col.type, context: 'root' }))
                    .catch(() => ({ snap: { empty: true, forEach: () => { } }, type: col.type, context: 'root' }))
            );
            if (!isNaN(userKey) && userKey !== '' && userKey !== null) {
                gradeQueryTasks.push(
                    firestore.collection(col.name)
                        .where('userKey', '==', Number(userKey))
                        .select(...SUMMARY_FIELDS)
                        .limit(3000)
                        .get()
                        .then(snap => ({ snap, type: col.type, context: 'root' }))
                        .catch(() => ({ snap: { empty: true, forEach: () => { } }, type: col.type, context: 'root' }))
                );
            }
        });

        // Subcollection (history)
        gradeQueryTasks.push(
            firestore.collection('users').doc(String(userKey)).collection('history')
                .orderBy('timestamp', 'desc')
                .limit(500)
                .select(...SUMMARY_FIELDS)
                .get()
                .then(snap => ({ snap, type: 'advice', context: 'sub', userKey: String(userKey) }))
                .catch(() => ({ snap: { empty: true, forEach: () => { } }, type: 'advice', context: 'sub' }))
        );

        // ─── [QUOTA FIX] Phase 2: 최신 프리뷰 아이템 (컬렉션당 3개, 전체 필드) ───
        // 기존: 전체 문서에서 3개 추출 → 수천 건 불필요 로드
        // 개선: 컬렉션별 최신 3개만 fetch (최대 12 reads)
        const latestTasks = collectionConfigs.map(col =>
            firestore.collection(col.name)
                .where('userKey', '==', String(userKey))
                .orderBy('createdAt', 'desc')
                .limit(3)
                .get()
                .then(snap => ({ snap, type: col.type }))
                .catch(() => ({ snap: { empty: true, forEach: () => { } }, type: col.type }))
        );

        const [gradeResults, latestResults] = await Promise.all([
            Promise.all(gradeQueryTasks),
            Promise.all(latestTasks)
        ]);

        // ─── Grade/Type 집계 처리 ───
        const seenIds = new Set();
        gradeResults.forEach(({ snap, type, context }) => {
            if (!snap || !snap.forEach) return;

            snap.forEach(doc => {
                if (seenIds.has(doc.id)) return;
                seenIds.add(doc.id);

                const data = doc.data();
                summary.totalCount++;

                let mappedType = type === 'fable' ? 'advice' : (type === 'zodiac' ? 'fortune' : type);
                if (data.personaId?.includes('lotto') || data.category === 'lotto') {
                    mappedType = 'lotto';
                } else if (data.v3Group === 'love' || data.category === 'love') {
                    mappedType = 'love';
                }

                if (summary.countsByType[mappedType] !== undefined) {
                    summary.countsByType[mappedType]++;
                } else {
                    summary.countsByType[mappedType] = 1;
                }

                const grade = normalizeGradeKey(data.grade ?? data.rarity);
                summary.countsByGrade[grade] = (summary.countsByGrade[grade] || 0) + 1;
            });
        });

        // ─── Latest Items 프리뷰 처리 ───
        const allLatestDocs = [];
        latestResults.forEach(({ snap, type }) => {
            if (!snap || !snap.forEach) return;
            snap.forEach(doc => {
                allLatestDocs.push({ id: doc.id, ...doc.data(), type });
            });
        });
        allLatestDocs.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
            const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
            return dateB - dateA;
        });

        const normalizedItems = allLatestDocs.map(item => normalizeStorageItem(item, item.type));
        summary.latestItems = filterValidImages(normalizedItems).slice(0, 3);

        const responseData = {
            ...summary,
            guide: {
                title: "보관함 안내",
                description: "수집하신 조언과 운세는 이곳에 안전하게 보관됩니다. 기록은 랭킹 점수에 즉시 반영됩니다."
            },
            rankingGuide: {
                title: "랭킹 점수 안내",
                scoreSystem: "운세 점수(60~100점) + 등급 보너스",
                bonuses: {
                    diamond: 500,
                    platinum: 200,
                    gold: 50,
                    silver: 10,
                    normal: 1
                },
                tip: "다양한 페르소나의 조언을 모을수록 랭킹 상위권에 오를 확률이 높아집니다!"
            }
        };

        // 결과를 인메모리 캐시에 저장
        _summaryCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + SUMMARY_TTL_MS });

        res.json({ resultType: 'SUCCESS', data: responseData });
    } catch (error) {
        console.error('Storage summary failed:', error);
        res.status(500).json({ resultType: 'FAIL', error: 'STORAGE_SUMMARY_FAILED' });
    }
});

/**
 * GET /list
 * 보관함 목록 조회 (V1: Array, V2: Paginated Object 지원)
 */
router.get('/list', async (req, res) => {
    const pageAttr = req.query.page || 1;
    const rawLimit = req.query.limit;
    const limitAttr = rawLimit || 100;
    const userKey = req.query.userKey || req.query.userkey; // Support lowercase
    const debugMode = req.query.debug === '1' || req.query.trace === '1';
    const clientContext = {
        platform: req.query.platform || req.headers['x-platform'] || 'unknown',
        appVersion: req.query.appVersion || req.headers['x-app-version'] || 'unknown',
        clientVersion: req.query.clientVersion || req.headers['x-client-version'] || 'unknown',
        screen: req.query.screen || req.headers['x-screen'] || 'unknown'
    };
    if (!userKey) return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_USER_KEY' });

    // Prevent Caching
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    const isStrictV2 = req.originalUrl.includes('/v2/') || req.query.v === '2';
    const pageNum = parseInt(pageAttr);
    const isLimitOmitted = rawLimit === undefined || rawLimit === null || String(rawLimit).trim() === '';
    const defaultV2Limit = 500;
    const limitNum = (isStrictV2 && isLimitOmitted) ? defaultV2Limit : parseInt(limitAttr);
    const offset = req.query.offset !== undefined ? parseInt(req.query.offset) : ((pageNum - 1) * limitNum);

    const items = [];
    try {
        // [CRITICAL FIX] We fetch up to 1500 items from DB to allow thematic grouping,
        // but we should NEVER send all of them in a single response to the client.
        // [QUOTA FIX] 3000 → 1500: grouped(100×5) + characters + pagination(500)에 충분하면서 읽기 쿼터 절반 절약
        const fetchLimit = 1500;
        const queryTasks = [];
        const collectionConfigs = [
            { name: 'contents', type: 'advice' },
            { name: 'fables', type: 'fable' },
            { name: 'fortunes', type: 'fortune' },
            { name: 'zodiac_fortunes', type: 'zodiac' }
        ];

        // Root collections
        collectionConfigs.forEach(col => {
            const fetchRoot = (userIdStr) => {
                const queryBase = firestore.collection(col.name).where('userKey', '==', userIdStr);
                return queryBase.orderBy('createdAt', 'desc').limit(fetchLimit).get()
                    .catch(e => {
                        console.warn(`[Fallback] Missing index for ${col.name}, fetching without order.`);
                        return queryBase.get(); // Fallback without order
                    })
                    .then(snap => ({ snap, type: col.type, context: 'root' }));
            };

            queryTasks.push(fetchRoot(String(userKey)));

            if (!isNaN(userKey) && userKey !== '' && userKey !== null) {
                queryTasks.push(fetchRoot(Number(userKey)));
            }
        });

        // Subcollections (history, daily_fortunes, etc)
        const subCollectionConfigs = [
            { name: 'history', type: 'advice' }
        ];

        subCollectionConfigs.forEach(col => {
            queryTasks.push(
                firestore.collection('users').doc(String(userKey)).collection(col.name)
                    .orderBy('timestamp', 'desc')
                    .limit(fetchLimit)
                    .get()
                    .then(snap => ({ snap, type: col.type, context: 'sub', userKey: String(userKey) }))
                    .catch(() => ({ snap: { empty: true, forEach: () => { } }, type: col.type }))
            );
        });

        const results = await Promise.allSettled(queryTasks);
        results.forEach(res => {
            if (res.status === 'fulfilled') {
                const { snap, type, context, userKey: injectedKey } = res.value;
                if (!snap || !snap.forEach) return;

                snap.forEach(doc => {
                    const data = doc.data();
                    if (context === 'sub' && injectedKey) {
                        data.userKey = injectedKey;
                    }
                    items.push(normalizeStorageItem({ id: doc.id, ...data }, type));
                });
            }
        });

        const uniqueItems = Array.from(new Map(items.map(i => [i.id, i])).values())
            .filter(item => ALLOWED_COLLECTION_PERSONAS.has(item.personaId || ''))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const gradeFilter = req.query.grade;
        const groupFilter = req.query.group || req.query.category; // [NEW] Support theme filtering

        const getMappedCategory = (item) => {
            let cat = item.v3Group || item.category || 'general';
            const pid = (item.personaId || item.persona || '').toLowerCase();
            const pname = (item.personaName || '').toLowerCase();

            if (pid.includes('lotto') || pid.includes('pachinko') || pid.includes('lucky7') || pid.includes('gachabot') || pname.includes('로또') || pname.includes('추첨기')) {
                return 'lotto';
            } else if (pid.includes('lucy') || pid.includes('cupid') || pid.includes('love')) {
                return 'love';
            } else if (pid.includes('fortune') || pid.includes('shaman') || pid.includes('tarot') || cat === 'mystic' || item.type === 'fortune' || item.type === 'zodiac') {
                return 'fortune';
            } else {
                // Default to 'advice' for all others (family, animal, seasonal, situation, career, healing, general, fables)
                return 'advice';
            }
        };

        // [CRITICAL FIX] Ensure ALL items are strictly V2 formatted BEFORE building `grouped`
        const baseItems = isStrictV2 ? uniqueItems.map(item => ({
            ...item, // Retain properties first
            id: item.id,
            personaName: item.personaName || item.personaId,
            title: item.title || item.situation || item.name || '알 수 없는 조언',
            content: item.content || item.moral || item.summary || '',
            imageUrl: item.imageUrl,
            createdAt: item.createdAt,
            rarity: (item.grade || item.rarity || 'NORMAL').toUpperCase(),
            category: getMappedCategory(item)
        })) : uniqueItems;

        let filteredItems = baseItems;
        if (gradeFilter) {
            const upGrade = String(gradeFilter).toUpperCase();
            filteredItems = baseItems.filter(item => {
                const itemGrade = (item.grade || item.rarity || 'NORMAL').toUpperCase();
                return itemGrade === upGrade;
            });
        }

        if (groupFilter) {
            filteredItems = filteredItems.filter(item => {
                return (item.category || getMappedCategory(item)) === groupFilter;
            });
        }

        // 유효한 이미지를 가진 항목만 필터링 (이모지나 이미지 없는 항목 제외)
        filteredItems = filterValidImages(filteredItems);

        // [NEW] Generate Grouped Data for Thematic View (Using fully mapped items)
        // [QUOTA FIX] Only send the full list in 'grouped' if total items is small.
        // If items are many, we only send a slice to prevent crashing the frontend storage.
        const grouped = { fortune: [], lotto: [], advice: [], love: [], general: [] };
        const validBaseItems = filterValidImages(baseItems);
        const shouldCapGrouped = validBaseItems.length > 300;
        const groupCap = 100;

        validBaseItems.forEach(item => {
            const cat = item.category || getMappedCategory(item);
            if (!grouped[cat]) grouped[cat] = [];
            if (shouldCapGrouped && grouped[cat].length >= groupCap) return;
            grouped[cat].push(item);
        });

        // [NEW] 캐릭터 컬렉션: 허용된 페르소나만 그룹핑
        // [QUOTA FIX] Limit items per character to prevent massive response.
        const characterCollection = {};
        validBaseItems.forEach(item => {
            const pid = item.personaId || '';
            if (!ALLOWED_COLLECTION_PERSONAS.has(pid)) return;
            if (!characterCollection[pid]) {
                characterCollection[pid] = {
                    personaId: pid,
                    personaName: PERSONA_NAME_MAP[pid] || item.personaName || pid,
                    imageUrl: resolveImageUrl(getPersonaImagePath(pid)),
                    count: 0,
                    items: []
                };
            }
            characterCollection[pid].count++;
            if (characterCollection[pid].items.length < 5) {
                characterCollection[pid].items.push(item);
            }
        });
        const characters = Object.values(characterCollection);

        const shouldUseWideFirstPage =
            isStrictV2 &&
            offset === 0 &&
            !groupFilter &&
            !gradeFilter &&
            limitNum < defaultV2Limit;

        const effectiveLimit = shouldUseWideFirstPage ? defaultV2Limit : limitNum;

        const paginatedItems = filteredItems.slice(offset, offset + effectiveLimit);
        const hasMore = filteredItems.length > offset + effectiveLimit;

        const ADMIN_IDS = (process.env.ADMIN_USER_IDS || '').split(',');
        const shouldTrace = debugMode || ADMIN_IDS.includes(String(userKey));

        if (shouldTrace) {
            void logSystemEvent('STORAGE_LIST_TRACE', 'SUCCESS', {
                userKey: String(userKey),
                isStrictV2,
                page: pageNum,
                limit: limitNum,
                effectiveLimit,
                offset,
                total: filteredItems.length,
                returned: paginatedItems.length,
                hasMore,
                groupFilter: groupFilter || null,
                gradeFilter: gradeFilter || null,
                ...clientContext
            });
        }

        if (isStrictV2) {
            res.json({
                resultType: 'SUCCESS',
                data: paginatedItems,
                grouped: grouped, // Capped if too many
                characters: characters, // Capped items per character
                page: pageNum,
                limit: limitNum,
                offset: offset,
                total: filteredItems.length,
                hasMore: hasMore
            });
        } else {
            res.json(paginatedItems);
        }

    } catch (error) {
        console.error('Storage list failed:', error);
        res.status(500).json({ resultType: 'FAIL', error: 'STORAGE_FETCH_FAILED' });
    }
});

/**
 * GET /:id
 * 개별 보관함 항목 상세 조회
 * @query userKey - 사용자 키 (필수)
 * @query type - 항목 타입 (선택: advice, fable, fortune, zodiac)
 */
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const userKey = req.query.userKey || req.query.userkey;
    const { type } = req.query;

    if (!id || !userKey) {
        return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_PARAMS' });
    }

    // Prevent Caching
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    try {
        // type이 지정되면 해당 컬렉션만, 아니면 모든 컬렉션 순회
        const collectionMap = {
            advice: 'contents',
            fable: 'fables',
            fortune: 'fortunes',
            zodiac: 'zodiac_fortunes'
        };

        const collectionsToSearch = type && collectionMap[type]
            ? [{ name: collectionMap[type], type }]
            : [
                { name: 'contents', type: 'advice' },
                { name: 'fables', type: 'fable' },
                { name: 'fortunes', type: 'fortune' },
                { name: 'zodiac_fortunes', type: 'zodiac' }
            ];

        let found = null;

        for (const col of collectionsToSearch) {
            const docRef = firestore.collection(col.name).doc(id);
            const docSnap = await docRef.get();
            if (docSnap.exists) {
                const data = docSnap.data();
                // 유저 소유 확인
                if (String(data.userKey) === String(userKey)) {
                    found = normalizeStorageItem({ id: docSnap.id, ...data }, col.type);
                    break;
                }
            }
        }

        // 서브컬렉션(history)도 검색
        if (!found) {
            const historyRef = firestore.collection('users').doc(String(userKey)).collection('history').doc(id);
            const historySnap = await historyRef.get();
            if (historySnap.exists) {
                found = normalizeStorageItem({ id: historySnap.id, ...historySnap.data() }, 'advice');
            }
        }

        if (!found) {
            return res.status(404).json({
                resultType: 'FAIL',
                error: { code: 'NOT_FOUND', message: '항목을 찾을 수 없습니다.' }
            });
        }

        // V2 포맷 적용
        const getMappedCategory = (item) => {
            const pid = (item.personaId || '').toLowerCase();
            const pname = (item.personaName || '').toLowerCase();
            if (pid.includes('lotto') || pid.includes('pachinko') || pid.includes('lucky7') || pid.includes('gachabot') || pname.includes('로또') || pname.includes('추첨기')) return 'lotto';
            if (pid.includes('lucy') || pid.includes('cupid') || pid.includes('love')) return 'love';
            if (pid.includes('fortune') || pid.includes('shaman') || pid.includes('tarot') || item.type === 'fortune' || item.type === 'zodiac') return 'fortune';
            return 'advice';
        };

        const result = {
            ...found,
            title: found.title || found.situation || found.name || '알 수 없는 조언',
            content: found.content || found.moral || found.summary || '',
            rarity: (found.grade || found.rarity || 'NORMAL').toUpperCase(),
            category: getMappedCategory(found)
        };

        return res.json({
            resultType: 'SUCCESS',
            data: result
        });
    } catch (error) {
        console.error('[Storage] GET /:id failed:', error);
        return res.status(500).json({ resultType: 'FAIL', error: 'STORAGE_FETCH_FAILED' });
    }
});

/**
 * DELETE /:id
 * 보관함 항목 삭제
 */
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const { userKey, type } = req.query;
    if (!id || !userKey) return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_PARAMS' });

    try {
        const collections = type ? [type === 'advice' ? 'contents' : type] : ['contents', 'fables', 'fortunes', 'zodiac_fortunes'];
        let deleted = false;

        for (const col of collections) {
            const colName = (col === 'fable' ? 'fables' : (col === 'advice' ? 'contents' : col));
            const docRef = firestore.collection(colName).doc(id);
            const doc = await docRef.get();
            if (doc.exists && String(doc.data().userKey) === String(userKey)) {
                await docRef.delete();
                deleted = true;
                break;
            }
        }

        if (deleted) {
            res.json({ resultType: 'SUCCESS' });
        } else {
            res.status(404).json({ resultType: 'FAIL', error: 'NOT_FOUND_OR_UNAUTHORIZED' });
        }
    } catch (error) {
        console.error('Delete failed:', error);
        res.status(500).json({ resultType: 'FAIL', error: 'DELETE_FAILED' });
    }
});

/**
 * POST /save
 * Explicitly save an item to storage (Legacy support or manual save)
 */
router.post('/save', async (req, res) => {
    try {
        const { userKey, type } = req.body;
        if (!userKey || !type) return res.status(400).json({ resultType: 'FAIL', error: 'MISSING_PARAMS' });

        const colName = (type === 'fable' ? 'fables' : (type === 'fortune' ? 'fortunes' : (type === 'zodiac' ? 'zodiac_fortunes' : 'contents')));

        // Follow Rules 1-4 for saving
        const dataToSave = {
            ...req.body,
            userKey: String(userKey),
            createdAt: req.body.createdAt || new Date().toISOString(),
            timestamp: req.body.timestamp || Date.now(), // [Rule 1]
            isV2: true
        };

        // [Rule 2] Ensure relative image path
        if (!dataToSave.imageUrl || dataToSave.imageUrl.startsWith('http')) {
            const personaId = dataToSave.personaId || dataToSave.persona;
            dataToSave.imageUrl = PERSONA_IMAGE_MAP[personaId] || 'images/personas/nano_banana.png';
        }

        // [Rule 3] Rarity Lowercase
        if (dataToSave.grade || dataToSave.rarity) {
            dataToSave.rarity = (dataToSave.grade || dataToSave.rarity).toLowerCase();
        }

        const docRef = await firestore.collection(colName).add(dataToSave);

        res.json({
            resultType: 'SUCCESS',
            data: normalizeStorageItem({ id: docRef.id, ...dataToSave }, type)
        });
    } catch (err) {
        console.error('Save failed:', err);
        res.status(500).json({ resultType: 'FAIL', error: 'SAVE_FAILED' });
    }
});

export default router;
