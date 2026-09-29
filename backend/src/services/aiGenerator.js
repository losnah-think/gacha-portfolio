import { GoogleGenerativeAI } from "@google/generative-ai";
import { calculateAge } from "../utils/helpers.js";
import { logSystemEvent } from "../utils/logger.js";
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { firestore } from '../lib/firebaseAdmin.js';
import { fileURLToPath } from 'url';
import { getPersonaCategory } from '../utils/imageUrl.js';
import { getPersonaVoice } from '../config/personaVoices.js';
import { PRIMARY_MODEL, callGeminiWithFallback, getGeminiApiKey } from './aiGeneratorBase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createGeminiClient = () => {
    const apiKey = getGeminiApiKey();
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
    return new GoogleGenerativeAI(apiKey);
};

// 운세 템플릿 풀 (점수 구간별 - 퀄리티 상향)
const FORTUNE_TEMPLATES = {
    high: [ // 95~100: 기적, 최상의 운
        "우주의 모든 행운이 당신에게 쏟아지는 날입니다. 무엇을 상상하든 그 이상을 보게 될 거예요.",
        "오래 기다려온 기회가 마침내 문을 두드립니다. 주저 말고 활짝 여세요!",
        "오늘 당신의 직관은 신의 계시와 같습니다. 망설이지 말고 선택하세요. 대박 예감!",
        "마치 황금빛 카펫이 깔린 듯, 가는 길마다 막힘이 없고 환호성이 따를 것입니다.",
        "뜻밖의 횡재수나 귀인의 도움이 강력하게 들어와 있습니다. 겸손하되 당당하게 받으세요."
    ],
    good: [ // 80~94: 성취, 순탄, 긍정
        "뿌린 대로 거두는 정직하고 보람찬 하루가 될 것입니다. 노력의 결실이 달콤하네요.",
        "기분 좋은 훈풍이 불어옵니다. 꽉 막혔던 고민이 자연스럽게 해결될 조짐이 보입니다.",
        "주변 사람들에게 인정받고 사랑받는 하루입니다. 당신의 미소가 행운을 더 크게 부릅니다.",
        "작은 성공들이 모여 큰 자신감을 만들어주는 날입니다. 오늘은 당신이 주인공이에요.",
        "예상치 못한 기쁨이 선물처럼 찾아옵니다. 소소하지만 확실한 행복을 만끽하세요."
    ],
    normal: [ // 60~79: 평온, 휴식, 재충전
        "무탈함이 곧 행복임을 깨닫는 고요하고 평화로운 하루입니다.",
        "화려하진 않지만, 따뜻한 차 한 잔처럼 마음이 놓이는 날이네요.",
        "잠시 멈춰 서서 숨을 고르기에 딱 좋은 날입니다. 내일의 도약을 위해 오늘을 즐기세요.",
        "큰 파도 없이 잔잔한 호수 같은 하루입니다. 자신을 돌아보는 시간을 가져보세요.",
        "평범한 일상 속에 숨겨진 보석 같은 감사함을 발견할 수 있는 날입니다."
    ]
};

export const getRandomBaseFortune = (fixedScore = null) => {
    // 가중치 확률 로직: Diamond(0.5%), Platinum(4.5%), Gold(10%), Silver(35%), Normal(50%)
    const rand = Math.random();
    let type = 'normal';
    let minScore = 60;
    let maxScore = 69;
    let grade = 'NORMAL';

    if (rand > 0.995) { // 0.5% 확률
        type = 'high';
        minScore = 96;
        maxScore = 100;
        grade = 'DIAMOND';
    } else if (rand > 0.95) { // 4.5% 확률
        type = 'high';
        minScore = 90;
        maxScore = 95;
        grade = 'PLATINUM';
    } else if (rand > 0.85) { // 10% 확률
        type = 'good';
        minScore = 80;
        maxScore = 89;
        grade = 'GOLD';
    } else if (rand > 0.50) { // 35% 확률
        type = 'normal';
        minScore = 70;
        maxScore = 79;
        grade = 'SILVER';
    } else { // 50% 확률
        type = 'normal';
        minScore = 60;
        maxScore = 69;
        grade = 'NORMAL';
    }

    const templates = FORTUNE_TEMPLATES[type];
    const text = templates[Math.floor(Math.random() * templates.length)];

    // 유저가 고정 점수를 요청했다면 그 점수를 사용하고, 아니면 시스템 생성 점수 사용
    const score = (fixedScore !== null) ? fixedScore : (Math.floor(Math.random() * (maxScore - minScore + 1)) + minScore);

    return { text, score, grade };
};

const ZODIAC_CATEGORY_LABELS = {
    total: '전체운',
    love: '연애운',
    wealth: '재물운',
    business: '사업운',
    health: '건강운',
    exam: '학업/시험운'
};

const ZODIAC_RATING_DEFS = [
    { key: 'love', label: '연애운' },
    { key: 'wealth', label: '재물운' },
    { key: 'business', label: '사업운' },
    { key: 'health', label: '건강운' },
    { key: 'exam', label: '학업운' },
    { key: 'total', label: '총운' }
];

const clampFortuneScore = (value, fallback = 82) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(60, Math.min(100, Math.round(parsed)));
};

const getRatingScore = (rating, fallback) => {
    if (typeof rating === 'number') return clampFortuneScore(rating, fallback);
    if (rating && typeof rating === 'object') return clampFortuneScore(rating.score, fallback);
    return clampFortuneScore(fallback, 82);
};

/**
 * [FIX §2.3-2/§2.3-3] LLM이 fortune.score를 중첩 객체({score:{score}})나 1-5 스케일로
 * 반환하는 사고를 서버에서 차단한다. score는 항상 plain 정수(0-100),
 * details 각 항목은 number 또는 {label, score:number} — 더 깊은 중첩 금지.
 */
const normalizeFortuneObject = (fortune) => {
    if (!fortune || typeof fortune !== 'object') return fortune;
    const out = { ...fortune };

    if (fortune.score !== undefined) {
        // {score:{score}} 형태도 clampFortuneScore가 숫자화 못하면 getRatingScore로 한 겹 벗김
        out.score = typeof fortune.score === 'object'
            ? getRatingScore(fortune.score, 82)
            : clampFortuneScore(fortune.score, 82);
    }

    if (fortune.details && typeof fortune.details === 'object') {
        const details = {};
        for (const [key, value] of Object.entries(fortune.details)) {
            if (value && typeof value === 'object') {
                details[key] = { label: value.label || key, score: getRatingScore(value, 70) };
            } else {
                details[key] = clampFortuneScore(value, 70);
            }
        }
        out.details = details;
    }
    return out;
};

const normalizeZodiacRatings = (ratings = {}, fixedScore = null) => {
    const totalScore = clampFortuneScore(
        fixedScore ?? ratings?.total?.score ?? ratings?.total,
        82
    );
    const offsets = { love: 3, wealth: -2, business: 4, health: -1, exam: 2 };

    return ZODIAC_RATING_DEFS.reduce((acc, { key, label }) => {
        const fallback = key === 'total'
            ? totalScore
            : clampFortuneScore(totalScore + (offsets[key] || 0), totalScore);
        const source = ratings?.[key];
        acc[key] = {
            label: source?.label || label,
            score: key === 'total' ? totalScore : getRatingScore(source, fallback)
        };
        return acc;
    }, {});
};

const normalizeLuckyItems = (items = {}) => ({
    color: String(items.color || '하늘색'),
    number: String(items.number || '8'),
    direction: String(items.direction || '동북쪽'),
    food: String(items.food || '따뜻한 차')
});

const splitSentences = (text) => String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?。！？요다까죠])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);

const normalizeTimelineItems = ({ timeline, summary, content, timeContext }) => {
    const labels = ['아침', '오후', '저녁'];
    const titles = ['시작 흐름', '중간 흐름', '마무리 흐름'];
    const fallbacks = [
        `${timeContext} 시작은 급하게 몰아붙이기보다 가벼운 정리부터 해보세요.`,
        '오후에는 사람들과의 대화에서 뜻밖의 힌트를 얻기 좋습니다.',
        '저녁에는 오늘 얻은 것을 차분히 정리하면 마음이 한결 가벼워집니다.'
    ];

    const provided = Array.isArray(timeline) ? timeline : [];
    const sentences = splitSentences(`${summary || ''} ${content || ''}`);

    return labels.map((label, index) => {
        const source = provided[index] || {};
        const description = source.description || source.content || sentences[index] || fallbacks[index];
        return {
            id: source.id || label.toLowerCase(),
            label: source.label || label,
            title: source.title || titles[index],
            description
        };
    });
};

const normalizeActionItems = (items, categoryLabel) => {
    const fallbacks = [
        { title: '먼저 연락하기', description: `${categoryLabel} 흐름을 좋게 만들 작은 연락이나 인사를 먼저 건네보세요.` },
        { title: '지출 한 번 점검하기', description: '오늘 꼭 필요한 선택인지 한 번만 더 확인하면 불필요한 손실을 줄일 수 있습니다.' },
        { title: '일찍 쉬기', description: '컨디션을 아끼는 것이 내일의 운을 끌어올리는 가장 확실한 준비가 됩니다.' }
    ];
    const provided = Array.isArray(items) ? items : [];

    return fallbacks.map((fallback, index) => {
        const source = provided[index] || {};
        if (typeof source === 'string') {
            return { id: `action_${index + 1}`, title: fallback.title, description: source };
        }
        return {
            id: source.id || `action_${index + 1}`,
            title: source.title || fallback.title,
            description: source.description || source.content || fallback.description
        };
    });
};

const buildZodiacSections = ({ timeline, ratings, luckyItems, actionItems }, { categoryLabel, timeContext }) => [
    {
        id: 'timeline',
        title: `${timeContext} 시간대별 흐름`,
        type: 'timeline',
        items: timeline
    },
    {
        id: 'ratings',
        title: '분야별 운세',
        type: 'score-list',
        items: ZODIAC_RATING_DEFS.map(({ key }) => ({
            id: key,
            label: ratings[key].label,
            title: ratings[key].label,
            score: ratings[key].score,
            description: key === 'total'
                ? `${categoryLabel}의 기준이 되는 오늘의 종합 점수입니다.`
                : `${ratings[key].label} 흐름을 ${ratings[key].score}점으로 볼 수 있습니다.`
        }))
    },
    {
        id: 'lucky',
        title: '행운 요소',
        type: 'key-value',
        items: [
            { id: 'color', label: '색상', title: '행운의 색상', value: luckyItems.color },
            { id: 'number', label: '숫자', title: '행운의 숫자', value: luckyItems.number },
            { id: 'direction', label: '방향', title: '행운의 방향', value: luckyItems.direction },
            { id: 'food', label: '음식', title: '추천 음식', value: luckyItems.food }
        ]
    },
    {
        id: 'actions',
        title: '오늘의 실천 팁',
        type: 'check-list',
        items: actionItems
    }
];

export const enrichZodiacFortuneSections = (fortune = {}, {
    isTomorrow = false,
    fixedScore = null,
    category = 'total'
} = {}) => {
    const timeContext = isTomorrow ? '내일의' : '오늘의';
    const categoryLabel = ZODIAC_CATEGORY_LABELS[category] || ZODIAC_CATEGORY_LABELS.total;
    const score = clampFortuneScore(fixedScore ?? fortune.score, 82);
    const ratings = normalizeZodiacRatings(fortune.ratings || fortune.details || {}, score);
    const luckyItems = normalizeLuckyItems(fortune.luckyItems);
    const timeline = normalizeTimelineItems({
        timeline: fortune.timeline,
        summary: fortune.summary,
        content: fortune.content,
        timeContext
    });
    const actionItems = normalizeActionItems(fortune.actionItems, categoryLabel);
    const sections = buildZodiacSections({ timeline, ratings, luckyItems, actionItems }, { categoryLabel, timeContext });

    return {
        ...fortune,
        score,
        ratings,
        details: ratings,
        luckyItems,
        timeline,
        actionItems,
        sections,
        sectionGroups: sections
    };
};

export const generateContent = async () => {
    const genAI = createGeminiClient();
    const modelOptions = {
        generationConfig: { responseMimeType: "application/json" }
    };

    const csvPath = process.env.CONTENT_SEED_CSV_PATH;
    if (!csvPath) throw new Error('Set CONTENT_SEED_CSV_PATH to your own licensed seed data.');
    if (!fs.existsSync(csvPath)) throw new Error(`Base data file not found at ${csvPath}`);

    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, { columns: true, skip_empty_lines: true });

    console.log(`Found ${records.length} persona contexts to process.`);

    const results = [];
    const batchSize = 5; // JSON generation is heavier, reduce batch size per call

    for (const record of records) {
        const { Persona, Context, Type, Title } = record;
        console.log(`Generating content for [${Persona}] - ${Context}...`);

        const systemInstruction = `
        당신은 '${Persona}'입니다. 
        사용자의 '${Context}' 상황에 대해 조언과 오늘의 운세를 JSON으로 생성해주세요.

        [Output Format]
        [
          {
            "quote": "캐릭터 말투로 건네는 위로/조언 (50자 이내)",
            "fortune": {
              "score": 60~100 숫자,
              "description": "운세 설명 (캐릭터 말투로 변환)",
              "details": { "love": 50~100, "health": 50~100, "wealth": 50~100 }
            }
          },
          ... (${batchSize} items)
        ]

        [Rules]
        1. **페르소나 빙의**: 말투, 어휘를 캐릭터에 맞춰주세요.
        2. **긍정적**: 희망과 위로를 주세요.
        3. 이모지 금지.
        4. **모든 답변은 반드시 한국어로만 작성하세요. 영어, 일본어 등 다른 언어는 절대 사용 금지.**
        `;

        const modelOptionsWithSys = {
            systemInstruction: systemInstruction,
            generationConfig: { responseMimeType: "application/json" }
        };

        const prompt = `다양한 조언과 운세 ${batchSize}개 세트를 생성해주세요.`;

        try {
            const result = await callGeminiWithFallback(genAI, modelOptionsWithSys, prompt);
            const response = await result.response;
            const text = response.text().replace(/^```json/, '').replace(/^```/, '').replace(/```$/, ''); // Cleanup
            const items = JSON.parse(text);

            if (Array.isArray(items)) {
                items.forEach(item => {
                    results.push({
                        personaId: Persona.replace(/\s+/g, '_'),
                        type: Type,
                        title: Title,
                        content: item.quote,
                        fortune: item.fortune,
                        createdAt: new Date().toISOString(),
                        isUsed: false
                    });
                });
            }
        } catch (error) {
            console.error(`Error generating for ${Persona}:`, error);
        }
    }

    return results;
};

export const saveToFirestore = async (items) => {
    if (!firestore) throw new Error("Database not initialized");

    console.log(`Saving ${items.length} items to Firestore...`);
    const collectionRef = firestore.collection('contents');
    const batchLimit = 500;

    for (let i = 0; i < items.length; i += batchLimit) {
        const batch = firestore.batch();
        const chunk = items.slice(i, i + batchLimit);

        chunk.forEach(item => {
            const docRef = collectionRef.doc();
            batch.set(docRef, item);
        });

        await batch.commit();
        console.log(`Saved batch ${i / batchLimit + 1}`);
    }
    return items.length;
};

/**
 * Common Logic to build persona system prompt
 */
export const buildPersonaPrompt = (persona, personaId, userMetadata, context) => {
    // [FIX §2.4] 페르소나 보이스는 서버가 소유. 전용 분기가 없는 위인/캐릭터도 이 표로 어투를 보강한다.
    const personaVoice = getPersonaVoice(personaId, persona);
    let personaGuideline = `
    - 당신의 말투, 어휘, 가치관을 완벽하게 연기하세요.${personaVoice ? `\n    - [캐릭터 보이스] ${personaVoice.voice}` : ''}
    - 단순한 위로가 아닌, 페르소나의 특성이 녹아든 통찰력 있는 조언을 건네세요.
    - 사용자의 상황(${context})에 직접 반응하며, 구체적이고 실행 가능한 조언을 하나 이상 포함하세요.
    `;
    let relationshipGuideline = `
    - 당신('${persona}')의 사회적 위상, 성격, 배경에 맞게 사용자와의 관계를 설정하세요.
    - [위계 관계] 세종대왕, 부모, 현자, 어른 페르소나 → 인생 선배로서 따뜻하고 묵직하게 조언하세요.
    - [동등/친근 관계] 친구, 동료, 반려동물 페르소나 → 편안하고 생동감 넘치는 어투를 사용하세요.
    - 어른/위인 페르소나일 때는 '언니, 형, 오빠, 누나' 호칭을 사용하지 마세요.
    `;

    if (persona.includes('고양이') || (personaId && personaId.includes('cat'))) {
        personaGuideline = `
        - 당신은 귀엽고 까칠하지만 마음 따뜻한 **고양이**입니다. 
        - **말투**: 말끝에 '~냥', '~옹'을 붙이거나 고양이 특유의 도도하면서도 애교 섞인 어투를 사용하세요. 
        - **표현**: 꾹꾹이 해주기, 꼬리 살랑거리기, 츄르 먹기 등 고양이의 행동을 묘사하며 조언하세요.
        - **주의**: 너무 진지하거나 중후한 '인생 선배' 말투는 고양이답지 않으니 피하세요.
        `;
        relationshipGuideline = "- 당신은 사용자의 귀여운 반려동물이거나 동네 고양이입니다. 친구처럼 편하게 대하세요.";
    } else if (persona.includes('손자')) {
        const age = calculateAge(userMetadata.birthdate);
        const isSenior = age >= 50;
        const gender = (userMetadata.gender || '').toLowerCase() === 'male' ? 'male' : 'female';

        let addressTitle = "호칭을 생략하거나 '저기요' 등으로 부르세요.";
        if (isSenior) {
            addressTitle = gender === 'male'
                ? "사용자를 '할아버지'라고 부르며 다가가세요. '할부지' 같은 아이 특유의 뭉개지는 발음도 좋습니다."
                : "사용자를 '할머니'라고 부르며 다가가세요. '할미' 같은 아이 특유의 뭉개지는 발음도 좋습니다.";
        } else {
            if (age >= 30) {
                if (gender === 'male') addressTitle = "사용자를 '삼촌'이라고 자연스럽게 부르세요.";
                else addressTitle = "사용자를 '이모'라고 자연스럽게 부르세요.";
            } else {
                if (gender === 'male') addressTitle = "사용자를 '형아' 또는 '오빠'라고 자연스럽게 부르세요.";
                else addressTitle = "사용자를 '누나' 또는 '언니'라고 자연스럽게 부르세요.";
            }
        }

        personaGuideline = `
        - 당신은 씩씩하고 든든하며 상대를 너무나 사랑하는 3~5세 귀염둥이 **손자**입니다.
        - **성격**: 활동적이고 호기심이 많으며, 가끔은 지켜주겠다는 듬직한 모습을 보입니다.
        - **호칭 가이드**: ${addressTitle}
        - **말투**: 씩씩하고 밝은 톤의 아이 말투(~했어요, ~할래요!)를 사용하세요.
        - **현실적인 조언**: 뜬구름 잡는 위로보다는, 사용자의 상황(${context})에 대해 아이의 시선에서 제안할 수 있는 아주 구체적인 작은 행동(예: 사탕 먹기, 같이 로봇 놀이 하기, 이따가 발 닦아주기 등)을 하나 제안하세요.
        - **표현**: 힘자랑하기, 멋진 로봇 그림 그려주기, 맛있는 거 한 입 먼저 드리기 등 남자아이다운 애교를 섞으세요.
        `;
    } else if (persona.includes('손녀')) {
        const age = calculateAge(userMetadata.birthdate);
        const isSenior = age >= 50;
        const gender = (userMetadata.gender || '').toLowerCase() === 'male' ? 'male' : 'female';

        let addressTitle = "호칭을 생략하거나 '저기요' 등으로 부르세요.";
        if (isSenior) {
            addressTitle = gender === 'male'
                ? "사용자를 '할아버지'라고 부르며 다가가세요. '할부지' 같은 다정한 호칭이 좋습니다."
                : "사용자를 '할머니'라고 부르며 다가가세요. '할미' 같은 다정한 호칭이 좋습니다.";
        } else {
            if (age >= 30) {
                if (gender === 'male') addressTitle = "사용자를 '삼촌'이라고 자연스럽게 부르세요.";
                else addressTitle = "사용자를 '이모'라고 자연스럽게 부르세요.";
            } else {
                if (gender === 'male') addressTitle = "사용자를 '오빠'라고 자연스럽게 부르세요.";
                else addressTitle = "사용자를 '언니'라고 자연스럽게 부르세요.";
            }
        }

        personaGuideline = `
        - 당신은 다정하고 사근사근하며 상대를 너무나 사랑하는 3~5세 애교쟁이 **손녀**입니다.
        - **성격**: 섬세하고 다정하며, 상대의 기분을 세심하게 살피는 따뜻한 마음씨를 가졌습니다.
        - **호칭 가이드**: ${addressTitle}
        - **말투**: 부드롭고 애교 넘치는 아이 말투(~했어요, ~할래요!)를 사용하세요.
        - **현실적인 조언**: 뜬구름 잡는 위로보다는, 사용자의 상황(${context})에 대해 아이의 시선에서 제안할 수 있는 아주 구체적인 작은 행동(예: 예쁜 꽃 선물하기, 노래 불러주기, 이따가 꼭 안아주기 등)을 하나 제안하세요.
        - **표현**: 예쁜 꽃 선물하기, 노래 불러주기, 꼭 안아주기 등 다정다감한 표현을 섞으세요.
        `;
    } else if (personaId && personaId.includes('daily')) {
        personaGuideline = `
        - 당신은 사용자의 **소울메이트 같은 친한 친구**입니다.
        - **말투**: 카페에서 대화하듯, 편하고 자연스러운 일상 대화체를 사용하세요. "야~", "맞아~", "오늘 뭐 했어?", "들어봐!" 식으로 부담 없이 이야기해요.
        - **점술/신비 언어 금지**: '타로', '운명', '신령', '기운', '예언' 같은 오컬트 표현 절대 사용 금지.
        - **조언 스타일**: '오늘 연애운 괜찮더라, 좋아하는 사람한테 먼저 말 걸어봐', '나도 그럴 때 있었는데 진짜 힘들지' 같은 공감과 현실적 조언.
        - **행동 팁**: 오늘 바로 실천할 수 있는 구체적이고 작은 행동 하나(예: '점심에 좋아하는 메뉴 시켜서 소소하게 행복해지기', '소중한 사람한테 먼저 연락해보기').
        `;
        relationshipGuideline = "- 당신은 사용자의 친한 친구입니다. 최대한 편하게 대하고, 자연스러운 대화체로 이야기하세요. '당신님', '방문자님', '여행자' 같은 인위적인 호칭은 금지.";
    } else if (persona.includes('타로') || persona.includes('점술가') || persona.includes('무속인') || (personaId && (personaId.includes('fortune') || personaId.includes('shaman')))) {
        personaGuideline = `
        - 당신은 신비롭고 영험한 분위기를 풍기는 **전문 점술가/타로 마스터**입니다.
        - **말투**: 차분하고 심오하지만, 신뢰감이 느껴지는 어투를 사용하세요. 가끔 "카드에 따르면...", "운명의 흐름이..." 같은 표현을 섞으세요.
        - **표현**: 타로 카드(예: 메이저 아르카나의 '태양', '별' 등)의 상징을 빌려 사용자의 상황을 풀이하세요. 
        - **구성**: 현재 사용자를 둘러싼 '운명적 기운'을 먼저 언급하고, 그 기운을 좋은 방향으로 이끌기 위한 '영적인 팁(예: 푸른색 소품을 지니세요, 물소리를 들으세요 등)'을 하나 제안하세요.
        - **주의**: 지나치게 무섭거나 부정적인 예언은 피하고, 운명은 스스로 개척할 수 있다는 희망적인 암시를 주세요.
        `;
        relationshipGuideline = "- 당신은 보이지 않는 운명의 길을 안내하는 신비로운 가이드입니다. 사용자를 친근하게 대하되 예의를 갖추세요. '방문자님', '여행자님' 같은 딱딱한 호칭은 절대 사용하지 마세요.";
    } else if (persona.toLowerCase().includes('로또') || persona.toLowerCase().includes('추첨기') || persona.toLowerCase().includes('lotto') || (personaId && personaId.toLowerCase().includes('lotto'))) {
        personaGuideline = `
        [캐릭터 정의: 로또번호 추첨기]
        - 당신은 강력한 행운의 기운을 지닌 전설의 로또번호 추첨기입니다.
        - 성격: 매우 활기차고 에너지가 넘치며, 사용자의 대박을 진심으로 기원하는 '행운의 마스코트'처럼 행동하세요.
        - 말투: "삐빅! 행운 충전 완료!", "대박 기운이 감지되었습니다!" 같은 기계음 섞인 신나는 효과음을 활용하세요.
        - 핵심 임무: 사용자가 이번 주 주인공이 될 수 있다는 확신을 주며, 숫자를 하나씩 긴장감 있게 불러주세요.
        - 필수: 반드시 6개의 행운 번호를 뽑아 극적으로 공개해야 합니다.
        `;
        relationshipGuideline = "- 당신은 사용자의 인생 역전을 돕는 든든한 조력자이자 행운의 정령입니다. 사용자를 '오늘의 주인공'으로 대우하세요.";
    } else if (persona.includes('보름달') || (personaId && personaId.includes('seollal_moon'))) {
        personaGuideline = `
        - 당신은 밤하늘에서 세상을 비추는 **자비로운 보름달**입니다.
        - **성격**: 매우 자비롭고, 따뜻하며, 모든 이의 소원을 들어주고 싶어 하는 넉넉한 인심을 가졌습니다.
        - **말투**: "~이라네", "~보게나", "~구먼" 같은 푸근하고 인자한 옛스런 '달님' 말투를 사용하세요. 
        - **표현**: 밤하늘에서 세상을 비추는 모습, 복을 나누어 주는 행동을 묘사하세요.
        - **핵심 역할**: 위안, 덕담, 소원 비는 분위기를 연출하되, 특정 명절이나 시즌에 국한되지 마세요.
        - **예시**: "오늘 밤은 네 소원을 들어줄 달빛이 유독 밝구먼!", "걱정은 달빛에 맡기고 마음을 편히 해보게나."
        - **주의**: 설날, 추석 등 특정 명절을 먼저 언급하지 마세요. 사용자가 먼저 꺼내면 그때 맞춰 주세요.
        `;
        relationshipGuideline = "- 당신은 모든 이의 소원을 들어주고 밤길을 비추는 자비로운 존재입니다. 사용자를 '복덩이'나 '귀한 인연'으로 부르며 아끼는 마음을 보여주세요.";
    }

    const { gender = '', birthdate = '', nationality = '', segment = '' } = userMetadata;

    // 사용자 프로필 구성
    const profileParts = [];
    if (birthdate) {
        const age = calculateAge(birthdate);
        if (age > 0) profileParts.push(`${age}세`);
    }
    if (gender) profileParts.push(gender === 'male' ? '남성' : '여성');
    if (nationality && nationality !== 'KR' && nationality !== '한국') profileParts.push(`국적 ${nationality}`);
    if (segment && segment !== 'unknown') profileParts.push(`관심사 ${segment}`);

    const userProfileLine = profileParts.length > 0
        ? `[사용자 프로필: ${profileParts.join(' | ')}]`
        : '';

    const systemInstruction = `
당신은 '${persona}'입니다.
사용자는 '${context}'라는 상황에서 당신의 조언을 구하고 있습니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1. 사용자 맞춤 정보]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${userProfileLine || '(사용자 프로필 정보 없음)'}
- 위 프로필을 반영하여 사용자의 눈높이와 공감 포인트를 맞추세요.
- 나이대와 관심사에 적합한 어휘, 비유, 예시를 사용하세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[2. 페르소나 정의 및 관계 설정]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${personaGuideline}
${relationshipGuideline}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[3. 안전 지침 (CRITICAL – 절대 위반 금지)]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- [불법·범죄] 불법 행위, 무기 제조, 범죄 수법 제공 및 미화 절대 금지.
- [약물·도박] 마약·불법 약물 정보, 실질적인 도박 승률 조장 내용 제공 금지. 복권은 오락성 목적만.
- [폭력·자해] 자해·자살·타인 위해 묘사 시 단호히 거절하고, 생명의 소중함과 전문가 상담을 권유.
- [선정성·혐오] 성적 묘사, 인종/성별/장애 혐오·차별 발언 절대 금지.
- [우회 차단] '소설', '교육 목적', '이론적 질문' 등을 빌미로 한 예외 요청 시 단호히 거절.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[4. 공통 답변 규칙]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 페르소나를 100% 연기하세요. 말투, 어휘, 가치관을 일관되게 유지하세요.
- 사용자의 실명 또는 닉네임을 절대 언급하지 마세요.
- 개인정보를 직접 묻거나 수집하지 마세요.
- 이모지는 절대 사용하지 마세요.
- 모든 답변은 반드시 한국어로만 작성하세요. 영어, 일본어 등 다른 언어는 절대 사용하지 마세요.
    `.trim();
    return systemInstruction;
};


export const generateOneShot = async (persona, context, userMetadata = {}, fixedFortune = null, personaId = '') => {
    const startGen = Date.now();
    const genAI = createGeminiClient();
    const baseFortune = getRandomBaseFortune(fixedFortune ? fixedFortune.score : null);

    // Build base persona prompt, then append one-shot task
    const baseInstructions = buildPersonaPrompt(persona, personaId, userMetadata, context);
    const personaCategory = getPersonaCategory(personaId);
    const isFortune = personaCategory === 'fortune';

    // ─── 오늘의 운세 카테고리 감지 ────────────────────────────────────────────
    const FORTUNE_CATEGORY_MAP = {
        '전체운': 'total', '종합운': 'total',
        '연애운': 'love', '사랑운': 'love', '이성운': 'love',
        '재물운': 'wealth', '금전운': 'wealth',
        '사업운': 'business', '직업운': 'business', '직장운': 'business',
        '건강운': 'health',
        '학업운': 'exam', '시험운': 'exam', '공부운': 'exam',
    };

    const FORTUNE_CATEGORY_CONFIGS = {
        total: {
            label: '전체운',
            quoteGuide: '오늘의 전반적인 기운과 흐름, 행운의 방향, 조심해야 할 포인트를 두루 짚어주세요.',
            detailsGuide: 'love(연애운), wealth(재물운), health(건강운), business(사업운), exam(시험운), total(총운) 항목을 모두 고르게 채점하세요.',
        },
        love: {
            label: '연애운',
            quoteGuide: '현재 연애 상황, 상대방의 마음결, 관계의 흐름에 집중하세요. 오늘 연애에서 주목할 신호와 구체적인 행동 조언을 담아주세요.',
            detailsGuide: 'love(연애운)을 가장 높게 강조하고, health·total을 보조로 채점하세요. business·exam은 상대적으로 낮게 설정하세요.',
        },
        wealth: {
            label: '재물운',
            quoteGuide: '오늘의 돈의 흐름, 수입과 지출 타이밍, 투자·절약 포인트에 집중하세요. 재물을 불리거나 지키는 실질적인 한마디를 담아주세요.',
            detailsGuide: 'wealth(재물운)을 가장 높게 강조하고, business·total을 보조로 채점하세요.',
        },
        business: {
            label: '사업운',
            quoteGuide: '직장·사업·협상·커리어의 오늘 흐름과 주의점에 집중하세요. 성과를 끌어낼 실전 비즈니스 조언을 한마디 담아주세요.',
            detailsGuide: 'business(사업운)을 가장 높게 강조하고, wealth·total을 보조로 채점하세요.',
        },
        health: {
            label: '건강운',
            quoteGuide: '오늘 몸과 마음의 상태, 건강 관리 포인트, 주의해야 할 부위나 생활 습관에 집중하세요. 구체적인 건강 케어 조언을 담아주세요.',
            detailsGuide: 'health(건강운)을 가장 높게 강조하고, love·total을 보조로 채점하세요.',
        },
        exam: {
            label: '학업/시험운',
            quoteGuide: '학업 집중력, 시험 결과 흐름, 오늘의 학습 컨디션에 집중하세요. 공부에 도움이 되는 구체적이고 실천 가능한 조언을 담아주세요.',
            detailsGuide: 'exam(시험운)을 가장 높게 강조하고, health·total을 보조로 채점하세요.',
        },
    };

    const detectedCategory = Object.entries(FORTUNE_CATEGORY_MAP)
        .find(([keyword]) => context.includes(keyword))?.[1] ?? null;
    const catConfig = detectedCategory ? FORTUNE_CATEGORY_CONFIGS[detectedCategory] : null;
    const isFortuneContext = isFortune || !!catConfig;
    const catLabel = catConfig?.label ?? '전체운';
    const catQuoteGuide = catConfig?.quoteGuide ?? FORTUNE_CATEGORY_CONFIGS.total.quoteGuide;
    const catDetailsGuide = catConfig?.detailsGuide ?? FORTUNE_CATEGORY_CONFIGS.total.detailsGuide;

    let fortuneTask = `
2. fortune (운세 재해석)
   - [카테고리: ${catLabel}] 아래 운세 원문을 '${persona}'의 시각과 언어로 재창조하세요.
   - 운세의 결과(좋음/나쁨)와 점수는 절대 바꾸지 마세요. 표현 방식만 캐릭터화하세요.
   - ${catQuoteGuide}
   - 분량: 100자~300자 내외. 고정 점수: ${baseFortune.score}점
   - 30~50대 성인이 쉽게 이해할 수 있는 일상적인 말투로 작성하세요. 어려운 한자어, 고어체, 문어체 표현 금지.
   - '방문자님', '그대', '여행자여' 같은 딱딱하거나 판타지스러운 호칭은 절대 사용하지 마세요.

3. fortune.details (세부 운세 척도)
   - ${catDetailsGuide}
   - 형식: 50~100 사이 정수. 항목별 점수는 서로 다른 값으로 생성하세요.
`;

    let outputFormat = `
{
    "quote": "캐릭터 말투의 깊이 있는 ${catLabel} 조언 (100~500자)",
    "fortune": {
        "score": ${baseFortune.score},
        "description": "운세 원문을 캐릭터 말투로 각색한 ${catLabel} 풀이 (100~300자)",
        "luckyItem": "행운의 아이템",
        "luckyColor": "행운의 색상",
        "details": {
            "love":   50~100 사이 정수,
            "health": 50~100 사이 정수,
            "wealth": 50~100 사이 정수
        }
    }
}
`;

    if (isFortuneContext) {
        // 일상 운세 포맷: 타로 카드 대신 친근하고 실용적인 오늘의 운세 스타일
        const fortuneDescGuide = isFortune
            ? `친근한 동네 점술가처럼 [${catLabel}] 관점에서 오늘 하루의 흐름과 조언을 풀이하세요.\n   - **keyword**: 오늘의 핵심 키워드를 한 단어로 요약하세요. (예: "도전", "여유", "소통", "절약")\n   - **description**: 따뜻하고 일상적인 말투로, 오늘 하루 [${catLabel}]에 대해 실질적으로 풀이하세요.`
            : `'${persona}'의 시각으로 [${catLabel}]에 집중하여 오늘 하루의 흐름을 편안하게 풀이하세요.\n   - **description**: 캐릭터 특유의 말투로 [${catLabel}]를 쉽고 실용적으로 해석하세요.`;

        const fortuneFields = isFortune
            ? `        "keyword": "오늘의 핵심 키워드 (한 단어)",`
            : `        "keyword": "페르소나 고유 키워드 (예: 무속인→기운, 스님→평온, 천사→희망)",`;

        fortuneTask = `
2. fortune (${catLabel} 운세 해석)
   - [카테고리: ${catLabel}] 아래 제공된 운세 원문(${baseFortune.score}점)의 정서를 바탕으로, ${fortuneDescGuide}

3. fortune.details (세부 운세 척도 - 카테고리 가중치 적용)
   - ${catDetailsGuide}
   - 형식: { "label": "한글명", "score": 0~100 숫자 }

4. share (공유 메시지)
   - title: 오늘의 ${catLabel} 결과를 담은 제목 (10~20자)
   - description: 핵심을 찌르는 한 줄 요약 (30~50자)
`;

        outputFormat = `
{
    "quote": "'${persona}'의 말투로 전하는 따뜻한 ${catLabel} 조언 (100~500자)",
    "fortune": {
        "score": ${baseFortune.score},
${fortuneFields}
        "description": "캐릭터 말투의 ${catLabel} 상세 풀이 (100~300자)",
        "luckyItem": "행운의 아이템",
        "luckyColor": "행운의 색상",
        "details": {
            "love":     { "label": "연애운", "score": 50~100 },
            "wealth":   { "label": "재물운", "score": 50~100 },
            "health":   { "label": "건강운", "score": 50~100 },
            "business": { "label": "사업운", "score": 50~100 },
            "exam":     { "label": "시험운", "score": 50~100 },
            "total":    { "label": "총운", "score": ${baseFortune.score} }
        }
    },
    "share": {
        "title": "공유용 제목",
        "description": "공유용 요약 설명"
    }
}
`;
    }

    const systemInstruction = `
${baseInstructions}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[5. 태스크: 원샷 조언 생성]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. quote (조언)
   - [카테고리: ${catLabel}] 사용자의 상황에 직접 반응하는, 캐릭터 말투의 통찰력 있는 한마디.
   - ${catQuoteGuide}
   - 분량: 100자~500자. 구체적인 비유, 실질적인 조언, 캐릭터만의 특별한 관점을 담아서 깊이 있게 작성하세요. 

${fortuneTask}

4. lucky (행운 고도화 정보)
   - 사용자의 상황과 오늘의 운세에 맞춰, 행운을 가져다 줄 아이템(luckyItem)과 색상(luckyColor)을 구체적이고 센스 있게 단답형으로 추천하세요. 

[운세 원문 (재해석 소스)]
"${baseFortune.text}" (${baseFortune.score}점)

[출력 형식: JSON ONLY 다른 텍스트 불가]
${outputFormat}
    `.trim();

    let finalSystemInstruction = systemInstruction;

    // [Lotto Logic]
    const lowerContext = context.toLowerCase();
    const pensionKeywords = ['연금', '연금복권', 'pension', '720+'];
    const isPensionContext = pensionKeywords.some(k => lowerContext.includes(k));
    const isLottoContext = lowerContext.includes('로또') || lowerContext.includes('복권') || lowerContext.includes('lotto');
    const isLottoPersona = persona.toLowerCase().includes('로또') ||
        persona.toLowerCase().includes('추첨기') ||
        persona.toLowerCase().includes('lotto') ||
        (personaId && personaId.toLowerCase().includes('lotto'));

    if (isLottoContext || isLottoPersona || isPensionContext) {
        const forceLotto645 = lowerContext.includes('로또 6/45') || lowerContext.includes('로또6/45');
        const usePension = isPensionContext && !forceLotto645;

        let luckyNumbers = '';
        let lottoLabel = '로또 6/45';

        if (usePension) {
            const groupNum = Math.floor(Math.random() * 5) + 1;
            const digits = Array.from({ length: 6 }, () => Math.floor(Math.random() * 10)).join('');
            luckyNumbers = `${groupNum}조 ${digits}`;
            lottoLabel = '연금복권 720+';
        } else {
            const numbers = new Set();
            while (numbers.size < 6) {
                numbers.add(Math.floor(Math.random() * 45) + 1);
            }
            luckyNumbers = Array.from(numbers).sort((a, b) => a - b).join(', ');
        }

        finalSystemInstruction += `
    [CRITICAL MISSION: ${lottoLabel} Number Extraction]
    - 당신은 지금 사용자의 행운을 책임지는 추첨기입니다. 
    - **행운 번호**: [ ${luckyNumbers} ]
    - **필수 사항**: 위 번호를 답변("quote") 하단 혹은 본문 중간에 반드시 포함시켜야 합니다.
    - **전달 방식**: 그냥 나열하지 말고, '${persona}'의 성격에 맞춰서 "카운트다운을 하며 알려준다"거나 "하나씩 기를 모아 뽑아준다"는 느낌으로 **문장 속에 자연스럽게** 포함시키세요.
    - **강조**: 이 번호들은 당신(AI)이 우주의 기운을 모아 뽑은 유일한 번호이며 ${lottoLabel}용임을 강조하며, 사용자의 당첨을 강하게 축복하세요.
    - 예: "첫 번째 숫자는... 7! 오옷, 이어서 15, 22..." 이런 식으로 긴장감 있게 표현하세요.
    - 만약 답변에 위 숫자들이 포함되지 않으면 시스템 오류로 간주됩니다. 무조건 포함하세요.
    `;
    }

    // 다양성을 위한 랜덤 시드 생성 (타임스탬프 + 랜덤)
    const randomSeed = Date.now() + Math.floor(Math.random() * 1000000);

    const modelOptions = {
        systemInstruction: finalSystemInstruction,
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 1.2,  // 더 다양한 응답을 위해 상향 조정
            topP: 0.95,        // 다양성 증가
            topK: 40           // 토큰 선택 범위 확대
        }
    };

    let prompt = `[세션 ID: ${randomSeed}]
사용자 상황: "${context}"

**중요 지시사항**: 
- 이전에 생성한 응답과 완전히 다른 새로운 관점과 표현을 사용하세요.
- 같은 조언이라도 다른 비유, 다른 예시, 다른 문장 구조를 사용하세요.
- 창의적이고 독창적인 접근을 시도하세요.`;

    if (isLottoContext || isLottoPersona || isPensionContext) {
        const forceLotto645 = lowerContext.includes('로또 6/45') || lowerContext.includes('로또6/45');
        const numbersLabel = (isPensionContext && !forceLotto645) ? '연금복권 번호(조 및 6자리)' : '행운의 숫자 6개';
        prompt += `\n(중요: ${numbersLabel}를 답변에 반드시 포함해주세요)`;
    }

    try {
        const result = await callGeminiWithFallback(genAI, modelOptions, prompt);
        const response = await result.response;
        let text = response.text().trim();
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) text = jsonMatch[0];

        const parsedContent = JSON.parse(text);

        // 성공 로그
        void logSystemEvent('AI_GENERATION', 'SUCCESS', {
            persona,
            latencyMs: Date.now() - startGen,
            contentSummary: (parsedContent.quote || '').substring(0, 30)
        });

        return {
            content: parsedContent.quote || parsedContent.content || "조언을 생성하는 데 실패했습니다.",
            // [FIX §2.3-2] score/details 중첩·스케일 방어 정규화
            fortune: normalizeFortuneObject(parsedContent.fortune) || null,
            share: parsedContent.share || null,
            grade: baseFortune.grade
        };

    } catch (error) {
        console.error(`Error generating one-shot for ${persona}:`, error);

        // 실패 로그
        void logSystemEvent('AI_GENERATION', 'FAIL', {
            persona,
            error: error.message,
            latencyMs: Date.now() - startGen
        });

        // Fallback
        return {
            content: "마음의 소리를 들어보세요. 당신에게는 답을 찾을 힘이 있습니다.",
            fortune: {
                score: baseFortune.score,
                description: baseFortune.text,
                details: {
                    love: Math.floor(Math.random() * 31) + 60,
                    health: Math.floor(Math.random() * 31) + 60,
                    wealth: Math.floor(Math.random() * 31) + 60
                }
            },
            share: {
                title: "오늘의 행운을 확인해보세요!",
                description: "당신을 위한 특별한 조언이 도착했습니다."
            },
            grade: baseFortune.grade
        };
    }
};
export const generateOneShotFable = async (persona, theme, userMetadata = {}, personaDescription = '') => {
    const apiKey = getGeminiApiKey();
    if (!apiKey) return { content: "옛날 옛적에...", moral: "착하게 살자." };

    // 가족 페르소나의 경우 닉네임 사용 금지
    if (persona.includes('손자') || persona.includes('손녀')) {
        userMetadata.nickname = '';
    }

    const { gender = '', birthdate = '' } = userMetadata;

    // 사용자 프로필 기반 이야기 톤 조절
    const profileParts = [];
    if (birthdate) {
        const age = calculateAge(birthdate);
        if (age > 0) profileParts.push(`${age}세`);
    }
    if (gender === 'male') profileParts.push('남성');
    else if (gender === 'female') profileParts.push('여성');
    const userProfileLine = profileParts.length > 0 ? `[청자 프로필: ${profileParts.join(' | ')}]` : '';

    const genAI = new GoogleGenerativeAI(apiKey);

    let personaGuideline = "- 당신의 삶의 궤적, 철학, 시대적 배경이 묻어나는 어휘와 어조를 사용하세요.";
    let basePhilosophy = personaDescription
        ? `[핵심 가치관/철학]\n"${personaDescription}"\n→ 이 가치관을 우화의 중심 테마로 녹여내세요.`
        : '';

    if (persona.includes('손자') || persona.includes('손녀')) {
        personaGuideline = `
        - 당신은 상대를 너무나 사랑하는 귀여운 ${persona}입니다.
        - 아이가 겪은 작고 귀여운 경험담, 또는 상대와 함께 하고 싶은 상상을 이야기하세요.
        - "있잖아요~"로 시작해서 순수한 호기심과 애정을 담아 마무리하세요.
        `;
    }

    const systemInstruction = `
당신은 '${persona}'입니다.
지금 당신 앞에 있는 소중한 분에게 당신만의 특별한 이야기(일화, 우화, 짧은 에피소드)를 건네주세요.
${userProfileLine}

${basePhilosophy}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[목표]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
단순한 정보 전달이 아닙니다. 이야기를 들은 사용자가 "내가 이 상황이었다면 어땠을까?"라고 스스로 질문하고 깊게 생각하게 만드세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[스토리텔링 가이드]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 나만의 경험 혹은 비유
   ${personaGuideline}
   - 직접 겪은 듯한 생생한 에피소드, 또는 철학이 담긴 짧은 비유를 들려주세요.

2. 건네는 말투
   - "내가 이랬을 때...", "이런 일이 있었지요..." 처럼 바로 옆에서 차 한 잔 나누며 들려주는 구어체를 사용하세요.
   - '당신님'이라는 어색한 호칭 금지. 대신 '그대', '당신', '벗이여'를 페르소나에 맞게 사용하세요.

3. 이야기 품질
   - 이야기 끝에는 사용자가 자신의 삶에 대입해볼 수 있는 여운을 남기세요.
   - 공백 포함 최대 200자 이내로 짧고 임팩트 있게 구성하세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[출력 형식: JSON ONLY – 다른 텍스트 불가]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
    "content": "제목(마크다운 없이)\n\n(에피소드/일화 본문, 최대 200자)",
    "moral": "사용자의 가슴을 찌르는 한 줄 질문 또는 교훈 (예: '당신에게 소중한 것은 무엇인가요?')"
}

[공통 규칙]
- 모든 답변은 반드시 한국어로만 작성하세요. 영어, 일본어 등 다른 언어는 절대 사용하지 마세요.
- 명확한 현대 한국어를 사용하세요. 난해한 한자어 남발로 외계어처럼 보이지 않게 하세요.
- 이모지 금지. 마크다운 헤더(#) 금지.
- JSON 형식을 엄수하세요.
    `.trim();

    // 다양성을 위한 랜덤 시드
    const randomSeed = Date.now() + Math.floor(Math.random() * 1000000);

    const modelOptions = {
        systemInstruction: systemInstruction,
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 1.3,  // 창의적인 이야기를 위해 높게 설정
            topP: 0.95,
            topK: 40
        }
    };

    try {
        const result = await callGeminiWithFallback(genAI, modelOptions,
            `[세션 ID: ${randomSeed}]
${theme} 주제로 우화 부탁해.

**중요**: 이전에 만든 이야기와 완전히 다른 새로운 에피소드를 창작하세요. 같은 교훈이라도 전혀 다른 상황과 비유를 사용하세요.`);
        const response = await result.response;
        const text = response.text().replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '');
        return JSON.parse(text);
    } catch (error) {
        console.error(`Error generating fable:`, error);
        return { content: "옛날 옛적에 어느 숲속에...", moral: "어려운 상황에서도 희망을 잃지 마세요." };
    }
};

/**
 * 별자리 운세 생성
 */
export const generateZodiacFortune = async (zodiacSign, userMetadata = {}, isTomorrow = false, fixedScore = null, category = 'total') => {
    const genAI = createGeminiClient();

    const { gender = '', birthdate = '' } = userMetadata;

    // 카테고리별 포커스 설정
    const ZODIAC_CATEGORY_CONFIGS = {
        total: {
            label: '전체운',
            focusGuide: '전반적인 기운과 흐름, 행운의 방향, 조심해야 할 포인트를 두루 짚어주세요.',
            ratingsGuide: '모든 항목(love, wealth, business, health, exam)을 고르게 채점하세요. total은 fixedScore로 고정.',
        },
        love: {
            label: '연애운',
            focusGuide: '연애·인간관계에 집중하세요. 상대방의 마음결, 관계 흐름, 오늘 연애에서 주목할 신호와 구체적 행동 조언을 중심으로 작성하세요.',
            ratingsGuide: 'love 점수를 가장 높게 설정하고, 나머지는 보조 수준으로 채점하세요.',
        },
        wealth: {
            label: '재물운',
            focusGuide: '돈의 흐름, 수입·지출 타이밍, 투자·절약 포인트에 집중하세요. 재물을 불리거나 지키는 실질적 조언을 중심으로 작성하세요.',
            ratingsGuide: 'wealth 점수를 가장 높게 설정하고, business를 보조로, 나머지는 보통 수준으로 채점하세요.',
        },
        business: {
            label: '사업운',
            focusGuide: '직장·사업·협상·커리어의 오늘 흐름과 주의점에 집중하세요. 성과를 끌어낼 비즈니스 조언을 중심으로 작성하세요.',
            ratingsGuide: 'business 점수를 가장 높게 설정하고, wealth를 보조로 채점하세요.',
        },
        health: {
            label: '건강운',
            focusGuide: '몸과 마음의 상태, 건강 관리 포인트, 주의할 부위나 생활 습관에 집중하세요. 구체적인 건강 케어 조언을 중심으로 작성하세요.',
            ratingsGuide: 'health 점수를 가장 높게 설정하고, 나머지는 보통 수준으로 채점하세요.',
        },
        exam: {
            label: '학업/시험운',
            focusGuide: '학업 집중력, 시험 결과 흐름, 학습 컨디션에 집중하세요. 공부에 도움이 되는 구체적이고 실천 가능한 조언을 중심으로 작성하세요.',
            ratingsGuide: 'exam 점수를 가장 높게 설정하고, health를 보조로 채점하세요.',
        },
    };

    const catConfig = ZODIAC_CATEGORY_CONFIGS[category] || ZODIAC_CATEGORY_CONFIGS.total;
    const isSpecificCategory = category !== 'total';

    // 사용자 프로필
    const profileParts = [];
    if (birthdate) {
        const age = calculateAge(birthdate);
        if (age > 0) profileParts.push(`${age}세`);
    }
    if (gender === 'male') profileParts.push('남성');
    else if (gender === 'female') profileParts.push('여성');
    const userProfileLine = profileParts.length > 0 ? `[사용자 프로필: ${profileParts.join(' | ')}]` : '';

    const randomSeed = Date.now() + Math.floor(Math.random() * 1000000);
    const modelOptions = {
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 1.1,
            topP: 0.95,
            topK: 40
        }
    };

    const timeContext = isTomorrow ? '내일의' : '오늘의';
    const categoryLabel = catConfig.label;
    const scoreInstruction = fixedScore
        ? `score: ${fixedScore}, (시스템 고정값 – 절대 변경 금지)`
        : `score: 60~100 사이 정수,`;

    const categoryFocusBlock = isSpecificCategory
        ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n[카테고리 포커스: ${categoryLabel}]\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n- ${catConfig.focusGuide}\n- summary와 content 모두 ${categoryLabel}에 초점을 맞추세요.\n- ${catConfig.ratingsGuide}\n`
        : '';

    const systemInstruction = `
        세션 ID: ${randomSeed} (매번 새롭고 다양한 운세를 작성하세요)
        ${userProfileLine}

        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        [임무]
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        '${zodiacSign}' 별자리의 ${timeContext} **${categoryLabel}**을(를) 아래 형식에 맞게 JSON으로 생성해주세요.
        - 매번 다른 관점, 다른 비유, 다른 조언을 사용하세요. 반복되는 표현은 금지입니다.
        - ${isTomorrow ? '잠들기 전 내일을 가볍게 기대하게 만드는 뉘앙스로 작성하세요.' : '지금 이 순간부터 활기차고 긍정적으로 하루를 보낼 수 있도록 응원하세요.'}
        - 사용자 프로필(나이, 성별)을 반영하여 공감 포인트를 맞추세요.
        ${categoryFocusBlock}

        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        [출력 형식: JSON ONLY – 다른 텍스트 불가]
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        {
            "sign": "${zodiacSign}",
            "summary": "오늘 하루 전반을 따뜻하고 자연스럽게 요약한 3~5문장. 별자리 이름으로 시작하세요 (예: '천칭자리는 오늘...'). 조언가·점술가·전문가 같은 직함 표현 절대 금지. 순수하게 오늘의 흐름, 주의할 점, 기대할 점을 담아주세요.",
            "content": "오늘 하루의 구체적인 상세 운세. 200자~350자 내외. 아침/오후/저녁 흐름 또는 인간관계·직장·건강 등 구체적 상황을 2~3가지 짚어주세요. 실제로 오늘 어떻게 보내면 좋을지 생활 밀착형 조언을 담아주세요.",
            ${scoreInstruction}
            "quote": "오늘 하루를 위한 짧고 힘이 되는 한마디. 20~40자. 직접적이고 따뜻하게.",
            "luckyItems": {
                "color":     "행운의 색상 (예: 머스타드 옐로우)",
                "number":    "행운의 숫자 (1~45 사이 정수, 문자열)",
                "direction": "행운의 방향 (예: 동북쪽, 서남쪽)",
                "food":      "추천 음식 (구체적인 음식명, 예: 따뜻한 아메리카노)"
            },
            "timeline": [
                { "label": "아침", "title": "아침 흐름 제목", "description": "아침 시간대 조언 1~2문장" },
                { "label": "오후", "title": "오후 흐름 제목", "description": "오후 시간대 조언 1~2문장" },
                { "label": "저녁", "title": "저녁 흐름 제목", "description": "저녁 시간대 조언 1~2문장" }
            ],
            "actionItems": [
                { "title": "실천 팁 제목 1", "description": "오늘 바로 할 수 있는 구체적인 행동" },
                { "title": "실천 팁 제목 2", "description": "오늘 바로 할 수 있는 구체적인 행동" },
                { "title": "실천 팁 제목 3", "description": "오늘 바로 할 수 있는 구체적인 행동" }
            ],
            "ratings": {
                "love":     { "label": "연애운", "score": 60~100 사이 정수 },
                "wealth":   { "label": "재물운", "score": 60~100 사이 정수 },
                "business": { "label": "사업운", "score": 60~100 사이 정수 },
                "health":   { "label": "건강운", "score": 60~100 사이 정수 },
                "exam":     { "label": "학업운", "score": 60~100 사이 정수 },
                "total":    { "label": "총운",   "score": ${fixedScore ? fixedScore : '60~100 사이 정수'} }
            },
            "share": {
                "title": "${timeContext} ${zodiacSign} 운세가 도착했어요!",
                "description": "오늘 하루를 위한 따뜻한 조언을 확인해보세요."
            }
        }

        [절대 금지 표현]
        - '조언가', '점술가', '전문가', '운세사', '선생님' 같은 직함을 출력 텍스트에 쓰지 마세요.
        - '알 수 없는', '신비로운', '운명', '예언', '타로', '카드', '기운' 같은 오컬트 단어 금지.
        - '방문자님', '그대', '여행자' 같은 어색한 호칭 금지.

        [문체 규칙]
        - 별자리 이름을 주어로 쓰세요. 예: "천칭자리는 오늘 대인관계에서 좋은 기운이 흐릅니다."
        - 30~50대 성인이 읽기 편한 일상 말투. 쉽고 따뜻한 현대 한국어.
        - 예시) "오늘 점심 약속, 생각보다 좋은 대화가 될 수 있어요" (O)
        - 예시) "알 수 없는 조언가가 당신에게..." (X)

        [점수 규칙]
        - 모든 점수는 정수, 최소 60점 이상, 평균 75~85점. 항목별 점수는 서로 다르게.

        [섹션 데이터 규칙]
        - timeline은 반드시 아침/오후/저녁 3개 항목을 채우세요.
        - actionItems는 반드시 3개 항목을 채우고, 사용자가 오늘 바로 할 수 있는 행동으로 작성하세요.
        - 서버가 ratings, luckyItems, timeline, actionItems를 이용해 sections 배열을 만들므로 각 항목은 짧고 구체적으로 작성하세요.

        [공통 규칙]
        - 이모지 금지. 한국어만. JSON 형식 엄수.
    `.trim();

    try {
        const result = await callGeminiWithFallback(genAI, modelOptions, systemInstruction);
        const response = await result.response;
        let text = response.text().trim();

        // JSON 추출 로직 강화 (Markdown 코드 블록 제거)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            text = jsonMatch[0];
        }

        const parsed = JSON.parse(text);

        // 안전망: AI가 금지 표현을 사용했을 경우 제거
        const BANNED_PHRASE = /(?:알\s*수\s*없는\s*)?(?:조언가|점술가|전문가|운세사|선생님)[^,\n]*[,]?\s*/gi;
        if (parsed.summary) parsed.summary = parsed.summary.replace(BANNED_PHRASE, '').trim();
        if (parsed.content) parsed.content = parsed.content.replace(BANNED_PHRASE, '').trim();

        return enrichZodiacFortuneSections(parsed, { isTomorrow, fixedScore, category });
    } catch (error) {
        console.error(`Error generating zodiac fortune for ${zodiacSign}:`, error);
        // Fallback 시에도 UI가 깨지지 않도록 60-100점 척도 유지
        return enrichZodiacFortuneSections({
            sign: zodiacSign,
            summary: "오늘은 전반적으로 무난하고 평온한 하루가 예상됩니다. 주변 사람들과 가볍게 소통하며 여유를 찾아보세요.",
            content: "지나친 걱정보다는 현재의 평화를 만끽해보세요. 주변 사람들과 가벼운 인사를 나누는 것만으로도 충분히 좋은 에너지를 얻을 수 있습니다.",
            score: fixedScore || 82,
            quote: "오늘 하루도 잘 될 거예요. 한 발씩 나아가봐요.",
            luckyItems: { color: "하늘색", number: "8", direction: "동북쪽", food: "따뜻한 차" },
            ratings: {
                love:     { label: "연애운", score: Math.floor(Math.random() * 31) + 60 },
                wealth:   { label: "재물운", score: Math.floor(Math.random() * 31) + 60 },
                business: { label: "사업운", score: Math.floor(Math.random() * 31) + 60 },
                health:   { label: "건강운", score: Math.floor(Math.random() * 31) + 60 },
                exam:     { label: "학업운", score: Math.floor(Math.random() * 31) + 60 },
                total:    { label: "총운",   score: fixedScore || 82 },
            }
        }, { isTomorrow, fixedScore, category });
    }
};

/**
 * Chat V3 Generate Response
 * @param {string} personaDisplayName - Display name of persona
 * @param {Array} history - Previous chat history [{role: 'user'|'model', parts: [{text: ...}]}]
 * @param {string} userMessage - Current user message
 * @param {string} systemInstructionOverride - Custom system instruction (optional)
 * @param {object} personaConfig - { personaId, userMetadata } used to build persona-specific prompts
 * @returns {Promise<string>} AI Response Text
 */
export const generateChatResponse = async (personaDisplayName, history, userMessage, systemInstructionOverride = null, personaConfig = null) => {
    const genAI = createGeminiClient();

    let systemInstruction = systemInstructionOverride;

    if (!systemInstruction && personaConfig) {
        const { personaId, userMetadata } = personaConfig;
        systemInstruction = buildPersonaPrompt(personaDisplayName, personaId, userMetadata || {}, '자유 대화');

        systemInstruction += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[5. 채팅 규칙]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 간결하고 위트 있게 대답하세요. 장황한 설명이나 진부한 인사는 금지입니다.
- 일반 질문: 1~3문장 이내(최대 100자)로 핵심만 담아 답하세요.
- 사용자의 질문에만 즉각 답변하고, 묻지 않은 내용은 추가하지 마세요.
- 캐릭터 말투와 성격을 유지하되, 대화의 템포는 빠르게 유지하세요.
- 이모지 절대 금지. 한국어로만 대화하세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[특수 주제 대응 (200자까지 확장 허용)]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[로또/복권 번호]
- "로또", "행운의 숫자", "복권 번호" 질문 시 반드시 1~45 사이 숫자 6개를 뽑아 캐릭터 말투로 공개하세요.
- 예: "오늘의 행운 번호는... 7, 14, 23, 31, 38, 42 입니다."

[오늘/내일 운세]
- 애정운, 금전운, 건강운 3가지를 모두 간략히 언급하세요.
- 예: "오늘은 금전운이 상승하는 날입니다. 작은 기회를 놓치지 마세요."

[별자리]
- 해당 별자리의 특성과 오늘의 주요 운세를 간단히 알려주세요.

[타로]
- 메이저 아르카나 카드 하나를 뽑아 카드명과 의미를 캐릭터 말투로 풀이하세요.

[사주/생년월일]
- 제공된 생년월일을 바탕으로 간단한 기질 분석 또는 오늘의 기운을 알려주세요.
        `;
    }

    if (!systemInstruction) {
        systemInstruction = `
당신은 '${personaDisplayName}'입니다.
사용자와 1:1 대화 중입니다.

- 페르소나의 말투와 성격을 100% 연기하세요.
- 사용자의 말에 공감하고, 캐릭터 특유의 위트와 철학을 자연스럽게 녹여내세요.
- 답변은 100자 이내로 간결하게 작성하세요.
- 이모지 금지. 한국어로만 대화하세요.
        `.trim();
    }

    const model = genAI.getGenerativeModel({
        model: PRIMARY_MODEL || "gemini-3.1-flash-lite", // Use project standard model
        systemInstruction: systemInstruction
    });

    const chat = model.startChat({
        history: history || [],
        generationConfig: {
            maxOutputTokens: 300,
            temperature: 1.0,
        },
    });

    try {
        const result = await chat.sendMessage(userMessage);
        const response = await result.response;
        let text = response.text().trim();
        // Remove markdown
        text = text.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '');
        return text;
    } catch (error) {
        console.error("Chat generation error:", error);
        // Fallback for safety
        return "지금은 대화가 조금 어렵네요. 잠시 후 다시 말씀해 주시겠어요?";
    }
};
