const normalizePersonaKey = (value = '') => String(value)
    .toLowerCase()
    .replace(/[\s_\-()·.,:;!?'"]/g, '');

const HIDDEN_COUNSELOR_PERSONA_KEYS = new Set([
    'grandmother',
    'grandma',
    '할머니',
    '할머님',
    'grandfather',
    'grandpa',
    '할아버지',
    '할아버님',
    'lotto',
    'lotto_generator',
    'lottogenerator',
    'lottonumbergenerator',
    '로또번호추첨기',
    '로또추첨기',
    'mystic_oracle',
    'fortune_teller',
    'fortuneteller',
    '운세술사',
    '신비로운운세술사',
    'nano_banana',
    'nanobanana',
    '나노바나나',
    'v3_gachabot',
    'gachatron',
    '가차트론',
    '가차마스터가차트론',
    'v3_lucky7',
    'lucky7',
    'luckyseven',
    '럭키세븐',
    '잭팟슬롯럭키세븐',
    'v3_pachinko',
    'pachi',
    'patchi',
    '파치',
    '빠찡코로봇파치',
].map(normalizePersonaKey));

// 이미지 에셋이 아직 생성되지 않은 페르소나 (2026-07-06 전수검사 기준).
// 이미지가 생성되면 여기서 제거한다. love_expert는 v3_lucy와 이름이 겹치므로 id만 등록한다.
const MISSING_IMAGE_PERSONA_KEYS = new Set([
    'love_expert',
    'mystic_seer',
    '전통 점술가',
    'mystic_oracle',
    '신비로운 운세술사',
    'grandfather',
    '할아버지',
    'grandmother',
    '할머니',
    'v3_gachabot',
    'v3_lucky7',
    'v3_pachinko',
].map(normalizePersonaKey));

const matchesKeySet = (persona, keySet) => {
    const candidates = [
        persona.id,
        persona.name,
        persona.title,
        persona.personaId,
    ].map(normalizePersonaKey).filter(Boolean);

    return candidates.some((key) => keySet.has(key));
};

export const isHiddenCounselorPersona = (persona = {}) =>
    matchesKeySet(persona, HIDDEN_COUNSELOR_PERSONA_KEYS);

export const isPersonaMissingImage = (persona = {}) =>
    matchesKeySet(persona, MISSING_IMAGE_PERSONA_KEYS);

export const filterVisibleCounselorPersonas = (personas = []) =>
    personas.filter((persona) => !isHiddenCounselorPersona(persona) && !isPersonaMissingImage(persona));

