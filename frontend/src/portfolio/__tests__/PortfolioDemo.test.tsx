import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PortfolioDemo } from '../PortfolioDemo';
import { requestAdvice, readAdviceHistory, ADVICE_STORAGE_KEY, type AdviceResult } from '../adviceData';

const generated: AdviceResult = {
  id: 'test-generated-advice', type: 'quote', source: 'vertex', model: 'test-model',
  title: '길고양이의 조언', summary: '진로와 적성이 고민될 때', situation: '진로와 적성이 고민될 때',
  personaName: '길고양이', content: '처음부터 정답을 찾아야 한다고 조급해하지 마라냥. 오늘 마음이 가는 일 하나를 적고, 작게 경험해 보는 것부터 시작하자냥.', timestamp: 123,
};
const providerResponse = () => new Response(JSON.stringify(generated), { status: 200 });

beforeEach(() => { localStorage.clear(); vi.stubGlobal('fetch', vi.fn().mockImplementation(providerResponse)); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function generateAdvice() {
  fireEvent.change(screen.getByLabelText('어떤 캐릭터의 조언을 받을까요?'), { target: { value: 'cat' } });
  fireEvent.click(screen.getByRole('button', { name: '진로와 적성이 고민될 때' }));
  fireEvent.click(screen.getByRole('button', { name: '내 조언 만들기' }));
  await screen.findByRole('heading', { name: generated.title });
}

describe('AI advice response and storage', () => {
  it('rejects blank, oversized and unknown-character input before sending it', async () => {
    await expect(requestAdvice('cat', '  ')).rejects.toThrow();
    await expect(requestAdvice('cat', '가'.repeat(201))).rejects.toThrow();
    await expect(requestAdvice('unknown', '고민')).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends only concern and allowlisted character to the same-origin API', async () => {
    expect(await requestAdvice('cat', '  진로와 적성이 고민될 때  ')).toEqual(generated);
    expect(fetch).toHaveBeenCalledWith('/api/advice', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ personaId: 'cat', situation: '진로와 적성이 고민될 때' }),
    }));
  });

  it('rejects empty, non-Korean, oversized or fixed-sample responses', async () => {
    for (const invalid of [{ ...generated, content: '' }, { ...generated, content: 'English only' }, { ...generated, content: '가'.repeat(251) }, { ...generated, source: undefined, sample: true }]) {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(invalid), { status: 200 }));
      await expect(requestAdvice('cat', '고민')).rejects.toThrow('완성된 조언');
    }
  });

  it('does not import old fixed examples and preserves unreadable current history', () => {
    localStorage.setItem('gacha_portfolio_examples_v1', JSON.stringify([{ sample: true }]));
    expect(readAdviceHistory()).toEqual([]);
    localStorage.setItem(ADVICE_STORAGE_KEY, '{broken');
    expect(readAdviceHistory).toThrow();
    expect(localStorage.getItem(ADVICE_STORAGE_KEY)).toBe('{broken');
    localStorage.setItem(ADVICE_STORAGE_KEY, JSON.stringify([{ ...generated, numbers: [1] }]));
    expect(readAdviceHistory()[0].numbers).toBeUndefined();
  });
});

describe('AI advice interaction', () => {
  it('shows empty history and validates whitespace-only input', async () => {
    render(<PortfolioDemo />);
    fireEvent.click(screen.getByRole('button', { name: '보관함', exact: true }));
    expect(screen.getByText(/저장한 조언이 없습니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '조언 만들기로 이동' }));
    const input = screen.getByLabelText('지금 어떤 고민이 있나요?');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);
    expect((await screen.findByRole('alert')).textContent).toContain('1~200자');
  });

  it('shows request loading and blocks duplicate submits until completion', async () => {
    let resolveRequest: (response: Response) => void = () => {};
    vi.mocked(fetch).mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    render(<PortfolioDemo />);
    fireEvent.click(screen.getByRole('button', { name: '진로와 적성이 고민될 때' }));
    fireEvent.click(screen.getByRole('button', { name: '내 조언 만들기' }));
    expect(screen.getByRole('status').textContent).toContain('조언을 작성');
    expect(screen.getByRole('button', { name: '조언 작성 중' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '보관함', exact: true }).hasAttribute('disabled')).toBe(true);
    resolveRequest(providerResponse());
    await screen.findByRole('heading', { name: generated.title });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows provider errors without creating a fallback answer or saved result', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'AI 연결을 준비 중입니다.' }), { status: 503 }));
    render(<PortfolioDemo />);
    fireEvent.click(screen.getByRole('button', { name: '진로와 적성이 고민될 때' }));
    fireEvent.click(screen.getByRole('button', { name: '내 조언 만들기' }));
    expect((await screen.findByRole('alert')).textContent).toContain('AI 연결을 준비');
    expect(screen.queryByRole('heading', { name: generated.title })).toBeNull();
    expect(readAdviceHistory()).toEqual([]);
  });

  it('completes result, reading size, save, reload, reopen and delete', async () => {
    const firstRender = render(<PortfolioDemo />);
    await generateAdvice();
    expect(screen.getByText(/Vertex AI가 작성한/)).toBeTruthy();
    fireEvent.change(screen.getByRole('slider'), { target: { value: '25' } });
    expect(screen.getByText('글자 크기: 25px')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '이 브라우저에 저장' }));
    expect(readAdviceHistory()).toHaveLength(1);
    firstRender.unmount();
    render(<PortfolioDemo />);
    fireEvent.click(screen.getByRole('button', { name: '보관함', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: `${generated.title} 다시 보기` }));
    expect(screen.getByRole('button', { name: '보관함에 저장됨' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '보관함', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: `${generated.title} 삭제` }));
    expect(readAdviceHistory()).toHaveLength(0);
  });

  it('reports failed storage writes without claiming the advice was saved', async () => {
    render(<PortfolioDemo />);
    await generateAdvice();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    fireEvent.click(screen.getByRole('button', { name: '이 브라우저에 저장' }));
    expect(screen.getByRole('status').textContent).toContain('저장하지 못했습니다');
    expect(localStorage.getItem(ADVICE_STORAGE_KEY)).toBeNull();
  });

  it('protects unreadable history until the user explicitly resets it', async () => {
    localStorage.setItem(ADVICE_STORAGE_KEY, '{broken');
    render(<PortfolioDemo />);
    expect(screen.getByRole('alert').textContent).toContain('읽지 못했습니다');
    await generateAdvice();
    expect(screen.getByRole('button', { name: '이 브라우저에 저장' }).hasAttribute('disabled')).toBe(true);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: '보관함 초기화' }));
    expect(localStorage.getItem(ADVICE_STORAGE_KEY)).toBe('{broken');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '보관함 초기화' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(localStorage.getItem(ADVICE_STORAGE_KEY)).toBeNull();
  });

  it('refuses an eleventh saved result without silently deleting prior results', async () => {
    const items = Array.from({ length: 10 }, (_, index) => ({ ...generated, id: `saved-${index}` }));
    localStorage.setItem(ADVICE_STORAGE_KEY, JSON.stringify(items));
    render(<PortfolioDemo />);
    await generateAdvice();
    fireEvent.click(screen.getByRole('button', { name: '이 브라우저에 저장' }));
    expect(screen.getByRole('status').textContent).toContain('최대 10개');
    expect(readAdviceHistory()).toEqual(items);
  });
});
