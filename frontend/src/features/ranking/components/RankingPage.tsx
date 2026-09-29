import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpenCheck,
  CircleDollarSign,
  Crown,
  HelpCircle,
  MessageCircle,
  RotateCw,
  Search,
  Sparkles,
  Star,
  Ticket,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { Button, Card, ErrorState, Skeleton } from '../../../shared/components/ui';
import {
  fetchServiceRanking,
  type RankingPeriod,
  type RankingServiceKey,
  type ServiceRankingData,
} from '../services/rankingService';

interface RankingPageProps {
  userKey?: string;
  initialServiceKey?: RankingServiceKey;
  onBack: () => void;
  onNavigateToService?: (serviceKey: RankingServiceKey) => void;
}

interface ServiceOption {
  key: RankingServiceKey;
  label: string;
  shortLabel: string;
  metricLabel: string;
  description: string;
  Icon: LucideIcon;
  tone: string;
  iconClass: string;
}

const SERVICE_OPTIONS: ServiceOption[] = [
  {
    key: 'fortune_total',
    label: '오늘의 운세',
    shortLabel: '운세',
    metricLabel: '확인',
    description: '운세를 많이 확인한 순서',
    Icon: Sparkles,
    tone: 'bg-toss-blue/10 text-toss-blue border-toss-blue/20',
    iconClass: 'text-toss-blue',
  },
  {
    key: 'ask_chat',
    label: '고민 상담',
    shortLabel: '상담',
    metricLabel: '대화',
    description: '캐릭터와 많이 이야기한 순서',
    Icon: MessageCircle,
    tone: 'bg-toss-blue/10 text-toss-blue border-toss-blue/20',
    iconClass: 'text-toss-blue',
  },
  {
    key: 'reward_gacha',
    label: '행운 뽑기',
    shortLabel: '뽑기',
    metricLabel: '뽑기',
    description: '좋은 보상을 많이 뽑은 순서',
    Icon: Zap,
    tone: 'bg-warning/10 text-warning border-warning/20',
    iconClass: 'text-warning',
  },
  {
    key: 'scratch_lottery',
    label: '황금 복권',
    shortLabel: '복권',
    metricLabel: '복권',
    description: '복권으로 점수를 많이 얻은 순서',
    Icon: Ticket,
    tone: 'bg-warning/10 text-warning border-warning/20',
    iconClass: 'text-warning',
  },
  {
    key: 'reward_quiz',
    label: '문제 맞추기',
    shortLabel: '문제',
    metricLabel: '정답',
    description: '문제를 많이 맞힌 순서',
    Icon: HelpCircle,
    tone: 'bg-toss-blue/10 text-toss-blue border-toss-blue/20',
    iconClass: 'text-toss-blue',
  },
  {
    key: 'idiom_quiz',
    label: '사자성어',
    shortLabel: '성어',
    metricLabel: '정답',
    description: '뜻풀이를 많이 맞힌 순서',
    Icon: BookOpenCheck,
    tone: 'bg-warning/10 text-warning border-warning/20',
    iconClass: 'text-warning',
  },
  {
    key: 'crossword',
    label: '단어찾기',
    shortLabel: '단어',
    metricLabel: '단어',
    description: '숨은 단어를 많이 찾은 순서',
    Icon: Search,
    tone: 'bg-toss-blue/10 text-toss-blue border-toss-blue/20',
    iconClass: 'text-toss-blue',
  },
  {
    key: 'roulette',
    label: '오늘의 돌림판',
    shortLabel: '돌림',
    metricLabel: '점수',
    description: '돌림판 점수를 많이 얻은 순서',
    Icon: CircleDollarSign,
    tone: 'bg-toss-blue/10 text-toss-blue border-toss-blue/20',
    iconClass: 'text-toss-blue',
  },
  {
    key: 'lotto',
    label: '로또 번호',
    shortLabel: '로또',
    metricLabel: '저장',
    description: '행운 번호를 많이 저장한 순서',
    Icon: RotateCw,
    tone: 'bg-warning/10 text-warning border-warning/20',
    iconClass: 'text-warning',
  },
];

const PERIOD_OPTIONS: Array<{ key: RankingPeriod; label: string }> = [
  { key: 'daily', label: '오늘' },
  { key: 'weekly', label: '이번 주' },
  { key: 'monthly', label: '이번 달' },
];

const createEmptyRankingData = (serviceKey: RankingServiceKey, period: RankingPeriod): ServiceRankingData => ({
  serviceKey,
  period,
  entries: [],
  myRank: null,
  emptyState: {
    title: '아직 순위가 없어요',
    description: '첫 참여자가 되어보세요.',
  },
});

const formatScore = (score: number) => `${score.toLocaleString()}점`;

const formatUpdatedAt = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} 기준`;
};

const RankingSkeleton = () => (
  <div className="space-y-2.5">
    {Array.from({ length: 8 }).map((_, index) => (
      <Card key={index} surface="reading" className="flex min-h-[74px] items-center gap-3 px-3.5 py-3">
        <Skeleton className="h-12 w-12 rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
        <Skeleton className="h-5 w-16" />
      </Card>
    ))}
  </div>
);

export const RankingPage = ({
  userKey,
  initialServiceKey = 'fortune_total',
  onBack,
  onNavigateToService,
}: RankingPageProps) => {
  const [serviceKey, setServiceKey] = useState<RankingServiceKey>(initialServiceKey);
  const [period, setPeriod] = useState<RankingPeriod>('daily');
  const [rankingData, setRankingData] = useState<ServiceRankingData>(() =>
    createEmptyRankingData(initialServiceKey, 'daily')
  );
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useAppNavigationBar({ title: '랭킹', showBack: true, onBackPress: onBack });

  useEffect(() => {
    setServiceKey(initialServiceKey);
  }, [initialServiceKey]);

  const loadRanking = useCallback(async (cancelledRef?: { current: boolean }) => {
    setIsLoading(true);
    try {
      const data = await fetchServiceRanking({
        serviceKey,
        period,
        userKey,
        limit: 20,
      });
      if (cancelledRef?.current) return;
      setRankingData(data);
      setLoadError(null);
    } catch (error) {
      if (cancelledRef?.current) return;
      setRankingData(createEmptyRankingData(serviceKey, period));
      setLoadError(error instanceof Error ? error.message : '랭킹을 불러오지 못했어요');
    } finally {
      if (!cancelledRef?.current) setIsLoading(false);
    }
  }, [period, serviceKey, userKey]);

  useEffect(() => {
    const cancelledRef = { current: false };
    void loadRanking(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [loadRanking]);

  const selectedService = useMemo(
    () => SERVICE_OPTIONS.find((item) => item.key === serviceKey) || SERVICE_OPTIONS[0],
    [serviceKey]
  );
  const topEntries = rankingData.entries.slice(0, 3);
  const listEntries = rankingData.entries.slice(3, 20);
  const SelectedIcon = selectedService.Icon;
  const updatedAtLabel = formatUpdatedAt(rankingData.updatedAt);

  return (
    <motion.div
      key="ranking"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="arcade-screen -mx-5 -mt-10 min-h-[100dvh] px-5 pt-10 pb-10 text-left"
    >
      <header className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="홈으로 돌아가기"
          className="arcade-button flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-white text-toss-gray-700"
        >
          <ArrowLeft size={21} strokeWidth={2.6} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-black leading-tight text-toss-gray-500">서비스별 순위</p>
          <h1 className="text-[28px] font-black leading-tight text-toss-gray-900">랭킹</h1>
        </div>
      </header>

      <section className="arcade-panel-dark pixel-pulse-shadow relative mt-5 rounded-[18px] p-4">
        <div className="pixel-scanline pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative flex items-center gap-3">
          <div
            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-[12px] border-2 border-white/80 bg-white shadow-hard-sm ${selectedService.iconClass}`}
          >
            <SelectedIcon size={30} strokeWidth={2.7} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-black text-white/65">현재 순위</p>
            <h2 className="mt-1 text-[25px] font-black leading-tight">{selectedService.label}</h2>
            <p className="mt-1 text-[13px] font-bold leading-snug text-white/70">
              {updatedAtLabel ? `${selectedService.description} · ${updatedAtLabel}` : selectedService.description}
            </p>
          </div>
        </div>
        <div className="relative mt-4 grid grid-cols-3 gap-2">
          {topEntries.length > 0 ? (
            topEntries.map((entry) => (
              <div key={entry.userKey} className="rounded-[12px] border border-white/15 bg-white/8 px-3 py-3">
                <p className="text-[12px] font-black text-white/55">{entry.rank}위</p>
                <p className="mt-1 truncate text-[14px] font-black text-white">{entry.nickname}</p>
                <p className="mt-1 t-caption font-black text-warning">{formatScore(entry.score)}</p>
              </div>
            ))
          ) : (
            <div className="col-span-3 rounded-[12px] border border-white/15 bg-white/8 px-4 py-5 text-center">
              <p className="text-[14px] font-black text-white">{rankingData.emptyState?.title || '아직 순위가 없어요'}</p>
              <p className="mt-1 text-[12px] font-bold text-white/60">
                {loadError ? '잠시 후 다시 시도해 주세요.' : (rankingData.emptyState?.description || '첫 참여자가 되어보세요.')}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-5 space-y-3">
        <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
          {SERVICE_OPTIONS.map((service) => {
            const Icon = service.Icon;
            const isActive = service.key === serviceKey;
            return (
              <button
                key={service.key}
                type="button"
                onClick={() => setServiceKey(service.key)}
                aria-pressed={isActive}
                className={`pixel-press flex min-h-[50px] shrink-0 items-center gap-2 rounded-[12px] border-2 px-3.5 text-[14px] font-black shadow-[2px_2px_0_rgba(49,130,246,0.14)] ${
                  isActive ? 'border-toss-blue bg-toss-blue text-white' : `${service.tone} bg-white`
                }`}
              >
                <Icon size={17} strokeWidth={2.6} />
                {service.shortLabel}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {PERIOD_OPTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPeriod(item.key)}
              aria-pressed={period === item.key}
              className={`pixel-press min-h-[46px] rounded-[12px] border-2 text-[15px] font-black ${
                period === item.key
                  ? 'border-toss-blue bg-toss-blue text-white shadow-[3px_3px_0_rgba(49,130,246,0.22)]'
                  : 'border-blue-100 bg-white text-toss-gray-600 shadow-[2px_2px_0_rgba(49,130,246,0.1)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="arcade-section-title rounded-[12px] text-[18px] font-black text-toss-gray-900">상위 순위</h2>
        </div>

        {loadError ? (
          <ErrorState message="순위를 불러오지 못했어요" onRetry={() => void loadRanking()} />
        ) : isLoading && rankingData.entries.length === 0 ? (
          <RankingSkeleton />
        ) : rankingData.entries.length === 0 ? (
          <div className="arcade-panel relative rounded-[16px] bg-white px-5 py-8 text-center">
            <p className="text-[16px] font-black text-toss-gray-600">{rankingData.emptyState?.title || '지금 참여하면 1위가 될 수 있어요'}</p>
            <p className="mt-2 text-[13px] font-bold text-toss-gray-400">
              {rankingData.emptyState?.description || '첫 참여자가 되어보세요.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {[...topEntries, ...listEntries].map((entry) => {
              const isTop = entry.rank <= 3;
              return (
                <motion.div
                  key={entry.userKey}
                  layout
                  className={`arcade-button flex min-h-[74px] items-center gap-3 rounded-[14px] bg-white px-3.5 py-3 ${
                    entry.isMe ? 'ring-2 ring-toss-blue/30' : ''
                  }`}
                >
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] border-2 text-[16px] font-black ${
                    isTop ? 'border-warning/20 bg-warning/10 text-warning' : 'border-toss-gray-100 bg-toss-gray-50 text-toss-gray-500'
                  }`}>
                    {isTop ? <Crown size={20} fill="currentColor" /> : entry.rank}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[16px] font-black text-toss-gray-900">{entry.nickname}</p>
                      {entry.isMe && (
                        <span className="t-micro shrink-0 rounded-full bg-toss-blue/10 px-2 py-0.5 font-black text-toss-blue">
                          나
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[12px] font-bold text-toss-gray-400">
                      {entry.playCount ? `${entry.playCount}번 이용` : selectedService.metricLabel}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1 text-toss-gray-900">
                      <Star size={14} fill="currentColor" className="text-amber-400" />
                      <p className="text-[17px] font-black">{formatScore(entry.score)}</p>
                    </div>
                    {entry.bestScore !== undefined && (
                      <p className="mt-1 text-[11px] font-bold text-toss-gray-400">최고 {entry.bestScore}</p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      <Card surface="play" className="sticky bottom-3 z-10 mt-5 px-4 py-3 pb-safe-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="t-caption font-black text-toss-gray-500">내 순위</p>
            <p className="t-section truncate text-toss-gray-900">
              {rankingData.myRank
                ? `${rankingData.myRank.rank}위 · ${formatScore(rankingData.myRank.score)}`
                : '참여 전 · 0점'}
            </p>
          </div>
          <Button
            className="w-auto shrink-0 px-4"
            size="sm"
            onClick={() => onNavigateToService?.(serviceKey)}
            disabled={!onNavigateToService}
          >
            {rankingData.myRank ? `${selectedService.shortLabel} 한 판 더 하기` : '지금 참여하기'}
          </Button>
        </div>
      </Card>
    </motion.div>
  );
};
