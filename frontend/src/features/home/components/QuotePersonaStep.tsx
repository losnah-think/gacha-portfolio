import { motion } from 'framer-motion';
import { memo } from 'react';
import { Star, Sparkles, Check } from 'lucide-react';
import type { Persona } from '../../../shared/types';
import { getPersonaIcon } from '../../../shared/utils/personaHelper';
import { BannerAdSlot } from '../../../shared/components/BannerAdSlot';
import { BANNER_AD_PERSONA_ID } from '../../../shared/constants/app';

interface QuotePersonaStepProps {
  selectedSituation: string;
  setChooseStep: (step: 1 | 2 | 3) => void;
  personas: Persona[];
  recommendedPersonas: Persona[];
  selectedPersonaId: string;
  handlePersonaSelect: (pId: string) => void;
  isPersonasExpanded: boolean;
  setIsPersonasExpanded: (expanded: boolean) => void;
  rewardLevelsByPersona?: Record<string, number>;
  accountLevel?: number;
  quickMode?: boolean;
  AIDisclaimer: React.FC;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } }
};

export const QuotePersonaStep = memo(({
  selectedSituation,
  setChooseStep,
  personas,
  recommendedPersonas,
  selectedPersonaId,
  handlePersonaSelect,
  isPersonasExpanded,
  setIsPersonasExpanded,
  rewardLevelsByPersona = {},
  accountLevel = 1,
  quickMode = false,
  AIDisclaimer
}: QuotePersonaStepProps) => {
  const newPersonas = personas.filter(p => p.isNew);
  const recommendedNotNew = recommendedPersonas.filter(p => !p.isNew);
  const otherPersonas = personas.filter(p => !p.isNew && !p.isRecommended);
  const getPersonaLevel = (personaId: string) => rewardLevelsByPersona[personaId] ?? 1;

  /* ── 3열 콤팩트 카드 (quickMode용) ── */
  const GridPersonaCard = ({ p }: { p: Persona }) => {
    const isSelected = p.id === selectedPersonaId;
    return (
      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={() => handlePersonaSelect(p.id)}
        className={`relative flex flex-col items-center gap-2 p-3 rounded-[20px] border-2 transition-all duration-200 ${
          isSelected
            ? 'border-toss-blue bg-toss-blue/[0.04] shadow-lg shadow-toss-blue/10'
            : 'border-toss-gray-100 bg-white'
        }`}
      >
        {/* 뱃지 */}
        <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 items-end">
          {p.isNew && (
            <span className="t-micro font-black text-white bg-[#F04452] px-1.5 py-0.5 rounded-md uppercase tracking-tighter leading-none">NEW</span>
          )}
          {p.isRecommended && !p.isNew && (
            <span className="flex items-center gap-0.5 t-micro font-black text-amber-600 bg-amber-50 border border-amber-200/50 px-1 py-0.5 rounded-md leading-none">
              <Star size={7} fill="currentColor" />
            </span>
          )}
        </div>
        {/* 아바타 */}
        <div className={`w-16 h-16 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 ${
          isSelected
            ? 'bg-gradient-to-br from-toss-blue/10 to-purple-100/40 ring-2 ring-toss-blue/30 ring-offset-2'
            : 'bg-toss-gray-50'
        }`}>
          {getPersonaIcon(p.name, personas)}
        </div>
        {/* 이름 */}
        <p className={`text-[12px] font-bold text-center leading-tight line-clamp-2 ${
          isSelected ? 'text-toss-blue' : 'text-toss-gray-700'
        }`}>
          {p.name}
        </p>
        {isSelected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute bottom-2 right-2 w-5 h-5 rounded-full bg-toss-blue flex items-center justify-center"
          >
            <Check size={11} className="text-white" strokeWidth={3} />
          </motion.div>
        )}
      </motion.button>
    );
  };

  /* ── 공통 페르소나 카드 ── */
  const PersonaCard = ({ p, badge }: { p: Persona; badge?: 'new' | 'rec' | 'default' }) => {
    const isSelected = p.id === selectedPersonaId;

    return (
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => handlePersonaSelect(p.id)}
        className={`relative w-full p-4 text-left rounded-[22px] border-2 transition-all flex items-center gap-4 overflow-hidden ${
          isSelected
            ? 'border-toss-blue bg-toss-blue/[0.04] shadow-md shadow-toss-blue/8'
            : 'border-toss-gray-100 bg-white hover:border-toss-gray-200'
        }`}
      >
        {/* 아바타 */}
        <div className={`w-14 h-14 rounded-[18px] flex-shrink-0 flex items-center justify-center overflow-hidden shadow-sm border ${
          isSelected ? 'border-toss-blue/20 bg-toss-blue/5' : 'border-toss-gray-100 bg-toss-gray-50'
        }`}>
          {getPersonaIcon(p.name, personas)}
        </div>

        {/* 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {badge === 'new' && (
              <span className="t-micro font-black text-white bg-[#F04452] px-1.5 py-0.5 rounded-md uppercase">NEW</span>
            )}
            <p className={`text-[16px] font-extrabold truncate ${isSelected ? 'text-toss-blue' : 'text-toss-gray-900'}`}>
              {p.name}
            </p>
          </div>
          <p className="text-[12px] text-toss-gray-400 line-clamp-1 leading-relaxed">{p.desc}</p>
        </div>

        {/* 레벨 + 체크 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`t-micro font-black px-1.5 py-0.5 rounded-full ${
            isSelected ? 'text-toss-blue bg-toss-blue/5 border border-toss-blue/10' : 'text-toss-gray-400 bg-toss-gray-50 border border-toss-gray-100'
          }`}>
            계정 {accountLevel}단계
          </span>
          <span className={`t-micro font-black px-1.5 py-0.5 rounded-full ${
            isSelected ? 'text-purple-600 bg-purple-50 border border-purple-100' : 'text-toss-gray-400 bg-toss-gray-50 border border-toss-gray-100'
          }`}>
            캐릭터 {getPersonaLevel(p.id)}단계
          </span>
          {isSelected && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-6 h-6 rounded-full bg-toss-blue flex items-center justify-center">
              <Check size={13} className="text-white" strokeWidth={3} />
            </motion.div>
          )}
        </div>
      </motion.button>
    );
  };

  return (
    <motion.div
      key="quote-step2"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      {/* ── quickMode: 질문 요약 배너 (변경 버튼 없음) ── */}
      {quickMode ? (
        <motion.div variants={itemVariants} className="p-4 rounded-[18px] bg-toss-blue/[0.04] border border-toss-blue/10">
          <p className="text-[11px] font-bold text-toss-blue/60 uppercase tracking-wider mb-0.5">내 질문</p>
          <p className="text-[15px] font-extrabold text-toss-gray-800 leading-snug">{selectedSituation}</p>
        </motion.div>
      ) : (
        /* 선택한 상황 요약 */
        <motion.div variants={itemVariants} className="flex items-center gap-3 p-4 rounded-[18px] bg-toss-gray-50 border border-toss-gray-100">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-toss-gray-400 uppercase tracking-wider">선택한 상황</p>
            <p className="text-[15px] font-extrabold text-toss-gray-800 truncate mt-0.5">{selectedSituation}</p>
          </div>
          <button
            onClick={() => setChooseStep(1)}
            className="flex-shrink-0 px-3.5 py-2 rounded-xl text-[13px] font-bold text-toss-blue bg-toss-blue/10 active:scale-95 transition-transform"
          >
            변경
          </button>
        </motion.div>
      )}

      {/* 헤더 */}
      <motion.div variants={itemVariants}>
        <h3 className="text-[20px] font-extrabold text-toss-gray-900 px-1 leading-snug tracking-tight">
          {quickMode ? (
            <>조언해 줄 <span className="text-toss-blue">상담가</span>를 골라보세요</>
          ) : (
            <>원하는 상담가를 선택하고<br />
            <span className="text-toss-blue">
              {new Date().getHours() >= 18 ? '조언과 내일의 운세' : '오늘의 조언과 운세'}
            </span>를 들어보세요</>
          )}
        </h3>
      </motion.div>

      {/* ── quickMode: 전체 3열 그리드 ── */}
      {quickMode ? (
        <motion.div variants={itemVariants}>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-3 gap-3"
          >
            {personas.map((p) => (
              <GridPersonaCard key={p.id} p={p} />
            ))}
          </motion.div>
        </motion.div>
      ) : (
        <>
          {/* NEW 페르소나 */}
          {newPersonas.length > 0 && (
            <motion.div variants={itemVariants} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Star size={13} className="text-[#F04452] fill-[#F04452]" />
                <span className="text-[13px] font-extrabold text-[#F04452]">새로 추가됨</span>
              </div>
              <div className="space-y-2.5">
                {newPersonas.map((p) => (
                  <PersonaCard key={`new-${p.id}`} p={p} badge="new" />
                ))}
              </div>
            </motion.div>
          )}

          {/* 추천 페르소나 */}
          {recommendedNotNew.length > 0 && (
            <motion.div variants={itemVariants} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Sparkles size={13} className="text-toss-blue" />
                <span className="text-[13px] font-extrabold text-toss-blue">추천 조언가</span>
              </div>
              <div className="space-y-2.5">
                {recommendedNotNew.map((p) => (
                  <PersonaCard key={`rec-${p.id}`} p={p} badge="rec" />
                ))}
              </div>
            </motion.div>
          )}

          {/* ━━━━ 텍스트 배너 광고 ━━━━ */}
          <BannerAdSlot adGroupId={BANNER_AD_PERSONA_ID} adOptions={{ variant: 'text' }} />

          {/* 모든 조언가 */}
          {otherPersonas.length > 0 && (
            <motion.div variants={itemVariants} className="space-y-3">
              <div className="px-1">
                <span className="text-[13px] font-extrabold text-toss-gray-500">모든 조언가</span>
              </div>
              <div className="space-y-2.5">
                {(isPersonasExpanded ? otherPersonas : otherPersonas.slice(0, 15)).map((p, idx) => (
                  <motion.div
                    key={`all-${p.id}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: isPersonasExpanded ? 0 : idx * 0.03 }}
                  >
                    <PersonaCard p={p} badge="default" />
                  </motion.div>
                ))}
              </div>

              {otherPersonas.length > 15 && !isPersonasExpanded && (
                <motion.button
                  variants={itemVariants}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setIsPersonasExpanded(true)}
                  className="w-full py-3.5 rounded-[18px] bg-toss-gray-50 border border-toss-gray-100 text-[13px] font-bold text-toss-gray-500 hover:bg-toss-gray-100 transition-all flex items-center justify-center gap-1.5"
                >
                  더 많은 조언가 보기 ({otherPersonas.length - 15}명)
                  <span className="text-toss-gray-400">↓</span>
                </motion.button>
              )}
            </motion.div>
          )}
        </>
      )}

      <AIDisclaimer />
    </motion.div>
  );
});
