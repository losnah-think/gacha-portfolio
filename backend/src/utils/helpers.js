import { firestore, FieldValue } from '../lib/firebaseAdmin.js';
import { generateRandomNickname } from './nicknameGenerator.js';
import { decryptTossUserInfo } from './tossCrypto.js';

/**
 * 닉네임이 Toss 암호화 값(Base64)인지 감지 후,
 * 맞으면 복호화하여 반환. 일반 문자열이면 그대로 반환.
 * 복호화 실패 시 랜덤 닉네임으로 폴백.
 *
 * @param {string} nickname
 * @param {string} [userKey] - DB 자동 갱신용 (옵션)
 * @returns {Promise<string>}
 */
export const safeNickname = async (nickname, userKey) => {
    if (!nickname) return '익명';

    // Base64로 인코딩된 Toss 암호문 감지:
    // - 20자 이상, ASCII-only, base64 문자만 구성, = 패딩 존재 가능
    const isLikelyEncrypted = /^[A-Za-z0-9+/]{20,}={0,2}$/.test(nickname);
    if (!isLikelyEncrypted) return nickname;

    try {
        const decrypted = await decryptTossUserInfo(nickname);
        if (decrypted && decrypted.length >= 1) {
            // DB에 복호화된 값으로 자동 갱신 (fire-and-forget)
            if (userKey) {
                firestore.collection('users').doc(String(userKey))
                    .update({ nickname: decrypted, _nicknameDecryptedAt: FieldValue.serverTimestamp() })
                    .catch(() => { });
            }
            return decrypted;
        }
    } catch {
        // 복호화 실패 → 랜덤 닉네임 폴백 + DB 갱신
        const fallback = generateRandomNickname();
        if (userKey) {
            firestore.collection('users').doc(String(userKey))
                .update({ nickname: fallback, _nicknameAutoFixed: true, updatedAt: FieldValue.serverTimestamp() })
                .catch(() => { });
        }
        return fallback;
    }

    return nickname;
};

export const getKstDateKey = (date = new Date()) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(date); // YYYY-MM-DD
};

export const getKstMonthKey = (date = new Date()) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit'
    });
    return formatter.format(date).substring(0, 7); // YYYY-MM
};

export const getKstWeekKey = (date = new Date()) => {
    // KST 기준으로 해당 객체의 연도와 주차 계산
    const kstDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const d = new Date(Date.UTC(kstDate.getFullYear(), kstDate.getMonth(), kstDate.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

export const getUserDocRef = (userKey) => firestore.collection('users').doc(String(userKey));

export const isActivityLogReadsEnabled = () => process.env.ENABLE_ACTIVITY_LOG_READS === 'true';

/**
 * Standardize Ticket Access (V1/V2 Unification)
 * - ticketsTotal: V2 Standard
 * - tickets: V1 Legacy
 * - ticket: Ancient Legacy
 */
export const getTicketBalance = (userData) => {
    if (!userData) return 0;
    // Prefer V2 standard
    if (userData.ticketsTotal !== undefined) return Number(userData.ticketsTotal);
    // Fallback to V1
    if (userData.tickets !== undefined) return Number(userData.tickets);
    // Fallback to Ancient
    if (userData.ticket !== undefined) return Number(userData.ticket);
    // Default
    return 0;
};

/**
 * 리스트/요약용 스니펫 — 문장 중간에서 끊기지 않게 단어(공백) 경계에서 자르고 '…' 부여.
 * 마크다운 기호/개행 제거.
 * @param {string} text
 * @param {number} maxLen 최대 길이(기본 42)
 */
export const makeSnippet = (text, maxLen = 42) => {
    const clean = String(text || '')
        .replace(/###\s+/g, '')
        .replace(/\*\*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (clean.length <= maxLen) return clean;
    const cut = clean.slice(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    const base = lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut;
    return base.trim() + '…';
};

/**
 * 레벨 → 다음 레벨까지 필요 EXP (전역 공용)
 * 🎮 RPG 스타일 기하급수적 성장 곡선
 */
export const getExpToNext = (level) => Math.round(50 * Math.pow(1.15, level - 1) + level * 15);

/**
 * 레벨/경험치 정규화 — characterExp < expToNext를 항상 보장
 * DB에서 raw 값을 읽은 후 반드시 이 함수를 거쳐서 반환해야 함.
 * @param {number} rawLevel
 * @param {number} rawExp
 * @returns {{ characterLevel: number, characterExp: number, expToNext: number }}
 */
export const normalizeLevel = (rawLevel, rawExp) => {
    let level = rawLevel || 1;
    let exp = rawExp || 0;
    let expToNext = getExpToNext(level);
    while (exp >= expToNext) {
        exp -= expToNext;
        level += 1;
        expToNext = getExpToNext(level);
    }
    return { characterLevel: level, characterExp: exp, expToNext };
};

// [성능 개선] 메모리 캐시: 요청이 빈번한 유저 메타데이터를 짧은 시간(30초) 동안 캐싱하여 DB 부하 감소
const metadataCache = new Map();
const METADATA_TTL = 30 * 1000;

/** 특정 유저의 메타데이터 캐시 무효화 */
export const invalidateMetadataCache = (userKey) => {
    metadataCache.delete(String(userKey));
};
const MAX_CACHE_SIZE = 10000;

/**
 * 사용자 메타데이터 로드 및 자동 동기화
 * 기존 유저의 정보(name/nickname 등)를 정규화하고, 
 * 요청 시 전달된 새로운 정보가 있다면 DB를 업데이트함.
 */
export const loadAndSyncUserMetadata = async (userKey, providedData = {}) => {
    try {
        const now = Date.now();
        const cached = metadataCache.get(userKey);

        // 캐시가 유효하고, 업데이트 요청(providedData)이 없는 경우 캐시 반환
        if (cached && (now - cached.timestamp < METADATA_TTL) && Object.keys(providedData).length === 0) {
            return cached.data;
        }

        // [추가] 대규모 유저 대응: 캐시 크기 관리 (1만명 이상 시 초기화)
        if (metadataCache.size > MAX_CACHE_SIZE) {
            metadataCache.clear();
        }

        const userRef = getUserDocRef(userKey);
        const snap = await userRef.get();
        const dbData = snap.exists ? snap.data() : {};

        // 1. 데이터 추출 및 정규화 (기존 유저 대응)
        // [수정] 실명 노출 방지: 닉네임이 없거나 실명으로 의심되는 경우(2~4자 한글 등) 랜덤 생성
        const isRealNameLikely = (str) => {
            if (!str) return true;
            const cleanStr = str.trim();
            // 2~4글자 한글이고 공백이 없으면 실명일 확률이 높음
            const koreanNameRegex = /^[가-힣]{2,4}$/;
            return koreanNameRegex.test(cleanStr);
        };

        let nickname = dbData.nickname || providedData.nickname;

        // [FIX] 유저가 직접 설정한 닉네임은 실명 체크 건너뜀
        const isUserSetNickname = dbData._nicknameUserSet === true;

        // 닉네임이 없거나, 실명처럼 보이는 경우 랜덤 닉네임으로 강제 전환
        // 단, 유저가 직접 설정한 닉네임은 보존
        if (!isUserSetNickname && (!nickname || isRealNameLikely(nickname))) {
            nickname = generateRandomNickname();
            console.log(`[loadAndSyncUserMetadata] Sanitized/Generated nickname for ${userKey}: ${nickname}`);
        }

        let gender = (providedData.gender || dbData.gender || '').toLowerCase();
        // 성별 정규화 (M/MALE -> male, F/FEMALE -> female)
        if (gender === 'm' || gender === 'male') gender = 'male';
        else if (gender === 'f' || gender === 'female') gender = 'female';
        else gender = ''; // 알 수 없는 경우 빈 값

        const birthdate = providedData.birthdate || providedData.birthday || dbData.birthdate || dbData.birthday || '';
        const nationality = providedData.nationality || dbData.nationality || '';
        const testResult = providedData.testResult || providedData.result || dbData.result || dbData.testResult || '';


        // 2. DB 업데이트가 필요한지 확인 (새로운 정보 유입 시 덮어쓰기 허용)
        const updates = {};

        // 닉네임 업데이트 로직 (검증 통과한 경우만 업데이트)
        // 만약 들어온 값이 실명이면 업데이트하지 않고 현재(또는 이미 생성된 랜덤) 값을 유지
        // [FIX] 유저가 직접 설정한 닉네임(_nicknameUserSet)은 절대 덮어쓰지 않음
        if (isUserSetNickname) {
            // 유저 설정 닉네임은 DB 그대로 유지, updates에 넣지 않음
        } else if (providedData.nickname && providedData.nickname !== dbData.nickname && !isRealNameLikely(providedData.nickname)) {
            updates.nickname = providedData.nickname;
        } else if (!dbData.nickname || isRealNameLikely(dbData.nickname)) {
            // DB에 없거나, DB에 있는게 실명이면 새 닉네임으로 교체
            updates.nickname = nickname;
        }

        if (providedData.name && providedData.name !== dbData.name) updates.name = providedData.name;

        if (gender && !dbData.gender) updates.gender = gender;
        if (birthdate && !dbData.birthdate) updates.birthdate = birthdate;
        if (nationality && !dbData.nationality) updates.nationality = nationality;
        if (testResult && !dbData.result) updates.result = testResult;

        if (Object.keys(updates).length > 0) {
            updates.updatedAt = FieldValue.serverTimestamp();
            if (!snap.exists) updates.createdAt = FieldValue.serverTimestamp();

            // 마케팅 세그먼트 자동 계산 및 저장
            if (updates.birthdate) {
                updates.segment = calculateUserSegment(updates.birthdate);
            }

            await userRef.set(updates, { merge: true });
            console.log(`[loadAndSyncUserMetadata] Updated profile & segment for user ${userKey}`);
        }

        const result = {
            nickname,
            gender,
            birthdate,
            nationality,
            testResult,
            segment: updates.segment || dbData.segment || 'unknown',
            raw: { ...dbData, ...providedData, ...updates }
        };

        // Cache the normalized result
        metadataCache.set(userKey, { data: result, timestamp: Date.now() });

        return result;
    } catch (error) {
        console.error('Error in loadAndSyncUserMetadata:', error);
        return providedData;
    }
};




/**
 * 최적화 #3: daily_stats 배치 플러시 (30초 주기)
 * 상세 이벤트 로그(user_activity_logs) 신규 적재는 중단.
 * daily_stats 업데이트는 메모리에 누적 후 30초마다 한 번만 Firestore 쓰기.
 */
const _statsBuffer = {};        // { dateKey: { count_ACTION: N, total_actions: N, ... }}
const _adSubBuffer = {};        // { dateKey: { ad_xxx: N, ... }}
let _flushTimer = null;
const FLUSH_INTERVAL_MS = 30 * 1000; // 30초

function _scheduleFlush() {
    if (_flushTimer) return;
    _flushTimer = setTimeout(async () => {
        _flushTimer = null;
        await _flushStatsBuffer();
    }, FLUSH_INTERVAL_MS);
}

async function _flushStatsBuffer() {
    const dates = new Set([...Object.keys(_statsBuffer), ...Object.keys(_adSubBuffer)]);
    if (dates.size === 0) return;

    for (const dateKey of dates) {
        const updates = {};
        if (_statsBuffer[dateKey]) {
            Object.entries(_statsBuffer[dateKey]).forEach(([k, v]) => { updates[k] = FieldValue.increment(v); });
            delete _statsBuffer[dateKey];
        }
        if (_adSubBuffer[dateKey]) {
            Object.entries(_adSubBuffer[dateKey]).forEach(([k, v]) => { updates[k] = FieldValue.increment(v); });
            delete _adSubBuffer[dateKey];
        }
        if (Object.keys(updates).length > 0) {
            updates.updatedAt = FieldValue.serverTimestamp();
            await firestore.collection('daily_stats').doc(dateKey)
                .set(updates, { merge: true })
                .catch(e => console.error('[StatsFlush] Failed:', e));
        }
    }
}

// 서버 종료 시 남은 버퍼 강제 플러시

/**
 * 사용자 행동 로깅
 * - 상세 이벤트 로그(user_activity_logs) 신규 적재는 중단
 * - daily_stats만 메모리 버퍼 → 30초 배치 플러시로 유지
 */

// 고빈도 이벤트: daily_stats 집계만으로 충분하여 개별 로그 불필요
const STATS_ONLY_ACTIONS = new Set([
    'AD_SHOW_START',
    'AD_SHOW_COMPLETE',
    'AD_CLICK',
    'PAGE_VIEW',
    'APP_OPEN',
    'BOOTSTRAP_LOAD',
    'PERSONA_CLICK'
]);

export const logUserAction = async (userKey, action, details = {}) => {
    try {
        const today = getKstDateKey();
        // 1. daily_stats: 메모리 버퍼에 누적 (Firestore 쓰기 안 함)
        if (!_statsBuffer[today]) _statsBuffer[today] = {};
        _statsBuffer[today][`count_${action}`] = (_statsBuffer[today][`count_${action}`] || 0) + 1;
        _statsBuffer[today].total_actions = (_statsBuffer[today].total_actions || 0) + 1;

        // 2. 광고 포맷별 상세 집계도 버퍼에
        if (action.includes('AD') && details.adFormat) {
            const subKey = `ad_${action.toLowerCase()}_${details.adFormat.toLowerCase()}`;
            if (!_adSubBuffer[today]) _adSubBuffer[today] = {};
            _adSubBuffer[today][subKey] = (_adSubBuffer[today][subKey] || 0) + 1;
        }

        // 3. PERSONA_CLICK은 즉시 처리 (빈도 낮고 실시간 반영 필요)
        if (action === 'PERSONA_CLICK' && details.personaId) {
            firestore.collection('personas').doc(details.personaId).set({
                ctaCount: FieldValue.increment(1),
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true }).catch(e => console.error('Persona stats update failed:', e));
        }

        // 30초 후 배치 플러시 예약
        _scheduleFlush();

    } catch (error) {
        console.error('Failed to log user action:', error);
    }
};


/**
 * 전용 마케팅 이벤트 트래커
 */
export const trackMarketingEvent = (userKey, eventType, data = {}) => {
    // 비동기 실행 (응답 속도에 영향을 주지 않도록)
    logUserAction(userKey, `MARKETING_${eventType.toUpperCase()}`, data);
};

export const requireCredentials = (res) => {
    const CLIENT_ID = process.env.TOSS_CLIENT_ID || process.env.CLIENT_ID;
    const CLIENT_SECRET = process.env.TOSS_CLIENT_SECRET || process.env.CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) {
        res.status(500).json({
            resultType: 'FAIL',
            error: 'Missing Client id or secret'
        });
        return false;
    }
    return true;
};
/**
 * 생년월일을 기반으로 현재 나이 계산
 */
export const calculateAge = (birthdate) => {
    if (!birthdate) return 0;
    try {
        let dateStr = birthdate;
        if (typeof birthdate === 'string' && birthdate.length === 8 && !birthdate.includes('-')) {
            dateStr = `${birthdate.substring(0, 4)}-${birthdate.substring(4, 6)}-${birthdate.substring(6, 8)}`;
        }
        const birthYear = new Date(dateStr).getFullYear();
        if (isNaN(birthYear)) return 0;
        const currentYear = new Date().getFullYear();
        return currentYear - birthYear + 1;
    } catch (e) {
        return 0;
    }
};

/**
 * 마케팅 타겟팅을 위한 연령대(Segment) 계산
 * @param {string} birthdate - YYYY-MM-DD
 * @returns {string} segment 명칭
 */
export const calculateUserSegment = (birthdate) => {
    const age = calculateAge(birthdate);
    if (!age) return 'unknown';
    if (age >= 60) return 'silver_senior';
    if (age >= 50) return 'active_senior';
    if (age >= 40) return 'prime_middle';
    if (age >= 30) return 'active_career';
    if (age >= 20) return 'social_youth';
    return 'junior';
};

/**
 * 사용자 연령에 따른 추천 폰트 설정 반환
 * @param {string} birthdate - YYYY-MM-DD 형식
 * @returns {object} { fontSize: 'LARGE' | 'NORMAL' }
 */
export const getRecommendedFontConfig = (birthdate) => {
    const age = calculateAge(birthdate);
    if (age === 0) return { fontSize: 'NORMAL' };

    // 40대 이상은 LARGE, 그 외는 NORMAL 추천
    return {
        fontSize: age >= 40 ? 'LARGE' : 'NORMAL'
    };
};

/**
 * 생년월일(MMDD only or full date)을 받아 별자리 반환
 * @param {string} dateStr - 'example-user' or '1225' or '1990-12-25'
 * @returns {string} 별자리 이름 (예: '염소자리')
 */
export const getZodiacSign = (dateStr) => {
    if (!dateStr) return '물병자리'; // Default

    // YYYY-MM-DD -> MMDD
    // YYYYMMDD -> MMDD
    let mm, dd;

    try {
        let cleanStr = dateStr.replace(/-/g, '');
        if (cleanStr.length === 8) {
            mm = parseInt(cleanStr.substring(4, 6));
            dd = parseInt(cleanStr.substring(6, 8));
        } else if (cleanStr.length === 4) {
            mm = parseInt(cleanStr.substring(0, 2));
            dd = parseInt(cleanStr.substring(2, 4));
        } else {
            return '물병자리';
        }

        if (isNaN(mm) || isNaN(dd)) return '물병자리';

        // 별자리 로직
        if ((mm === 1 && dd >= 20) || (mm === 2 && dd <= 18)) return "물병자리";
        if ((mm === 2 && dd >= 19) || (mm === 3 && dd <= 20)) return "물고기자리";
        if ((mm === 3 && dd >= 21) || (mm === 4 && dd <= 19)) return "양자리";
        if ((mm === 4 && dd >= 20) || (mm === 5 && dd <= 20)) return "황소자리";
        if ((mm === 5 && dd >= 21) || (mm === 6 && dd <= 21)) return "쌍둥이자리";
        if ((mm === 6 && dd >= 22) || (mm === 7 && dd <= 22)) return "게자리";
        if ((mm === 7 && dd >= 23) || (mm === 8 && dd <= 22)) return "사자자리";
        if ((mm === 8 && dd >= 23) || (mm === 9 && dd <= 22)) return "처녀자리";
        if ((mm === 9 && dd >= 23) || (mm === 10 && dd <= 22)) return "천칭자리";
        if ((mm === 10 && dd >= 23) || (mm === 11 && dd <= 22)) return "전갈자리";
        if ((mm === 11 && dd >= 23) || (mm === 12 && dd <= 24)) return "사수자리";
        return "염소자리";

    } catch (e) {
        return '물병자리';
    }
};
