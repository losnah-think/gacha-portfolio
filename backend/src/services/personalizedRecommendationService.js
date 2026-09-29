import { firestore } from '../lib/firebaseAdmin.js';
import { getUserPersonaPreferences, calculateCategoryPreferences, getPersonaCategory } from './personaPreferenceService.js';
import { getTopRankings, getUserRanking } from './rankingService.js';
import { getCachedPersonasArray, getCachedSituations } from '../utils/sharedCache.js';
import { getKstMonthKey, isActivityLogReadsEnabled } from '../utils/helpers.js';

/**
 * 개인화 추천 서비스
 * 사용자의 선호도와 행동 패턴을 기반으로 맞춤형 랭킹과 추천을 제공
 */

// ✅ 최적화 #10: EXP Rankings 인메모리 캐시 (5분 TTL)
// 호출당 1,000개 유저 문서 읽기를 캐시로 대체
const EXP_RANKINGS_CACHE_TTL = 5 * 60 * 1000;
let _expRankingsCache = null;
let _expRankingsCacheAt = 0;

const getExpRankingDocId = (segment, gender) => {
    let docId = `monthly_${getKstMonthKey()}`;
    if (segment && segment !== 'unknown') {
        docId += `_segment_${segment}`;
    } else if (gender && (gender === 'male' || gender === 'female')) {
        docId += `_gender_${gender}`;
    }
    return docId;
};

const getExpRankQuery = (docId, limit) => firestore.collection('rankings')
    .doc(docId)
    .collection('users')
    .orderBy('characterLevel', 'desc')
    .orderBy('characterExp', 'desc')
    .limit(limit);

/**
 * 경험치(EXP) 기반 랭킹 조회
 * @param {string} userKey 
 * @param {number} limit 
 */
export const getExpRankings = async (userKey, limit = 20) => {
    try {
        const userDoc = await firestore.collection('users').doc(String(userKey)).get();
        if (!userDoc.exists) throw new Error('USER_NOT_FOUND');
        const userData = userDoc.data();
        const mySegment = userData.segment || 'unknown';
        const myGender = userData.gender || 'unknown';
        const myLevel = userData.characterLevel || 1;
        const myExp = userData.characterExp || 0;

        const now = Date.now();
        const cacheKey = `${mySegment}|${myGender}|${limit}`;
        let cachedPayload;
        if (_expRankingsCache && now - _expRankingsCacheAt < EXP_RANKINGS_CACHE_TTL) {
            cachedPayload = _expRankingsCache[cacheKey];
        }

        const buildRanking = (docs, targetLimit) => {
            return docs.slice(0, targetLimit).map((entry, i) => ({
                userKey: entry.userKey,
                nickname: entry.nickname,
                score: entry.characterLevel * 100000 + entry.characterExp,
                rank: i + 1,
                isMe: String(entry.userKey) === String(userKey),
                characterLevel: entry.characterLevel,
                characterExp: entry.characterExp
            }));
        };

        const buildMyRank = (rank) => ({
            userKey: String(userKey),
            nickname: userData.nickname || '익명',
            score: myLevel * 100000 + myExp,
            rank,
            isMe: true,
            characterLevel: myLevel,
            characterExp: myExp
        });

        if (!cachedPayload) {
            const globalDocId = getExpRankingDocId();
            const segmentDocId = getExpRankingDocId(mySegment, null);
            const genderDocId = getExpRankingDocId(null, myGender);

            const [globalSnap, segmentSnap, genderSnap, globalHigher, segmentHigher, genderHigher] = await Promise.all([
                getExpRankQuery(globalDocId, limit).get(),
                mySegment !== 'unknown' ? getExpRankQuery(segmentDocId, limit).get() : Promise.resolve(null),
                (myGender === 'male' || myGender === 'female') ? getExpRankQuery(genderDocId, limit).get() : Promise.resolve(null),
                firestore.collection('rankings').doc(globalDocId).collection('users').where('characterLevel', '>', myLevel).count().get(),
                mySegment !== 'unknown'
                    ? firestore.collection('rankings').doc(segmentDocId).collection('users').where('characterLevel', '>', myLevel).count().get()
                    : Promise.resolve(null),
                (myGender === 'male' || myGender === 'female')
                    ? firestore.collection('rankings').doc(genderDocId).collection('users').where('characterLevel', '>', myLevel).count().get()
                    : Promise.resolve(null)
            ]);

            const sameLevelCount = async (docId) => firestore.collection('rankings')
                .doc(docId)
                .collection('users')
                .where('characterLevel', '==', myLevel)
                .where('characterExp', '>', myExp)
                .count()
                .get();

            const [globalSameLevel, segmentSameLevel, genderSameLevel] = await Promise.all([
                sameLevelCount(globalDocId),
                mySegment !== 'unknown' ? sameLevelCount(segmentDocId) : Promise.resolve(null),
                (myGender === 'male' || myGender === 'female') ? sameLevelCount(genderDocId) : Promise.resolve(null)
            ]);

            const mapDocs = (snap) => (snap?.docs || []).map((doc) => {
                const data = doc.data() || {};
                return {
                    userKey: doc.id,
                    nickname: data.nickname || '익명',
                    characterLevel: Number(data.characterLevel || 1),
                    characterExp: Number(data.characterExp || 0)
                };
            });

            cachedPayload = {
                global: {
                    docs: mapDocs(globalSnap),
                    rank: (globalHigher?.data().count || 0) + (globalSameLevel?.data().count || 0) + 1
                },
                segment: mySegment !== 'unknown' ? {
                    docs: mapDocs(segmentSnap),
                    rank: (segmentHigher?.data().count || 0) + (segmentSameLevel?.data().count || 0) + 1
                } : null,
                gender: (myGender === 'male' || myGender === 'female') ? {
                    docs: mapDocs(genderSnap),
                    rank: (genderHigher?.data().count || 0) + (genderSameLevel?.data().count || 0) + 1
                } : null
            };

            _expRankingsCache = _expRankingsCache || {};
            _expRankingsCache[cacheKey] = cachedPayload;
            _expRankingsCacheAt = now;
        }
        const globalRankingList = buildRanking(cachedPayload.global.docs, limit);
        const segmentRankingList = cachedPayload.segment ? buildRanking(cachedPayload.segment.docs, limit) : [];
        const genderRankingList = cachedPayload.gender ? buildRanking(cachedPayload.gender.docs, limit) : [];

        const myGlobalRank = buildMyRank(cachedPayload.global.rank);
        const mySegmentRank = cachedPayload.segment ? buildMyRank(cachedPayload.segment.rank) : null;
        const myGenderRank = cachedPayload.gender ? buildMyRank(cachedPayload.gender.rank) : null;

        return {
            rankings: {
                global: {
                    data: globalRankingList,
                    myRank: myGlobalRank
                },
                byAge: {
                    data: segmentRankingList,
                    myRank: mySegmentRank
                },
                byGender: {
                    data: genderRankingList,
                    myRank: myGenderRank
                },
                byPersona: []
            },
            recommendations: {
                message: '',
                personas: [],
                situations: []
            }
        };

    } catch (error) {
        console.error('[PersonalizedRanking] Failed to get exp rankings:', error);
        throw error;
    }
};

/**
 * 사용자 맞춤 랭킹 조회
 * 사용자의 segment, gender, 페르소나 선호도를 고려한 복합 랭킹
 * @param {string} userKey 
 * @param {string} type - 'daily' | 'weekly' | 'monthly'
 * @param {number} limit 
 * @returns {object} 개인화된 랭킹 데이터
 */
export const getPersonalizedRankings = async (userKey, type = 'daily', limit = 100) => {
    try {
        // 1. 사용자 정보 조회
        const userDoc = await firestore.collection('users').doc(String(userKey)).get();
        if (!userDoc.exists) {
            throw new Error('USER_NOT_FOUND');
        }

        const userData = userDoc.data();
        const segment = userData.segment || 'unknown';
        const gender = userData.gender || 'unknown';

        // 2. 페르소나 선호도 조회
        const { topPersonas } = await getUserPersonaPreferences(userKey);
        const categoryPreferences = await calculateCategoryPreferences(userKey);

        // 3. 다양한 랭킹 조회
        const [globalRanking, segmentRanking, genderRanking, myGlobalRank, mySegmentRank, myGenderRank] = await Promise.all([
            // 전체 랭킹
            getTopRankings(type, limit),
            // 같은 연령대 랭킹
            segment !== 'unknown' ? getTopRankings(type, limit, null, { segment }) : Promise.resolve([]),
            // 같은 성별 랭킹
            (gender === 'male' || gender === 'female') ? getTopRankings(type, limit, null, { gender }) : Promise.resolve([]),
            // 내 전체 순위
            getUserRanking(userKey, type),
            // 내 연령대 순위
            segment !== 'unknown' ? getUserRanking(userKey, type, { segment }) : Promise.resolve(null),
            // 내 성별 순위
            (gender === 'male' || gender === 'female') ? getUserRanking(userKey, type, { gender }) : Promise.resolve(null)
        ]);

        // Helper to add isMe flag
        const addIsMe = (list) => (list || []).map(item => ({
            ...item,
            isMe: String(item.userKey) === String(userKey)
        }));

        // 4. 선호 페르소나 랭킹 (상위 3개)
        const favoritePersonaRankings = await Promise.all(
            topPersonas.slice(0, 3).map(async ({ personaId }) => {
                const { getPersonaRanking, getUserPersonaRank } = await import('./personaPreferenceService.js');
                const [ranking, myRank] = await Promise.all([
                    getPersonaRanking(personaId, 10),
                    getUserPersonaRank(userKey, personaId)
                ]);
                return {
                    personaId,
                    category: getPersonaCategory(personaId),
                    ranking: addIsMe(ranking),
                    myRank
                };
            })
        );

        // 5. 추천 카테고리 (선호도 높은 순)
        const recommendedCategories = Object.entries(categoryPreferences)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([category, score]) => ({ category, score }));

        return {
            userInfo: {
                userKey,
                segment,
                gender,
                topPersonas: topPersonas.slice(0, 5)
            },
            rankings: {
                global: {
                    type: 'global',
                    title: '전체 랭킹',
                    data: addIsMe(globalRanking),
                    myRank: myGlobalRank
                },
                byAge: {
                    type: 'segment',
                    title: `${getSegmentLabel(segment)} 랭킹`,
                    data: addIsMe(segmentRanking),
                    myRank: mySegmentRank
                },
                byGender: {
                    type: 'gender',
                    title: `${gender === 'male' ? '남성' : '여성'} 랭킹`,
                    data: addIsMe(genderRanking),
                    myRank: myGenderRank
                },
                byPersona: favoritePersonaRankings
            },
            recommendations: {
                categories: recommendedCategories,
                message: generateRecommendationMessage(segment, categoryPreferences, topPersonas)
            }
        };
    } catch (error) {
        console.error('[PersonalizedRanking] Failed to get personalized rankings:', error);
        throw error;
    }
};

/**
 * 세그먼트 라벨 반환
 * @param {string} segment 
 * @returns {string}
 */
const getSegmentLabel = (segment) => {
    const labels = {
        junior: '10대',
        social_youth: '20대',
        active_career: '30대',
        prime_middle: '40대',
        active_senior: '50대',
        silver_senior: '60대 이상'
    };
    return labels[segment] || '알 수 없음';
};

/**
 * 개인화된 추천 메시지 생성
 * @param {string} segment 
 * @param {object} categoryPreferences 
 * @param {array} topPersonas 
 * @returns {string}
 */
const generateRecommendationMessage = (segment, categoryPreferences, topPersonas) => {
    const segmentLabel = getSegmentLabel(segment);
    const topCategory = Object.entries(categoryPreferences)
        .sort(([, a], [, b]) => b - a)[0];

    const categoryLabels = {
        korean_historical: '한국 역사 인물',
        family: '가족',
        animals: '동물',
        fortune_tellers: '점술/종교',
        lotto: '로또',
        service_workers: '직업인'
    };

    const topCategoryLabel = topCategory ? categoryLabels[topCategory[0]] || '다양한 주제' : '다양한 주제';
    const topPersonaName = topPersonas[0]?.personaId || '다양한 페르소나';

    return `${segmentLabel} 사용자님은 ${topCategoryLabel} 카테고리를 선호하시네요! 특히 ${topPersonaName}와(과) 자주 대화하시는군요. 🎯`;
};

/**
 * 사용자 맞춤 추천 페르소나 목록
 * @param {string} userKey 
 * @param {number} limit 
 * @returns {array} 추천 페르소나 목록
 */
export const getRecommendedPersonas = async (userKey, limit = 10) => {
    try {
        // 1. 사용자 선호도 분석
        const { topPersonas } = await getUserPersonaPreferences(userKey);
        const categoryPreferences = await calculateCategoryPreferences(userKey);

        // ✅ 최적화: 공유 캐시에서 personas 읽기 (Firestore 직접 읽기 제거)
        const cachedPersonas = await getCachedPersonasArray(true);
        const allPersonas = cachedPersonas.map(p => ({
            ...p,
            category: getPersonaCategory(p.id)
        }));

        // 3. 점수 계산 (선호도 기반)
        const scoredPersonas = allPersonas.map(persona => {
            let score = 0;

            // 이미 사용한 페르소나는 낮은 점수 (다양성 증진)
            const usageCount = topPersonas.find(p => p.personaId === persona.id)?.count || 0;
            score -= usageCount * 0.1;

            // 카테고리 선호도 반영
            const categoryScore = categoryPreferences[persona.category] || 0;
            score += categoryScore * 10;

            // 인기도 반영 (ctaCount)
            score += (persona.ctaCount || 0) * 0.01;

            return {
                ...persona,
                recommendationScore: score
            };
        });

        // 4. 점수순 정렬 및 반환
        return scoredPersonas
            .sort((a, b) => b.recommendationScore - a.recommendationScore)
            .slice(0, limit);
    } catch (error) {
        console.error('[PersonalizedRanking] Failed to get recommended personas:', error);
        return [];
    }
};

/**
 * 사용자 맞춤 추천 상황 목록
 * @param {string} userKey 
 * @param {number} limit 
 * @returns {array} 추천 상황 목록
 */
export const getRecommendedSituations = async (userKey, limit = 10) => {
    try {
        // 1. 사용자 정보 조회
        const userDoc = await firestore.collection('users').doc(String(userKey)).get();
        if (!userDoc.exists) {
            return [];
        }

        const userData = userDoc.data();
        const segment = userData.segment || 'unknown';

        // 2. 사용자의 과거 상황 조회 (user_activity_logs에서)
        const usedSituations = new Set();
        if (isActivityLogReadsEnabled()) {
            const logsSnapshot = await firestore.collection('user_activity_logs')
                .where('userKey', '==', String(userKey))
                .where('action', '==', 'GACHA_PULL')
                .orderBy('timestamp', 'desc')
                .limit(100)
                .get();

            logsSnapshot.forEach(doc => {
                const situation = doc.data().details?.situation;
                if (situation) usedSituations.add(situation);
            });
        }

        // 3. ✅ 최적화: 공유 캐시에서 situations 읽기
        const allSituations = await getCachedSituations();

        // 4. 세그먼트별 추천 상황 필터링
        const segmentKeywords = {
            junior: ['학교', '친구', '공부', '진로', '부모님'],
            social_youth: ['연애', '취업', '면접', '직장', '자취'],
            active_career: ['승진', '이직', '결혼', '육아', '재테크'],
            prime_middle: ['건강', '자녀', '노후', '투자', '부모님'],
            active_senior: ['은퇴', '건강', '손자', '여행', '취미'],
            silver_senior: ['건강', '자식', '손주', '병원', '약']
        };

        const keywords = segmentKeywords[segment] || [];

        // 5. 점수 계산
        const scoredSituations = allSituations.map(situation => {
            let score = 0;

            // 이미 사용한 상황은 낮은 점수
            if (usedSituations.has(situation.text || situation.id)) {
                score -= 5;
            }

            // 세그먼트 키워드 매칭
            const text = (situation.text || situation.title || '').toLowerCase();
            keywords.forEach(keyword => {
                if (text.includes(keyword)) {
                    score += 3;
                }
            });

            // 인기도 반영
            score += (situation.clickCount || 0) * 0.01;

            return {
                ...situation,
                recommendationScore: score
            };
        });

        // 6. 점수순 정렬 및 반환
        return scoredSituations
            .sort((a, b) => b.recommendationScore - a.recommendationScore)
            .slice(0, limit);
    } catch (error) {
        console.error('[PersonalizedRanking] Failed to get recommended situations:', error);
        return [];
    }
};

/**
 * 사용자 활동 요약 통계
 * @param {string} userKey 
 * @returns {object} 활동 통계
 */
export const getUserActivitySummary = async (userKey) => {
    try {
        const [userDoc, preferencesData, logsSnapshot] = await Promise.all([
            firestore.collection('users').doc(String(userKey)).get(),
            getUserPersonaPreferences(userKey),
            isActivityLogReadsEnabled() ? firestore.collection('user_activity_logs')
                .where('userKey', '==', String(userKey))
                .where('action', '==', 'GACHA_PULL')
                .orderBy('timestamp', 'desc')
                .limit(100)
                .get() : Promise.resolve(null)
        ]);

        if (!userDoc.exists) {
            throw new Error('USER_NOT_FOUND');
        }

        const userData = userDoc.data();
        const { topPersonas } = preferencesData;

        // 등급별 통계
        const gradeStats = {
            diamond: 0,
            platinum: 0,
            gold: 0,
            silver: 0,
            normal: 0
        };

        let totalPulls = 0;
        logsSnapshot?.forEach(doc => {
            const grade = (doc.data().details?.grade || 'normal').toLowerCase();
            if (gradeStats[grade] !== undefined) {
                gradeStats[grade]++;
            }
            totalPulls++;
        });

        return {
            userKey,
            segment: userData.segment || 'unknown',
            gender: userData.gender || 'unknown',
            totalPulls,
            gradeStats,
            topPersonas: topPersonas.slice(0, 5),
            averageGrade: calculateAverageGrade(gradeStats),
            luckyScore: calculateLuckyScore(gradeStats, totalPulls)
        };
    } catch (error) {
        console.error('[PersonalizedRanking] Failed to get activity summary:', error);
        throw error;
    }
};

/**
 * 평균 등급 계산
 * @param {object} gradeStats 
 * @returns {string}
 */
const calculateAverageGrade = (gradeStats) => {
    const gradeValues = {
        diamond: 5,
        platinum: 4,
        gold: 3,
        silver: 2,
        normal: 1
    };

    let totalValue = 0;
    let totalCount = 0;

    Object.entries(gradeStats).forEach(([grade, count]) => {
        totalValue += gradeValues[grade] * count;
        totalCount += count;
    });

    if (totalCount === 0) return 'NORMAL';

    const average = totalValue / totalCount;
    if (average >= 4.5) return 'DIAMOND';
    if (average >= 3.5) return 'PLATINUM';
    if (average >= 2.5) return 'GOLD';
    if (average >= 1.5) return 'SILVER';
    return 'NORMAL';
};

/**
 * 행운 점수 계산 (0-100)
 * @param {object} gradeStats 
 * @param {number} totalPulls 
 * @returns {number}
 */
const calculateLuckyScore = (gradeStats, totalPulls) => {
    if (totalPulls === 0) return 50;

    const weights = {
        diamond: 50,
        platinum: 20,
        gold: 10,
        silver: 5,
        normal: 1
    };

    let score = 0;
    Object.entries(gradeStats).forEach(([grade, count]) => {
        score += weights[grade] * count;
    });

    // 정규화 (0-100)
    const maxPossibleScore = totalPulls * weights.diamond;
    return Math.min(100, Math.round((score / maxPossibleScore) * 100));
};
