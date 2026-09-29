import { motion } from 'framer-motion';
import { memo, useCallback, useMemo, useState } from 'react';
import { Archive, Calendar, ChevronRight, Sparkles, User } from 'lucide-react';
import type { ResultHistoryItem, Persona } from '../../../shared/types';
import type { ActiveTab } from '../../../shared/types/navigation';
import { RARITY_CONFIG } from '../../../shared/constants/rarity';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { getPersonaIcon } from '../../../shared/utils/personaHelper';
import { cn } from '../../../shared/utils/cn';
import { Card, Button, EmptyState, Skeleton } from '../../../shared/components/ui';
import { fadeUp, staggerList } from '../../../shared/motion';

interface HistoryListProps {
  userKey: string;
  resultHistory: ResultHistoryItem[];
  personas: Persona[];
  setSelectedHistoryId: (id: string) => void;
  logClick: (e: string) => void;
  setActiveTab: (tab: ActiveTab) => void;
  ageGroup?: number;
  isLoading?: boolean;
}

type FilterId = 'all' | 'fortune' | 'quote' | 'lotto';

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'fortune', label: '운세' },
  { id: 'quote', label: '조언' },
  { id: 'lotto', label: '로또' },
];

const getTimestampMs = (timestamp: unknown) => {
  if (!timestamp) return 0;
  if (typeof timestamp === 'number') return timestamp;
  if (typeof timestamp === 'string') {
    const numberValue = Number(timestamp);
    const dateValue = Date.parse(timestamp);
    return Number.isFinite(numberValue) ? numberValue : Number.isFinite(dateValue) ? dateValue : 0;
  }
  if (timestamp instanceof Date) return timestamp.getTime();
  if (typeof timestamp === 'object' && 'seconds' in timestamp) {
    return Number((timestamp as { seconds: number }).seconds) * 1000;
  }
  return 0;
};

const formatRelativeDate = (timestamp: unknown) => {
  const time = getTimestampMs(timestamp);
  if (!time) return '날짜 없음';
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return '날짜 없음';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.floor((startOfToday - startOfDate) / 86400000);

  if (days === 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(date);
};

const formatGroupDate = (timestamp: unknown) => {
  const time = getTimestampMs(timestamp);
  if (!time) return '날짜 없음';
  const date = new Date(time);
  const relative = formatRelativeDate(timestamp);
  if (relative === '오늘' || relative === '어제') return relative;
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
};

// 알 수 없는/제거된 타입(예: 과거 저장된 'fable')은 안전하게 '조언'으로 폴백해요.
const getItemType = (item: ResultHistoryItem): FilterId => {
  if (item.type === 'lotto') return 'lotto';
  if (item.type === 'fortune') return 'fortune';
  return 'quote';
};

const getTypeLabel = (type: FilterId) => {
  if (type === 'fortune') return '운세';
  if (type === 'lotto') return '로또';
  return '조언';
};

const getPersonaName = (item: ResultHistoryItem) => {
  if (item.type === 'lotto') return '행운의 로또';
  return item.personaName || (item.summary || '').split('\n')[0].replace(/[이가]$/, '') || '알 수 없음';
};

export const HistoryList = memo(({
  userKey: _userKey,
  resultHistory,
  personas,
  setSelectedHistoryId,
  logClick,
  setActiveTab,
  ageGroup: _ageGroup = 20,
  isLoading = false,
}: HistoryListProps) => {
  const [selectedFilter, setSelectedFilter] = useState<FilterId>('all');
  const [visibleCount, setVisibleCount] = useState(30);

  const counts = useMemo(() => {
    const base: Record<FilterId, number> = { all: resultHistory.length, fortune: 0, quote: 0, lotto: 0 };
    resultHistory.forEach((item) => {
      base[getItemType(item)] += 1;
    });
    return base;
  }, [resultHistory]);

  const filteredResults = useMemo(() => {
    return [...resultHistory]
      .filter((item) => selectedFilter === 'all' || getItemType(item) === selectedFilter)
      .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));
  }, [resultHistory, selectedFilter]);

  const visibleResults = filteredResults.slice(0, visibleCount);

  const groupedResults = useMemo(() => {
    return visibleResults.reduce<Array<{ label: string; items: ResultHistoryItem[] }>>((groups, item) => {
      const label = formatGroupDate(item.timestamp);
      const last = groups[groups.length - 1];
      if (last?.label === label) {
        last.items.push(item);
      } else {
        groups.push({ label, items: [item] });
      }
      return groups;
    }, []);
  }, [visibleResults]);

  const handleItemClick = useCallback((itemId: string) => {
    setSelectedHistoryId(itemId);
    setActiveTab('history-detail');
    logClick('history_item_click');
  }, [setSelectedHistoryId, setActiveTab, logClick]);

  const handleFilterClick = (filter: FilterId) => {
    setSelectedFilter(filter);
    setVisibleCount(30);
    logClick(`history_filter_${filter}`);
  };

  useAppNavigationBar({ title: '보관함' });

  return (
    <motion.div
      key="history"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative z-0 space-y-5 overflow-x-hidden pb-24"
    >
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 className="t-display text-toss-gray-900">보관함</h2>
          <p className="t-body text-toss-gray-500">나의 행운 기록</p>
        </div>
        <button
          type="button"
          aria-label="마이페이지"
          onClick={() => setActiveTab('mypage')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-toss-gray-100 bg-paper text-toss-gray-500 shadow-soft active:bg-toss-gray-50"
        >
          <User size={18} />
        </button>
      </header>

      {isLoading ? (
        <div className="space-y-3" aria-label="보관함을 불러오는 중">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} surface="reading" className="flex min-h-[96px] items-center gap-3 p-4">
              <Skeleton className="h-12 w-12 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
            </Card>
          ))}
        </div>
      ) : resultHistory.length === 0 ? (
        <EmptyState
          icon={<Archive size={22} className="text-toss-blue" />}
          title="아직 보관된 행운이 없어요"
          desc="첫 번째 행운을 뽑아보세요."
          cta={{ label: '행운 뽑으러 가기', onClick: () => setActiveTab('home') }}
        />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map((filter) => {
              const isSelected = selectedFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => handleFilterClick(filter.id)}
                  className={cn(
                    't-caption flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 font-bold transition-colors',
                    isSelected
                      ? 'border-ink bg-toss-blue text-white shadow-hard-sm'
                      : 'border-toss-gray-100 bg-paper text-toss-gray-600 shadow-soft active:bg-toss-gray-50',
                  )}
                  aria-pressed={isSelected}
                >
                  <span>{filter.label}</span>
                  <span className={cn('t-micro rounded-sm px-1.5 py-0.5', isSelected ? 'bg-white/20 text-white' : 'bg-toss-gray-50 text-toss-gray-400')}>
                    {counts[filter.id]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="rounded-md border border-toss-gray-100 bg-paper px-4 py-3 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-toss-blue" />
                <p className="t-body font-bold text-toss-gray-800">
                  {FILTERS.find((filter) => filter.id === selectedFilter)?.label} 기록
                </p>
              </div>
              <span className="t-caption text-toss-gray-500 tabular-nums">
                {filteredResults.length}개
              </span>
            </div>
          </div>

          {filteredResults.length === 0 ? (
            <EmptyState
              title="해당 기록이 없어요"
              desc="다른 필터를 선택하거나 새 행운을 뽑아보세요."
              cta={{ label: '전체 보기', onClick: () => handleFilterClick('all') }}
            />
          ) : (
            <motion.div variants={staggerList(0.03)} initial="hidden" animate="show" className="space-y-6">
              {groupedResults.map((group) => (
                <section key={group.label} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-toss-gray-100" />
                    <h3 className="t-caption font-bold text-toss-gray-500">{group.label}</h3>
                    <div className="h-px flex-1 bg-toss-gray-100" />
                  </div>

                  <div className="space-y-3">
                    {group.items.map((item) => {
                      const rarityConf = item.rarity ? RARITY_CONFIG[item.rarity] : null;
                      const type = getItemType(item);
                      const personaName = getPersonaName(item);
                      const title = item.situation || item.title || '행운의 말';

                      return (
                        <motion.button
                          key={item.id}
                          type="button"
                          variants={fadeUp}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleItemClick(item.id)}
                          className="relative w-full overflow-hidden rounded-lg border border-toss-gray-100 bg-paper p-4 text-left shadow-soft transition-colors active:bg-toss-gray-50"
                        >
                          {rarityConf && (
                            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${rarityConf.gradient}`} />
                          )}

                          <div className="flex items-start gap-3.5">
                            <div
                              className={cn(
                                'flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md text-3xl',
                                rarityConf
                                  ? `${rarityConf.bgColor} border ${rarityConf.borderColor}`
                                  : 'border border-toss-gray-100 bg-toss-gray-50',
                              )}
                            >
                              {getPersonaIcon(personaName, personas)}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                  <span className="t-micro rounded-sm border border-toss-gray-100 bg-toss-gray-50 px-1.5 py-0.5 text-toss-gray-500">
                                    {getTypeLabel(type)}
                                  </span>
                                  {rarityConf && (
                                    <span className={`t-micro rounded-sm border px-1.5 py-0.5 ${rarityConf.bgColor} ${rarityConf.color} ${rarityConf.borderColor}`}>
                                      {rarityConf.icon} {rarityConf.label}
                                    </span>
                                  )}
                                  {item.detailedAnalysis && (
                                    <span className="t-micro inline-flex items-center gap-1 rounded-sm border border-toss-blue/10 bg-toss-blue/5 px-1.5 py-0.5 text-toss-blue">
                                      <Sparkles size={11} />
                                      해석 완료
                                    </span>
                                  )}
                                </div>
                                <span className="t-micro shrink-0 text-toss-gray-400">
                                  {formatRelativeDate(item.timestamp)}
                                </span>
                              </div>

                              <h4 className="t-body line-clamp-1 font-bold text-toss-gray-900">
                                {title}
                              </h4>

                              <p className="t-caption mt-1 line-clamp-2 text-toss-gray-500">
                                {item.content}
                              </p>

                              {typeof item.score === 'number' && (
                                <div className="mt-2 flex items-center gap-1.5">
                                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-toss-gray-100">
                                    <div
                                      className={`h-full rounded-full ${rarityConf ? `bg-gradient-to-r ${rarityConf.gradient}` : 'bg-toss-blue'}`}
                                      style={{ width: `${item.score}%` }}
                                    />
                                  </div>
                                  <span className="t-micro shrink-0 text-toss-gray-400 tabular-nums">{item.score}점</span>
                                </div>
                              )}
                            </div>

                            <ChevronRight size={16} className="mt-1 shrink-0 text-toss-gray-300" />
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </motion.div>
          )}

          {visibleCount < filteredResults.length && (
            <Button variant="secondary" onClick={() => setVisibleCount((count) => count + 30)}>
              더 보기
            </Button>
          )}
        </>
      )}
    </motion.div>
  );
});
