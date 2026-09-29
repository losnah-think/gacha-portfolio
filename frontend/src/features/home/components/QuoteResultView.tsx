import { memo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Share2, Home, Sparkles, Eye, Ticket, LogIn, Play, RefreshCw } from 'lucide-react';
import { AnalyticsObserver } from '../../../shared/components/AnalyticsObserver';
import { PromotedBanner } from '../../../shared/components/PromotedBanner';
import { AppImage, FontSizeControl } from '../../../shared/components/ui';
import type { GachaResult, Persona } from '../../../shared/types';
import { RARITY_CONFIG } from '../../../shared/constants/rarity';
import { getIcon } from '../../../shared/utils/iconHelper';
import { getPersonaIcon } from '../../../shared/utils/personaHelper';
import { recommendedReadingFontSize } from '../../../shared/utils/readingFontSize';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { getStorageUrl } from '../../../shared/utils/storage';
import { REVEAL } from '../../../shared/motion';
import { DrawStage } from './gacha/DrawStage';
import { RevealFX } from './gacha/RevealFX';

interface QuoteResultViewProps {
  isSpinning: boolean;
  result: GachaResult | null;
  personas: Persona[];
  selectedPersonaId?: string;
  selectionSummary: string;
  setSelectedPersonaId: (id: string) => void;
  setSelectedSituation: (id: string) => void;
  setSituationQuery: (q: string) => void;
  setSituationError: (e: string | null) => void;
  setChooseStep: (step: 1 | 2 | 3) => void;
  setStep: (step: 'landing' | 'choose' | 'result') => void;
  setIsSituationsExpanded: (expanded: boolean) => void;
  setIsPersonasExpanded: (expanded: boolean) => void;
  handleShareReward: (amount?: number, message?: string) => void;
  ageGroup?: number;
  onRecharge?: () => void;
  onLogin?: () => void;
  handleRetryGacha?: () => void;
  onDetailedAnalysis?: () => void;
  onViewAnalysis?: () => void;
  isAnalysisLoading?: boolean;
  openConfirm?: (config: {
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
  }) => void;
}

/* ── Fortune bar config ── */
const FORTUNE_COLORS: Record<string, { bar: string; icon: string }> = {
  '재물운': { bar: 'bg-amber-400', icon: '💰' },
  '연애운': { bar: 'bg-rose-400', icon: '💕' },
  '건강운': { bar: 'bg-emerald-400', icon: '🍀' },
  '사업운': { bar: 'bg-blue-500', icon: '💼' },
  '학업/시험': { bar: 'bg-violet-500', icon: '🎓' },
  '전체운': { bar: 'bg-indigo-500', icon: '⭐' },
};

export const QuoteResultView = memo(({
  isSpinning,
  result,
  personas,
  selectedPersonaId,
  selectionSummary,
  setSelectedPersonaId,
  setSelectedSituation,
  setSituationQuery,
  setSituationError,
  setChooseStep,
  setStep,
  setIsSituationsExpanded,
  setIsPersonasExpanded,
  handleShareReward,
  ageGroup,
  onRecharge,
  onLogin,
  handleRetryGacha,
  onDetailedAnalysis,
  onViewAnalysis,
  isAnalysisLoading = false,
  openConfirm,
}: QuoteResultViewProps) => {
  const [fontSize, setFontSize] = useState(() => recommendedReadingFontSize(result?.fontSize, ageGroup));
  const [canReveal, setCanReveal] = useState(true);
  const revealTimersRef = useRef<number[]>([]);
  const selectedPersona = personas.find((p) => p.id === selectedPersonaId) || null;

  const goHome = () => {
    setSelectedPersonaId('');
    setSelectedSituation('');
    setSituationQuery('');
    setSituationError(null);
    setChooseStep(1);
    setStep('landing');
    setIsSituationsExpanded(false);
    setIsPersonasExpanded(false);
  };

  const confirmExit = () => {
    if (!openConfirm) {
      goHome();
      return;
    }
    openConfirm({
      title: '결과를 만들고 있어요',
      description: '지금 나가도 완성되면 보관함에 저장돼요.',
      confirmText: '나가기',
      cancelText: '계속 기다리기',
      onConfirm: goHome,
    });
  };

  useAppNavigationBar({
    title: selectionSummary.includes('운세') 
      ? selectionSummary 
      : (result?.isTomorrow ? '내일의 조언' : '오늘의 조언'),
    showBack: true,
    onBackPress: isSpinning ? confirmExit : goHome,
  });

  useEffect(() => {
    return () => {
      revealTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      revealTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (isSpinning) {
      const resetTimer = window.setTimeout(() => setCanReveal(false), 0);
      const revealTimer = window.setTimeout(() => setCanReveal(true), REVEAL.drawMinMs);
      revealTimersRef.current.push(resetTimer, revealTimer);
    }
  }, [isSpinning]);

  if (isSpinning || (Boolean(result) && !canReveal)) {
    return (
      <DrawStage
        mode="quote"
        personaName={selectedPersona?.name || result?.persona}
        personaIcon={selectedPersona ? getPersonaIcon(selectedPersona.name, personas) : null}
        onExitConfirm={confirmExit}
        onSkip={() => setCanReveal(true)}
      />
    );
  }

  /* ─────────────── Result State ─────────────── */
  if (result && !isSpinning) {
    if (result.isError) {
      const needsLogin = result.needsLogin === true;
      return (
        <motion.div
          key="error-quote"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12 text-center"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-toss-gray-50 text-toss-blue">
            {needsLogin ? <LogIn size={28} /> : <AlertCircle size={28} />}
          </div>
          <h2 className="mt-5 text-[22px] font-black text-toss-gray-900">
            {needsLogin ? '로그인이 필요해요' : '조언을 만들지 못했어요'}
          </h2>
          <p className="mt-3 max-w-[320px] text-[15px] font-semibold leading-relaxed text-toss-gray-500">
            {result.errorMessage || result.content || '잠시 후 다시 시도해 주세요.'}
          </p>
          <div className="mt-8 flex w-full max-w-[340px] flex-col gap-3">
            {needsLogin ? (
              <button
                type="button"
                onClick={onLogin}
                className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-toss-blue px-5 py-4 text-[16px] font-black text-white shadow-lg shadow-toss-blue/20"
              >
                <LogIn size={18} />
                로그인하기
              </button>
            ) : result.retryable !== false ? (
              <button
                type="button"
                onClick={handleRetryGacha}
                className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-toss-blue px-5 py-4 text-[16px] font-black text-white shadow-lg shadow-toss-blue/20"
              >
                <RefreshCw size={18} />
                다시 시도
              </button>
            ) : (
              <button
                type="button"
                onClick={onRecharge}
                className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-toss-blue px-5 py-4 text-[16px] font-black text-white shadow-lg shadow-toss-blue/20"
              >
                <Ticket size={18} />
                이용권 받기
              </button>
            )}
            <button
              type="button"
              onClick={goHome}
              className="w-full rounded-[22px] bg-toss-gray-50 px-5 py-4 text-[15px] font-black text-toss-gray-700"
            >
              처음으로
            </button>
          </div>
        </motion.div>
      );
    }

    const rarityConf = result.rarity ? RARITY_CONFIG[result.rarity] : null;
    const isHighRarity = result.rarity === 'diamond' || result.rarity === 'platinum';
    const isPreview = result.isPreview === true;
    const needsLogin = result.needsLogin === true;

    return (
      <RevealFX rarity={result.rarity} mode="quote">
        <AnimatePresence mode="wait">
        <motion.div
          key="result-quote"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="space-y-5 pb-6"
        >
          {/* ── Preview Banner ── */}
          {isPreview && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className={`flex items-center gap-3 px-5 py-4 rounded-2xl border ${needsLogin
                  ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-toss-blue/20'
                  : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200/60'
                }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${needsLogin ? 'bg-toss-blue/10' : 'bg-amber-100'
                }`}>
                {needsLogin
                  ? <LogIn size={18} className="text-toss-blue" />
                  : <Eye size={18} className="text-amber-600" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[14px] font-bold ${needsLogin ? 'text-toss-gray-900' : 'text-amber-900'}`}>
                  {needsLogin ? '로그인하면 진짜 결과를 볼 수 있어요' : '이런 결과를 받아볼 수 있어요'}
                </p>
                <p className={`text-[12px] font-medium mt-0.5 ${needsLogin ? 'text-toss-blue' : 'text-amber-600'}`}>
                  {needsLogin ? '지금 이건 예시예요. 로그인하면 나만의 조언을 받을 수 있어요' : '이용권을 받으면 나만의 조언을 받을 수 있어요'}
                </p>
              </div>
            </motion.div>
          )}
          {/* ── Main Card ── */}
          <AnalyticsObserver
            itemId="gacha_result_card"
            params={{
              result_type: 'quote',
              result_title: result.title,
              persona: result.persona,
              rarity: result.rarity,
            }}
            className={`relative overflow-hidden rounded-lg border bg-paper shadow-soft ${rarityConf ? rarityConf.borderColor : 'border-toss-gray-100'}`}
          >
            {/* Rarity gradient overlay for diamond/platinum */}
            {isHighRarity && rarityConf && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.06 }}
                  transition={{ duration: 0.4 }}
                  className={`absolute inset-0 bg-gradient-to-br ${rarityConf.gradient} pointer-events-none`}
                />
                <div className="absolute inset-0 bg-paper/50 pointer-events-none" />
              </>
            )}

            {/* Top accent bar */}
            <div
              className={`h-1.5 bg-gradient-to-r ${rarityConf ? rarityConf.gradient : 'from-toss-blue via-sky-400 to-toss-blue'
                }`}
            />

            {/* ── Header Area ── */}
            <div className="relative px-6 pt-8 pb-4 flex flex-col items-center text-center space-y-5">
              {/* Rarity badge */}
              {rarityConf && (
                <motion.div
                  initial={{ x: 40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.3, type: 'spring', stiffness: 300 }}
                  className={`absolute right-0 top-4 flex items-center gap-1.5 rounded-l-full border-y border-l px-3.5 py-1 shadow-soft ${rarityConf.bgColor} ${rarityConf.borderColor}`}
                >
                  <span className="text-sm">{rarityConf.icon}</span>
                  <span className={`t-micro font-bold ${rarityConf.color}`}>
                    {rarityConf.label}
                  </span>
                </motion.div>
              )}

              {/* Decorative star */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 0.1 }}
                transition={{ delay: 0.6, duration: 0.8 }}
                className="absolute -right-4 -top-4 w-28 h-28 pointer-events-none select-none"
              >
                <AppImage
                  src={getStorageUrl('images/ui/star-premium.png')}
                  alt=""
                  width={112}
                  className="w-full h-full object-contain rotate-[15deg]"
                />
              </motion.div>

              {/* Persona icon */}
              <motion.div
                initial={{ rotate: -12, scale: 0.5, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 220, damping: 18 }}
                className="w-20 h-20 bg-toss-gray-50 rounded-[26px] flex items-center justify-center text-4xl shadow-md border border-toss-gray-100 overflow-hidden"
              >
                {(() => {
                  const name = result.persona;
                  if (!name) return getIcon(result.type);
                  return getPersonaIcon(name, personas) || getIcon(result.type);
                })()}
              </motion.div>

              {/* Title */}
              <div className="space-y-1.5">
                <p className="t-caption font-bold text-toss-blue">
                  {result.isTomorrow ? '내일의 조언' : '오늘의 조언'}
                </p>
                <h2 className="t-display text-toss-gray-900 break-keep">{result.title}</h2>
                {/* Level / boost tags */}
                {(result.appliedBoost || result.characterLevelSnapshot) && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {typeof result.characterLevelSnapshot === 'number' && (
                      <span className="t-micro font-bold text-toss-blue bg-toss-blue/5 px-2 py-0.5 rounded-full border border-toss-blue/10">
                        캐릭터 {result.characterLevelSnapshot}단계
                      </span>
                    )}
                    {typeof result.appliedBoost?.diamondBoostPct === 'number' && (
                      <span className="t-micro font-bold text-toss-blue bg-toss-blue/5 px-2 py-0.5 rounded-full border border-toss-blue/10">
                        좋은 결과 가능성 +{result.appliedBoost.diamondBoostPct}%
                      </span>
                    )}
                    {typeof result.appliedBoost?.platinumBoostPct === 'number' && (
                      <span className="t-micro font-bold text-toss-blue bg-toss-blue/5 px-2 py-0.5 rounded-full border border-toss-blue/10">
                        특별 결과 가능성 +{result.appliedBoost.platinumBoostPct}%
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Selection summary */}
              {selectionSummary && (
                <p className="text-[12px] font-medium text-toss-gray-400 leading-relaxed max-w-[260px] break-words whitespace-pre-wrap">
                  {selectionSummary}
                </p>
              )}
            </div>

            {/* ── Divider ── */}
            <div className="mx-6 h-px bg-toss-gray-100" />

            {/* ── Content Area ── */}
            <div className={`px-6 py-8 space-y-5 ${isPreview ? 'relative' : ''}`}>
              {/* Preview blur overlay */}
              {isPreview && (
                <div className="absolute inset-0 z-10 bg-gradient-to-b from-transparent via-white/70 to-white rounded-b-[28px] flex flex-col items-center justify-end pb-8 pointer-events-none">
                  <div className="pointer-events-auto text-center space-y-2">
                    <p className="text-[15px] font-bold text-toss-gray-700">
                      {needsLogin ? '로그인하면 전체 결과를 볼 수 있어요' : '전체 글을 보려면 이용권이 필요해요'}
                    </p>
                    <p className="text-[12px] text-toss-gray-400">
                      {needsLogin ? '지금 보시는 건 미리보기예요' : '광고 보기나 공유로 무료 이용권을 받을 수 있어요'}
                    </p>
                  </div>
                </div>
              )}
              <FontSizeControl value={fontSize} onChange={setFontSize} className="mx-auto max-w-sm" />

              {/* Quote content */}
              <div className="relative">
                <span className="absolute -top-2 left-0 text-3xl text-toss-gray-100 font-serif leading-none select-none">
                  "
                </span>
                <p
                  className="font-bold text-toss-gray-900 leading-[1.7] break-keep px-5 whitespace-pre-wrap"
                  style={{ fontSize: `${fontSize}px` }}
                >
                  {result.content}
                </p>
                <span className="absolute -bottom-4 right-0 text-3xl text-toss-gray-100 font-serif leading-none select-none">
                  "
                </span>
              </div>
            </div>

            {/* ── Footer ── */}
            <div className="px-6 pb-6 flex flex-col items-center gap-1.5">
              <div className="w-8 h-px bg-toss-gray-200" />
              <p className="text-[11px] text-toss-gray-300 font-bold tracking-tight uppercase">
                오늘의 조언
              </p>
              <span className="t-micro text-toss-gray-300 font-medium px-2 py-0.5 rounded-full border border-toss-gray-100">
                AI가 만든 참고용 글이에요
              </span>
            </div>
          </AnalyticsObserver>

          {/* ── Fortune Card ── */}
          {result.fortune && !needsLogin && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="rounded-[24px] border border-toss-gray-100 bg-gradient-to-b from-white to-toss-gray-50/60 p-5 space-y-4"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-toss-blue/10 to-toss-blue/5 flex items-center justify-center">
                  <Sparkles size={16} className="text-toss-blue" />
                </div>
                <h4 className="text-[15px] font-bold text-toss-gray-900">
                  {result.isTomorrow ? '내일의 운세' : '오늘의 운세'}
                </h4>
              </div>

              <p className="text-[14px] font-medium text-toss-gray-700 leading-relaxed break-words whitespace-pre-wrap">
                {result.fortune.description}
              </p>

              {result.fortune.details && (
                <div className="space-y-3 pt-1">
                  {(() => {
                    const toScore = (v: number | { label: string; score: number } | undefined): number =>
                      typeof v === 'number' ? v : (v?.score ?? 0);
                    return [
                      { label: '재물운', value: toScore(result.fortune.details!.wealth) },
                      { label: '연애운', value: toScore(result.fortune.details!.love) },
                      { label: '건강운', value: toScore(result.fortune.details!.health) },
                    ];
                  })().map((item) => {
                    const cfg = FORTUNE_COLORS[item.label] ?? FORTUNE_COLORS['재물운'];
                    return (
                      <div key={item.label} className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className={`text-[12px] font-bold flex items-center gap-1 ${selectionSummary.includes(item.label) ? 'text-toss-blue font-black' : 'text-toss-gray-500'}`}>
                            <span className="t-micro">{cfg.icon}</span>
                            {item.label}
                          </span>
                          <span className={`text-[12px] font-bold tabular-nums ${selectionSummary.includes(item.label) ? 'text-toss-blue font-black' : 'text-toss-gray-900'}`}>
                            {item.value}점
                          </span>
                        </div>
                        <div className="h-1.5 bg-toss-gray-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${item.value}%` }}
                            transition={{ duration: 0.8, delay: 0.5 }}
                            className={`h-full rounded-full ${selectionSummary.includes(item.label) ? 'bg-toss-blue' : cfg.bar}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Promoted Banner ── */}
          {!needsLogin && !isPreview && (
            <PromotedBanner
              label="오늘의 추천"
              sublabel="맞춤 추천"
              className="px-1 my-1"
            />
          )}

          {/* ── Action Buttons ── */}
          {needsLogin ? (
            <div className="space-y-3 pt-2">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => onLogin?.()}
                className="w-full flex items-center justify-center gap-2.5 py-[16px] rounded-2xl bg-toss-blue text-white font-bold text-[16px] shadow-md active:bg-toss-blue/90 transition-colors"
              >
                <LogIn size={18} />
                로그인하고 나만의 결과 받기
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={goHome}
                className="w-full flex items-center justify-center gap-2 py-[14px] rounded-2xl text-toss-gray-400 font-bold text-[14px] transition-colors"
              >
                다음에 할게요
              </motion.button>
            </div>
          ) : isPreview ? (
            <div className="space-y-3 pt-2">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => onRecharge?.()}
                className="w-full flex items-center justify-center gap-2.5 py-[16px] rounded-2xl bg-toss-blue text-white font-bold text-[16px] shadow-md active:bg-toss-blue/90 transition-colors"
              >
                <Ticket size={18} />
                이용권 받고 진짜 결과 받기
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={goHome}
                className="w-full flex items-center justify-center gap-2 py-[14px] rounded-2xl text-toss-gray-400 font-bold text-[14px] transition-colors"
              >
                다음에 할게요
              </motion.button>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <div className="rounded-md border border-toss-gray-100 bg-paper px-4 py-3 text-center shadow-soft">
                <p className="t-caption font-bold text-toss-gray-500">✓ 보관함에 저장했어요</p>
              </div>

              {/* 상세 해석 버튼: 이미 해석이 있으면 바로 보기, 없으면 광고 보고 가져오기 */}
              {result.detailedAnalysis && onViewAnalysis ? (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onViewAnalysis}
                  className="w-full flex items-center justify-center gap-2.5 py-[16px] rounded-2xl bg-gradient-to-r from-purple-600 to-violet-600 text-white font-bold text-[16px] shadow-[0_4px_16px_rgba(147,51,234,0.3)] active:from-purple-700 active:to-violet-700 transition-all"
                >
                  <Sparkles size={16} />
                  자세한 해석 보기
                </motion.button>
              ) : !result.detailedAnalysis && onDetailedAnalysis ? (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onDetailedAnalysis}
                  disabled={isAnalysisLoading}
                  className="w-full flex items-center justify-center gap-2.5 py-[16px] rounded-2xl bg-gradient-to-r from-purple-600 to-violet-600 text-white font-bold text-[16px] shadow-[0_4px_16px_rgba(147,51,234,0.3)] active:from-purple-700 active:to-violet-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
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

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() =>
                  handleShareReward(
                    1,
                    result
                      ? `[오늘의 이야기] ${result.persona || '조언자'}가 들려주는 행운: ${result.title}\n\n"${result.content}"`
                      : undefined,
                  )
                }
                className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-ink-deep bg-toss-blue px-4 py-4 text-[16px] font-bold text-white shadow-hard active:translate-x-1 active:translate-y-1 active:shadow-none"
              >
                <Share2 size={18} />
                <span>공유하고 이용권 받기</span>
                <span className="t-micro rounded-sm border border-white/40 bg-white/20 px-2 py-0.5">+1장</span>
              </motion.button>

              <button
                type="button"
                onClick={handleRetryGacha}
                className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-ink bg-cream px-4 py-4 text-[16px] font-bold text-toss-gray-900 shadow-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                <Ticket size={18} />
                다시 뽑기 · 이용권 1장
              </button>

              <div className="flex gap-2">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={goHome}
                  className="flex-[1] flex items-center justify-center gap-2 rounded-md py-4 text-[15px] font-bold text-toss-gray-500 transition-colors active:bg-toss-gray-50"
                >
                  <Home size={18} />
                  홈으로
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>
        </AnimatePresence>
      </RevealFX>
    );
  }

  return null;
});
