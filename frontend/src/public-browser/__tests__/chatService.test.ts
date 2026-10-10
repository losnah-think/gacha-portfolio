import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules(); localStorage.clear();
  vi.stubEnv('VITE_PUBLIC_BROWSER', 'true');
  vi.stubEnv('VITE_BACKEND_API_URL', 'http://127.0.0.1:8787');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ resultType: 'SUCCESS', data: { message: '새로 작성한 조언입니다.' } }))));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('original chat service in public browser', () => {
  it('uses the same-origin original v2 and v3 API paths', async () => {
    const { apiUrl } = await import('../../shared/api/client');
    expect(apiUrl('/gacha')).toBe('/api/v2/gacha');
    expect(apiUrl('/chat/message', { version: 'v3' })).toBe('/api/v3/chat/message');
  });

  it('sends the chosen persona and at most eight prior messages without a Toss identity', async () => {
    const { chatService } = await import('../../features/ask/services/chatService');
    const history = Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content: `이전 이야기 ${index}` }));
    await chatService.sendMessage('', 'portfolio-chat', '현재 고민', 'test-request', {
      personaId: 'cat', history: [{ role: 'assistant', content: '시작 안내' }, ...history],
    });
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/v3/chat/message');
    const body = JSON.parse(String(options?.body));
    expect(body.personaId).toBe('cat'); expect(body.message).toBe('현재 고민');
    expect(body.history).toEqual(history.slice(-8)); expect(body.userKey).toBeUndefined();
  });

  it('reopens stored chat history locally without making a server history request', async () => {
    const { chatService } = await import('../../features/ask/services/chatService');
    const messages = [{ id: 'u1', role: 'user', content: '예전 고민', timestamp: 1 }, { id: 'a1', role: 'assistant', content: '예전 조언', timestamp: 2 }];
    localStorage.setItem('gacha_chat_sessions', JSON.stringify([{ id: 'portfolio-saved', messages }]));
    expect(await chatService.getChatHistory('', 'portfolio-saved')).toEqual({ messages });
    expect(await chatService.getChatHistory('', 'missing')).toEqual({ messages: [] });
    expect(fetch).not.toHaveBeenCalled();
  });
});
