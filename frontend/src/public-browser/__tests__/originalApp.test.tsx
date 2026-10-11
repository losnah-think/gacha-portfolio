import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PERSONAS } from '../../shared/constants/personas';
import { DEFAULT_SITUATIONS } from '../../shared/constants/situations';

const fortune = {
  sign: '전체', summary: '오늘은 작은 일을 차근차근 확인해 보세요.', content: '할 일을 하나씩 정리하면 다음 행동을 고르기 편해질 거예요.', quote: '오늘 할 수 있는 작은 행동부터 시작해 보세요.',
  score: 80, ratings: { total: 80, love: 80, wealth: 80, business: 80, health: 80, exam: 80 },
  luckyItems: { color: '하늘색', number: '8', direction: '동쪽', food: '따뜻한 차' }, category: 'total',
};
const quote = { type: 'quote', title: '오늘 시작할 작은 행동', content: '지금 할 수 있는 일을 하나 골라 가볍게 시도해 보세요.', rarity: 'normal', score: 75, source: 'vertex' };
const success = (data: unknown) => new Response(JSON.stringify({ resultType: 'SUCCESS', data }), { status: 200 });

beforeEach(() => {
  vi.resetModules(); localStorage.clear(); sessionStorage.clear(); window.history.replaceState(null, '', '/');
  vi.stubEnv('VITE_PUBLIC_BROWSER', 'true'); vi.stubEnv('DEV', true);
  vi.stubEnv('VITE_BACKEND_API_URL', 'http://127.0.0.1:8787');
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.split('?')[0];
    if (path === '/api/v2/discover/personas' || path === '/api/v3/chat/personas') return success(PERSONAS);
    if (path === '/api/v2/discover/situations') return success(DEFAULT_SITUATIONS);
    if (path === '/api/v2/promotion/list' || path === '/api/v3/chat/suggested-questions') return success([]);
    if (path === '/api/v2/fortune/zodiac') return success(fortune);
    if (path === '/api/v2/gacha') return success(quote);
    if (path === '/api/v3/chat/start') return success({ chatId: 'portfolio-app-integration', message: '' });
    if (path === '/api/v3/chat/message') return success({ message: '오늘 직접 확인할 작은 질문 하나를 골라 보세요.' });
    if (path === '/api/v2/log/event' || path === '/api/log' || path === '/api/v2/interactions/cta') return success({ stored: false });
    throw new Error(`Unexpected API in original App test: ${path}`);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function mountOriginalApp() {
  const [{ default: App }, { ModalProvider }] = await Promise.all([import('../../App'), import('../../shared/components/ui/Modal')]);
  render(<ModalProvider><App /></ModalProvider>);
  await screen.findByRole('heading', { name: '반가워요, 오늘의 운세를 확인해 보세요' });
}

function assertNoPrivateCalls() {
  const urls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
  expect(urls.every((url) => url.startsWith('/api/'))).toBe(true);
  expect(urls.some((url) => /\/(toss|user|reward|storage|bootstrap)(?:\/|\?|$)/.test(url))).toBe(false);
  expect(vi.mocked(fetch).mock.calls.some(([, init]) => String(init?.body).includes('NATIVE_TOKEN_MARKER'))).toBe(false);
}

function requestBodies(path: string) {
  return vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === path).map(([, init]) => JSON.parse(String(init?.body)));
}

function assertFreeResultActions() {
  expect(screen.queryByRole('button', { name: /공유하고 이용권 받기/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /광고 보고 상세 해석 보기/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /다시 뽑기 · 이용권/ })).toBeNull();
}

describe('original App public browser integration', () => {
  it('mounts the original home and navigation without consuming a native session or customer backend', async () => {
    localStorage.setItem('toss_access_token', 'NATIVE_TOKEN_MARKER');
    localStorage.setItem('toss_refresh_token', 'NATIVE_REFRESH_MARKER');
    localStorage.setItem('toss_user_key', 'NATIVE_USER_MARKER');
    localStorage.setItem('toss_user_name', 'NATIVE_NAME_MARKER');
    const read = vi.spyOn(Storage.prototype, 'getItem');
    await mountOriginalApp();
    expect(screen.getByRole('tablist', { name: '주요 메뉴' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['홈', '랭킹', '보관함']);
    expect(screen.getByRole('button', { name: /오늘 운세 보기/ })).toBeTruthy();
    expect(screen.getByText('고민 물어보기')).toBeTruthy();
    expect(screen.getByText('포인트 놀이')).toBeTruthy();
    expect(screen.queryByText('NATIVE_NAME_MARKER')).toBeNull();
    expect(read.mock.calls.some(([key]) => key.startsWith('toss_'))).toBe(false);
    expect((await import('../../firebase')).db).toBeNull();
    expect((await import('../../firebase')).auth).toBeNull();
    assertNoPrivateCalls();
    fireEvent.click(screen.getByRole('button', { name: /오늘 운세 보기/ }));
    await screen.findByText(fortune.summary, {}, { timeout: 5000 });
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url) === '/api/v2/fortune/zodiac')).toBe(true);
    expect(screen.queryByText('로그인이 필요해요')).toBeNull();
    assertNoPrivateCalls();
  });

  it('keeps the original 23-character Ask grid and starts a real-request chat flow with zero native tickets', async () => {
    await mountOriginalApp();
    fireEvent.click(screen.getByRole('button', { name: /캐릭터 고르고 이야기하기/ }));
    await screen.findByRole('heading', { name: '고민 상담' });
    await waitFor(() => {
      const gridButtons = screen.getAllByRole('button').filter((button) => button.parentElement?.classList.contains('grid-cols-3'));
      expect(gridButtons).toHaveLength(23);
    });
    const input = screen.getByPlaceholderText('소크라테스에게 편하게 말을 건네보세요');
    expect(input.hasAttribute('disabled')).toBe(false);
    fireEvent.change(input, { target: { value: '새로운 일을 시작하기가 망설여져요' } });
    fireEvent.click(screen.getByRole('button', { name: '상담 시작하기' }));
    await screen.findByText('오늘 직접 확인할 작은 질문 하나를 골라 보세요.');
    const send = vi.mocked(fetch).mock.calls.find(([url]) => String(url) === '/api/v3/chat/message');
    const body = JSON.parse(String(send?.[1]?.body));
    expect(body.personaId).toBe('socrates'); expect(body.userKey).toBeUndefined();
    expect(body.history).toEqual([]);
    await waitFor(() => expect(JSON.parse(localStorage.getItem('gacha_chat_sessions') || '[]')).toHaveLength(1));
    assertNoPrivateCalls();
  });

  it('generates and retries an original fortune without charging or changing saved native tickets', async () => {
    localStorage.setItem('drawCount', '7');
    await mountOriginalApp();
    fireEvent.click(screen.getByRole('button', { name: /오늘 운세 보기/ }));
    await screen.findByText(fortune.summary, {}, { timeout: 5000 });
    expect(requestBodies('/api/v2/fortune/zodiac')).toHaveLength(1);
    expect(requestBodies('/api/v2/fortune/zodiac')[0].ticketCost).toBe(0);
    expect(localStorage.getItem('drawCount')).toBe('7');
    assertFreeResultActions();

    fireEvent.click(screen.getByRole('button', { name: '무료로 다시 뽑기' }));
    const dialog = await screen.findByRole('dialog', { name: '운세를 재생성할까요?' });
    expect(within(dialog).getByText('이용권 없이 새로운 운세를 만들어요.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '무료로 다시 뽑기' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('gacha_public_original_history_v1') || '[]')).toHaveLength(2));
    expect(requestBodies('/api/v2/fortune/zodiac').map((body) => body.ticketCost)).toEqual([0, 0]);
    expect(requestBodies('/api/v2/fortune/zodiac')[1].forceRegenerate).toBe(true);
    expect(localStorage.getItem('drawCount')).toBe('7');
    assertFreeResultActions();
    assertNoPrivateCalls();
  });

  it('generates and retries chosen-character advice without native tickets, ads or recharge prompts', async () => {
    localStorage.setItem('drawCount', '9');
    await mountOriginalApp();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '새로운 일을 시작하기가 망설여져요' } });
    fireEvent.click(screen.getByRole('button', { name: '고민 보내기' }));
    fireEvent.click(await screen.findByRole('button', { name: /단골 카페 사장님/ }));
    fireEvent.click(await screen.findByRole('button', { name: /웹에서 무료로 시작하기/ }));
    await screen.findByText(quote.content, {}, { timeout: 5000 });
    expect(requestBodies('/api/v2/gacha')).toHaveLength(1);
    expect(requestBodies('/api/v2/gacha')[0]).toMatchObject({ personaId: 'healing_단골_카페_사장님', ticketCost: 0 });
    expect(localStorage.getItem('drawCount')).toBe('9');
    assertFreeResultActions();

    fireEvent.click(screen.getByRole('button', { name: '무료로 다시 뽑기' }));
    const dialog = await screen.findByRole('dialog', { name: '다시 뽑기' });
    expect(within(dialog).getByText('이용권 없이 새로운 조언을 만들어요.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '무료로 다시 뽑기' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('gacha_public_original_history_v1') || '[]')).toHaveLength(2));
    expect(requestBodies('/api/v2/gacha').map((body) => body.ticketCost)).toEqual([0, 0]);
    expect(requestBodies('/api/v2/gacha')[1].personaId).toBe('healing_단골_카페_사장님');
    expect(localStorage.getItem('drawCount')).toBe('9');
    assertFreeResultActions();
    assertNoPrivateCalls();
  });
});
