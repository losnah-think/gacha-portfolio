import { motion } from 'framer-motion';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { chatService } from '../services/chatService';
import { ArrowLeft, MessageCircle, Send, Sparkles, Star } from 'lucide-react';
import type { ChatSession, Persona, PersonaGroup } from '../../../shared/types';
import { getPersonaIcon } from '../../../shared/utils/personaHelper';
import { formatRelativeTime } from '../../../shared/utils/formatRelativeTime';
import { Card, EmptyState, Skeleton } from '../../../shared/components/ui';
import { cn } from '../../../shared/utils/cn';

interface AskViewProps {
  personas: Persona[];
  drawCount: number;
  rewardProfile: {
    adViewsDaily: number;
    adViewsTotal: number;
    consultCount: number;
    characterLevel: number;
    characterExp: number;
    expToNext: number;
  };
  personaRewardProfiles?: Record<string, {
    characterLevel: number;
    characterExp: number;
    expToNext: number;
  }>;
  onStartChat: (persona: Persona, query: string) => void;
  onResumeChat?: (session: ChatSession) => void;
  onBack?: () => void;
}

const readSavedSessions = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem('gacha_chat_sessions');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as ChatSession[] : [];
  } catch {
    return [];
  }
};

const getStylePreview = (persona: Persona) => {
  const base = persona.recommendation || persona.desc || '편하게 이야기해 주세요.';
  return base.split(/[.!?。]/)[0] || base;
};

export const AskView = ({
  personas,
  drawCount,
  rewardProfile,
  personaRewardProfiles,
  onStartChat,
  onResumeChat,
  onBack,
}: AskViewProps) => {
  const [query, setQuery] = useState('');
  const [chatPersonas, setChatPersonas] = useState<Persona[]>([]);
  const [personaGroups, setPersonaGroups] = useState<PersonaGroup[]>([]);
  const [isLoadingPersonas, setIsLoadingPersonas] = useState(true);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('');
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);
  const [savedSessions, setSavedSessions] = useState<ChatSession[]>([]);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const suggestionsCacheRef = useRef<Record<string, string[]>>({});

  const recommendedPersonas = chatPersonas.filter((p) => p.isRecommended);
  const defaultPersona = recommendedPersonas[0] || chatPersonas[0];
  const selectedPersona = chatPersonas.find((p) => p.id === selectedPersonaId) || defaultPersona;
  const selectedPersonaProfile = selectedPersonaId ? personaRewardProfiles?.[selectedPersonaId] : undefined;
  const isCoarsePointer = useMemo(() =>
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  []);

  const displayRewardProfile = selectedPersonaProfile
    ? {
      ...rewardProfile,
      characterLevel: selectedPersonaProfile.characterLevel,
      characterExp: selectedPersonaProfile.characterExp,
      expToNext: selectedPersonaProfile.expToNext,
    }
    : rewardProfile;

  let displayExp = displayRewardProfile.characterExp || 0;
  const displayExpToNext = Math.max(1, displayRewardProfile.expToNext || 100);

  if (displayExp >= displayExpToNext) {
    displayExp %= displayExpToNext;
  }

  const expPercent = Math.min(100, Math.round((displayExp / displayExpToNext) * 100));

  const counselingPersonas = useMemo(() => {
    const group = personaGroups.find((g) => g.category === 'counseling');
    if (group) return [...group.personas].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return chatPersonas;
  }, [personaGroups, chatPersonas]);

  const personaTagMap = useMemo(() => {
    const map = new Map<string, string[]>();
    personaGroups.forEach((group) => {
      group.personas.forEach((persona) => {
        const tags = [group.label, persona.category].filter(Boolean) as string[];
        map.set(persona.id, [...new Set(tags)].slice(0, 2));
      });
    });
    return map;
  }, [personaGroups]);

  const visibleSessions = showAllSessions ? savedSessions : savedSessions.slice(0, 3);

  useAppNavigationBar({ title: '고민 상담', showBack: Boolean(onBack), onBackPress: onBack });

  useEffect(() => {
    setSavedSessions(readSavedSessions());
  }, []);

  useEffect(() => {
    const fetchChatPersonas = async () => {
      try {
        setIsLoadingPersonas(true);
        const { groups, flat } = await chatService.getGroupedPersonas();

        if (flat.length > 0) {
          setChatPersonas(flat);
          setPersonaGroups(groups);
          const counseling = groups.find((g) => g.category === 'counseling');
          const counselingList = counseling ? counseling.personas : flat;
          const firstRec = counselingList.find((p) => p.isRecommended) || counselingList[0];
          if (firstRec) setSelectedPersonaId(firstRec.id);
        } else {
          setChatPersonas(personas);
          if (personas.length > 0) setSelectedPersonaId(personas[0].id);
        }
      } catch {
        setChatPersonas(personas);
        if (personas.length > 0) setSelectedPersonaId(personas[0].id);
      } finally {
        setIsLoadingPersonas(false);
      }
    };
    void fetchChatPersonas();
  }, [personas]);

  useEffect(() => {
    if (!selectedPersonaId) return;
    const cached = suggestionsCacheRef.current[selectedPersonaId];
    if (cached) {
      setSuggestedQuestions(cached);
      setIsFetchingSuggestions(false);
      return;
    }

    const fetchSuggestions = async () => {
      setIsFetchingSuggestions(true);
      const questions = await chatService.getSuggestedQuestions(selectedPersonaId);
      suggestionsCacheRef.current[selectedPersonaId] = questions;
      setSuggestedQuestions(questions);
      setIsFetchingSuggestions(false);
    };
    void fetchSuggestions();
  }, [selectedPersonaId]);

  const handleSubmit = () => {
    if (!query.trim() || !selectedPersona) return;
    if (drawCount <= 0) return;
    onStartChat(selectedPersona, query);
    setQuery('');
  };

  const getPersonaLevel = (pid: string) => personaRewardProfiles?.[pid]?.characterLevel ?? 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex min-h-[100dvh] flex-col bg-paper surface-reading"
    >
      <header className="px-1 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="홈으로 돌아가기"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-toss-gray-700 active:bg-toss-gray-50"
              >
                <ArrowLeft size={20} strokeWidth={2.5} />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="t-display text-toss-gray-900">고민 상담</h1>
              <p className="t-body text-toss-gray-500">어떤 고민이든 편하게 이야기하세요</p>
            </div>
          </div>
          <div className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-toss-gray-100 bg-paper px-3 shadow-soft">
            <Sparkles size={14} className="text-toss-blue" />
            <span className="t-caption font-bold text-toss-gray-500 tabular-nums">{drawCount}장</span>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-6 pb-24">
        {savedSessions.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="t-section text-toss-gray-900">이어서 이야기하기</h2>
              {savedSessions.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAllSessions((value) => !value)}
                  className="t-caption font-bold text-toss-blue"
                >
                  {showAllSessions ? '접기' : '전체 보기'}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {visibleSessions.map((session) => {
                const persona = chatPersonas.find((p) => p.id === session.personaId) || personas.find((p) => p.id === session.personaId);
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => onResumeChat?.(session)}
                    className="w-full rounded-lg border border-toss-gray-100 bg-paper p-4 text-left shadow-soft active:bg-toss-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-toss-gray-100 bg-toss-gray-50">
                        {getPersonaIcon(persona?.name || session.personaName || '', personas)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="t-body truncate font-bold text-toss-gray-900">{session.personaName || persona?.name || '상담가'}</p>
                          <span className="t-caption shrink-0 text-toss-gray-400">{formatRelativeTime(session.updatedAt || session.createdAt)}</span>
                        </div>
                        <p className="t-body mt-0.5 line-clamp-1 text-toss-gray-500">{session.preview}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {showAllSessions && savedSessions.length === 0 && (
          <EmptyState
            title="아직 나눈 이야기가 없어요"
            desc="첫 고민을 들려주면 여기서 이어볼 수 있어요."
            cta={{ label: '상담 시작하기', onClick: () => setShowAllSessions(false) }}
          />
        )}

        <section className="space-y-3">
          <h2 className="t-section text-toss-gray-900">상담가 고르기</h2>
          {isLoadingPersonas && chatPersonas.length === 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} card lines={2} />
              ))}
            </div>
          ) : counselingPersonas.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {counselingPersonas.map((persona) => {
                const isSelected = persona.id === selectedPersonaId;
                return (
                  <motion.button
                    key={persona.id}
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setSelectedPersonaId(persona.id)}
                    className={cn(
                      'relative flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-colors',
                      isSelected ? 'border-ink bg-toss-blue/5 shadow-hard-sm' : 'border-toss-gray-100 bg-paper shadow-soft',
                    )}
                  >
                    <div className="absolute right-1.5 top-1.5 flex flex-col items-end gap-1">
                      {persona.isNew && (
                        <span className="t-micro rounded-sm bg-danger px-1.5 py-0.5 font-bold text-white">NEW</span>
                      )}
                      {persona.isRecommended && (
                        <span className="flex items-center gap-0.5 rounded-sm border border-warning/20 bg-warning/10 px-1 py-0.5 text-warning">
                          <Star size={8} fill="currentColor" />
                        </span>
                      )}
                    </div>

                    <div className={cn(
                      'flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full',
                      isSelected ? 'border-2 border-toss-blue bg-toss-blue/10' : 'bg-toss-gray-50',
                    )}>
                      {getPersonaIcon(persona.name, chatPersonas)}
                    </div>

                    <p className={cn('t-caption line-clamp-2 text-center font-bold', isSelected ? 'text-toss-blue' : 'text-toss-gray-700')}>
                      {persona.name}
                    </p>
                  </motion.button>
                );
              })}
            </div>
          )}
        </section>

        {selectedPersona && (
          <section className="space-y-4">
            <Card surface="reading" className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-toss-gray-100 bg-toss-gray-50">
                  {getPersonaIcon(selectedPersona.name, chatPersonas)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <h2 className="t-title truncate text-toss-gray-900">{selectedPersona.name}</h2>
                    {selectedPersona.isNew && (
                      <span className="t-micro rounded-sm bg-danger px-1.5 py-0.5 font-bold text-white">NEW</span>
                    )}
                    {selectedPersona.isRecommended && (
                      <span className="t-micro flex items-center gap-0.5 rounded-sm border border-warning/20 bg-warning/10 px-1.5 py-0.5 font-bold text-warning">
                        <Star size={8} fill="currentColor" />추천
                      </span>
                    )}
                  </div>
                  <p className="t-body line-clamp-2 text-toss-gray-500">{selectedPersona.desc}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {personaTagMap.get(selectedPersona.id)?.map((tag) => (
                      <span key={tag} className="t-micro rounded-sm border border-toss-blue/10 bg-toss-blue/5 px-1.5 py-0.5 text-toss-blue">
                        #{tag}
                      </span>
                    ))}
                    <span className="t-micro rounded-sm border border-toss-gray-100 bg-toss-gray-50 px-1.5 py-0.5 text-toss-gray-500">
                      캐릭터 {getPersonaLevel(selectedPersona.id)}단계
                    </span>
                  </div>
                </div>
              </div>

              <p className="t-body mt-4 border-l-2 border-ink-soft pl-3 italic text-toss-gray-600">
                "{getStylePreview(selectedPersona)}"
              </p>

              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between">
                  <span className="t-caption font-bold text-toss-gray-400">경험치</span>
                  <span className="t-caption font-bold text-toss-blue">{displayExp} / {displayExpToNext} 경험</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-toss-gray-100">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${expPercent}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="h-full rounded-full bg-toss-blue"
                  />
                </div>
              </div>
            </Card>

            <Card surface="reading" className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <MessageCircle size={18} className="text-toss-blue" />
                <h3 className="t-section text-toss-gray-900">{selectedPersona.name}에게 이야기하기</h3>
              </div>

              <div className="mb-4 min-h-20">
                <div className="mb-2 flex items-center gap-1">
                  <Sparkles size={12} className="text-toss-blue" />
                  <span className="t-caption font-bold text-toss-gray-400">이런 이야기는 어떨까요?</span>
                </div>
                {isFetchingSuggestions ? (
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="skeleton-shimmer h-9 w-24 rounded-sm" />
                    ))}
                  </div>
                ) : suggestedQuestions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {suggestedQuestions.map((question, index) => (
                      <button
                        key={`suggest-${selectedPersonaId}-${index}`}
                        type="button"
                        onClick={() => setQuery(question)}
                        className="t-caption rounded-md border border-toss-gray-100 bg-toss-gray-50 px-3 py-2 text-toss-gray-600 transition-colors active:bg-toss-blue/5"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="t-caption text-toss-gray-400">직접 고민을 적어도 좋아요.</p>
                )}
              </div>

              <div className="relative">
                <textarea
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`${selectedPersona.name}에게 편하게 말을 건네보세요`}
                  className="h-28 w-full resize-none rounded-lg border-2 border-transparent bg-toss-gray-50 p-4 pr-16 text-[16px] font-medium text-toss-gray-900 transition-colors placeholder:text-toss-gray-300 focus:border-toss-blue focus:bg-paper focus:outline-none disabled:opacity-60"
                  maxLength={300}
                  onKeyDown={(event) => {
                    if (!isCoarsePointer && event.key === 'Enter' && !event.shiftKey) {
                      if ((event.nativeEvent as KeyboardEvent).isComposing) return;
                      event.preventDefault();
                      handleSubmit();
                    }
                  }}
                  disabled={drawCount <= 0}
                />
                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                  <span className="t-micro text-toss-gray-300">{query.length}/300</span>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!query.trim() || drawCount <= 0}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-toss-blue text-white transition-colors active:scale-95 disabled:bg-toss-gray-200 disabled:text-toss-gray-400"
                    aria-label="상담 시작하기"
                  >
                    <Send size={17} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              <p className="t-caption mt-3 text-center text-toss-gray-400">
                {drawCount > 0
                  ? `보내기를 누르면 ${selectedPersona.name}와의 대화가 시작돼요`
                  : '상담을 시작하려면 이용권이 필요해요'}
              </p>
            </Card>
          </section>
        )}
      </div>
    </motion.div>
  );
};
