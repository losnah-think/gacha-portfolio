import express from 'express';
import { firestore } from '../../lib/firebaseAdmin.js';
import admin from 'firebase-admin';

import { resolveImageUrl, getPersonaImagePath, PERSONA_IMAGE_MAP } from '../../utils/imageUrl.js';
import { isHiddenCounselorPersona, isPersonaMissingImage } from '../../utils/personaVisibility.js';


const router = express.Router();


// Separate Cache for V1 and V2
let cache = {
    v1: { personas: { data: null, expiry: 0 }, situations: { data: null, expiry: 0 } },
    v2: { personas: { data: null, expiry: 0 }, situations: { data: null, expiry: 0 } }
};
// 글로벌 캐시 TTL: 2분 (스페셜 추천 다양화를 위해 5분→2분 단축)
// group/category 요청은 useGlobalCache=false이므로 항상 셔플 결과를 반환
const CACHE_TTL = 2 * 60 * 1000;

router.get('/personas', async (req, res) => {
    try {
        const { userKey, situation, category, group } = req.query;
        // Detect API Version
        const isV2 = req.isV2 || req.baseUrl.includes('/v2') || req.originalUrl.includes('/v2');

        // Skip global cache if personalization or context is requested
        const useGlobalCache = !userKey && !situation && !category && !group;
        const versionCache = isV2 ? cache.v2 : cache.v1;

        if (useGlobalCache && versionCache.personas.data && versionCache.personas.expiry > Date.now()) {
            return res.json(versionCache.personas.data);
        }

        const snapshot = await firestore.collection('personas').get();
        let items = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.isActive !== false) {
                if (!isV2 && (data.isV2Only === true || data.isNew === true)) return;

                // [V3] Group Filtering
                if (group && data.v3Group !== group) return;

                const item = { id: doc.id, ...data };
                if (isHiddenCounselorPersona(item) || isPersonaMissingImage(item)) return;

                // [New] Check Reward Eligibility
                const canonicalId = (item.id || '').toLowerCase();
                const canonicalName = (item.name || '').toLowerCase();
                const isKorean = false; // [종료] 2026-02-07
                const isAnimal = ['dog', 'cat', 'puppy', 'kitten', '진돗개', '고양이', '길냥이', 'pet'].some(k => canonicalId.includes(k) || canonicalName.includes(k));
                const isLotto = canonicalId.includes('lotto') || canonicalName.includes('로또') || canonicalName.includes('추첨기') || canonicalName.includes('스피또') || canonicalId.includes('speetto');

                item.isRewardEligible = isKorean || isAnimal || isLotto;
                item.rewardText = item.isRewardEligible ? (isLotto ? '행운 보상' : '보너스 리워드') : null;

                // [V3] Category Logic Mapping: Ensure all personas fall into 4 primary tabs
                let mappedCategory = data.v3Group || data.category || 'general';
                if (doc.id.includes('lotto') || (data.name || '').includes('로또') || (data.name || '').includes('추첨기') || doc.id.includes('pachinko') || doc.id.includes('lucky7') || doc.id.includes('gachabot') || (data.name || '').includes('스피또') || doc.id.includes('speetto')) {
                    mappedCategory = 'lotto';
                } else if (doc.id.includes('lucy') || doc.id.includes('cupid') || doc.id.includes('love')) {
                    mappedCategory = 'love';
                } else if (doc.id.includes('fortune') || doc.id.includes('shaman') || doc.id.includes('tarot') || mappedCategory === 'mystic') {
                    mappedCategory = 'fortune';
                } else {
                    mappedCategory = 'advice';
                }
                item.category = mappedCategory;

                // Ensure imageUrl is resolved to a full public URL
                // Priority: Code Override > DB URL > Default Path
                let baseImage = data.imageUrl || data.image_url || '';

                // Use PERSONA_IMAGE_MAP override if exists
                if (PERSONA_IMAGE_MAP[doc.id] || PERSONA_IMAGE_MAP[data.name]) {
                    baseImage = PERSONA_IMAGE_MAP[doc.id] || PERSONA_IMAGE_MAP[data.name];
                }

                if (!baseImage) {
                    baseImage = getPersonaImagePath(doc.id);
                }

                item.imageUrl = resolveImageUrl(baseImage);
                item.icon = item.imageUrl;

                // [#10] description / desc 정규화: 둘 다 제공하여 클라이언트 호환성 보장
                item.description = item.description || item.desc || '';
                item.desc = item.description;  // legacy alias

                // [#8] 등급 명칭 alias: LEGEND → PLATINUM, HERO → GOLD (ISO 정규화)
                // 응답에 normalizedGrade 추가, 기존 grade 필드는 유지
                if (item.grade) {
                    const GRADE_ALIAS = { LEGEND: 'PLATINUM', HERO: 'GOLD' };
                    item.normalizedGrade = GRADE_ALIAS[item.grade?.toUpperCase()] || item.grade;
                }

                items.push(item);
            }
        });

        // 1. Context-Based Matching (Situation/Category)
        const context = (situation || category || '').toLowerCase();
        if (context) {
            const matchKeywords = {
                mystic: [], // Disabled keywords to avoid confusion with theme-based separation
                career: ['상사', '커리어', '전문가', '세종대왕', '선생님', '사장님', '직장', '업무', '성취'],
                family: ['엄마', '아빠', '언니', '형', '손자', '손녀', '할머니', '할아버지', '아들', '딸', '조카']
            };

            const relevantKeywords = matchKeywords[category] || [];

            items.forEach(item => {
                let matchScore = 0;
                const nameMatch = (item.name || '').toLowerCase();
                const descMatch = (item.description || '').toLowerCase();

                // Match based on persona's intrinsic category
                if (item.category && context.includes(item.category.toLowerCase())) matchScore += 300;

                // Match based on persona's tags
                if (Array.isArray(item.tags)) {
                    item.tags.forEach(tag => {
                        if (context.includes(tag.toLowerCase())) matchScore += 200;
                    });
                }

                // Boost based on predefined keywords
                relevantKeywords.forEach(kw => {
                    if (nameMatch.includes(kw.toLowerCase()) || descMatch.includes(kw.toLowerCase())) {
                        matchScore += 500;
                    }
                });

                // Context similarity detection (simple)
                if (context.includes(nameMatch) || nameMatch.includes(context)) matchScore += 1000;

                item.tempPriority = (item.priority || 100) + (item.ctaCount || 0) + matchScore;
            });

            // 2. Comprehensive Sort (Context Match > Priority > Popularity)
            items.sort((a, b) => {
                // If there is no specific context match score, prioritize by baseline priority
                if ((b.tempPriority || 0) !== (a.tempPriority || 0)) {
                    return (b.tempPriority || 0) - (a.tempPriority || 0);
                }

                // Tie-breaker: original priority
                if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);

                // Final tie-breaker: CTA count (popularity)
                return (b.ctaCount || 0) - (a.ctaCount || 0);
            });
        } else {
            // Default Sort when no context is provided
            items.sort((a, b) => {
                // Keep Lotto as Rank 0 globally in default view if desired, 
                // but let's follow the user's wish to hide it in non-relevant contexts if possible.
                // For default (empty context), we keep Lotto high.
                const aIsLotto = a.id.includes('lotto') || (a.name || '').includes('로또') || (a.name || '').includes('스피또');
                const bIsLotto = b.id.includes('lotto') || (b.name || '').includes('로또') || (b.name || '').includes('스피또');
                if (aIsLotto && !bIsLotto) return -1;
                if (!aIsLotto && bIsLotto) return 1;

                if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
                return (b.ctaCount || 0) - (a.ctaCount || 0);
            });
        }

        // 2. Personalization & Randomization for Recommendations
        let finalRecommendations = [];
        let featured = null;

        // Specific personas requested by the user to be "recommended"
        const RECOMMEND_IDS = ['socrates', 'nano_banana', 'grandmother', 'grandfather', 'healing_단골_카페_사장님', 'king_sejong', 'yi_sun_shin', 'gandhi', 'einstein'];

        // [FIX] 그룹별 추천 ID — group 파라미터가 있으면 해당 그룹의 대표 캐릭터만 추천
        const GROUP_RECOMMEND_IDS = {
            advice: ['socrates', 'nano_banana', 'grandmother', 'grandfather', 'healing_단골_카페_사장님', 'king_sejong', 'yi_sun_shin', 'steve_jobs', 'situation_잔소리꾼_엄마', 'family_우리_아빠', 'taxi'],
            lotto: ['lotto_generator', 'v3_lucky7', 'v3_pachinko', 'v3_gachabot'],
            fortune: ['mystic_fortune_teller', 'seollal_moon'],
            love: ['v3_lucy', 'v3_cupid'],
        };

        const activeRecommendIds = group ? (GROUP_RECOMMEND_IDS[group] || []) : RECOMMEND_IDS;

        const checkIsRecommended = (p) => {
            if (group) return activeRecommendIds.includes(p.id);
            return RECOMMEND_IDS.includes(p.id) || (p.category === 'advice' && p.priority >= 100);
        };

        const recommendedItems = items.filter(checkIsRecommended);

        // Populate recommendations (group일 때: 해당 그룹 전체, 아닐 때: 최대 4개)
        const recLimit = group ? Math.min(recommendedItems.length, 6) : 4;
        finalRecommendations = recommendedItems.sort(() => 0.5 - Math.random()).slice(0, recLimit).map(item => ({
            ...item,
            isRecommended: true,
            recommendation: `${item.name || item.id}님이 이 상황에 딱 맞는 지혜로운 조언을 드릴 수 있어요.`
        }));

        // Select featured from recommended if available
        featured = finalRecommendations.length > 0 ? finalRecommendations[0] : null;

        const grouped = {};
        items.forEach(item => {
            const cat = item.category || 'general';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push({ ...item, isRecommended: checkIsRecommended(item) });
        });

        const result = {
            resultType: 'SUCCESS',
            data: items.map(p => ({ ...p, isRecommended: checkIsRecommended(p) })),
            grouped,
            recommendations: finalRecommendations,
            featured: featured || null
        };

        if (useGlobalCache) {
            versionCache.personas = { data: result, expiry: Date.now() + CACHE_TTL };
        }

        res.json(result);
    } catch (error) {
        console.error('Failed to fetch personas:', error);
        res.status(500).json({ resultType: 'FAIL', error: 'DB_ERROR' });
    }
});

// Situation Cache
let situationCache = {
    v1: { data: null, expiry: 0 },
    v2: { data: null, expiry: 0 }
};

/**
 * GET /situations
 * Paging, Filtering, Search supported
 */
router.get('/situations', async (req, res) => {
    try {
        const { page = 1, limit = 20, category, group, q, query, userKey } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const searchTerm = (q || query || '').toLowerCase();
        const isV2 = req.isV2 || req.baseUrl.includes('/v2') || req.originalUrl.includes('/v2');

        const useGlobalCache = !userKey && !category && !group && !searchTerm && pageNum === 1;
        const versionCache = isV2 ? situationCache.v2 : situationCache.v1;

        if (useGlobalCache && versionCache.data && versionCache.expiry > Date.now()) {
            return res.json(versionCache.data);
        }

        let queryRef = firestore.collection('situations');
        if (category) queryRef = queryRef.where('category', '==', category);
        // [FIX] group 필터는 DB 레벨이 아닌 인메모리에서 처리
        // 대부분의 상황에 v3Group 필드가 없으므로 키워드 기반 동적 분류 필요

        // [성능 개선] DB 레벨에서 정렬 및 리밋 적용 (검색어가 없을 때)
        if (!searchTerm) {
            queryRef = queryRef.orderBy('priority', 'desc').limit(200); // 넉넉히 가져오되 리밋 설정
        }

        // 상황 → v3Group 동적 매핑 함수
        const mapSituationGroup = (item) => {
            if (item.v3Group) return item.v3Group;
            const title = (item.title || '').toLowerCase();
            const tags = (item.tags || []).map(t => t.toLowerCase());
            const id = (item.id || '').toLowerCase();
            const cat = (item.category || '').toLowerCase();

            // 로또/복권
            if (id.includes('lotto') || title.includes('로또') || title.includes('복권') || title.includes('스피또') ||
                tags.some(t => ['로또', '번호', '복권', '추첨', '당첨', '잭팟'].includes(t))) {
                return 'lotto';
            }
            // 운세/점술
            if (id.includes('fortune') || id.includes('zodiac') || id.includes('tarot') ||
                title.includes('운세') || title.includes('타로') || title.includes('별자리') || title.includes('사주') || title.includes('토정비결') || title.includes('꿈해몽') ||
                cat === 'mystic' ||
                tags.some(t => ['운세', '타로', '별자리', '사주', '점술', '행운', '꿈'].includes(t))) {
                return 'fortune';
            }
            // 연애
            if (id.includes('love') || id.includes('cupid') || id.includes('lucy') ||
                title.includes('연애') || title.includes('사랑') || title.includes('소개팅') || title.includes('고백') || title.includes('이별') ||
                cat === 'love' ||
                tags.some(t => ['연애', '사랑', '커플', '이별', '고백', '남친', '여친', '솔로', '썸', '짝사랑'].includes(t))) {
                return 'love';
            }
            return 'advice';
        };

        const snapshot = await queryRef.get();
        let items = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.isActive !== false) {
                if (!isV2 && (data.isV2Only === true || data.isNew === true)) return;
                const item = { id: doc.id, ...data };

                // [FIX] 동적 v3Group 매핑
                item.v3Group = mapSituationGroup(item);

                // [New] Check Reward Eligibility
                const canonicalId = (item.id || '').toLowerCase();
                const canonicalTitle = (item.title || '').toLowerCase();
                const canonicalTags = (item.tags || []).map(t => t.toLowerCase());

                const isSenior = ['은퇴', '노후', '연금', '건강', '질병', '약', '병원', '자식', '결혼', '미래', '일자리', '재취업', '창업', '귀농', '상속', '유산'].some(k => canonicalTitle.includes(k) || canonicalTags.includes(k));
                const isJobStress = ['상사', '동료', '후임', '고객', '파견', '야근', '월급', '퇴사', '이직', '업무', '회사', '직장', '회식', '스트레스', '취업', '면접'].some(k => canonicalTitle.includes(k) || canonicalTags.includes(k));
                const isLotto = canonicalId.includes('lotto') || canonicalTitle.includes('로또') || canonicalTitle.includes('스피또');

                item.isRewardEligible = isSenior || isJobStress || isLotto;
                item.rewardText = item.isRewardEligible ? (isLotto ? '행운 보상' : '보너스 리워드') : null;

                items.push(item);
            }
        });

        // [FIX] group 인메모리 필터링 (DB에 v3Group 없는 상황도 동적 분류 후 필터)
        if (group) {
            items = items.filter(item => item.v3Group === group);
        }

        if (searchTerm) {
            items = items.filter(item =>
                (item.title || '').toLowerCase().includes(searchTerm) ||
                (item.name || '').toLowerCase().includes(searchTerm) ||
                (item.tags || []).some(tag => tag.toLowerCase().includes(searchTerm))
            );
        }

        // 1. Base Sort
        items.sort((a, b) => {
            // [Rank 0] Lotto Absolute Priority
            const aIsLotto = a.id.includes('lotto') || (a.title || '').includes('로또') || (a.title || '').includes('스피또');
            const bIsLotto = b.id.includes('lotto') || (b.title || '').includes('로또') || (b.title || '').includes('스피또');
            if (aIsLotto && !bIsLotto) return -1;
            if (!aIsLotto && bIsLotto) return 1;

            if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
            return (b.ctaCount || 0) - (a.ctaCount || 0);
        });

        // 2. Recommendation Randomization (Shuffle top 30% of results if not searching)
        // group 파라미터가 있어도 셔플 적용하여 스페셜 추천 다양화
        if (!searchTerm && !category && !group) {
            const topCount = Math.ceil(items.length * 0.3);
            const topSlice = items.slice(0, topCount);
            const otherSlice = items.slice(topCount);

            // Randomly shuffle top slice to keep ranking fresh
            topSlice.sort(() => 0.5 - Math.random());
            items = [...topSlice, ...otherSlice];
        } else if (!searchTerm && group) {
            // group 필터가 있는 경우: 해당 그룹 내 상위 50% 셔플 (스페셜 추천 다양화)
            const topCount = Math.ceil(items.length * 0.5);
            const topSlice = items.slice(0, topCount);
            const otherSlice = items.slice(topCount);
            topSlice.sort(() => 0.5 - Math.random());
            items = [...topSlice, ...otherSlice];
        }

        // 3. Simple Segment Boosting if userKey provided
        if (userKey && !searchTerm) {
            const userSnap = await firestore.collection('users').doc(String(userKey)).get();
            if (userSnap.exists) {
                const userData = userSnap.exists ? userSnap.data() : {};
                const segment = userData.segment || '';

                // Sort again bringing segment-matched items to top within their tiers
                items.sort((a, b) => {
                    const aMatch = (a.tags || []).includes(segment) || (a.category === segment);
                    const bMatch = (b.tags || []).includes(segment) || (b.category === segment);
                    if (aMatch && !bMatch) return -1;
                    if (!aMatch && bMatch) return 1;
                    return 0; // Maintain existing order
                });
            }
        }

        // Group situations by category for separate theme viewing
        const grouped = {};
        items.forEach(item => {
            const cat = item.v3Group || item.category || 'general';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(item);
        });

        // 4. Create Category Specific Recommendations
        let recommendations = [];
        const requestCat = category || group;

        // Strict Keyword Matching Configuration
        const mandatoryKeywords = {
            lotto: ['로또', '복권', '추첨', '번호', '당첨', '6/45', '720+', '스피또', 'speetto'],
            fortune: ['운세', '신년', '토정비결', '사주', '타로', '별자리', '행운', '운기'],
            love: ['연애', '사랑', '커플', '이별', '고백', '남친', '여친', '솔로', '썸'],
            advice: ['조관', '고민', '위로', '응원', '격려', '취업', '면접', '직장', '스트레스']
        };

        const validateItemForCat = (item, cat) => {
            if (!cat || !mandatoryKeywords[cat]) return true;
            const title = (item.title || '').toLowerCase();
            const tags = (item.tags || []).map(t => t.toLowerCase());
            return mandatoryKeywords[cat].some(kw => title.includes(kw) || tags.some(t => t.includes(kw)));
        };

        if (requestCat) {
            // 특정 카테고리가 요청된 경우: 1. 카테고리 일치 + 2. 키워드 엄격 검증
            const strictlyRelevant = items.filter(item => validateItemForCat(item, requestCat));

            // 상위 20개 중 최대 6개 랜덤 추출 (다양성 확대: 10→20, 3→6)
            const candidates = strictlyRelevant.slice(0, 20);
            if (candidates.length > 0) {
                const count = Math.min(candidates.length, 6);
                recommendations = candidates.sort(() => 0.5 - Math.random()).slice(0, count);
            }
        } else {
            // 카테고리 지정이 없는 경우: 각 테마별 상위 후보 중 랜덤 1개씩 선택 (고정 → 랜덤)
            const requiredCategories = ['fortune', 'lotto', 'advice', 'love'];
            requiredCategories.forEach(cat => {
                const catItems = (grouped[cat] || []).filter(item => validateItemForCat(item, cat));
                if (catItems.length > 0) {
                    // 상위 5개 중 랜덤 1개 선택 (기존: catItems[0] 항상 고정)
                    const pool = catItems.slice(0, 5);
                    recommendations.push(pool[Math.floor(Math.random() * pool.length)]);
                }
            });
            recommendations = recommendations.slice(0, 4);
        }

        // Pagination only applies to 'data' strictly, grouped has full list for the given query limit
        const result = {
            resultType: 'SUCCESS',
            success: true,
            data: items.slice((pageNum - 1) * limitNum, pageNum * limitNum),
            grouped,
            recommendations: recommendations,
            pagination: {
                total: items.length,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(items.length / limitNum)
            }
        };

        if (useGlobalCache) {
            versionCache.data = result;
            versionCache.expiry = Date.now() + CACHE_TTL;
        }

        res.json(result);
    } catch (error) {
        console.error('Failed to fetch situations:', error);
        res.status(500).json({ resultType: 'FAIL', error: 'DB_ERROR' });
    }
});

/**
 * POST /interactions/cta
 */
router.post(['/cta', '/interactions/cta'], async (req, res) => {
    try {
        const { type, id, userKey } = req.body;
        if (!type || !id) return res.status(400).json({ resultType: 'FAIL', error: 'INVALID_REQUEST' });

        const collection = type === 'persona' ? 'personas' : 'situations';
        await firestore.collection(collection).doc(id).update({
            ctaCount: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        if (userKey) {
            const { logUserAction } = await import('../../utils/helpers.js');
            await logUserAction(userKey, type === 'persona' ? 'PERSONA_CLICK' : 'SITUATION_CLICK', { id });
        }

        res.json({ resultType: 'SUCCESS' });
    } catch (error) {
        console.error('Failed to increment CTA:', error);
        res.status(500).json({ resultType: 'FAIL', error: 'UPDATE_FAILED' });
    }
});

/**
 * POST /situations/request
 */
router.post(['/request', '/situations/request'], async (req, res) => {
    try {
        const { userKey, name } = req.body;
        if (!userKey || !name) return res.status(400).json({ resultType: 'FAIL', error: 'INVALID_REQUEST' });

        await firestore.collection('situation_requests').add({
            userKey: String(userKey),
            name,
            status: 'PENDING',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ resultType: 'SUCCESS' });
    } catch (error) {
        console.error('Failed to request situation:', error);
        res.status(500).json({ resultType: 'FAIL', error: 'REQUEST_FAILED' });
    }
});

export default router;
