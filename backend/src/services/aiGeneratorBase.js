
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logSystemEvent } from "../utils/logger.js";

export const API_KEY = process.env.GEMINI_API_KEY;
export const PRIMARY_MODEL = "gemini-2.5-flash-lite";
export const FALLBACK_MODEL = "gemini-2.5-flash-lite";

/**
 * GEMINI API 호출 - 모델 폴백 및 재시도 로직 포함 (Base)
 */
export const callGeminiWithFallback = async (genAI, modelOptions, prompt, maxRetries = 3) => {
    let currentModel = PRIMARY_MODEL;
    let lastError = null;
    const RETRY_DELAY = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let timeoutId = null;
        try {
            console.log(`[Gemini API] Attempt ${attempt}/${maxRetries} (Model: ${currentModel})`);

            const model = genAI.getGenerativeModel({
                ...modelOptions,
                model: currentModel
            });

            // Standard timeout logic
            const generatePromise = model.generateContent(prompt);
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), 20000);
            });

            const result = await Promise.race([generatePromise, timeoutPromise]);

            if (timeoutId) clearTimeout(timeoutId);
            return result;

        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);
            lastError = error;
            console.error(`[Gemini API] Failed (Attempt ${attempt}):`, error.message);

            const isRetryable = error.message?.includes('429') ||
                error.message?.includes('quota') ||
                error.message?.includes('TIMEOUT') ||
                error.message?.includes('500') ||
                error.message?.includes('503');

            if (!isRetryable || attempt >= maxRetries) {
                throw lastError;
            }

            const waitTime = RETRY_DELAY * attempt;
            await new Promise(r => setTimeout(r, waitTime));
        }
    }
    throw lastError || new Error('Google Gemini API Request Failed');
};

/**
 * 운세 가중치 관리 및 기본 데이터 생성
 */
export const getRandomBaseFortune = (fixedScore = null) => {
    const FORTUNE_TEMPLATES = {
        high: [
            "우주의 모든 행운이 당신에게 쏟아지는 날입니다.",
            "오래 기다려온 기회가 마침내 문을 두드립니다.",
            "오늘 당신의 직관은 신의 계시와 같습니다.",
            "노력 이상의 엄청난 성과가 따라오는 마법 같은 하루입니다.",
            "뜻밖의 귀인을 만나 막혔던 일이 눈녹듯 풀립니다.",
            "오늘은 당신이 걷는 모든 길이 황금빛으로 빛나는 날입니다.",
            "잠재되어 있던 행운의 포텐이 폭발하는 결정적인 하루가 될 것입니다."
        ],
        good: [
            "뿌린 대로 거두는 정직하고 보람찬 하루입니다.",
            "기분 좋은 훈풍이 불어와 하루 종일 미소짓게 하네요.",
            "주변 사람들에게 인정받고 사랑받는 따뜻한 하루입니다.",
            "작은 우연이 기분 좋은 인연으로 이어지는 날입니다.",
            "순조로운 흐름 속에 소소한 성취감을 맛보게 됩니다.",
            "어려웠던 문제가 실마리를 찾으며 긍정적인 방향으로 흘러갑니다."
        ],
        normal: [
            "무탈함이 곧 행복임을 깨닫는 고요한 하루입니다.",
            "따뜻한 차 한 잔처럼 마음이 놓이는 평온한 날이네요.",
            "잠시 멈춰 서서 숨을 고르기에 딱 좋은 날입니다.",
            "특별한 일은 없지만, 그렇기에 더없이 소중한 평범한 하루입니다.",
            "조급함을 버리고 흔들림 없는 당신만의 페이스를 유지해보세요.",
            "평소와 같이 묵묵히 나아가면 뜻밖의 안도감을 느낄 수 있습니다."
        ]
    };

    const rand = Math.random();
    let type = 'normal', minScore = 60, maxScore = 69, grade = 'NORMAL';

    if (rand > 0.995) { type = 'high'; minScore = 96; maxScore = 100; grade = 'DIAMOND'; }
    else if (rand > 0.95) { type = 'high'; minScore = 90; maxScore = 95; grade = 'PLATINUM'; }
    else if (rand > 0.85) { type = 'good'; minScore = 80; maxScore = 89; grade = 'GOLD'; }
    else if (rand > 0.50) { type = 'normal'; minScore = 70; maxScore = 79; grade = 'SILVER'; }

    const templates = FORTUNE_TEMPLATES[type];
    const text = templates[Math.floor(Math.random() * templates.length)];
    const score = fixedScore || (Math.floor(Math.random() * (maxScore - minScore + 1)) + minScore);

    return { text, score, grade };
};
