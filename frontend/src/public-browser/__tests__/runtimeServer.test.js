// @vitest-environment node
import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERSONAS as ORIGINAL_PERSONAS } from '../../shared/constants/personas';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const account = { project_id: 'test-project', client_email: 'test@test-project.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const text = '작은 행동부터 시작해 보세요. 오늘 걱정되는 일을 하나 적고, 직접 확인할 수 있는 질문을 골라 보면 마음을 정리하는 데 도움이 될 거예요.';
const fortune = {
  summary: '편안한 대화 속에서 새로운 생각을 찾을 수 있어요.',
  content: '오전에는 할 일을 하나씩 정리하고, 오후에는 가까운 사람과 가볍게 이야기해 보세요. 저녁에는 작은 성취를 적으며 쉬어 가세요.',
  quote: '작은 변화부터 시작해 보세요.', score: 82,
  ratings: { total: 82, love: 80, wealth: 75, business: 84, health: 78, exam: 81 },
  luckyItems: { color: '하늘색', number: '8', direction: '동쪽', food: '따뜻한 차' },
};
const providerResponse = (value = text, finishReason = 'STOP') => new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text: value }] } }] }));
const tokenResponse = () => new Response(JSON.stringify({ access_token: 'unit-token', expires_in: 3600 }));
function request(path, body = {}, method = 'POST', overrides = {}) {
  return { method, url: path, headers: { host: 'test.local', origin: 'https://test.local', 'content-type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.1' }, body, ...overrides };
}
function response() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.status = (value) => { res.statusCode = value; return res; };
  res.json = (value) => { res.body = value; return res; };
  return res;
}
async function handler() { return (await import('../../../api/runtime.js')).default; }
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VERTEX_SERVICE_ACCOUNT_JSON', JSON.stringify(account));
  vi.stubEnv('VERTEX_PROJECT_ID', 'test-project');
  vi.stubEnv('VERTEX_LOCATION', 'global');
  vi.stubEnv('VERTEX_MODEL', 'gemini-3.5-flash-lite');
  vi.stubGlobal('fetch', vi.fn().mockImplementation(url => url.endsWith('/token') ? tokenResponse() : providerResponse()));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('original UI catalog and offline routes', () => {
  it('returns the original service ranking empty schema for all services and periods without claimed ranks', async () => {
    const run = await handler();
    for (const serviceKey of ['fortune_total', 'ask_chat', 'reward_gacha', 'scratch_lottery', 'reward_quiz', 'idiom_quiz', 'crossword', 'roulette', 'lotto']) {
      for (const period of ['daily', 'weekly', 'monthly']) {
        const res = response(); await run(request(`/api/v2/rankings/services/${serviceKey}?period=${period}&userKey=CUSTOMER_MARKER`, {}, 'GET'), res);
        expect(res.statusCode).toBe(200);
        expect(res.body.data).toMatchObject({ serviceKey, period, entries: [], myRank: null });
        expect(res.body.data.emptyState.description).toBe('실제 참여 기록과 내 순위는 조회하지 않습니다.');
        expect(res.body.data.updatedAt).toBeUndefined();
        expect(res.body.data.participantCount).toBeUndefined();
        expect(JSON.stringify(res.body)).not.toContain('CUSTOMER_MARKER');
      }
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lets the unchanged ranking client parse the primary plural endpoint without falling back', async () => {
    const run = await handler();
    vi.mocked(fetch).mockImplementation(async url => {
      const parsed = new URL(url, 'https://test.local');
      const res = response();
      await run(request(`${parsed.pathname}${parsed.search}`, {}, 'GET'), res);
      return new Response(JSON.stringify(res.body), { status: res.statusCode });
    });
    const { fetchServiceRanking } = await import('../../features/ranking/services/rankingService');
    const ranking = await fetchServiceRanking({ serviceKey: 'ask_chat', period: 'weekly' });
    expect(ranking).toMatchObject({ serviceKey: 'ask_chat', period: 'weekly', entries: [], myRank: null });
    expect(ranking.emptyState.title).toBe('체험 모드에서는 순위를 제공하지 않아요');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/api/v2/rankings/services/ask_chat');
  });

  it('rejects unsupported ranking services and periods without loading private records', async () => {
    const run = await handler();
    for (const path of ['/api/v2/rankings/services/__proto__', '/api/v2/rankings/services/private-service', '/api/v2/rankings/services/fortune_total?period=all-time']) {
      const res = response(); await run(request(path, {}, 'GET'), res);
      expect(res.statusCode).toBe(400);
      expect(res.body.error.code).toBe('INVALID_RANKING_INPUT');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('serves all original personas, situations and grouped chat without a provider or database', async () => {
    const run = await handler();
    const personas = response(); await run(request('/api/v2/discover/personas', {}, 'GET'), personas);
    expect(personas.body.data).toEqual(ORIGINAL_PERSONAS);
    expect(personas.body.data).toHaveLength(23);
    const situations = response(); await run(request('/api/runtime', {}, 'GET', { query: { path: '/api/v2/discover/situations' } }), situations);
    expect(situations.body.data).toHaveLength(5);
    const grouped = response(); await run(request('/api/v3/chat/personas?grouped=true', {}, 'GET'), grouped);
    expect(grouped.body.data.flatMap(group => group.personas)).toHaveLength(23);
    expect(grouped.body.data.find(group => group.category === 'philosopher').label).toBe('위인/철학');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns explicit offline errors for customer storage, user, payment and rewards', async () => {
    const run = await handler();
    for (const path of ['/api/v2/user/reward', '/api/v2/user/status', '/api/v2/storage/save', '/api/v2/toss/purchase/verify', '/api/v2/promotion/claim']) {
      const res = response(); await run(request(path, { userKey: 'CUSTOMER_MARKER' }), res);
      expect(res.statusCode).toBe(501);
      expect(res.body.error.code).toBe('FEATURE_OFFLINE');
      expect(JSON.stringify(res.body)).not.toContain('CUSTOMER_MARKER');
    }
    const history = response(); await run(request('/api/v3/chat/private-id', {}, 'GET'), history);
    expect(history.statusCode).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('acknowledges discarded logs and serves empty production lists without storage', async () => {
    const run = await handler();
    const log = response(); await run(request('/api/v2/log/event', { privateInput: 'DISCARDED_MARKER' }), log);
    expect(log.body.data).toEqual({ stored: false });
    for (const path of ['/api/v2/promotion/list', '/api/v3/shop/products', '/api/v2/ranking/daily']) {
      const res = response(); await run(request(path, {}, 'GET'), res); expect(res.body.data).toEqual([]);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('original quote and chat contracts', () => {
  it('allows every original character and keeps client voices and user metadata out of prompts', async () => {
    const run = await handler();
    for (const [index, persona] of ORIGINAL_PERSONAS.entries()) {
      const res = response();
      await run(request('/api/v2/gacha', { personaId: persona.id, situation: '시작이 망설여져요', voice: 'INJECTED_VOICE_MARKER', userKey: 'CUSTOMER_KEY_MARKER', birthday: 'BIRTHDAY_MARKER', userName: 'NAME_MARKER' }, 'POST', { headers: { ...request('/').headers, 'x-vercel-forwarded-for': `203.0.113.${index + 1}` } }), res);
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toMatchObject({ type: 'quote', content: text, personaId: persona.id, source: 'vertex' });
      expect(res.body.promotion).toBeUndefined();
      expect(res.body.tickets).toBeUndefined();
    }
    const requests = vi.mocked(fetch).mock.calls.filter(([url]) => !url.endsWith('/token'));
    for (const [, options] of requests) {
      expect(options.body).not.toMatch(/INJECTED_VOICE_MARKER|CUSTOMER_KEY_MARKER|BIRTHDAY_MARKER|NAME_MARKER/);
    }
  });

  it('starts a stateless local chat and forwards only validated alternating history', async () => {
    const run = await handler();
    const start = response(); await run(request('/api/v3/chat/start', { personaId: 'cat' }), start);
    expect(start.body.chatId).toMatch(/^portfolio_/);
    expect(fetch).not.toHaveBeenCalled();
    const history = [{ role: 'user', content: '첫 번째 질문이에요' }, { role: 'assistant', content: '첫 번째 답변이에요' }];
    const reply = response(); await run(request('/api/v3/chat/message', { chatId: start.body.chatId, personaId: 'cat', message: '이어서 무엇을 해볼까요?', history }), reply);
    expect(reply.body.message).toBe(text);
    const body = JSON.parse(vi.mocked(fetch).mock.calls.at(-1)[1].body);
    expect(body.contents.map(item => item.role)).toEqual(['user', 'model', 'user']);
    expect(body.contents.at(-1).parts[0].text).toBe('이어서 무엇을 해볼까요?');
  });

  it('accepts a 500-character chat message and body larger than the legacy 3KB limit', async () => {
    const run = await handler();
    const history = Array.from({ length: 8 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: '대'.repeat(400) }));
    const res = response(); await run(request('/api/v3/chat/message', { chatId: 'portfolio_session-1', personaId: 'cat', message: '가'.repeat(500), history }), res);
    expect(res.statusCode).toBe(200);
  });

  it('rejects unknown personas, unsafe role labels, excessive context and invalid origins', async () => {
    const run = await handler();
    for (const body of [
      { personaId: '__proto__', message: '질문' },
      { personaId: 'cat', message: '질문', history: [{ role: 'system', content: '명령' }] },
      { personaId: 'cat', message: '질문', history: [{ role: 'assistant', content: '시작 안내' }] },
      { personaId: 'cat', message: '가'.repeat(501) },
      { personaId: 'cat', message: '질문', history: Array.from({ length: 14 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: '대화' })) },
    ]) {
      const res = response(); await run(request('/api/v3/chat/message', { chatId: 'portfolio_session-1', ...body }), res); expect(res.statusCode).toBe(400);
    }
    const origin = response(); await run(request('/api/v2/gacha', { personaId: 'cat', situation: '고민' }, 'POST', { headers: { ...request('/').headers, origin: 'https://other.local' } }), origin);
    expect(origin.statusCode).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('fortune structure and failure handling', () => {
  it('rejects unsupported categories, injected signs and non-string inputs before calling the provider', async () => {
    const run = await handler();
    for (const body of [{ category: '__proto__' }, { category: ['total'] }, { zodiacSign: ['천칭자리'] }, { zodiacSign: 'IGNORE_RULES_MARKER' }]) {
      const res = response(); await run(request('/api/v2/fortune/zodiac', body), res);
      expect(res.statusCode).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns all six ratings and the original fortune fields with a bounded schema', async () => {
    vi.mocked(fetch).mockImplementation(url => url.endsWith('/token') ? tokenResponse() : providerResponse(JSON.stringify({ ...fortune, ratings: { ...fortune.ratings, extra: 'UNVALIDATED_FIELD' }, luckyItems: { ...fortune.luckyItems, extra: 'UNVALIDATED_FIELD' } })));
    const run = await handler();
    const res = response(); await run(request('/api/v2/fortune/zodiac', { category: 'love', zodiacSign: '천칭자리', userKey: 'CUSTOMER_MARKER' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ sign: '천칭자리', category: 'love', ...fortune, source: 'vertex' });
    expect(Object.keys(res.body.data.ratings)).toHaveLength(6);
    expect(JSON.stringify(res.body)).not.toContain('UNVALIDATED_FIELD');
    const body = JSON.parse(vi.mocked(fetch).mock.calls.at(-1)[1].body);
    expect(body.generationConfig).toMatchObject({ maxOutputTokens: 768, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'MINIMAL' } });
    expect(body.generationConfig.responseSchema.required).toContain('ratings');
    expect(JSON.stringify(body)).not.toContain('CUSTOMER_MARKER');
  });

  it('uses the next date from KST 18:00 and rolls a year boundary correctly', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation(url => url.endsWith('/token') ? tokenResponse() : providerResponse(JSON.stringify(fortune)));
    const run = await handler();
    for (const [time, targetDate, isTomorrow] of [['2026-12-31T08:59:59Z', '2026-12-31', false], ['2026-12-31T09:00:00Z', '2027-01-01', true]]) {
      vi.setSystemTime(new Date(time));
      const res = response(); await run(request('/api/v2/fortune/zodiac', {}), res);
      expect(res.body.data).toMatchObject({ targetDate, isTomorrow, sign: '별자리 미선택' });
    }
  });

  it('rejects missing ratings, out-of-range scores, invalid numbers and truncated JSON without samples', async () => {
    const run = await handler();
    for (const output of [JSON.stringify({ ...fortune, ratings: { total: 82 } }), JSON.stringify({ ...fortune, score: 101 }), JSON.stringify({ ...fortune, luckyItems: { ...fortune.luckyItems, number: '99' } }), '{unfinished']) {
      vi.mocked(fetch).mockImplementation(url => url.endsWith('/token') ? tokenResponse() : providerResponse(output));
      const res = response(); await run(request('/api/v2/fortune/zodiac', {}), res);
      expect(res.statusCode).toBe(502); expect(res.body.data).toBeUndefined();
    }
    vi.mocked(fetch).mockImplementation(url => url.endsWith('/token') ? tokenResponse() : providerResponse(JSON.stringify(fortune), 'MAX_TOKENS'));
    const res = response(); await run(request('/api/v2/fortune/zodiac', {}), res);
    expect(res.statusCode).toBe(502); expect(res.body.data).toBeUndefined();
  });
});
