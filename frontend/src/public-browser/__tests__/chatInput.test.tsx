import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChatMessage, Persona } from '../../shared/types';

const chat = vi.hoisted(() => ({ getGroupedPersonas: vi.fn(), getSuggestedQuestions: vi.fn(), startChat: vi.fn(), sendMessage: vi.fn() }));
vi.mock('../../features/ask/services/chatService', () => ({ chatService: chat }));
vi.mock('../../hooks/useAppNavigationBar', () => ({ useAppNavigationBar: () => {} }));
vi.mock('../../shared/hooks/useVisualViewportHeight', () => ({ useVisualViewportHeight: () => '700px' }));
vi.mock('../../shared/utils/personaHelper', () => ({ getPersonaIcon: () => null }));

const persona: Persona = { id: 'cat', name: '길고양이', desc: '고양이의 조언', icon: '', isRecommended: true };
const rewardProfile = { adViewsDaily: 0, adViewsTotal: 0, consultCount: 0, characterLevel: 1, characterExp: 0, expToNext: 100 };

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); localStorage.clear();
  vi.stubEnv('VITE_PUBLIC_BROWSER', 'true');
  vi.stubGlobal('fetch', vi.fn());
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() });
  Element.prototype.scrollIntoView = vi.fn();
  chat.getGroupedPersonas.mockResolvedValue({ groups: [], flat: [persona] });
  chat.getSuggestedQuestions.mockResolvedValue([]);
  chat.startChat.mockResolvedValue({ chatId: 'portfolio-first', message: '' });
  chat.sendMessage.mockResolvedValue({ message: '고민에 맞춰 새로 작성한 조언입니다.' });
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('original public chat inputs', () => {
  it('lets the original AskView start a conversation with zero native tickets', async () => {
    const { AskView } = await import('../../features/ask/components/AskView');
    const onStartChat = vi.fn();
    render(<AskView personas={[persona]} drawCount={0} rewardProfile={rewardProfile} onStartChat={onStartChat} />);
    const input = await screen.findByPlaceholderText('길고양이에게 편하게 말을 건네보세요');
    expect(input.hasAttribute('disabled')).toBe(false);
    fireEvent.change(input, { target: { value: '지금 진로가 고민이에요' } });
    fireEvent.click(screen.getByRole('button', { name: '상담 시작하기' }));
    expect(onStartChat).toHaveBeenCalledWith(persona, '지금 진로가 고민이에요');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('continues the original reopened conversation past three user messages without native tickets', async () => {
    const { ChatRoomView } = await import('../../features/ask/components/ChatRoomView');
    const prior: ChatMessage[] = Array.from({ length: 6 }, (_, index) => ({ id: `old-${index}`, role: index % 2 ? 'assistant' : 'user', content: `지난 이야기 ${index}`, timestamp: index }));
    const save = vi.fn(); const openAlert = vi.fn();
    render(<ChatRoomView userKey="" chatId="portfolio-saved" initialPersona={persona} initialMessages={prior} personas={[persona]} drawCount={0} setDrawCount={vi.fn()} onBack={vi.fn()} onSaveChat={save} openAlert={openAlert} openConfirm={vi.fn()} />);
    expect(screen.getByText('지난 이야기 0')).toBeTruthy();
    const input = screen.getByPlaceholderText('길고양이에게 말하기');
    fireEvent.change(input, { target: { value: '이어서 이야기하고 싶어요' } });
    fireEvent.click(screen.getByRole('button', { name: '메시지 보내기' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(chat.sendMessage).toHaveBeenCalledWith('', 'portfolio-saved', '이어서 이야기하고 싶어요', undefined, { personaId: 'cat', history: prior });
    expect(chat.startChat).not.toHaveBeenCalled(); expect(openAlert).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends the first question once with its actual character and no duplicate history entry', async () => {
    const { ChatRoomView } = await import('../../features/ask/components/ChatRoomView');
    const initial: ChatMessage[] = [{ id: 'first-user', role: 'user', content: '첫 고민입니다', timestamp: 1 }];
    render(<ChatRoomView userKey="" chatId={null} initialPersona={persona} initialMessages={initial} personas={[persona]} drawCount={0} setDrawCount={vi.fn()} onBack={vi.fn()} onSaveChat={vi.fn()} openAlert={vi.fn()} openConfirm={vi.fn()} />);
    await waitFor(() => expect(chat.sendMessage).toHaveBeenCalled());
    expect(chat.sendMessage).toHaveBeenCalledWith('', 'portfolio-first', '첫 고민입니다', undefined, { personaId: 'cat', history: [] });
    expect(chat.startChat).toHaveBeenCalledTimes(1);
  });
});
