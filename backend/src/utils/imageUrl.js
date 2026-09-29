
/**
 * Image URL Resolution Utility
 * 
 * Handles converting Firebase Storage URLs or relative paths to CDN URLs.
 */

const STORAGE_BUCKET = process.env.APP_FIREBASE_PROJECT_ID ? `${process.env.APP_FIREBASE_PROJECT_ID}.firebasestorage.app` : 'example-project.firebasestorage.app';
const CDN_BASE_URL = process.env.IMAGE_CDN_BASE_URL || '';

// Default image for personas when none is provided
const DEFAULT_PERSONA_IMAGE = 'images/personas/nano_banana.png';

/**
 * Centered mapping for Persona IDs to their actual GCS filenames.
 */
export const PERSONA_IMAGE_MAP = {
    'lotto_generator': 'images/personas/lotto.png',
    'lotto_machine': 'images/personas/lotto.png',
    'king_sejong': 'images/personas/king_sejong.png',
    'yi_sun_shin': 'images/personas/yi_sun_shin.png',
    'socrates': 'images/personas/socrates.png',
    'einstein': 'images/personas/einstein.png',
    'nano_banana': 'images/personas/nano_banana.png',
    'cat': 'images/personas/cat.png',
    'dog': 'images/personas/dog.png',
    'healing_단골_카페_사장님': 'images/personas/cafe_owner.png',
    'situation_잔소리꾼_엄마': 'images/personas/nagging_mom.png',
    'family_우리_아빠': 'images/personas/dad_manager.png',
    'fantasy_하얀_날개의_천사': 'images/personas/angel.png',
    'fantasy_장난꾸러기_악마': 'images/personas/devil.png',
    'seollal_moon': 'images/personas/seollal_moon.png',
    'mystic_fortune_teller': 'images/personas/fortune_teller.png',
    'mystic_shaman': 'images/personas/shaman.png',
    'religious_monk': 'images/personas/monk.png',
    'religious_pastor': 'images/personas/pastor.png',
    'religious_priest': 'images/personas/priest.png',
    'grandmother': 'images/personas/grandmother.png',
    'grandfather': 'images/personas/grandfather.png',
    'grandson': 'images/personas/grandson.png',
    'granddaughter': 'images/personas/granddaughter.png',
    'steve_jobs': 'images/personas/steve_jobs.png',
    'taxi': 'images/personas/chatty_taxi_driver.png',

    // V3 Personas
    'v3_lucy': 'images/personas/v3_lucy.png',
    'v3_cupid': 'images/personas/v3_cupid.png',
    'v3_pachinko': 'images/personas/v3_pachinko.png',
    'v3_gachabot': 'images/personas/v3_gachabot.png',
    'v3_lucky7': 'images/personas/v3_lucky7.png',

    // Counseling Personas
    'dream_interpreter': 'images/personas/dream_interpreter.png',
    'tarot_master': 'images/personas/tarot_master.png',
    'finance_advisor': 'images/personas/finance_advisor.png',
    'parenting_coach': 'images/personas/parenting_coach.png',
    'interview_coach': 'images/personas/interview_coach.png'
};

/**
 * Maps common names or variations to their Canonical Persona ID.
 * This ensures that storage results map correctly to discovery personas.
 */
export const CANONICAL_PERSONA_MAP = {
    '로또': 'lotto_generator',
    '로또 번호 추첨기': 'lotto_generator',
    '로또번호추첨기': 'lotto_generator',
    '로또번호 추첨기': 'lotto_generator',
    '로또번호_추첨기': 'lotto_generator',
    '로또 추첨기': 'lotto_generator',
    '추첨기': 'lotto_generator',
    'lotto': 'lotto_generator',
    'Lotto': 'lotto_generator',
    'lotto_machine': 'lotto_generator',
    'lotto_generator': 'lotto_generator',

    '스티브 잡스': 'steve_jobs',
    '스티브잡스': 'steve_jobs',
    'steve_jobs': 'steve_jobs',
    'jobs': 'steve_jobs',
    '스티브': 'steve_jobs',

    '세종대왕': 'king_sejong',
    '이순신': 'yi_sun_shin',
    '이순신 장군': 'yi_sun_shin',
    '이숭신': 'yi_sun_shin',
    '소크라테스': 'socrates',
    '에인슈타인': 'einstein',
    '아인슈타인': 'einstein',
    '설날 보름달': 'seollal_moon',
    '보름달': 'seollal_moon',
    'seollal_moon': 'seollal_moon',

    '엄마': 'situation_잔소리꾼_엄마',
    '잔소리꾼 엄마': 'situation_잔소리꾼_엄마',
    '아빠': 'family_우리_아빠',
    '우리 아빠': 'family_우리_아빠',
    '우리아빠': 'family_우리_아빠',

    '고양이': 'cat',
    'cat': 'cat',
    '길고양이': 'cat',
    '길냥이': 'cat',
    '길고냥이': 'cat',
    '강아지': 'dog',
    'dog': 'dog',
    '충직한 진돗개': 'dog',
    '진돗개': 'dog',

    '카페 사장님': 'healing_단골_카페_사장님',
    '단골 카페 사장님': 'healing_단골_카페_사장님',
    '점술가': 'mystic_fortune_teller',
    'teller': 'mystic_fortune_teller',
    'fortune_teller': 'mystic_fortune_teller',
    'mystic_fortune_teller': 'mystic_fortune_teller',
    '타로 점술가': 'mystic_fortune_teller',
    'fortune_타로_점술가': 'mystic_fortune_teller',
    'fortune 타로 점술가': 'mystic_fortune_teller',
    '타로': 'mystic_fortune_teller',
    '타로카드': 'mystic_fortune_teller',
    'fortune_타로_점술가': 'mystic_fortune_teller',

    '택시기사': 'taxi',
    '택시 기사': 'taxi',
    '수다쟁이 택시기사': 'taxi',

    '할머니': 'grandmother',
    '인자한 할머니': 'grandmother',
    '할아버지': 'grandfather',
    '지혜로운 할아버지': 'grandfather',
    '손자': 'grandson',
    '귀염둥이 손자': 'grandson',
    '손녀': 'granddaughter',
    '애교쟁이 손녀': 'granddaughter',

    '고양이': 'cat',
    '길고양이': 'cat',
    '길냥이': 'cat',
    '강아지': 'dog',
    '충직한 진돗개': 'dog',
    '진돗개': 'dog',

    // V3 Personas
    'v3_lucy': 'v3_lucy',
    'v3_cupid': 'v3_cupid',
    'v3_pachinko': 'v3_pachinko',
    'v3_gachabot': 'v3_gachabot',
    'v3_lucky7': 'v3_lucky7',
    '가차트론': 'v3_gachabot',
    '루시': 'v3_lucy',
    '큐피트': 'v3_cupid',

    // Counseling Personas
    'dream_interpreter': 'dream_interpreter',
    '꿈 해몽사': 'dream_interpreter',
    '꿈해몽': 'dream_interpreter',
    '해몽': 'dream_interpreter',
    '몽선생': 'dream_interpreter',
    'tarot_master': 'tarot_master',
    '타로 마스터': 'tarot_master',
    '아르카나': 'tarot_master',
    'finance_advisor': 'finance_advisor',
    '재테크': 'finance_advisor',
    '머니킹': 'finance_advisor',
    '재테크 멘토': 'finance_advisor',
    'parenting_coach': 'parenting_coach',
    '육아': 'parenting_coach',
    '육아 멘토': 'parenting_coach',
    '아이사랑': 'parenting_coach',
    'interview_coach': 'interview_coach',
    '면접': 'interview_coach',
    '면접 코치': 'interview_coach',
    '합격신': 'interview_coach'
};

/**
 * Persona IDs to their natural Korean names
 */
export const PERSONA_NAME_MAP = {
    'socrates': '소크라테스',
    'einstein': '알베르트 아인슈타인',
    'king_sejong': '세종대왕',
    'marilyn_monroe': '마릴린 먼로',
    'steve_jobs': '스티브 잡스',
    'yi_sun_shin': '이순신',
    'shakespeare': '윌리엄 셰익스피어',
    'gandhi': '마하트마 간디',
    'cat': '길고양이',
    'dog': '충직한 진돗개',
    'nano_banana': '나노 바나나',
    // 프론트 personas.ts id 표기 보강 (raw id 노출 방지)
    'fortune_타로_점술가': '타로 점술가',
    'shaman_무속인': '무속인',
    'pastor_목사님': '목사님',
    'priest_신부님': '신부님',
    'monk_스님': '스님',
    'lotto_로또번호_추첨기': '로또번호 추첨기',
    'alien': '외계인',
    'smartphone': '스마트폰',
    'seollal_moon': '설날 보름달',
    'grandmother': '할머니',
    'grandfather': '할아버지',
    'grandson': '손자',
    'granddaughter': '손녀',
    'lotto_generator': '로또번호 추첨기',
    'lotto_machine': '로또번호 추첨기',
    'lotto': '로또번호 추첨기',
    'situation_잔소리꾼_엄마': '잔소리꾼 엄마',
    'family_우리_아빠': '우리 아빠',
    'fantasy_하얀_날개의_천사': '하얀 날개의 천사',
    'fantasy_장난꾸러기_악마': '장난꾸러기 악마',
    'healing_단골_카페_사장님': '단골 카페 사장님',
    'mystic_fortune_teller': '타로 점술가',
    'taxi': '수다쟁이 택시기사',
    'mom': '엄마',
    'dad': '아빠',
    'v3_lucy': '연애상담사 루시',
    'v3_cupid': '사랑의 요정 큐피트',
    'v3_pachinko': '빠찡코 로봇 파치',
    'v3_gachabot': '가차 마스터 가차트론',
    'v3_lucky7': '잭팟 슬롯 럭키세븐',

    // Counseling Personas
    'dream_interpreter': '꿈 해몽사 몽선생',
    'tarot_master': '타로 마스터 아르카나',
    'finance_advisor': '재테크 멘토 머니킹',
    'parenting_coach': '육아 멘토 아이사랑',
    'interview_coach': '면접관 코치 합격신'
};

/**
 * [V3] Persona to Primary Category Mapping
 */
export const PERSONA_CATEGORY_MAP = {
    // Lotto
    'lotto_generator': 'lotto',
    'v3_pachinko': 'lotto',
    'v3_lucky7': 'lotto',
    'v3_gachabot': 'lotto',
    // Love
    'v3_lucy': 'love',
    'v3_cupid': 'love',
    'v3_lucy_v3': 'love',
    // Fortune
    'mystic_fortune_teller': 'fortune',
    'seollal_moon': 'fortune',
    'tarot_master': 'fortune',
    'dream_interpreter': 'fortune',
    // Advice
    'socrates': 'advice',
    'king_sejong': 'advice',
    'yi_sun_shin': 'advice',
    'grandmother': 'advice',
    'grandfather': 'advice',
    'finance_advisor': 'advice',
    'parenting_coach': 'advice',
    'interview_coach': 'advice'
};

/**
 * Resolves a persona's category
 */
export const getPersonaCategory = (personaId) => {
    if (!personaId) return 'advice';
    if (PERSONA_CATEGORY_MAP[personaId]) return PERSONA_CATEGORY_MAP[personaId];

    // Dynamic Fallback
    if (personaId.includes('lotto') || personaId.includes('pachinko') || personaId.includes('lucky7') || personaId.includes('gachabot')) return 'lotto';
    if (personaId.includes('lucy') || personaId.includes('cupid') || personaId.includes('love')) return 'love';
    if (personaId.includes('fortune') || personaId.includes('shaman') || personaId.includes('tarot') || personaId.includes('dream') || personaId.includes('daily')) return 'fortune';

    return 'advice';
};

/**
 * Centered Helper to get the canonical path
 * Use this to ensure all parts of the app use the same image files.
 */
export const getPersonaImagePath = (personaId) => {
    return PERSONA_IMAGE_MAP[personaId] || DEFAULT_PERSONA_IMAGE;
};

/**
 * Resolves any image path or URL into a final usable URL.
 */
export const resolveImageUrl = (urlStr) => {
    if (!urlStr) return resolveImageUrl(DEFAULT_PERSONA_IMAGE);

    // 1. If it's a relative path (starts with images/)
    if (urlStr.startsWith('images/')) {
        const cleanPath = urlStr.split('?')[0];
        if (CDN_BASE_URL) {
            const base = CDN_BASE_URL.endsWith('/') ? CDN_BASE_URL.slice(0, -1) : CDN_BASE_URL;
            return `${base}/${cleanPath}`;
        }

        // Try to determine the best bucket URL if not provided
        let bucket = STORAGE_BUCKET;
        if (!bucket.includes('.')) {
            bucket = `${bucket}.firebasestorage.app`;
        }

        return `https://example.invalid/${bucket}/${cleanPath}`;
    }

    // 2. If it's a full URL, check if it's from Firebase/Google Storage
    try {
        const url = new URL(urlStr);
        let filePath = '';

        if (url.hostname === 'firebasestorage.googleapis.com') {
            const pathParts = url.pathname.split('/o/');
            if (pathParts.length > 1) {
                filePath = decodeURIComponent(pathParts[1].split('?')[0]);
            }
        } else if (url.hostname === 'storage.googleapis.com') {
            const pathParts = url.pathname.split(`/${STORAGE_BUCKET}/`);
            if (pathParts.length > 1) {
                filePath = pathParts[1].split('?')[0];
            } else {
                const parts = url.pathname.split('/').filter(Boolean);
                if (parts[0] === STORAGE_BUCKET) {
                    filePath = parts.slice(1).join('/');
                }
            }
        }

        if (filePath) {
            if (CDN_BASE_URL) {
                const base = CDN_BASE_URL.endsWith('/') ? CDN_BASE_URL.slice(0, -1) : CDN_BASE_URL;
                const path = filePath.startsWith('/') ? filePath.slice(1) : filePath;
                return `${base}/${path}`;
            }
            const path = filePath.startsWith('/') ? filePath.slice(1) : filePath;
            return `https://example.invalid/${STORAGE_BUCKET}/${path}`;
        }
    } catch (e) {
        console.error('[ImageUrl] Proxy resolution failed for:', urlStr);
    }

    return urlStr;
};
