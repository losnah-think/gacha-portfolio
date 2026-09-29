import { firestore, FieldValue } from '../lib/firebaseAdmin.js';
import { getKstDateKey, safeNickname } from '../utils/helpers.js';

/**
 * 페르소나 선호도 분석 서비스
 * 사용자의 페르소나 사용 패턴을 분석하고 개인화된 추천을 제공
 */

// ✅ 최적화 #12: persona 랭킹 배치 쓰기 (60초 버퍼)
// 가챠 1회당 즉시 2 writes → 배치로 ~30K~50K writes/일 절감
const _personaRankingBuffer = {};  // key: `{docPath}_{userKey}` → { ref, data }
let _personaRankingFlushTimer = null;
const PERSONA_RANKING_FLUSH_INTERVAL = 60 * 1000; // 60초

async function _flushPersonaRankings() {
    const entries = Object.entries(_personaRankingBuffer);
    if (entries.length === 0) return;

    // 현재 버퍼 스냅샷 복사 후 즉시 비우기
    const toFlush = [...entries];
    for (const key of Object.keys(_personaRankingBuffer)) {
        delete _personaRankingBuffer[key];
    }

    try {
        const batch = firestore.batch();
        let count = 0;
        for (const [, { ref, data }] of toFlush) {
            batch.set(ref, data, { merge: true });
            count++;
            if (count >= 500) break; // Firestore batch limit
        }
        await batch.commit();
    } catch (e) {
        console.error('[PersonaRanking] Batch flush failed:', e);
    }
}

function _schedulePersonaRankingFlush() {
    if (_personaRankingFlushTimer) return;
    _personaRankingFlushTimer = setTimeout(async () => {
        _personaRankingFlushTimer = null;
        await _flushPersonaRankings();
    }, PERSONA_RANKING_FLUSH_INTERVAL);
}

/**
 * 사용자의 페르소나 사용 기록 업데이트
 * @param {string} userKey 
 * @param {string} personaId 
 * @param {string} grade - 획득한 등급
 */
export const recordPersonaUsage = async (userKey, personaId, grade = 'NORMAL') => {
    try {
        const userPersonaRef = firestore
            .collection('user_persona_preferences')
            .doc(String(userKey));

        // 페르소나별 카운트 증가 (중첩 객체 구조로 업데이트하여 데이터 일관성 유지)
        const updates = {
            personas: {
                [personaId]: {
                    count: FieldValue.increment(1),
                    lastUsed: FieldValue.serverTimestamp(),
                    grades: {
                        [grade.toLowerCase()]: FieldValue.increment(1)
                    }
                }
            },
            lastUpdated: FieldValue.serverTimestamp()
        };

        await userPersonaRef.set(updates, { merge: true });
    } catch (error) {
        console.error('[PersonaPreference] Failed to record usage:', error);
    }
};

/**
 * 사용자의 페르소나 선호도 조회
 * @param {string} userKey 
 * @returns {object} 페르소나별 사용 통계
 */
export const getUserPersonaPreferences = async (userKey) => {
    try {
        const doc = await firestore
            .collection('user_persona_preferences')
            .doc(String(userKey))
            .get();

        if (!doc.exists) {
            return { personas: {}, topPersonas: [] };
        }

        const data = doc.data();
        const personas = data.personas || {};

        // 사용 빈도순으로 정렬
        const topPersonas = Object.entries(personas)
            .map(([personaId, stats]) => ({
                personaId,
                count: stats.count || 0,
                lastUsed: stats.lastUsed,
                grades: stats.grades || {}
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10); // 상위 10개

        return {
            personas,
            topPersonas
        };
    } catch (error) {
        console.error('[PersonaPreference] Failed to get preferences:', error);
        return { personas: {}, topPersonas: [] };
    }
};

/**
 * 페르소나 카테고리 분류
 * @param {string} personaId 
 * @returns {string} 카테고리
 */
export const getPersonaCategory = (personaId) => {
    const id = personaId.toLowerCase();

    // 한국 역사 인물
    if (['sejong', 'sun_shin', 'yi_hwang', 'yi_i'].some(k => id.includes(k))) {
        return 'korean_historical';
    }

    // 가족
    if (['mom', 'dad', 'family', 'grandma', 'grandpa'].some(k => id.includes(k))) {
        return 'family';
    }

    // 동물
    if (['dog', 'cat', 'puppy', 'kitten', 'pet', '진돗개', '고양이'].some(k => id.includes(k))) {
        return 'animals';
    }

    // 점술/종교
    if (['fortune', 'shaman', 'pastor', 'priest', 'monk', '무당', '점술', '스님'].some(k => id.includes(k))) {
        return 'fortune_tellers';
    }

    // 로또
    if (['lotto', '추첨', 'lottery'].some(k => id.includes(k))) {
        return 'lotto';
    }

    // 직업/서비스
    if (['taxi', 'driver', 'part_time', 'worker'].some(k => id.includes(k))) {
        return 'service_workers';
    }

    return 'other';
};

/**
 * 사용자의 페르소나 카테고리 선호도 계산
 * @param {string} userKey 
 * @returns {object} 카테고리별 선호도 점수 (0-1)
 */
export const calculateCategoryPreferences = async (userKey) => {
    try {
        const { personas } = await getUserPersonaPreferences(userKey);

        const categoryScores = {};
        let totalUsage = 0;

        // 카테고리별 사용 횟수 집계
        Object.entries(personas).forEach(([personaId, stats]) => {
            const category = getPersonaCategory(personaId);
            const count = stats.count || 0;

            categoryScores[category] = (categoryScores[category] || 0) + count;
            totalUsage += count;
        });

        // 정규화 (0-1 범위)
        const preferences = {};
        Object.entries(categoryScores).forEach(([category, score]) => {
            preferences[category] = totalUsage > 0 ? score / totalUsage : 0;
        });

        return preferences;
    } catch (error) {
        console.error('[PersonaPreference] Failed to calculate category preferences:', error);
        return {};
    }
};

/**
 * 페르소나별 랭킹 업데이트
 * @param {string} userKey 
 * @param {string} personaId 
 * @param {string} nickname 
 * @param {number} points 
 * @param {object} userMetadata 
 */
export const updatePersonaRanking = async (userKey, personaId, nickname, points, userMetadata = {}) => {
    try {
        const today = getKstDateKey();
        const category = getPersonaCategory(personaId);

        // ✅ 최적화: 즉시 쓰기 대신 60초 버퍼에 누적
        const personaDocPath = `daily_${today}_persona_${personaId}`;
        const personaKey = `${personaDocPath}_${userKey}`;
        const rankingRef = firestore
            .collection('rankings')
            .doc(personaDocPath)
            .collection('users')
            .doc(String(userKey));

        _personaRankingBuffer[personaKey] = {
            ref: rankingRef,
            data: {
                userKey: String(userKey),
                nickname: nickname || '익명',
                personaId,
                category,
                count: FieldValue.increment(points),
                segment: userMetadata.segment || 'unknown',
                gender: userMetadata.gender || 'unknown',
                updatedAt: FieldValue.serverTimestamp()
            }
        };

        // 카테고리별 랭킹도 버퍼에 추가
        if (category !== 'other') {
            const catDocPath = `daily_${today}_category_${category}`;
            const catKey = `${catDocPath}_${userKey}`;
            const categoryRankingRef = firestore
                .collection('rankings')
                .doc(catDocPath)
                .collection('users')
                .doc(String(userKey));

            _personaRankingBuffer[catKey] = {
                ref: categoryRankingRef,
                data: {
                    userKey: String(userKey),
                    nickname: nickname || '익명',
                    category,
                    count: FieldValue.increment(points),
                    segment: userMetadata.segment || 'unknown',
                    gender: userMetadata.gender || 'unknown',
                    updatedAt: FieldValue.serverTimestamp()
                }
            };
        }

        _schedulePersonaRankingFlush();
    } catch (error) {
        console.error('[PersonaPreference] Failed to update persona ranking:', error);
    }
};

/**
 * 페르소나별 랭킹 조회
 * @param {string} personaId 
 * @param {number} limit 
 * @returns {array} 랭킹 목록
 */
export const getPersonaRanking = async (personaId, limit = 20) => {
    try {
        const today = getKstDateKey();
        const snapshot = await firestore
            .collection('rankings')
            .doc(`daily_${today}_persona_${personaId}`)
            .collection('users')
            .orderBy('count', 'desc')
            .limit(limit)
            .get();

        const rankings = [];
        let rank = 1;

        snapshot.forEach(doc => {
            const data = doc.data();
            rankings.push({
                rank: rank++,
                userKey: data.userKey,
                nickname: data.nickname,
                score: data.count || 0,
                personaId: data.personaId,
                category: data.category
            });
        });

        // 암호화 닉네임 일괄 복호화
        await Promise.all(rankings.map(async (r) => {
            r.nickname = await safeNickname(r.nickname, r.userKey);
        }));

        return rankings;
    } catch (error) {
        console.error('[PersonaPreference] Failed to get persona ranking:', error);
        return [];
    }
};

/**
 * 카테고리별 랭킹 조회
 * @param {string} category 
 * @param {number} limit 
 * @returns {array} 랭킹 목록
 */
export const getCategoryRanking = async (category, limit = 20) => {
    try {
        const today = getKstDateKey();
        const snapshot = await firestore
            .collection('rankings')
            .doc(`daily_${today}_category_${category}`)
            .collection('users')
            .orderBy('count', 'desc')
            .limit(limit)
            .get();

        const rankings = [];
        let rank = 1;

        snapshot.forEach(doc => {
            const data = doc.data();
            rankings.push({
                rank: rank++,
                userKey: data.userKey,
                nickname: data.nickname,
                score: data.count || 0,
                category: data.category
            });
        });

        // 암호화 닉네임 일괄 복호화
        await Promise.all(rankings.map(async (r) => {
            r.nickname = await safeNickname(r.nickname, r.userKey);
        }));

        return rankings;
    } catch (error) {
        console.error('[PersonaPreference] Failed to get category ranking:', error);
        return [];
    }
};

/**
 * 사용자의 페르소나별 순위 조회
 * @param {string} userKey 
 * @param {string} personaId 
 * @returns {object} 순위 정보
 */
export const getUserPersonaRank = async (userKey, personaId) => {
    try {
        const today = getKstDateKey();
        const userRef = firestore
            .collection('rankings')
            .doc(`daily_${today}_persona_${personaId}`)
            .collection('users')
            .doc(String(userKey));

        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return {
                rank: 0,
                score: 0,
                personaId,
                message: '아직 이 페르소나로 활동 기록이 없습니다.'
            };
        }

        const userData = userDoc.data();
        const userScore = userData.count || 0;

        // 내 점수보다 높은 사람 수 계산
        const higherCount = await firestore
            .collection('rankings')
            .doc(`daily_${today}_persona_${personaId}`)
            .collection('users')
            .where('count', '>', userScore)
            .count()
            .get();

        const rank = higherCount.data().count + 1;

        return {
            rank,
            score: userScore,
            personaId,
            nickname: await safeNickname(userData.nickname, String(userKey))
        };
    } catch (error) {
        console.error('[PersonaPreference] Failed to get user persona rank:', error);
        return { rank: 0, score: 0, personaId };
    }
};
