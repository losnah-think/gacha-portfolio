import { memo, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Share2, Home, RotateCcw, Star } from 'lucide-react';
import type { GachaResult } from '../../../shared/types';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { BannerAdSlot } from '../../../shared/components/BannerAdSlot';
import { FontSizeControl } from '../../../shared/components/ui';
import { BANNER_AD_PERSONA_ID } from '../../../shared/constants/app';
import { recommendedReadingFontSize } from '../../../shared/utils/readingFontSize';
import { REVEAL } from '../../../shared/motion';
import { DrawStage } from './gacha/DrawStage';
import { RevealFX } from './gacha/RevealFX';
import { IS_PUBLIC_BROWSER } from '../../../public-browser/config';

interface FortuneResultViewProps {
  isSpinning: boolean;
  result: GachaResult | null;
  selectionSummary: string;
  onBack: () => void;
  onRetry: () => void;
  onShare: (amount?: number, message?: string) => void;
  openConfirm?: (config: {
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
  }) => void;
}

const CATEGORY_MAP: Record<string, { label: string; icon: string; color: string }> = {
  love:     { label: '연애운',    icon: '❤️', color: 'bg-rose-400' },
  wealth:   { label: '재물운',    icon: '💰', color: 'bg-amber-400' },
  health:   { label: '건강운',    icon: '🍀', color: 'bg-emerald-400' },
  business: { label: '사업운',    icon: '💼', color: 'bg-blue-400' },
  exam:     { label: '학업/시험', icon: '🎓', color: 'bg-violet-400' },
  total:    { label: '전체운',    icon: '⭐', color: 'bg-amber-400' },
};

// 점수 → 별 (5개)
function scoreToStars(score: number): number {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 55) return 3;
  if (score >= 35) return 2;
  return 1;
}

function StarRating({ score }: { score: number }) {
  const stars = scoreToStars(score);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={16}
          className={i <= stars ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
}

export const FortuneResultView = memo(({
  isSpinning,
  result,
  selectionSummary,
  onBack,
  onRetry,
  onShare,
  openConfirm,
}: FortuneResultViewProps) => {
  const [revealed, setRevealed] = useState(false);
  const [fontSize, setFontSize] = useState(() => recommendedReadingFontSize(result?.fontSize));
  const [canReveal, setCanReveal] = useState(true);
  const revealTimersRef = useRef<number[]>([]);

  const confirmExit = () => {
    if (!openConfirm) {
      onBack();
      return;
    }
    openConfirm({
      title: '결과를 만들고 있어요',
      description: '지금 나가도 완성되면 보관함에 저장돼요.',
      confirmText: '나가기',
      cancelText: '계속 기다리기',
      onConfirm: onBack,
    });
  };

  useAppNavigationBar({
    title: selectionSummary || '오늘의 운세',
    showBack: true,
    onBackPress: isSpinning ? confirmExit : onBack,
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

  useEffect(() => {
    if (!isSpinning && result && canReveal) {
      const t = setTimeout(() => setRevealed(true), 300);
      return () => clearTimeout(t);
    }
  }, [canReveal, isSpinning, result]);

  // ── 로딩 화면 ──
  if (isSpinning || !result || !canReveal) {
    return (
      <DrawStage
        mode="fortune"
        onExitConfirm={confirmExit}
        onSkip={() => setCanReveal(true)}
      />
    );
  }

  const { fortune, share: shareInfo } = result;

  if (result.isError) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="-mx-5 -mt-10 flex min-h-[100dvh] flex-col bg-paper px-5 pt-20 pb-12 surface-reading"
      >
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] bg-amber-100 text-amber-600">
            <AlertCircle size={32} strokeWidth={2.4} />
          </div>
          <h2 className="text-[22px] font-black text-slate-900">
            {result.needsLogin ? '로그인이 필요해요' : '운세를 만들지 못했어요'}
          </h2>
          <p className="mt-3 max-w-[280px] text-[15px] font-bold leading-relaxed text-slate-500">
            {result.errorMessage || '잠시 후 다시 시도해 주세요.'}
          </p>
          <div className="mt-8 flex w-full max-w-[320px] flex-col gap-3">
            {result.retryable !== false && (
              <button
                type="button"
                onClick={onRetry}
                className="h-[54px] rounded-2xl bg-amber-400 text-[16px] font-black text-white shadow-[0_8px_20px_rgba(251,191,36,0.24)] active:bg-amber-500"
              >
                다시 시도
              </button>
            )}
            <button
              type="button"
              onClick={onBack}
              className="h-[52px] rounded-2xl border border-slate-200 bg-white text-[15px] font-bold text-slate-600 active:bg-slate-50"
            >
              홈으로
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  const isSpecificCategory = selectionSummary && !selectionSummary.includes('전체운');

  const allDetailsArray = fortune?.details
    ? Object.entries(fortune.details).map(([key, value]) => {
        const config = CATEGORY_MAP[key] || { label: key, icon: '📍', color: 'bg-slate-400' };
        if (typeof value === 'object' && value !== null) {
          const rawScore = (value as { label: string; score: unknown }).score;
          return {
            key,
            label: (value as { label?: string }).label || config.label,
            score: typeof rawScore === 'number' ? rawScore : typeof rawScore === 'object' && rawScore !== null ? ((rawScore as { score?: number }).score ?? 0) : 0,
            icon: config.icon,
            color: config.color,
          };
        }
        return { key, label: config.label, score: typeof value === 'number' ? value : 0, icon: config.icon, color: config.color };
      })
    : [];

  const detailsArray = isSpecificCategory
    ? allDetailsArray.filter(item => selectionSummary.includes(item.label))
    : allDetailsArray;

  // 대표 점수
  const mainScore = typeof fortune?.score === 'number'
    ? fortune.score
    : typeof fortune?.score === 'object' && fortune?.score !== null
    ? ((fortune.score as unknown as { score?: number }).score ?? 0)
    : 0;

  // 카테고리 정보
  const categoryKey = Object.keys(CATEGORY_MAP).find(k => selectionSummary.includes(CATEGORY_MAP[k].label)) ?? 'total';
  const categoryInfo = CATEGORY_MAP[categoryKey] ?? CATEGORY_MAP.total;

  // 점수 한마디
  const scoreLabel = mainScore >= 85 ? '아주 좋은 하루예요! 🎉' : mainScore >= 70 ? '괜찮은 하루가 될 거예요' : mainScore >= 50 ? '평범한 하루가 될거예요' : '조용히 신중하게 움직여요';

  return (
    <RevealFX mode="fortune" score={mainScore}>
      <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="-mx-5 -mt-10 flex min-h-[100dvh] flex-col overflow-x-hidden bg-paper pt-14 pb-12 surface-reading"
    >
      {/* ── 상단 결과 카드 ── */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="px-5 mb-4"
      >
        <div className="rounded-lg border border-toss-gray-100 bg-paper p-5 text-toss-gray-900 shadow-soft">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-md border border-toss-gray-100 bg-toss-gray-50 text-3xl">
              {categoryInfo.icon}
            </div>
            <div className="flex-1">
              <p className="t-caption font-bold text-toss-blue">
                {result.zodiacFortune?.sign ? `${result.zodiacFortune.sign} · ${categoryInfo.label}` : categoryInfo.label}
              </p>
              <h2 className="t-display mt-0.5 text-toss-gray-900">
                {fortune?.cardNameKo || result.title || '오늘의 운세'}
              </h2>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <StarRating score={mainScore} />
              <span className="t-caption font-bold text-toss-gray-500">{scoreLabel}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[34px] font-bold leading-none text-toss-gray-900 tabular-nums">{mainScore}</span>
              <span className="t-micro text-toss-gray-400">점</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── 요약 ── */}
      {fortune?.description && (
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={revealed ? { y: 0, opacity: 1 } : {}}
          transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="px-5 mb-4"
        >
          <div className="rounded-lg border border-toss-gray-100 bg-paper p-5 shadow-soft">
            <p className="t-caption mb-3 font-bold text-toss-blue">요약</p>
            <p className="font-bold leading-relaxed text-toss-gray-700 break-keep" style={{ fontSize: `${fontSize}px` }}>
              {fortune.description}
            </p>
          </div>
        </motion.div>
      )}

      {/* ── 본문 ── */}
      {result.zodiacFortune?.content && (
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={revealed ? { y: 0, opacity: 1 } : {}}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="px-5 mb-4"
        >
          <div className="rounded-lg border border-toss-gray-100 bg-paper p-5 shadow-soft">
            <p className="t-caption mb-3 font-bold text-toss-blue">오늘의 운세</p>
            <p className="whitespace-pre-line text-toss-gray-700 break-keep" style={{ fontSize: `${fontSize}px`, lineHeight: 1.8 }}>
              {result.zodiacFortune.content}
            </p>
          </div>
        </motion.div>
      )}

      {/* ── 분야별 점수 ── */}
      {detailsArray.length > 0 && (
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={revealed ? { y: 0, opacity: 1 } : {}}
          transition={{ delay: 0.25, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="px-5 mb-4"
        >
          <div className="rounded-lg border border-toss-gray-100 bg-paper p-5 shadow-soft">
            <p className="t-caption mb-4 font-bold text-toss-blue">
              {isSpecificCategory ? '세부 점수' : '분야별 운세'}
            </p>
            <div className="space-y-4">
              {detailsArray.map((item) => (
                <div key={item.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px]">{item.icon}</span>
                      <span className="t-caption font-bold text-toss-gray-700">{item.label}</span>
                    </div>
                    <span className="t-caption font-bold text-toss-blue tabular-nums">{item.score}점</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={revealed ? { width: `${item.score}%` } : { width: 0 }}
                      transition={{ duration: 1.2, delay: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                      className="h-full rounded-full bg-toss-blue"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      <div className="px-5 mb-4">
        <BannerAdSlot adGroupId={BANNER_AD_PERSONA_ID} adOptions={{ variant: 'text' }} className="opacity-60" />
      </div>

      {/* ── 오늘의 조언 ── */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={revealed ? { y: 0, opacity: 1 } : {}}
        transition={{ delay: 0.35, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="px-5 mb-5"
      >
        <div className="rounded-lg border border-toss-gray-100 bg-paper p-5 shadow-soft">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[16px]">💬</span>
            <span className="t-caption font-bold text-toss-blue">오늘의 한마디</span>
          </div>
          <p className="font-bold leading-relaxed text-toss-gray-700 break-keep" style={{ fontSize: `${fontSize}px` }}>
            {result.content || '오늘 하루, 자신을 믿고 한 걸음씩 나아가 보세요. 작은 행동이 큰 변화를 만들어요.'}
          </p>
        </div>
      </motion.div>

      <div className="px-5 mb-4">
        <FontSizeControl value={fontSize} onChange={setFontSize} />
      </div>

      {/* ── 액션 버튼 ── */}
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={revealed ? { y: 0, opacity: 1 } : {}}
        transition={{ delay: 0.45, duration: 0.5 }}
        className="px-5 flex flex-col gap-3"
      >
        <div className="rounded-md border border-toss-gray-100 bg-paper px-4 py-3 text-center shadow-soft">
          <p className="t-caption font-bold text-toss-gray-500">✓ 보관함에 저장했어요</p>
        </div>

        {!IS_PUBLIC_BROWSER && <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            const title = shareInfo?.title || `[오늘의 운세] ${selectionSummary} 결과`;
            const description = shareInfo?.description || `"${result.content}"`;
            onShare(1, `${title}\n${description}`);
          }}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-md border-2 border-ink-deep bg-toss-blue text-[16px] font-bold text-white shadow-hard active:translate-x-1 active:translate-y-1 active:shadow-none"
        >
          <Share2 size={18} />
          공유하고 이용권 받기
          <span className="t-micro rounded-sm border border-white/40 bg-white/20 px-2 py-0.5">+1장</span>
        </motion.button>}

        <button
          type="button"
          onClick={onRetry}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-md border-2 border-ink bg-cream text-[16px] font-bold text-toss-gray-900 shadow-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        >
          <RotateCcw size={18} />
          {IS_PUBLIC_BROWSER ? '무료로 다시 뽑기' : '다시 뽑기 · 이용권 1장'}
        </button>

        <div className="flex gap-2.5">
          <button
            onClick={onBack}
            className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-md text-[14px] font-bold text-toss-gray-500 transition-colors active:bg-toss-gray-50"
          >
            <Home size={16} />
            홈으로
          </button>
        </div>
      </motion.div>
      </motion.div>
    </RevealFX>
  );
});

FortuneResultView.displayName = 'FortuneResultView';
