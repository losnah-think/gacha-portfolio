import { motion } from 'framer-motion';
import { ArrowLeft, Send, Ticket } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { chatService } from '../services/chatService';
import type { ChatSession, ChatMessage, Persona } from '../../../shared/types';
import { getPersonaIcon } from '../../../shared/utils/personaHelper';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { useVisualViewportHeight } from '../../../shared/hooks/useVisualViewportHeight';
import { Button } from '../../../shared/components/ui';
import { ChatBubble } from './ChatBubble';
import { TypingIndicator } from './TypingIndicator';

interface ChatRoomViewProps {
  userKey: string;
  chatId: string | null;
  initialPersona: Persona;
  initialMessages?: ChatMessage[];
  personas: Persona[];
  drawCount: number;
  setDrawCount: (count: number) => void;
  onBack: () => void;
  onSaveChat: (session: ChatSession) => void;
  onRecharge?: () => void;
  openAlert: (config: { title: string; description: string }) => void;
  openConfirm: (config: {
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  }) => void;
}

const createMessageId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const firstUserContent = (messages: ChatMessage[], fallback: string) =>
  messages.find((message) => message.role === 'user')?.content || fallback;

const SystemLine = ({ action, children }: { action?: React.ReactNode; children: React.ReactNode }) => (
  <div className="flex items-center gap-3 text-center">
    <div className="h-px flex-1 bg-toss-gray-100" />
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="t-caption text-toss-gray-400">{children}</span>
      {action}
    </div>
    <div className="h-px flex-1 bg-toss-gray-100" />
  </div>
);

export const ChatRoomView = ({
  userKey,
  chatId: initialChatId,
  initialPersona,
  initialMessages = [],
  personas,
  drawCount,
  setDrawCount,
  onBack,
  onSaveChat,
  onRecharge,
  openAlert,
  openConfirm,
}: ChatRoomViewProps) => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [chatId, setChatId] = useState<string | null>(initialChatId);
  const [isLoading, setIsLoading] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [systemNotice, setSystemNotice] = useState<string | null>(null);
  const [userMessageCount, setUserMessageCount] = useState(() =>
    initialMessages.filter((msg) => msg.role === 'user').length,
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isStartingRef = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const viewportHeight = useVisualViewportHeight(() => scrollToBottom('auto'));

  const handleBack = useCallback(() => {
    if (messages.length > 0) {
      openConfirm({
        title: '대화를 마칠까요?',
        description: '지난 상담에서 언제든 이어볼 수 있어요.',
        confirmText: '나가기',
        cancelText: '계속하기',
        onConfirm: onBack,
      });
      return;
    }
    onBack();
  }, [messages.length, onBack, openConfirm]);

  useAppNavigationBar({
    title: initialPersona.name,
    showBack: true,
    onBackPress: handleBack,
  });

  useEffect(() => {
    scrollToBottom();
  }, [isLoading, messages, scrollToBottom]);

  const saveSession = useCallback((sessionId: string, nextMessages: ChatMessage[], fallbackTitle: string, preview: string) => {
    onSaveChat({
      id: sessionId,
      personaId: initialPersona.id,
      personaName: initialPersona.name,
      title: firstUserContent(nextMessages, fallbackTitle),
      preview,
      messages: nextMessages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }, [initialPersona.id, initialPersona.name, onSaveChat]);

  const handleFirstMessage = useCallback(async (content: string) => {
    setRetryMessage(null);
    setSystemNotice(null);
    setIsLoading(true);

    try {
      const startRes = await chatService.startChat(userKey, initialPersona.id);
      const currentChatId = startRes.chatId;
      setChatId(currentChatId);

      if (startRes.tickets !== undefined) {
        setDrawCount(startRes.tickets);
      }

      const aiGreeting: ChatMessage | null = startRes.message ? {
        id: createMessageId(),
        role: 'assistant',
        content: startRes.message,
        timestamp: Date.now(),
      } : null;

      const sentInitialMessages = initialMessages.map((message) =>
        message.role === 'user' ? { ...message, status: 'sent' as const } : message,
      );

      if (aiGreeting) {
        setMessages([aiGreeting, ...sentInitialMessages]);
      }

      const response = await chatService.sendMessage(userKey, currentChatId, content);

      if (response.tickets !== undefined) {
        setDrawCount(response.tickets);
      }

      const newAiMessage: ChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: response.message,
        timestamp: Date.now(),
      };

      const finalMessages = aiGreeting
        ? [aiGreeting, ...sentInitialMessages, newAiMessage]
        : [...sentInitialMessages, newAiMessage];

      setMessages(finalMessages);
      saveSession(currentChatId, finalMessages, content, response.message);
    } catch (error) {
      console.error('Initial chat error:', error);
      setUserMessageCount((prev) => Math.max(0, prev - 1));
      setRetryMessage(content);
      setSystemNotice('상담을 시작하지 못했어요. 이용권은 실패 응답 기준으로 보존돼요.');
      setMessages((prev) => prev.map((message) =>
        message.role === 'user' && message.content === content
          ? { ...message, status: 'failed' as const }
          : message,
      ));
    } finally {
      setIsLoading(false);
    }
  }, [initialMessages, initialPersona.id, saveSession, setDrawCount, userKey]);

  useEffect(() => {
    if (initialMessages.length === 1 && initialMessages[0].role === 'user' && !chatId && !isStartingRef.current) {
      isStartingRef.current = true;
      void handleFirstMessage(initialMessages[0].content);
    }
  }, [chatId, handleFirstMessage, initialMessages]);

  const handleSendMessage = useCallback(async (userMessageContent: string) => {
    if (!chatId) return;
    setRetryMessage(null);
    setSystemNotice(null);
    setQuery('');
    setIsLoading(true);
    setUserMessageCount((prev) => prev + 1);

    const newUserMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      content: userMessageContent,
      timestamp: Date.now(),
      status: 'sending',
    };

    const updatedUserMessages = [...messages, newUserMessage];
    setMessages(updatedUserMessages);

    try {
      const response = await chatService.sendMessage(userKey, chatId, userMessageContent);

      if (response.tickets !== undefined) {
        setDrawCount(response.tickets);
      }

      const sentUserMessages = updatedUserMessages.map((message) =>
        message.id === newUserMessage.id ? { ...message, status: 'sent' as const } : message,
      );

      const newAiMessage: ChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: response.message,
        timestamp: Date.now(),
      };

      const finalMessages = [...sentUserMessages, newAiMessage];
      setMessages(finalMessages);
      saveSession(chatId, finalMessages, userMessageContent, response.message);
    } catch (error) {
      console.error('Chat error:', error);
      setUserMessageCount((prev) => Math.max(0, prev - 1));
      setRetryMessage(userMessageContent);
      setSystemNotice('메시지를 보내지 못했어요.');
      setMessages((prev) => prev.map((message) =>
        message.id === newUserMessage.id ? { ...message, status: 'failed' as const } : message,
      ));
    } finally {
      setIsLoading(false);
    }
  }, [chatId, messages, saveSession, setDrawCount, userKey]);

  const needsTicketForNextMessage = userMessageCount > 0 && userMessageCount % 3 === 0;
  const remainingMessages = needsTicketForNextMessage ? 0 : 3 - (userMessageCount % 3);
  const usedDots = needsTicketForNextMessage ? 3 : userMessageCount % 3;
  const isLastFreeMessage = remainingMessages === 1;

  const handleSubmit = useCallback(() => {
    const trimmed = query.trim();
    if (!trimmed || isLoading || !chatId) return;

    if (needsTicketForNextMessage) {
      if (drawCount <= 0) {
        openAlert({
          title: '이용권 부족',
          description: '사용 가능한 이용권이 없어요. 홈에서 이용권을 받아주세요.',
        });
        onRecharge?.();
        return;
      }

      openConfirm({
        title: '이용권을 사용할까요?',
        description: '대화를 계속하려면 이용권 1장이 필요해요. 계속할까요?',
        confirmText: '계속하기',
        cancelText: '취소',
        onConfirm: () => {
          void handleSendMessage(trimmed);
        },
      });
      return;
    }

    void handleSendMessage(trimmed);
  }, [chatId, drawCount, handleSendMessage, isLoading, needsTicketForNextMessage, onRecharge, openAlert, openConfirm, query]);

  const handleRetry = useCallback((content: string) => {
    if (chatId) {
      void handleSendMessage(content);
    } else {
      void handleFirstMessage(content);
    }
  }, [chatId, handleFirstMessage, handleSendMessage]);

  const lockedForNoTicket = needsTicketForNextMessage && drawCount <= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-paper surface-reading"
      style={{ height: viewportHeight }}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-toss-gray-100 bg-paper/90 px-4 backdrop-blur">
        <button
          type="button"
          aria-label="상담 목록으로 돌아가기"
          onClick={handleBack}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-toss-gray-700 active:bg-toss-gray-50"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-toss-gray-100 bg-paper shadow-soft">
            {getPersonaIcon(initialPersona.name, personas)}
          </div>
          <div className="min-w-0">
            <h1 className="t-section truncate text-toss-gray-900">{initialPersona.name}</h1>
            <p className="t-caption text-toss-gray-500">상담 중</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRecharge}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-toss-gray-100 bg-paper px-3 text-toss-gray-700 shadow-soft active:bg-toss-gray-50"
        >
          <Ticket size={16} className="text-toss-blue" />
          <span className="t-body font-bold tabular-nums">{drawCount}</span>
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        <SystemLine>이용권 1장으로 3마디까지 이야기할 수 있어요</SystemLine>

        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const showAvatar = message.role === 'assistant' && previous?.role !== 'assistant';
          return (
            <ChatBubble
              key={message.id}
              message={message}
              persona={initialPersona}
              personas={personas}
              showAvatar={showAvatar}
              onRetry={handleRetry}
            />
          );
        })}

        {isLoading && <TypingIndicator persona={initialPersona} personas={personas} />}

        {retryMessage && !isLoading && (
          <SystemLine
            action={(
              <button
                type="button"
                onClick={() => handleRetry(retryMessage)}
                className="t-caption font-bold text-toss-blue"
              >
                다시 보내기
              </button>
            )}
          >
            {systemNotice || '메시지를 보내지 못했어요.'}
          </SystemLine>
        )}

        <div ref={messagesEndRef} className="h-4" />
      </div>

      <div className="shrink-0 border-t border-toss-gray-100 bg-paper px-4 py-3 pb-safe">
        <div className="mx-auto max-w-xl space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1" aria-label={`남은 대화 ${remainingMessages}`}>
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className={`h-2 w-2 rounded-full ${
                      dot < usedDots
                        ? 'bg-toss-gray-300'
                        : isLastFreeMessage
                        ? 'bg-warning'
                        : 'bg-toss-blue'
                    }`}
                  />
                ))}
              </div>
              <span className={`t-caption font-bold ${isLastFreeMessage ? 'text-warning' : 'text-toss-gray-500'}`}>
                남은 대화 {remainingMessages}
              </span>
            </div>
            {needsTicketForNextMessage && drawCount > 0 && (
              <span className="t-caption font-bold text-toss-blue">다음 전송은 이용권 1장</span>
            )}
          </div>

          {lockedForNoTicket ? (
            <Button
              variant="primary"
              onClick={() => {
                openAlert({
                  title: '이용권이 필요해요',
                  description: '상담을 계속하려면 이용권 1장을 받아주세요.',
                });
                onRecharge?.();
              }}
            >
              <Ticket size={18} />
              이용권 받고 계속하기
            </Button>
          ) : (
            <div className="flex items-end gap-2">
              <textarea
                autoFocus
                rows={1}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    if ((event.nativeEvent as KeyboardEvent).isComposing) return;
                    event.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={`${initialPersona.name}에게 말하기`}
                className="min-h-11 flex-1 resize-none rounded-lg border border-transparent bg-toss-gray-50 px-4 py-3 text-[16px] font-medium text-toss-gray-900 shadow-inner transition-colors placeholder:text-toss-gray-300 focus:border-toss-blue focus:bg-paper focus:outline-none"
                maxLength={500}
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!query.trim() || isLoading || !chatId}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-toss-blue text-white shadow-soft transition-colors active:scale-95 disabled:bg-toss-gray-200 disabled:text-toss-gray-400"
                aria-label="메시지 보내기"
              >
                <Send size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
