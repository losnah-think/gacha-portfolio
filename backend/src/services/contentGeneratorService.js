/**
 * [Content Generator Service]
 * 룰렛 코멘트 / 오늘의 부적 / 주문 생성기 — AI 콘텐츠 생성 + Firestore 캐싱
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { callGeminiWithFallback, API_KEY, PRIMARY_MODEL } from './aiGeneratorBase.js';
import { firestore, FieldValue } from '../lib/firebaseAdmin.js';
import { getKstDateKey, logUserAction } from '../utils/helpers.js';
import crypto from 'crypto';

// ─── 공통 유틸 ─────────────────────────────────────────────────────
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;
const modelOptions = { generationConfig: { responseMimeType: 'application/json' } };

/** deterministic seed → 0~1 float (userKey+date 조합으로 동일 결과 보장) */
const seedRandom = (seed) => {
  const hash = crypto.createHash('sha256').update(seed).digest();
  return hash.readUInt32BE(0) / 0xffffffff;
};

// ─── 1. 룰렛 포인트 스핀 ──────────────────────────────────────────
/**
 * 룰렛 확률표: 1P(50%) / 2P(40%) / 3P(9%) / 5P(0.8%) / 10P(0.2%)
 * 누적 확률 기반 O(n) 선택 — 항목 5개이므로 충분히 빠름
 */
const ROULETTE_TABLE = [
  { points: 1,  weight: 0.50 },
  { points: 2,  weight: 0.40 },
  { points: 3,  weight: 0.09 },
  { points: 5,  weight: 0.008 },
  { points: 10, weight: 0.002 },
];

export const spinRoulette = () => {
  const rand = Math.random();
  let cumulative = 0;
  for (const slot of ROULETTE_TABLE) {
    cumulative += slot.weight;
    if (rand < cumulative) {
      return { points: slot.points };
    }
  }
  // fallback (부동소수점 오차 대비)
  return { points: 1 };
};

// ─── 2. 룰렛 코멘트 (AI) ─────────────────────────────────────────
const ROULETTE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const _rouletteCache = new Map(); // key → { comment, cachedAt }

export const generateRouletteComment = async (userKey, result, category) => {
  // 동일 result에 대해 인메모리 캐시 (LLM 비용 절감)
  const cacheKey = `${result}_${category || ''}`;
  const cached = _rouletteCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < ROULETTE_CACHE_TTL_MS) {
    return cached.comment;
  }

  if (!genAI) throw new Error('AI_SERVICE_UNAVAILABLE');

  const prompt = `당신은 재미있고 위트 있는 AI 코멘테이터입니다.
룰렛 뽑기 결과에 대해 짧고 재미있는 한마디를 해주세요.
${category ? `카테고리: ${category}` : ''}
뽑힌 항목: "${result}"

반드시 아래 JSON 형식으로만 답하세요:
{"comment": "1~2문장의 재미있는 한마디"}`;

  const apiResult = await callGeminiWithFallback(genAI, modelOptions, prompt);
  const text = apiResult.response.text();
  const parsed = JSON.parse(text);
  const comment = parsed.comment || '좋은 선택이에요!';

  _rouletteCache.set(cacheKey, { comment, cachedAt: Date.now() });

  // 100개 초과 시 오래된 항목 정리
  if (_rouletteCache.size > 100) {
    const oldest = [..._rouletteCache.entries()]
      .sort((a, b) => a[1].cachedAt - b[1].cachedAt)[0];
    if (oldest) _rouletteCache.delete(oldest[0]);
  }

  logUserAction(userKey, 'ROULETTE_SPIN', { result, category });

  return comment;
};

// ─── 3. 오늘의 부적 ───────────────────────────────────────────────

const TALISMAN_CATEGORIES = {
  ward: { name: '액운 차단', frameRange: [1, 2] },
  exam: { name: '합격 기원', frameRange: [3, 4] },
  love: { name: '사랑 성취', frameRange: [5, 6] },
  wealth: { name: '재물 운', frameRange: [7, 8] },
  health: { name: '건강 수호', frameRange: [9, 10] },
};

export const generateTalisman = async (userKey, category, date) => {
  const validCategory = TALISMAN_CATEGORIES[category];
  if (!validCategory) throw new Error('INVALID_CATEGORY');

  const dateKey = date || getKstDateKey();
  const docId = `${userKey}_${dateKey}_${category}`;
  const docRef = firestore.collection('talisman_results').doc(docId);

  // Firestore 캐시 확인
  const existing = await docRef.get();
  if (existing.exists) {
    return existing.data();
  }

  if (!genAI) throw new Error('AI_SERVICE_UNAVAILABLE');

  // deterministic frameId
  const seed = seedRandom(`${userKey}${dateKey}${category}`);
  const [minFrame, maxFrame] = validCategory.frameRange;
  const frameId = minFrame + Math.floor(seed * (maxFrame - minFrame + 1));

  const prompt = `당신은 한국 전통 부적을 만드는 도사입니다.
카테고리: ${validCategory.name}
오늘 날짜: ${dateKey}

이 카테고리에 맞는 부적 텍스트를 생성하세요.
- title: 부적 이름 (4~8자, 한자풍 느낌. 예: "만사형통부", "연애대길부")
- lines: 주문 텍스트 2~4줄 (각 줄 최대 15자, 신비롭고 힘 있는 문장)

반드시 아래 JSON 형식으로만 답하세요:
{"title": "부적이름", "lines": ["첫째 줄", "둘째 줄", "셋째 줄"]}`;

  const apiResult = await callGeminiWithFallback(genAI, modelOptions, prompt);
  const text = apiResult.response.text();
  const parsed = JSON.parse(text);

  const result = {
    title: parsed.title || `${validCategory.name}부`,
    lines: Array.isArray(parsed.lines) ? parsed.lines.slice(0, 4) : ['행운이 깃들기를'],
    frameId,
    category,
    date: dateKey,
    createdAt: FieldValue.serverTimestamp(),
  };

  // Firestore에 캐싱 저장
  await docRef.set(result);

  logUserAction(userKey, 'TALISMAN_GENERATE', { category, date: dateKey });

  return { title: result.title, lines: result.lines, frameId: result.frameId };
};

// ─── 4. 오늘의 주문 ───────────────────────────────────────────────

export const generateSpell = async (userKey, { gender, birthday, ageGroup } = {}) => {
  const dateKey = getKstDateKey();
  const docId = `${userKey}_${dateKey}`;
  const docRef = firestore.collection('spell_results').doc(docId);

  // Firestore 캐시 확인
  const existing = await docRef.get();
  if (existing.exists) {
    const data = existing.data();
    return {
      spell: data.spell,
      description: data.description,
      expiresAt: data.expiresAt,
    };
  }

  if (!genAI) throw new Error('AI_SERVICE_UNAVAILABLE');

  // 오전 6시 만료 계산
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);
  const tomorrow6am = new Date(kstNow);
  tomorrow6am.setDate(tomorrow6am.getDate() + 1);
  tomorrow6am.setHours(6, 0, 0, 0);
  const expiresAt = tomorrow6am.getTime() - kstOffset;

  const userContext = [];
  if (gender) userContext.push(`성별: ${gender}`);
  if (birthday) userContext.push(`생년월일: ${birthday}`);
  if (ageGroup) userContext.push(`연령대: ${ageGroup}대`);

  const prompt = `당신은 신비로운 마법사입니다. 오늘 날짜(${dateKey})에 맞는 "나만의 마법 주문"을 만들어주세요.
${userContext.length > 0 ? `사용자 정보: ${userContext.join(', ')}` : ''}

규칙:
- spell: 마법 주문 본문 2~3줄 (각 줄 15~25자). 신비롭고, 외우고 싶은 느낌. 한국어와 판타지 언어 혼합 가능
- description: 오늘 이 주문이 왜 당신에게 맞는지 1~2문장 설명

반드시 아래 JSON 형식으로만 답하세요:
{"spell": "주문 본문\\n줄바꿈으로 구분", "description": "설명 1~2문장"}`;

  const apiResult = await callGeminiWithFallback(genAI, modelOptions, prompt);
  const text = apiResult.response.text();
  const parsed = JSON.parse(text);

  const result = {
    spell: parsed.spell || '아스트라 루멘, 빛이여 나를 이끌라',
    description: parsed.description || '오늘은 새로운 시작의 에너지가 가득한 날입니다.',
    expiresAt,
    date: dateKey,
    createdAt: FieldValue.serverTimestamp(),
  };

  await docRef.set(result);

  logUserAction(userKey, 'SPELL_GENERATE', { date: dateKey });

  return {
    spell: result.spell,
    description: result.description,
    expiresAt: result.expiresAt,
  };
};
