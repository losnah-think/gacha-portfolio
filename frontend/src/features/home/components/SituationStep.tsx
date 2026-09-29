import { motion } from 'framer-motion';
import { memo, useMemo } from 'react';
import { ArrowRight, Search, Sparkles, TrendingUp } from 'lucide-react';
import type { Situation } from '../../../shared/types';
import { BannerAdSlot } from '../../../shared/components/BannerAdSlot';
import { BANNER_AD_PERSONA_ID } from '../../../shared/constants/app';
import { fadeUp, staggerList } from '../../../shared/motion';

interface SituationStepProps {
  situationQuery: string;
  setSituationQuery: (q: string) => void;
  setSituationError: (e: string | null) => void;
  situationOptions: Situation[];
  situationError: string | null;
  recommendedSituations: Situation[];
  isSituationsExpanded: boolean;
  setIsSituationsExpanded: (expanded: boolean) => void;
  handleSituationSelect: (sit: Situation) => void;
  handleCustomSituationConfirm: () => void;
  AIDisclaimer: React.FC;
}

const containerVariants = staggerList(0.07);
const itemVariants = fadeUp;

export const SituationStep = memo(({
  situationQuery,
  setSituationQuery,
  setSituationError,
  situationOptions,
  situationError,
  recommendedSituations,
  isSituationsExpanded,
  setIsSituationsExpanded,
  handleSituationSelect,
  handleCustomSituationConfirm,
  AIDisclaimer
}: SituationStepProps) => {
  const filteredSituations = useMemo(() => {
    let list = situationOptions;
    if (situationQuery) {
      list = list.filter(sit => sit.title.includes(situationQuery));
    }
    return list;
  }, [situationQuery, situationOptions]);
  const customSituation = situationQuery.trim();

  return (
    <motion.div
      key="step1"
      variants={containerVariants}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      {/* 헤더 */}
      <motion.div variants={itemVariants} className="space-y-2 px-1">
        <h3 className="text-[22px] font-extrabold text-toss-gray-900 leading-tight tracking-tight">
          지금 어떤 상황이신가요?
        </h3>
        <p className="text-[14px] text-toss-gray-400 font-medium break-words leading-relaxed">
          고민 상황을 선택하거나, 직접 적어보세요
        </p>
      </motion.div>

      {/* ① 질문 입력 */}
      <motion.div variants={itemVariants} className="space-y-3">
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-toss-gray-300 pointer-events-none">
            <Search size={18} />
          </div>
          <input
            value={situationQuery}
            onChange={(e) => { setSituationQuery(e.target.value); setSituationError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && situationQuery.trim()) handleCustomSituationConfirm(); }}
            placeholder="직접 입력 (예: 오늘 면접이 너무 걱정돼)"
            className="w-full rounded-[18px] border-2 border-toss-gray-100 bg-white pl-11 pr-[88px] py-4 text-[15px] font-semibold text-toss-gray-800 focus:border-toss-blue focus:outline-none transition-all placeholder:text-toss-gray-300 shadow-sm focus:shadow-md focus:shadow-toss-blue/5"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <button
              onClick={handleCustomSituationConfirm}
              disabled={!situationQuery.trim()}
              className="h-10 rounded-full bg-toss-blue px-4 text-[14px] font-bold text-white shadow-lg shadow-toss-blue/20 active:scale-95 transition-all disabled:opacity-0 disabled:scale-90"
            >
              확인
            </button>
          </div>
        </div>
      </motion.div>

      {situationError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 text-red-500 p-4 rounded-2xl text-[14px] font-bold text-center border border-red-100"
        >
          {situationError}
        </motion.div>
      )}

      {/* ② 광고 배너 (상단) */}
      {!situationQuery && (
        <BannerAdSlot adGroupId={BANNER_AD_PERSONA_ID} adOptions={{ variant: 'text' }} />
      )}

      {/* ③ 추천 (백엔드) */}
      {recommendedSituations.length > 0 && !situationQuery && (
        <motion.div variants={itemVariants} className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <div className="flex items-center gap-1.5 bg-gradient-to-r from-purple-500 to-toss-blue text-white text-[11px] font-black px-3 py-1.5 rounded-lg uppercase tracking-wider shadow-sm">
              <Sparkles size={12} />
              스페셜 추천
            </div>
          </div>
          <div className="space-y-2.5">
            {recommendedSituations.map((sit) => (
              <motion.button
                key={`rec-${sit.id}`}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSituationSelect(sit)}
              className="w-full px-4 py-5 rounded-[22px] border-2 border-toss-blue/15 bg-white shadow-sm active:bg-toss-blue/[0.03] group relative overflow-hidden flex items-center justify-between gap-3"
              >
                <div className="text-left flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-toss-blue mb-1">
                    {sit.recommendation || '추천'}
                  </p>
                  <span className="block min-w-0 text-[16px] font-extrabold text-toss-gray-900 group-hover:text-toss-blue transition-colors leading-snug break-words">
                    {sit.title}
                  </span>
                </div>
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-toss-blue/10 flex items-center justify-center group-hover:bg-toss-blue/20 transition-colors">
                  <span className="text-toss-blue text-[16px] font-bold">→</span>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {/* 인기 급상승 랭킹 */}
      {filteredSituations.length > 0 && (
        <motion.div variants={itemVariants} className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <TrendingUp size={15} className="text-toss-blue" />
            <h3 className="text-[14px] font-extrabold text-toss-gray-500 uppercase tracking-wider">인기 급상승</h3>
          </div>
          <div className="space-y-2">
            {(situationQuery || isSituationsExpanded ? filteredSituations : filteredSituations.slice(0, 5))
              .map((sit) => {
                const rank = situationOptions.indexOf(sit) + 1;
                const isTop3 = rank <= 3;
                return (
                  <motion.button
                    key={sit.id}
                    layout
                    variants={itemVariants}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSituationSelect(sit)}
                    className={`w-full flex items-center gap-3 px-4 py-4 rounded-[18px] border bg-white transition-all active:bg-toss-gray-50 group overflow-hidden ${
                      isTop3 ? 'border-toss-blue/10 shadow-sm' : 'border-toss-gray-100'
                    }`}
                  >
                    <span className={`text-[15px] font-black w-7 text-center tabular-nums ${isTop3 ? 'text-toss-blue' : 'text-toss-gray-300'}`}>
                      {rank}
                    </span>
                    <span className="min-w-0 flex-1 text-left text-[15px] font-bold text-toss-gray-800 break-words group-hover:text-toss-blue transition-colors leading-snug">
                      {sit.title}
                    </span>
                    <span className="text-toss-gray-300 group-hover:text-toss-blue transition-colors text-lg flex-shrink-0">→</span>
                  </motion.button>
                );
              })}
          </div>

          {!situationQuery && filteredSituations.length > 5 && !isSituationsExpanded && (
            <motion.button
              variants={itemVariants}
              whileTap={{ scale: 0.98 }}
              onClick={() => setIsSituationsExpanded(true)}
              className="w-full py-4 rounded-[18px] bg-toss-gray-50 border border-toss-gray-100 text-[14px] font-bold text-toss-gray-500 hover:bg-toss-gray-100 transition-all flex items-center justify-center gap-1.5"
            >
              더 많은 상황 보기 ({filteredSituations.length - 5}개)
              <span className="text-toss-gray-400">↓</span>
            </motion.button>
          )}
        </motion.div>
      )}

      {customSituation && (
        <motion.button
          variants={itemVariants}
          whileTap={{ scale: 0.98 }}
          onClick={handleCustomSituationConfirm}
          className="w-full rounded-[22px] border-2 border-toss-blue bg-toss-blue/5 px-4 py-5 text-left shadow-sm"
        >
          <span className="t-caption text-toss-blue">
            {filteredSituations.length === 0 ? '검색 결과가 없어도 괜찮아요' : '목록에 없어도 직접 진행할 수 있어요'}
          </span>
          <span className="mt-1 flex items-center justify-between gap-3">
            <span className="min-w-0 flex-1 text-[16px] font-extrabold leading-snug text-toss-gray-900 break-words">
              '{customSituation}' 고민으로 바로 만들어 드려요
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-toss-blue text-white">
              <ArrowRight size={17} />
            </span>
          </span>
        </motion.button>
      )}

      <AIDisclaimer />
    </motion.div>
  );
});
