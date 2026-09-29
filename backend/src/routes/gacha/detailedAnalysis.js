/**
 * POST /api/v2/gacha/detailed-analysis
 * 뽑기 결과 상세 AI 해석 API
 *
 * - 전면 광고 시청 후 호출 → AI가 뽑기 결과를 심층 분석
 * - Rate Limiting: 비로그인 1일 1회, 로그인 유저 1일 5회
 * - 캐싱: 동일 resultContent+persona 조합 24시간 캐시
 */
import express from 'express';
import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { API_KEY, PRIMARY_MODEL, callGeminiWithFallback } from '../../services/aiGeneratorBase.js';
import { checkAndClaimActivityReward } from '../../services/promotionService.js';
import { firestore, FieldValue } from '../../lib/firebaseAdmin.js';
import { getKstDateKey, getUserDocRef, logUserAction } from '../../utils/helpers.js';
import { logSystemEvent } from '../../utils/logger.js';

const router = express.Router();

// ── 상수 ────────────────────────────────────────────────
const RATE_LIMIT_ANON = 1;       // 비로그인: 1일 1회
const RATE_LIMIT_USER = 5;       // 로그인: 1일 5회
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

// ── 인메모리 캐시 (서버 재시작 시 초기화 — 충분) ─────────
const _analysisCache = new Map();   // key → { data, expiresAt }
const _rateLimitCache = new Map();  // "date:identifier" → count

/** resultContent + persona → deterministic cache key */
const makeCacheKey = (content, persona) =>
    crypto.createHash('sha256').update(`${content}||${persona || ''}`).digest('hex').slice(0, 24);

/** Rate-limit 체크 및 증가. 초과 시 true 반환 */
const isRateLimited = (identifier, isLoggedIn) => {
    pruneRateLimitCache();
    const today = getKstDateKey();
    const key = `${today}:${identifier}`;
    const current = _rateLimitCache.get(key) || 0;
    const limit = isLoggedIn ? RATE_LIMIT_USER : RATE_LIMIT_ANON;
    if (current >= limit) return true;
    _rateLimitCache.set(key, current + 1);
    return false;
};

/** 매일 자정 지난 rate-limit 엔트리 정리 */
const pruneRateLimitCache = () => {
    const today = getKstDateKey();
    for (const key of _rateLimitCache.keys()) {
        if (!key.startsWith(today)) _rateLimitCache.delete(key);
    }
};

// ── 프롬프트 생성 ──────────────────────────────────────
const buildAnalysisPrompt = ({ resultTitle, resultContent, persona, rarity, type, fortune }) => {
    const rarityLabel = {
        common: '일반', rare: '레어', epic: '에픽', platinum: '플래티넘', diamond: '다이아몬드'
    }[rarity] || '일반';

    const fortuneBlock = fortune ? `
[오늘의 운세 데이터]
- 종합 점수: ${fortune.score}점
- 설명: ${fortune.description || '없음'}
- 상세: 연애 ${fortune.details?.love ?? '?'}점, 건강 ${fortune.details?.health ?? '?'}점, 재물 ${fortune.details?.wealth ?? '?'}점
` : '';

    return {
        systemInstruction: `
당신은 '가차' 앱의 AI 해석 전문가입니다.

[규칙]
1. 사용자가 뽑기(가차)에서 받은 결과를 깊이 있게 해석합니다.
2. ${persona ? `'${persona}'의 어투와 성격을 반영하세요. (예: 공자→고전적·지혜로운, 타로→신비로운, 루시→다정한 언니)` : '따뜻하고 지혜로운 조언자의 어투로 작성하세요.'}
3. interpretation은 3문단으로: (1) 핵심 메시지 해석 (2) 현재 상황과 연결 (3) 앞으로의 방향
4. actionItems는 오늘 바로 실천할 수 있는 구체적 행동 3~5개
5. summary는 15자 내외의 핵심 한 줄
6. luckyTip은 시간대/색상/방위 등 구체적인 행운 팁
7. compatibility는 카드 등급(${rarityLabel})이 높을수록 더 상세하게
${fortuneBlock}

[카드 등급: ${rarityLabel}]
[결과 타입: ${type === 'fable' ? '동화' : '명언/조언'}]

[출력 형식: 반드시 아래 JSON만 출력]
{
    "summary": "15자 내외 핵심 요약",
    "interpretation": "3문단 해석 (\\n\\n으로 문단 구분)",
    "actionItems": ["실천1", "실천2", "실천3"],
    "luckyTip": "행운 팁 (운세 데이터 기반)",
    "compatibility": "궁합/상성 정보"
}
`.trim(),
        prompt: `[뽑기 결과 제목] ${resultTitle}\n[뽑기 결과 본문] ${resultContent}`
    };
};

// ── 메인 핸들러 ────────────────────────────────────────
router.post('/detailed-analysis', async (req, res) => {
    const startTime = Date.now();
    const { userKey, resultTitle, resultContent, persona, rarity, type, fortune } = req.body || {};

    // ── 1. 필수 필드 검증 ─────────────────────────────
    if (!resultContent) {
        return res.status(400).json({ resultType: 'ERROR', message: 'resultContent is required' });
    }
    if (!resultTitle) {
        return res.status(400).json({ resultType: 'ERROR', message: 'resultTitle is required' });
    }

    // ── 2. Rate Limiting ──────────────────────────────
    const identifier = userKey || req.ip || 'anon';
    const isLoggedIn = !!userKey;
    if (isRateLimited(identifier, isLoggedIn)) {
        return res.status(429).json({
            resultType: 'ERROR',
            message: '일일 해석 한도를 초과했어요',
            code: 'ANALYSIS_LIMIT_EXCEEDED'
        });
    }

    // ── 3. 캐시 확인 ─────────────────────────────────
    const cacheKey = makeCacheKey(resultContent, persona);
    const cached = _analysisCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        // 캐시 히트 → AI 호출 스킵
        void logSystemEvent('DETAILED_ANALYSIS', 'CACHE_HIT', {
            userKey, cacheKey, latencyMs: Date.now() - startTime
        });
        return res.json({ resultType: 'SUCCESS', data: cached.data });
    }

    // ── 4. AI 해석 생성 ──────────────────────────────
    try {
        if (!API_KEY) throw new Error('GEMINI_API_KEY is not set.');

        const { systemInstruction, prompt } = buildAnalysisPrompt({
            resultTitle, resultContent, persona, rarity, type, fortune
        });

        const genAI = new GoogleGenerativeAI(API_KEY);
        const modelOptions = {
            systemInstruction,
            generationConfig: { responseMimeType: 'application/json', temperature: 0.9 }
        };

        const result = await callGeminiWithFallback(genAI, modelOptions, prompt);
        const response = await result.response;
        let text = response.text().trim();

        // JSON 파싱 (코드블럭 래핑 대응)
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) text = jsonMatch[0];

        const parsed = JSON.parse(text);

        // ── 5. 필수 필드 보장 ────────────────────────
        const analysisData = {
            summary: parsed.summary || '당신만을 위한 메시지',
            interpretation: parsed.interpretation || '결과를 해석하는 중 오류가 발생했지만, 오늘의 운세는 긍정적입니다.',
            actionItems: Array.isArray(parsed.actionItems) && parsed.actionItems.length > 0
                ? parsed.actionItems.slice(0, 5)
                : ['오늘 하루를 감사하는 마음으로 시작해보세요', '가까운 사람에게 안부를 전해보세요', '5분간 조용히 자신과 대화해보세요'],
            ...(parsed.luckyTip && { luckyTip: parsed.luckyTip }),
            ...(parsed.compatibility && { compatibility: parsed.compatibility }),
        };

        // ── 6. 캐시 저장 ────────────────────────────
        _analysisCache.set(cacheKey, {
            data: analysisData,
            expiresAt: Date.now() + CACHE_TTL_MS
        });

        // 오래된 캐시 정리 (500개 초과 시 가장 오래된 것부터)
        if (_analysisCache.size > 500) {
            const oldest = _analysisCache.keys().next().value;
            _analysisCache.delete(oldest);
        }

        // ── 7. 로깅 ────────────────────────────────
        const latencyMs = Date.now() - startTime;
        void logSystemEvent('DETAILED_ANALYSIS', 'SUCCESS', {
            userKey, persona, rarity, type, cacheKey, latencyMs
        });
        if (userKey) {
            void logUserAction(userKey, 'DETAILED_ANALYSIS_VIEWED', {
                persona, rarity, type, cacheKey, latencyMs
            }).catch(() => {});
        }

        // ── 8. 더 자세한 운세 보기 프로모션 (FORTUNE_DETAIL_VIEW) ──
        let fortuneDetailReward = null;
        if (userKey) {
            fortuneDetailReward = await checkAndClaimActivityReward(userKey, 'FORTUNE_DETAIL_VIEW', 1).catch(() => null);
        }

        return res.json({
            resultType: 'SUCCESS',
            data: analysisData,
            ...(fortuneDetailReward && !fortuneDetailReward.alreadyClaimed && { activityPromotion: fortuneDetailReward })
        });

    } catch (error) {
        console.error('[DetailedAnalysis] AI generation failed:', error.message);
        void logSystemEvent('DETAILED_ANALYSIS', 'FAIL', {
            userKey, error: error.message, latencyMs: Date.now() - startTime
        });
        return res.status(500).json({
            resultType: 'ERROR',
            message: '해석 생성에 실패했습니다'
        });
    }
});

export default router;
