// @vitest-environment node
import { generateKeyPairSync, verify } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const testAccount = {
  project_id: 'test-project', client_email: 'test@test-project.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
};
const tokenResponse = () => new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }));
const adviceResponse = (content = '새로운 일을 시작하기 전에 오늘 할 수 있는 작은 실험을 하나 골라 보세요. 좋아하는 일과 걱정되는 일을 적어 두고, 한 가지 경험으로 생각을 확인해 보세요.') => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: content }] } }] }));

function request(overrides = {}) {
  return {
    method: 'POST',
    headers: { host: 'test.local', origin: 'https://test.local', 'content-type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.1' },
    body: { personaId: 'cat', situation: '새로운 일을 시작하기가 망설여져요' },
    ...overrides,
  };
}
function response() {
  const res = { statusCode: 200, headers: {}, body: null };
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}
async function handler() { return (await import('../../../api/advice.js')).default; }

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VERTEX_SERVICE_ACCOUNT_JSON', JSON.stringify(testAccount));
  vi.stubEnv('VERTEX_PROJECT_ID', 'test-project');
  vi.stubEnv('VERTEX_LOCATION', 'global');
  vi.stubEnv('VERTEX_MODEL', 'gemini-3.5-flash-lite');
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url) => url.endsWith('/token') ? tokenResponse() : adviceResponse()));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('advice server boundary', () => {
  it('refuses other methods and cross-origin requests before calling a provider', async () => {
    const advice = await handler();
    const get = response();
    await advice(request({ method: 'GET' }), get);
    expect(get.statusCode).toBe(405);
    const crossOrigin = response();
    await advice(request({ headers: { ...request().headers, origin: 'https://other.local' } }), crossOrigin);
    expect(crossOrigin.statusCode).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects non-JSON, malformed, oversized and invalid input', async () => {
    const advice = await handler();
    for (const [req, status] of [
      [request({ headers: { ...request().headers, 'content-type': 'text/plain' } }), 415],
      [request({ body: '{bad-json' }), 400],
      [request({ body: { personaId: 'cat', situation: '가'.repeat(1200) } }), 413],
      [request({ body: { personaId: 'cat', situation: '가'.repeat(201) } }), 400],
      [request({ body: { personaId: 'cat', situation: '   ' } }), 400],
      [request({ body: { personaId: '__proto__', situation: '고민' } }), 400],
    ]) {
      const res = response();
      await advice(req, res);
      expect(res.statusCode).toBe(status);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed without server configuration and never exposes account values', async () => {
    vi.stubEnv('VERTEX_MODEL', '');
    const advice = await handler();
    const res = response();
    await advice(request(), res);
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain(testAccount.client_email);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Vertex generation', () => {
  it('signs an OAuth assertion, calls the global model and returns only validated advice', async () => {
    const advice = await handler();
    const res = response();
    await advice(request(), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.body.source).toBe('vertex');
    expect(res.body.model).toBe('gemini-3.5-flash-lite');
    const assertion = vi.mocked(fetch).mock.calls[0][1].body.get('assertion');
    const [header, payload, signature] = assertion.split('.');
    expect(JSON.parse(Buffer.from(payload, 'base64url')).aud).toBe('https://oauth2.googleapis.com/token');
    expect(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
    const [url, options] = vi.mocked(fetch).mock.calls[1];
    expect(url).toContain('/locations/global/publishers/google/models/gemini-3.5-flash-lite:generateContent');
    const body = JSON.parse(options.body);
    expect(body.generationConfig).toEqual({ maxOutputTokens: 768, thinkingConfig: { thinkingLevel: 'MINIMAL' } });
    expect(body.contents[0].parts[0].text).toBe(request().body.situation);
    expect(JSON.stringify(body)).not.toContain(testAccount.client_email);
    const second = response();
    await advice(request(), second);
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => url.endsWith('/token'))).toHaveLength(1);
  });

  it('does not return blocked, truncated, oversized, empty or non-Korean provider output', async () => {
    const advice = await handler();
    for (const output of [
      { candidates: [{ finishReason: 'SAFETY' }] },
      { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '미완성 조언' }] } }] },
      { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'English only' }] } }] },
      { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '가'.repeat(251) }] } }] },
      {},
    ]) {
      vi.mocked(fetch).mockImplementation((url) => url.endsWith('/token') ? tokenResponse() : new Response(JSON.stringify(output)));
      const res = response();
      await advice(request(), res);
      expect(res.statusCode).toBe(502);
      expect(res.body.content).toBeUndefined();
    }
  });

  it('returns safe errors for provider failure, quota and timeout without a fixture fallback', async () => {
    for (const [status, expected] of [[403, 502], [429, 429], [500, 502]]) {
      const advice = await handler();
      vi.mocked(fetch).mockImplementation((url) => url.endsWith('/token') ? tokenResponse() : new Response('sensitive provider diagnostics', { status }));
      const res = response();
      await advice(request(), res);
      expect(res.statusCode).toBe(expected);
      expect(JSON.stringify(res.body)).not.toContain('sensitive');
      expect(res.body.content).toBeUndefined();
    }
    const advice = await handler();
    vi.mocked(fetch).mockRejectedValue(Object.assign(new Error('private detail'), { name: 'TimeoutError' }));
    const res = response();
    await advice(request(), res);
    expect(res.statusCode).toBe(504);
    expect(JSON.stringify(res.body)).not.toContain('private detail');
  });
});

describe('bounded public compute', () => {
  it('limits one IP to ten accepted requests per instance hour', async () => {
    const started = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(started);
    const advice = await handler();
    for (let index = 0; index < 10; index++) {
      const res = response(); await advice(request(), res); expect(res.statusCode).toBe(200);
    }
    const res = response(); await advice(request(), res);
    expect(res.statusCode).toBe(429);
    expect(Number(res.headers['Retry-After'])).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalledTimes(11);
    vi.mocked(Date.now).mockReturnValue(started + 3_600_001);
    const nextWindow = response(); await advice(request(), nextWindow);
    expect(nextWindow.statusCode).toBe(200);
  });

  it('limits all IPs to one hundred accepted requests per instance hour', async () => {
    const advice = await handler();
    for (let index = 0; index < 100; index++) {
      const res = response();
      await advice(request({ headers: { ...request().headers, 'x-vercel-forwarded-for': `203.0.113.${index + 1}` } }), res);
      expect(res.statusCode).toBe(200);
    }
    const res = response(); await advice(request({ headers: { ...request().headers, 'x-vercel-forwarded-for': '203.0.113.200' } }), res);
    expect(res.statusCode).toBe(429);
  });

  it('admits at most four concurrent provider requests per instance', async () => {
    const advice = await handler();
    const tokenWaiters = [];
    vi.mocked(fetch).mockImplementation((url) => url.endsWith('/token') ? new Promise((resolve) => tokenWaiters.push(resolve)) : adviceResponse());
    const responses = Array.from({ length: 4 }, response);
    const pending = responses.map((res) => advice(request(), res));
    const fifth = response(); await advice(request(), fifth);
    expect(fifth.statusCode).toBe(429);
    tokenWaiters.forEach((resolve) => resolve(tokenResponse()));
    await Promise.all(pending);
    expect(responses.every((res) => res.statusCode === 200)).toBe(true);
  });
});
