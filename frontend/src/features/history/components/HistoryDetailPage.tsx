import { Share2, Trash2, Calendar, Sparkles, Play } from 'lucide-react';
import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { MarkdownProse } from '../../../shared/components/MarkdownProse';
import { Card, EmptyState, FontSizeControl } from '../../../shared/components/ui';
import type { ResultHistoryItem, Persona } from '../../../shared/types';
import { RARITY_CONFIG } from '../../../shared/constants/rarity';
import { getPersonaIcon } from '../../../shared/utils/personaHelper';
import { recommendedReadingFontSize } from '../../../shared/utils/readingFontSize';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { HistoryContentCard } from './HistoryContentCard';

interface HistoryDetailPageProps {
  selectedItem: ResultHistoryItem | null;
  personas: Persona[];
  setActiveTab: (tab: 'home' | 'history') => void;
  handleShareHistoryItem: (id: string) => void;
  handleDeleteHistoryItem: () => void;
  logClick: (e: string) => void;
  ageGroup?: number;
  onDetailedAnalysis?: () => void;
  onViewAnalysis?: () => void;
  isAnalysisLoading?: boolean;
}

/* ── Fortune bar config ── */
const FORTUNE_COLORS: Record<string, { bar: string; icon: string }> = {
  '재물운': { bar: 'bg-amber-400', icon: '💰' },
  '연애운': { bar: 'bg-rose-400', icon: '💕' },
  '건강운': { bar: 'bg-emerald-400', icon: '🍀' },
  '사업운': { bar: 'bg-blue-400', icon: '💼' },
  '학업/시험': { bar: 'bg-violet-400', icon: '🎓' },
  '전체운': { bar: 'bg-orange-400', icon: '⭐' },
};

const formatDate = (timestamp: any) => {
  if (!timestamp) return '날짜 없음';
  let date: Date;
  if (typeof timestamp === 'number') date = new Date(timestamp);
  else if (typeof timestamp === 'string') {
    const n = Number(timestamp);
    date = !isNaN(n) ? new Date(n) : new Date(timestamp);
  } else if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
    date = new Date(timestamp.seconds * 1000);
  } else if (timestamp instanceof Date) date = timestamp;
  else return '날짜 없음';
  if (isNaN(date.getTime())) return '날짜 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const HistoryDetailPage = memo(({
  selectedItem,
  personas,
  setActiveTab,
  handleShareHistoryItem,
  handleDeleteHistoryItem,
  logClick,
  ageGroup: _ageGroup = 20,
  onDetailedAnalysis,
  onViewAnalysis,
  isAnalysisLoading = false,
}: HistoryDetailPageProps) => {
  const [fontSize, setFontSize] = useState(() => recommendedReadingFontSize(undefined, _ageGroup));
  const [prevId, setPrevId] = useState(selectedItem?.id);

  if (selectedItem?.id !== prevId) {
    setPrevId(selectedItem?.id);
    setFontSize(recommendedReadingFontSize(undefined, _ageGroup));
  }

  const handleBackPress = () => {
    setActiveTab('history');
    logClick('history_detail_back');
  };

  useAppNavigationBar({
    title: '상세 보기',
    showBack: true,
    onBackPress: handleBackPress,
  });

  /* ── Empty state ── */
  if (!selectedItem) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex min-h-[60vh] items-center justify-center"
      >
        <EmptyState
          title="항목을 찾을 수 없습니다"
          desc="보관함으로 돌아가 다른 기록을 확인해 주세요."
          cta={{ label: '보관함으로', onClick: handleBackPress }}
        />
      </motion.div>
    );
  }

  const rarityConf = selectedItem.rarity ? RARITY_CONFIG[selectedItem.rarity] : null;

  return (
    <motion.div
      key={`history-detail-${selectedItem.id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="w-full space-y-5 pb-20"
    >
      {/* ── Header Section ── */}
      <div className="pt-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: text info */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Persona name */}
            <p className="text-[13px] font-bold text-toss-blue tracking-tight">
              {(() => {
                if (selectedItem.personaName) {
                  const lastChar = selectedItem.personaName.charCodeAt(selectedItem.personaName.length - 1);
                  const isHg = lastChar >= 0xac00 && lastChar <= 0xd7a3;
                  const hasBatchim = isHg ? (lastChar - 0xac00) % 28 > 0 : false;
                  const josa = hasBatchim ? '이' : '가';
                  return `${selectedItem.personaName}${josa}`;
                }
                return (selectedItem.summary || '').split('\n')[0];
              })()}
            </p>

            {/* Situation title */}
            <h1 className="text-[24px] font-bold text-toss-gray-900 leading-tight tracking-tight break-keep">
              {selectedItem.situation || (selectedItem.summary || '').split('\n')[1]?.replace(' 해주는 조언이에요', '')}
            </h1>

            {/* Date */}
            <div className="flex items-center gap-1.5 text-toss-gray-400">
              <Calendar size={12} />
              <p className="text-[12px] font-medium">{formatDate(selectedItem.timestamp)}</p>
            </div>

            {/* Rarity badge + score */}
            <div className="flex items-center gap-2 flex-wrap">
              {rarityConf && (
                <div
                  className={`w-fit px-2.5 py-0.5 rounded-full flex items-center gap-1 ${rarityConf.bgColor} border ${rarityConf.borderColor}`}
                >
                  <span className="t-micro">{rarityConf.icon}</span>
                  <span className={`t-micro font-black tracking-widest ${rarityConf.color}`}>
                    {rarityConf.label}
                  </span>
                </div>
              )}
              {typeof selectedItem.score === 'number' && (
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-20 bg-toss-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${selectedItem.score}%` }}
                      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                      className={`h-full rounded-full ${rarityConf ? `bg-gradient-to-r ${rarityConf.gradient}` : 'bg-toss-blue'}`}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-toss-gray-400 tabular-nums">{selectedItem.score}점</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Persona icon */}
          <div className={`w-20 h-20 rounded-[24px] flex items-center justify-center text-4xl overflow-hidden flex-shrink-0 ${rarityConf ? `${rarityConf.bgColor} border ${rarityConf.borderColor} shadow-md` : 'bg-toss-gray-50 shadow-inner border border-toss-gray-100/50'}`}>
            {(() => {
              const name = selectedItem.type === 'lotto' ? '행운의 로또' : (selectedItem.personaName || (selectedItem.summary || '').split('\n')[0].replace(/[이가]$/, '') || '알 수 없음');
              return getPersonaIcon(name, personas);
            })()}
          </div>
        </div>

        <FontSizeControl value={fontSize} onChange={setFontSize} className="max-w-sm border-t border-toss-gray-100 pt-4" />
      </div>

      {/* ── Content Card ── */}
      <HistoryContentCard item={selectedItem} personas={personas} fontSize={fontSize} />

      {/* ── 교훈(과거 저장된 우화 항목 등 moral 데이터가 있으면 안전하게 표시) ── */}
      {selectedItem.moral && (
        <Card surface="reading" className="space-y-2 p-5 text-center">
          <p className="t-caption font-bold text-toss-blue">교훈</p>
          <MarkdownProse align="center" fontSize={fontSize} className="font-bold text-toss-gray-900">
            {selectedItem.moral}
          </MarkdownProse>
        </Card>
      )}

      {/* ── Fortune Section ── */}
      {selectedItem.fortune && (
        <div className="rounded-[22px] border border-toss-gray-100 bg-gradient-to-b from-white to-toss-gray-50/60 p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-toss-blue/10 to-toss-blue/5 flex items-center justify-center">
              <Sparkles size={16} className="text-toss-blue" />
            </div>
            <h4 className="text-[15px] font-bold text-toss-gray-900">오늘의 운세</h4>
          </div>

          <p className="text-[14px] font-medium text-toss-gray-700 leading-relaxed break-words whitespace-pre-wrap">
            {selectedItem.fortune.description}
          </p>

          {selectedItem.fortune.details && (
            <div className="space-y-2.5 pt-1">
              {(() => {
                const toScore = (v: number | { label: string; score: number } | undefined): number =>
                  typeof v === 'number' ? v : (v?.score ?? 0);
                return [
                  { label: '재물운', value: toScore(selectedItem.fortune.details!.wealth) },
                  { label: '연애운', value: toScore(selectedItem.fortune.details!.love) },
                  { label: '건강운', value: toScore(selectedItem.fortune.details!.health) },
                ];
              })().map((item) => {
                const cfg = FORTUNE_COLORS[item.label] ?? FORTUNE_COLORS['재물운'];
                return (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[12px] font-bold text-toss-gray-500 flex items-center gap-1">
                        <span className="t-micro">{cfg.icon}</span>
                        {item.label}
                      </span>
                      <span className="text-[12px] font-bold text-toss-gray-900 tabular-nums">{item.value}%</span>
                    </div>
                    <div className="h-1.5 bg-toss-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${item.value}%` }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className={`h-full rounded-full ${cfg.bar}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Zodiac Fortune ── */}
      {selectedItem.zodiacFortune && (
        <div className="rounded-[22px] bg-gradient-to-br from-toss-blue/5 via-white to-white border border-toss-blue/10 p-5 space-y-5 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-toss-blue/10 flex items-center justify-center">
              <span className="text-toss-blue font-bold text-xs">Z</span>
            </div>
            <h4 className="text-[15px] font-bold text-toss-gray-900">
              {selectedItem.zodiacFortune.sign} 운세
            </h4>
          </div>

          {/* Summary / Content */}
          <div className="p-4 rounded-2xl bg-white border border-toss-blue/5 space-y-2">
            <p className="text-[13px] font-bold text-toss-gray-900 leading-relaxed break-words whitespace-pre-wrap">
              {selectedItem.zodiacFortune.summary}
            </p>
            <p className="text-[12px] text-toss-gray-500 font-medium leading-relaxed break-words whitespace-pre-wrap">
              {selectedItem.zodiacFortune.content}
            </p>
          </div>

          {/* Ratings */}
          {selectedItem.zodiacFortune.ratings && (
            <div className="space-y-2.5">
              {(() => {
                const r = selectedItem.zodiacFortune.ratings;
                const gs = (v: { label: string; score: number } | number | undefined) =>
                  v == null ? undefined : typeof v === 'number' ? v : v.score;
                return [
                  { label: '연애운',    value: gs(r.love) },
                  { label: '재물운',    value: gs(r.wealth) },
                  { label: '사업운',    value: gs(r.business) },
                  { label: '건강운',    value: gs(r.health) },
                  { label: '학업/시험', value: gs(r.exam) },
                  { label: '전체운',    value: gs(r.total) },
                ];
              })().map(
                (item) =>
                  item.value !== undefined && (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] font-bold text-toss-gray-400 flex items-center gap-1">
                          <span className="t-micro">{(FORTUNE_COLORS[item.label] ?? FORTUNE_COLORS['재물운']).icon}</span>
                          {item.label}
                        </span>
                        <span className="text-[11px] font-bold text-toss-gray-900 tabular-nums">{item.value}%</span>
                      </div>
                      <div className="h-1 bg-toss-blue/10 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${item.value}%` }}
                          transition={{ duration: 0.8, delay: 0.3 }}
                          className={`h-full rounded-full ${(FORTUNE_COLORS[item.label] ?? FORTUNE_COLORS['재물운']).bar}`}
                        />
                      </div>
                    </div>
                  ),
              )}
            </div>
          )}

          {/* Lucky items grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: '행운의 컬러', value: selectedItem.zodiacFortune.luckyItems.color },
              { label: '행운의 숫자', value: selectedItem.zodiacFortune.luckyItems.number },
              { label: '행운의 장소', value: selectedItem.zodiacFortune.luckyItems.direction },
              { label: '행운의 음식', value: selectedItem.zodiacFortune.luckyItems.food },
            ].map((item) => (
              <div key={item.label} className="bg-white/60 p-3 rounded-xl border border-toss-blue/5">
                <p className="t-micro text-toss-gray-400 font-bold mb-0.5">{item.label}</p>
                <p className="text-[12px] font-bold text-toss-gray-800">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 상세 해석 버튼 ── */}
      {selectedItem.detailedAnalysis && onViewAnalysis ? (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            onViewAnalysis();
            logClick('history_view_analysis');
          }}
          className="w-full flex items-center justify-center gap-2.5 py-[15px] rounded-2xl bg-gradient-to-r from-purple-600 to-violet-600 text-white font-bold text-[15px] shadow-[0_4px_16px_rgba(147,51,234,0.25)] active:from-purple-700 active:to-violet-700 transition-all"
        >
          <Sparkles size={16} />
          자세한 해석 보기
        </motion.button>
      ) : onDetailedAnalysis ? (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            onDetailedAnalysis();
            logClick('history_detailed_analysis');
          }}
          disabled={isAnalysisLoading}
          className="w-full flex items-center justify-center gap-2.5 py-[15px] rounded-2xl bg-gradient-to-r from-purple-600 to-violet-600 text-white font-bold text-[15px] shadow-[0_4px_16px_rgba(147,51,234,0.25)] active:from-purple-700 active:to-violet-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isAnalysisLoading ? (
            <>
              <div className="w-5 h-5 border-[2.5px] border-white/30 border-t-white rounded-full animate-spin" />
              해석을 준비하고 있어요...
            </>
          ) : (
            <>
              <Play size={16} className="fill-white" />
              광고 보고 상세 해석 보기
              <span className="text-[11px] font-bold text-white/60 bg-white/15 px-2 py-0.5 rounded-full ml-1">전면 광고 1회</span>
            </>
          )}
        </motion.button>
      ) : null}

      {/* ── Action Buttons ── */}
      <div className="flex gap-3 pt-2 pb-8">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            handleShareHistoryItem(selectedItem.id);
            logClick('history_detail_share');
          }}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-toss-blue/5 text-toss-blue font-bold text-[15px] border border-toss-blue/10 hover:bg-toss-blue/10 transition-colors"
        >
          <Share2 size={18} strokeWidth={2.5} />
          공유하기
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            handleDeleteHistoryItem();
            logClick('history_detail_delete');
          }}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-red-50 text-red-500 font-bold text-[15px] border border-red-100 hover:bg-red-100/50 transition-colors"
        >
          <Trash2 size={18} strokeWidth={2.5} />
          삭제하기
        </motion.button>
      </div>
    </motion.div>
  );
});
