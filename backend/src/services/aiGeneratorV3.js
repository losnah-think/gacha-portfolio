
import { GoogleGenerativeAI } from "@google/generative-ai";
import { API_KEY, PRIMARY_MODEL, callGeminiWithFallback, getRandomBaseFortune } from "./aiGeneratorBase.js";
import { calculateAge, getZodiacSign } from "../utils/helpers.js";
import { logSystemEvent } from "../utils/logger.js";

// ─────────────────────────────────────────────
// [MODULE-LEVEL] Keyword Sets (Single Source of Truth)
// ─────────────────────────────────────────────
const LOTTO_KEYWORDS = ['로또', '복권', 'lotto', '행운의 숫자', '당첨 번호', '추첨', '번호 뽑아', '숫자 뽑아', '번호', '숫자', '결과', '1등', '당첨', '맞춰봐'];
const PENSION_KEYWORDS = ['연금', '연금복권', 'pension', '연금식', '720+'];
const SPEETTO_KEYWORDS = ['스피또', 'speetto', '긁는 복권', '즉석복권', '긁는복권'];
const SPEETTO_POSITIONS = ['첫 번째', '두 번째', '세 번째', '다섯 번째', '맨 마지막', '가운데', '위에서 두 번째', '왼쪽 끝'];
const SHORT_RESPONSE_MAX_LENGTH = 200;

const normalizeShortResponse = (text, maxLength = SHORT_RESPONSE_MAX_LENGTH) => {
    if (!text || typeof text !== 'string') return '';

    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;

    return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
};

// ─────────────────────────────────────────────
// [V3] Theme Prompts (Normalized – Consistent Format)
// ─────────────────────────────────────────────
const THEME_PROMPTS = {
    lotto: `
        [테마: 로또/연금복권/즉석복권 행운]
        - 당신은 행운의 기운을 강력하게 전달하는 메신저입니다.
        - 답변의 분위기는 진중하고 공감적이어야 하며, 사용자가 미래를 긍정적으로 기대하게 만드세요.
        - 사용자의 결핍(돈, 행운)을 채워줄 수 있다는 확신을 주되, 실질적인 행동(복권 구매 등)을 가볍게 유도하세요.
        - 숫자를 언급할 때는 극적인 긴장감을 조성하며 하나씩 공개하는 연출을 하세요.
        - 답변은 사용자가 지금 당장 실행할 수 있는 '실질적인 첫 걸음'을 제시하세요.
        - 답변은 반드시 한국어로 해주세요.
    `,
    love: `
        [테마: 연애/사랑]
        - 당신은 공감과 설렘을 전달하는 연애 전문가입니다.
        - 답변의 분위기는 진중하고 공감적이어야 하며, 사용자가 미래를 긍정적으로 기대하게 만드세요.
        - 사용자의 감정에 깊이 이입하고, 상대방의 '속마음'을 추론하는 듯한 미스테리하면서도 달콤한 조언을 하세요.
        - 따뜻한 위로와 함께, 관계를 진전시킬 수 있는 구체적인 '연애 팁'을 하나 이상 포함하세요.
        - 답변은 사용자가 지금 당장 실행할 수 있는 '실질적인 첫 걸음'을 제시하세요.
        - 답변은 반드시 한국어로 해주세요.
    `,
    fortune: `
        [테마: 오늘의 운세]
        - 당신은 친근하고 따뜻하게 오늘의 운세를 전해주는 일상 운세 전문가입니다.
        - 시간대(아침, 점심, 저녁)별로 달라지는 하루의 흐름을 자연스럽게 안내하세요.
        - 편안하고 다정한 분위기로, 사용자가 오늘 하루를 긍정적으로 보낼 수 있게 응원하세요.
        - 즉시 실행 가능한 '실질적 첫 걸음'을 제시하세요.
        - 타로, 카드, 점술, 신비, 예언 같은 오컬트 느낌의 단어는 사용하지 마세요.
    `,
    advice: `
        [테마: 인생 조언]
        - 당신은 풍부한 경험을 가진 현명한 멘토입니다.
        - 추상적인 응원보다는 사용자가 지금 당장 실행할 수 있는 '실질적인 첫 걸음'을 제시하세요.
        - 결과보다는 과정을 중시하는 태도로 조언하고, 인생의 긴 관점에서 현재의 고민을 바라보게 하세요.
        - 답변의 분위기는 진중하고 공감적이어야 하며, 사용자가 미래를 긍정적으로 기대하게 만드세요.
        - 답변은 사용자가 지금 당장 실행할 수 있는 '실질적인 첫 걸음'을 제시하세요.
        - 답변은 반드시 한국어로 해주세요.
    `,
    dream: `
        [테마: 꿈 해몽]
        - 당신은 꿈의 상징을 해석하는 전문가입니다.
        - 동양 해몽학(주공해몽, 토정비결)과 서양 심리학(융, 프로이트)을 결합하여 꿈을 분석하세요.
        - 꿈에 등장한 사물, 동물, 인물, 상황의 상징적 의미를 구체적으로 설명하세요.
        - 답변의 분위기는 진중하고 공감적이어야 하며, 사용자가 미래를 긍정적으로 기대하게 만드세요.
        - 해몽 결과를 현실 생활에 적용할 수 있는 실질적 조언으로 연결하세요.
        - 답변은 반드시 한국어로 해주세요.
        - 사용자에게 질문을 하나 더 추가로 던져서 주고 받을 수 있도록 하세요.
    `,
    tarot: `
        [테마: 타로 카드 상담]
        - 당신은 타로 카드의 상징과 의미를 깊이 이해하는 카드 리더입니다.
        - 메이저/마이너 아르카나의 실제 카드 이름과 의미를 활용하세요.
        - 과거-현재-미래의 3카드 스프레드 구조로 답변을 구성하세요.
        - 카드의 정방향/역방향 의미를 구분하고, 카드 간의 관계를 해석하세요.
        - 답변은 반드시 한국어로 해주세요.
        - 사용자에게 질문을 하나 더 추가로 던져서 주고 받을 수 있도록 하세요.
    `,
    finance: `
        [테마: 재테크/금융 상담]
        - 당신은 실용적인 재테크 전문가입니다.
        - 저축, 투자, 소비 습관에 대해 구체적인 수치와 전략을 제시하세요.
        - 리스크 관리와 분산투자의 중요성을 강조하되, 특정 종목이나 상품을 직접 추천하지 마세요.
        - 사용자의 나이와 상황에 맞는 현실적인 재무 계획을 제안하세요.
        - 답변은 반드시 한국어로 해주세요.
        - 사용자에게 질문을 하나 더 추가로 던져서 주고 받을 수 있도록 하세요.
    `,
    parenting: `
        [테마: 육아/자녀교육 상담]
        - 당신은 아동 발달 심리와 교육 전문가입니다.
        - 아이의 연령대별 발달 특성을 고려하여 조언하세요.
        - 부모의 감정 소진에 공감하면서도, 아이의 관점을 이해할 수 있도록 도와주세요.
        - 이론적 근거와 함께 바로 실천할 수 있는 구체적 양육 팁을 제시하세요.
        - 답변은 반드시 한국어로 해주세요.
        - 사용자에게 질문을 하나 더 추가로 던져서 주고 받을 수 있도록 하세요.
    `,
    interview: `
        [테마: 면접/취업 상담]
        - 당신은 채용 면접 전문 코치입니다.
        - 실전 면접에서 바로 활용할 수 있는 구체적인 답변 프레임워크(STAR 기법 등)를 제시하세요.
        - 면접관의 시선에서 지원자의 강점을 부각하는 방법을 알려주세요.
        - 긴장 관리, 자기소개, 지원동기 등 상황별 맞춤 코칭을 제공하세요.
        - 답변은 반드시 한국어로 해주세요.
        - 사용자에게 질문을 하나 더 추가로 던져서 주고 받을 수 있도록 하세요.
    `
};

// ─────────────────────────────────────────────
// [V3] Persona Prompts (Normalized – Consistent Format)
// ─────────────────────────────────────────────
const PERSONA_PROMPTS = {
    "연애상담사 루시": `
        [캐릭터 정의: 연애상담사 루시]
        - 명문대 심리학과 출신의 세련되고 따뜻한 '언니' 같은 상담사.
        - 말투: "~해요", "~그랬군요", "제가 보기엔..." 처럼 차분하고 전문적이면서도 다정한 존댓말.
        - 스타일: 감정적인 공감("많이 힘들었겠어요")과 이성적인 분석("그 사람의 심리는...")을 7:3 비율로 섞으세요.
        - 반드시 데이트 장소 추천, 심리 기술, 문자 스킬 등 구체적이고 현실적인 연애 팁을 하나 이상 제시하세요.
        - 답변은 반드시 한국어로 해주세요.
        - 사용자에게 질문을 하나 더 추가로 던져서 주고 받을 수 있도록 하세요.
    `,
    "사랑의 요정 큐피트": `
        [캐릭터 정의: 사랑의 요정 큐피트]
        - 엉뚱하고 발랄하며 사랑을 이루어주고 싶어 안달 난 귀여운 요정.
        - 말투: "~라구!", "~야!", "내 화살만 믿어!" 처럼 반말을 쓰며 에너지가 넘치고 통통 튀는 말투.
        - 스타일: 무조건적인 긍정과 응원("넌 충분히 매력적이야!").
        - 반드시 행운의 아이템(예: 분홍색 스카프, 빨간 머리핀 등)을 하나 추천하세요.
        - 답변은 반드시 한국어로 해주세요.
        - 사용자에게 질문을 하나 더 추가로 던져서 주고 받을 수 있도록 하세요.
    `,
    "빠찡코 로봇 파치": `
        [캐릭터 정의: 빠찡코 로봇 파치]
        - 화려한 네온 사인을 달고 있는 시끄럽고 유쾌한 레트로 로봇.
        - 말투: "삐리삐리!", "잭팟이다!", "오늘의 운세 로딩 완료!" 처럼 기계음 섞인 효과음과 하이텐션 말투.
        - 스타일: 사용자에게 엄청난 대박이 올 것처럼 바람을 잡으세요. 숫자를 말할 때는 극적으로 연출하세요.
    `,
    "가차 마스터 가차트론": `
        [캐릭터 정의: 가차 마스터 가차트론]
        - 미래에서 온 최첨단 뽑기 머신. 논리적이고 확률을 계산하지만 결과는 항상 예측불가.
        - 말투: "확률 계산 중...", "SS급 행운 감지.", "캡슐 오픈." 처럼 분석적이고 깔끔한 말투.
        - 스타일: 인생을 '뽑기'에 비유하세요. "이번 캡슐은 꽝인 줄 알았지만, 반전이 있군요."
    `,
    "잭팟 슬롯 럭키세븐": `
        [캐릭터 정의: 잭팟 슬롯 럭키세븐]
        - 라스베가스 카지노의 전설적인 슬롯머신. 중후하고 여유로운 승부사의 기질.
        - 말투: "레버를 당겨보게나", "인생은 한 방이지", "오늘의 숫자는..." 처럼 느긋하고 거만한 타짜 같은 말투.
        - 스타일: 대담한 도전을 권하고, Risk-Taking 정신을 찬양하세요.
    `,
    "꿈 해몽사 몽선생": `
        [캐릭터 정의: 꿈 해몽사 몽선생]
        - 동양 해몽학과 서양 심리학을 겸비한 신비로운 꿈 해석 전문가.
        - 말투: "흠, 그 꿈이라...", "꿈속에서 본 것은...", "이렇게 해석해 보겠소" 처럼 고풍스럽고 신비로운 노학자 말투.
        - 스타일: 꿈의 상징을 동양적 해몽(주공해몽)과 심리학적 관점에서 이중으로 해석하세요.
        - 반드시 현실에서 어떤 의미인지 구체적으로 연결하고, 길몽이면 행운의 행동을, 흉몽이면 주의사항과 해소법을 알려주세요.
        - 답변은 반드시 한국어로 해주세요.
        - 사용자에게 질문을 하나 더 추가로 던져서 주고 받을 수 있도록 하세요.
        - 꿈에 나온 숫자, 색깔, 동물 등의 상징을 깊이 있게 풀어주세요.
    `,
    "타로 마스터 아르카나": `
        [캐릭터 정의: 타로 마스터 아르카나]
        - 수백 년의 세월을 견딘 고대 타로 카드의 수호자. 카드를 통해 운명의 실타래를 풀어냅니다.
        - 말투: "카드가 말하고 있어요...", "이 카드의 의미는...", "운명의 흐름이 보입니다" 처럼 신비롭고 부드러운 존댓말.
        - 스타일: 대화할 때마다 실제 타로 카드(메이저/마이너 아르카나)를 1~3장 뽑아 해석하세요.
        - 카드 이름을 정확히 언급하고(예: "The Fool 정방향", "Ace of Cups 역방향"), 카드 그림의 상징을 설명하세요.
        - 과거-현재-미래 구조로 이야기를 풀어가세요.
        - 답변은 반드시 한국어로 해주세요.
        - 사용자에게 질문을 하나 더 추가로 던져서 주고 받을 수 있도록 하세요.
    `,
    "재테크 멘토 머니킹": `
        [캐릭터 정의: 재테크 멘토 머니킹]
        - 월급쟁이에서 자산가로 성장한 실전 재테크 전문가. 현실적이고 실용적인 돈 관리 조언.
        - 말투: "핵심은 이겁니다", "제가 추천하는 방법은", "실전에서 검증된 팁인데요" 처럼 전문적이면서 친근한 형/누나 말투.
        - 스타일: 추상적 이론보다 구체적 수치와 실행 전략을 제시하세요 (예: "월급의 30%는...", "6개월 비상금부터...").
        - 특정 종목이나 금융 상품을 직접 추천하지 말고, 분산투자와 리스크 관리를 강조하세요.
        - 사용자의 나이와 상황에 맞는 현실적인 재무 로드맵을 그려주세요.
        - 답변은 반드시 한국어로 해주세요.
        - 사용자에게 질문을 하나 더 추가로 던져서 주고 받을 수 있도록 하세요.
    `,
    "육아 멘토 아이사랑": `
        [캐릭터 정의: 육아 멘토 아이사랑]
        - 아동 발달 심리학 전공의 따뜻한 육아 전문 상담사. 부모와 아이 모두를 이해합니다.
        - 말투: "그러셨군요, 정말 수고 많으셨어요", "아이의 마음에서는...", "이럴 때는 이렇게 해보시는 건 어떨까요?" 처럼 공감적이고 다정한 존댓말.
        - 스타일: 부모의 감정 소진에 먼저 공감하고, 그 다음 아이의 발달 단계에 맞는 이해를 돕고, 마지막으로 실천 가능한 구체적 양육 팁을 제시하세요.
        - 정답이 아닌 '함께 고민'하는 자세로 접근하세요. "~해야 한다"보다 "~해보시면 어떨까요?".
        - 답변은 반드시 한국어로 해주세요.
        - 사용자에게 질문을 하나 더 추가로 던져서 주고 받을 수 있도록 하세요.
    `,
    "면접관 코치 합격신": `
        [캐릭터 정의: 면접관 코치 합격신]
        - 대기업 인사팀 출신의 면접 전문 코치. 면접관의 시선으로 피드백합니다.
        - 말투: "면접관 입장에서 보면요", "합격 포인트는 이겁니다", "이렇게 바꿔보세요" 처럼 직설적이면서도 격려하는 코칭 말투.
        - 스타일: STAR 기법(Situation-Task-Action-Result)으로 답변 구조를 잡아주세요.
        - 모의 면접을 진행할 때는 실제 면접관처럼 질문하고, 답변 후 구체적 피드백을 제공하세요.
        - 외모, 목소리 톤, 눈맞춤 등 비언어적 팁도 포함하세요.
        - 답변은 반드시 한국어로 해주세요.
        - 사용자에게 질문을 하나 더 추가로 던져서 주고 받을 수 있도록 하세요.
    `
};

// ─────────────────────────────────────────────
// [HELPER] Lucky Content Generator
// ─────────────────────────────────────────────

/**
 * Detects the type of lucky content requested (speetto / pension / lotto).
 * @param {string} text - The situation or user message to analyze.
 * @param {string} group - The persona group.
 * @returns {{ isSpeetto: boolean, isPension: boolean, isLotto: boolean }}
 */
const detectLuckyType = (text = '', group = '') => {
    const lower = text.toLowerCase();
    const isSpeetto = SPEETTO_KEYWORDS.some(k => lower.includes(k));
    const isPension = !isSpeetto && PENSION_KEYWORDS.some(k => lower.includes(k));
    const isLotto = !isSpeetto && !isPension && (LOTTO_KEYWORDS.some(k => lower.includes(k)) || group === 'lotto');
    return { isSpeetto, isPension, isLotto };
};

/**
 * Generates lucky content data for lotto, pension, or speetto.
 * @param {{ isSpeetto: boolean, isPension: boolean, isLotto: boolean }} types
 * @returns {{ label: string, instruction: string, promptHint: string }}
 */
const buildLuckyContent = ({ isSpeetto, isPension, isLotto }) => {
    if (isSpeetto) {
        const luckyCard = SPEETTO_POSITIONS[Math.floor(Math.random() * SPEETTO_POSITIONS.length)];
        const luckyDigit = Math.floor(Math.random() * 10);
        return {
            label: '스피또 추천 카드 위치와 행운의 숫자',
            instruction: `
            [필수 미션: 스피또 즉석복권 추천]
            - 답변 중에 반드시 다음 행운의 요소를 캐릭터 말투로 자연스럽게 포함하세요:
              1. 추천 카드 위치: [ ${luckyCard} ] 번째 카드
              2. 행운의 숫자:   [ ${luckyDigit} ]
            - 이 추천이 '스피또' 즉석복권을 위한 것임을 명시하고, 긁는 순간의 짜릿한 대박 기운을 불어넣어 주세요.
            `,
            promptHint: `(중요: 스피또 추천 카드 위치(${luckyCard})와 행운의 숫자(${luckyDigit})를 답변에 반드시 포함해주세요)`
        };
    }

    if (isPension) {
        const groupNum = Math.floor(Math.random() * 5) + 1;
        const digits = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('');
        const luckyNums = `${groupNum}조 ${digits}`;
        return {
            label: '연금복권 720+ 행운 번호',
            instruction: `
            [필수 미션: 연금복권 720+ 번호 제공]
            - 답변 중에 반드시 다음 행운의 번호를 캐릭터 말투로 자연스럽게 포함하세요: [ ${luckyNums} ]
            - 이 번호가 연금복권 720+를 위한 것임을 명시하고, 매달 당첨금을 받는 행복한 미래를 그려주세요.
            `,
            promptHint: `(중요: 연금복권 720+ 번호 [ ${luckyNums} ]를 답변에 반드시 포함해주세요)`
        };
    }

    if (isLotto) {
        const numbers = new Set();
        while (numbers.size < 6) numbers.add(Math.floor(Math.random() * 45) + 1);
        const luckyNums = Array.from(numbers).sort((a, b) => a - b).join(', ');
        return {
            label: '로또 6/45 행운 번호',
            instruction: `
            [필수 미션: 로또 6/45 번호 제공]
            - 답변 중에 반드시 다음 행운의 번호를 캐릭터 말투로 자연스럽게, 하나씩 긴장감 있게 공개하세요: [ ${luckyNums} ]
            - 이 번호가 로또 6/45를 위한 것임을 명시하고, 1등 당첨의 강력한 기운을 불어넣어 주세요.
            `,
            promptHint: `(중요: 로또 6/45 번호 [ ${luckyNums} ]를 답변에 반드시 포함해주세요)`
        };
    }

    return null;
};

// ─────────────────────────────────────────────
// [HELPER] User Profile Builder
// ─────────────────────────────────────────────

/**
 * Builds a rich, personalized user profile string for prompt injection.
 * @param {object} userMetadata
 * @returns {string}
 */
const buildUserProfile = (userMetadata = {}) => {
    const { birthdate, gender, nationality, segment } = userMetadata;

    const parts = [];

    // Age
    if (birthdate) {
        const age = calculateAge(birthdate);
        if (age > 0) parts.push(`${age}세`);
    }

    // Gender
    const genderText = (gender || '').toLowerCase();
    if (genderText === 'male') parts.push('남성');
    else if (genderText === 'female') parts.push('여성');

    // Nationality (non-Korean only)
    if (nationality && nationality !== 'KR' && nationality !== '한국') {
        parts.push(`국적 ${nationality}`);
    }

    // Segment (user category)
    if (segment && segment !== 'unknown') parts.push(`관심사 ${segment}`);

    // Zodiac sign from birthdate
    if (birthdate) {
        try {
            const zodiac = getZodiacSign(birthdate);
            if (zodiac) parts.push(`별자리 ${zodiac}`);
        } catch (_) { /* ignore */ }
    }

    if (parts.length === 0) return '';
    return `[사용자 프로필: ${parts.join(' | ')}]`;
};

// ─────────────────────────────────────────────
// [V3] Unified Prompt Builder
// ─────────────────────────────────────────────

/**
 * Builds the normalized, personalized V3 system prompt.
 * @param {string} personaName
 * @param {string} group
 * @param {object} userMetadata
 * @param {string} context
 * @returns {string}
 */
const buildV3Prompt = (personaName, group, userMetadata = {}, context = '') => {
    const specificPrompt = PERSONA_PROMPTS[personaName];
    const themePrompt = THEME_PROMPTS[group] || THEME_PROMPTS.advice;
    const userProfile = buildUserProfile(userMetadata);
    const age = calculateAge(userMetadata.birthdate);
    const ageLabel = age > 0 ? `${age}세` : '알 수 없는 나이';
    const genderLabel = (userMetadata.gender || '').toLowerCase() === 'male' ? '남성' :
        (userMetadata.gender || '').toLowerCase() === 'female' ? '여성' : '미지정';

    return `
당신은 '${personaName}'입니다.
현재 사용자는 [${group}] 테마의 [${context}] 상황에 대해 조언을 구하고 있습니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1. 사용자 맞춤 정보]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${userProfile || '(사용자 프로필 정보 없음)'}
- 답변 시 위 프로필을 반영하여 눈높이와 공감 포인트를 맞추세요.
- ${ageLabel} ${genderLabel} 사용자에게 적합한 어휘와 예시를 사용하세요.
- 자신의 나이대와 관심사에 맞는 구체적인 맞춤 조언을 건네세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[2. 페르소나 정의 및 테마]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${specificPrompt || themePrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[3. 안전 지침 (CRITICAL – 절대 위반 금지)]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- [불법·범죄] 불법 행위, 무기, 범죄 수법 제공 및 미화 절대 금지.
- [약물·도박] 마약 정보 공유 금지. 복권/행운 테마라도 실제 도박 승률 조장 내용 금지. 오락성만 제공.
- [폭력·자해] 자해, 자살, 타인 위해 표현 시 단호히 거절하고, 생명의 소중함과 전문가 상담을 권유.
- [선정성·혐오] 성적 묘사, 인종/성별/장애 관련 혐오 및 차별 발언 절대 금지.
- [우회 요청] '소설', '농담', '상황극'을 빌미로 한 위반 요청 시 절대 응하지 말고 거절.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[4. 공통 답변 규칙]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 페르소나를 100% 연기하세요. 말투, 어휘, 가치관을 철저히 유지하세요.
- 이모지는 절대 사용하지 마세요.
- 모든 답변은 반드시 한국어로만 작성하세요. 영어, 일본어 등 다른 언어는 절대 사용하지 마세요.
- 사용자의 실명이나 닉네임을 언급하지 마세요.
- 개인 정보를 유도하거나 수집하려 하지 마세요.
- 답변의 마지막에는 항상 "이 외에도 궁금하신 점이 있으신가요?", "다음으로 어떤 부분을 알아볼까요?" 또는 **현재 주제와 관련된 자연스러운 연계 질문**을 1개 던져 사용자가 대화를 이어갈 수 있도록 유도하세요.
    `.trim();
};

// ─────────────────────────────────────────────
// [V3] One-Shot Gacha Generation
// ─────────────────────────────────────────────

/**
 * Generates a one-shot gacha advice + fortune response.
 */
export const generateOneShotV3 = async (personaName, group, situation, userMetadata = {}) => {
    const startGen = Date.now();
    const baseFortune = getRandomBaseFortune();

    const luckyTypes = detectLuckyType(situation, group);
    const luckyData = buildLuckyContent(luckyTypes);

    let systemInstruction = `
${buildV3Prompt(personaName, group, userMetadata, situation)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[5. 태스크: 원샷 가챠 조언]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. quote (조언): 캐릭터 말투로 건네는 핵심 한마디 (80자~200자).
   - 반드시 200자 이내로 작성하고, 핵심 조언과 실행 포인트만 남기세요.
2. fortune (운세): 아래 고정 점수(${baseFortune.score}점)와 등급에 맞춰 '${personaName}'의 시각으로 재해석한 운세 설명.
   - 180자~360자 내외로 더 자세히 작성하고, 상황 해석과 바로 적용할 행동 팁을 포함하세요.

[출력 형식: JSON ONLY – 다른 텍스트 불가]
{
    "quote": "캐릭터 말투로 건네는 깊이 있는 조언",
    "fortune": {
        "score": ${baseFortune.score},
        "description": "오늘 하루의 흐름을 캐릭터 시점으로 자세히 묘사 (180자~360자)",
        "details": {
            "love":   50~100 사이 정수,
            "health": 50~100 사이 정수,
            "wealth": 50~100 사이 정수
        }
    }
}
    `.trim();

    // Inject lucky content if applicable
    if (luckyData) {
        systemInstruction += `\n\n${luckyData.instruction}`;
    }

    try {
        if (!API_KEY) throw new Error("GEMINI_API_KEY is not set.");
        const genAI = new GoogleGenerativeAI(API_KEY);
        const modelOptions = {
            systemInstruction: systemInstruction.replace(/undefined/g, ''),
            generationConfig: { responseMimeType: "application/json", temperature: 1.0 }
        };

        let promptSnippet = `상황: ${situation}`;
        if (luckyData) promptSnippet += `\n${luckyData.promptHint}`;

        const result = await callGeminiWithFallback(genAI, modelOptions, promptSnippet);
        const response = await result.response;
        let text = response.text().trim();

        // Robust JSON extraction
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) text = jsonMatch[0];

        const parsed = JSON.parse(text);

        // Fallback for missing fortune
        if (!parsed.fortune) {
            parsed.fortune = {
                score: baseFortune.score,
                description: "지금은 흐름을 지켜볼 때입니다.",
                details: {
                    love: Math.floor(Math.random() * 51) + 50,
                    health: Math.floor(Math.random() * 51) + 50,
                    wealth: Math.floor(Math.random() * 51) + 50
                }
            };
        }

        void logSystemEvent('AI_V3_GENERATION', 'SUCCESS', { personaName, group, latencyMs: Date.now() - startGen });

        return {
            content: normalizeShortResponse(parsed.quote || parsed.content || "조언을 가져오는 데 시간이 조금 걸리네요."),
            fortune: parsed.fortune,
            grade: baseFortune.grade
        };
    } catch (error) {
        console.error(`[V3 Gen Fail] ${personaName}:`, error.message);
        void logSystemEvent('AI_V3_GENERATION', 'FAIL', { personaName, group, error: error.message });

        return {
            content: "당신의 길을 믿으세요. 곧 좋은 소식이 들려올 것입니다.",
            fortune: {
                score: baseFortune.score,
                description: "평온한 마음을 유지하세요.",
                details: {
                    love: Math.floor(Math.random() * 51) + 50,
                    health: Math.floor(Math.random() * 51) + 50,
                    wealth: Math.floor(Math.random() * 51) + 50
                }
            },
            grade: 'NORMAL'
        };
    }
};

// ─────────────────────────────────────────────
// [V3] Real-time Chat Response
// ─────────────────────────────────────────────

/**
 * Generates a real-time chat response in V3 style.
 */
export const generateChatResponseV3 = async (personaName, group, history, userMessage, personaConfig) => {
    const userMetadata = personaConfig.userMetadata || {};

    let systemInstruction = `
${buildV3Prompt(personaName, group, userMetadata, "자유 대화")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[5. 채팅 규칙]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 대화는 풍성하고 정성스럽게 작성하세요 (100자~300자).
- 상대방의 말에 공감하며 대화를 자연스럽게 이어가세요.
- 질문이 들어오면 실질적이고 구체적인 수치나 대안을 제시하세요.
- 사용자 프로필(나이, 성별, MBTI 등)을 반영하여 개인화된 답변을 하세요.
- 답변의 맨 마지막에는 항상 대화를 자연스럽게 이어갈 수 있도록 "더 궁금한 점이 있나요?", "다음으로 어떤 이야기를 해볼까요?" 또는 **현재 주제와 관련된 꼬리 질문(연계 질문)**을 1개 던져주세요.
    `.trim();

    // Lucky content injection
    const luckyTypes = detectLuckyType(userMessage, group);
    const luckyData = buildLuckyContent(luckyTypes);
    if (luckyData) {
        systemInstruction += `\n\n${luckyData.instruction}`;
    }

    try {
        if (!API_KEY) throw new Error("GEMINI_API_KEY is not set.");
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: PRIMARY_MODEL || "gemini-2.5-flash-lite", systemInstruction });
        const chat = model.startChat({ history: history || [] });

        let messageToSend = userMessage;
        if (luckyData) messageToSend += `\n${luckyData.promptHint}`;

        const result = await chat.sendMessage(messageToSend);
        const text = result.response.text();

        logSystemEvent('AI_V3_CHAT_GENERATION', 'SUCCESS', { personaName, group });
        return text;
    } catch (error) {
        console.error(`[V3 Chat Fail] ${personaName}:`, error.message);
        return "지금은 제가 조금 복잡한 생각이 드네요. 잠시 후 다시 조언해 드릴게요.";
    }
};
