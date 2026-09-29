import { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, GraduationCap, Heart, Coins, Activity, ArrowRight } from 'lucide-react';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { SpellCard } from './SpellCard';
import { PromotedBanner } from '../../../shared/components/PromotedBanner';
import { apiUrl } from '../../../shared/api/client';
import { fadeUp, staggerList } from '../../../shared/motion';

// ── 부적 카테고리 ────────────────────────────────────────────

const CATEGORIES = [
  { key: 'ward',   label: '나쁜 기운 막기', icon: Shield,        color: '#6366F1', bg: '#EEF2FF' },
  { key: 'exam',   label: '합격 기원', icon: GraduationCap, color: '#F59E0B', bg: '#FFFBEB' },
  { key: 'love',   label: '사랑 성취', icon: Heart,         color: '#EC4899', bg: '#FDF2F8' },
  { key: 'wealth', label: '재물 운',   icon: Coins,         color: '#10B981', bg: '#ECFDF5' },
  { key: 'health', label: '건강 지키기', icon: Activity,      color: '#EF4444', bg: '#FEF2F2' },
] as const;

interface TalismanData {
  title: string;
  lines: string[];
  frameId: number;
  category: string;
}

// ── 부적 프레임 색상 (frameId별) ────────────────────────────

function frameGradient(category: string): string {
  switch (category) {
    case 'ward':   return 'from-indigo-900 via-indigo-800 to-slate-900';
    case 'exam':   return 'from-amber-900 via-amber-800 to-yellow-900';
    case 'love':   return 'from-pink-900 via-rose-800 to-red-900';
    case 'wealth': return 'from-emerald-900 via-green-800 to-teal-900';
    case 'health': return 'from-red-900 via-rose-800 to-slate-900';
    default:       return 'from-slate-900 via-slate-800 to-gray-900';
  }
}

// ── 애니메이션 ────────────────────────────────────────────────

const stagger = staggerList(0.08);

// ── Props ─────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  userKey?: string;
  isLoggedIn: boolean;
  drawCount: number;
  onTicketUpdate: (tickets: number | ((prev: number) => number)) => void;
  hasViewedFortuneToday: boolean;
  onGoToFortune: () => void;
  gender?: string | null;
  birthday?: string | null;
  ageGroup?: number | null;
  bootstrapSpell?: { spell: string; description: string; expiresAt: number } | null;
}

export const TalismanPage = memo(({
  onBack, userKey, isLoggedIn, drawCount, onTicketUpdate,
  hasViewedFortuneToday, onGoToFortune,
  gender, birthday, ageGroup, bootstrapSpell,
}: Props) => {
  useAppNavigationBar({ title: '부적', showBack: true, onBackPress: onBack });

  const [talisman, setTalisman] = useState<TalismanData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 부적 sessionStorage 캐시 (카테고리별 하루 1회)
  const getCacheKey = (cat: string) => {
    const date = new Date().toISOString().slice(0, 10);
    return `talisman_${cat}_${date}_${userKey}`;
  };

  const handleCategory = useCallback(async (category: string) => {
    if (!userKey || loading) return;

    // 캐시 확인
    const cacheKey = getCacheKey(category);
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        setTalisman(JSON.parse(cached) as TalismanData);
        setShowResult(true);
        return;
      } catch { /* re-fetch */ }
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch(apiUrl('/talisman/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-key': userKey },
        body: JSON.stringify({ category }),
      });

      const json = await res.json();

      if (json.resultType === 'SUCCESS' && json.data) {
        const data: TalismanData = {
          title: json.data.title,
          lines: json.data.lines ?? [],
          frameId: json.data.frameId ?? 1,
          category,
        };
        setTalisman(data);
        setShowResult(true);
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
      } else {
        const code = json.error?.code;
        if (code === 'INVALID_CATEGORY') setErrorMsg('잘못된 종류예요');
        else setErrorMsg(json.error?.message ?? '오류가 발생했어요');
      }
    } catch {
      setErrorMsg('네트워크 오류가 발생했어요');
    } finally {
      setLoading(false);
    }
  }, [userKey, loading]);

  return (
    <motion.div
      variants={stagger} initial="hidden" animate="show"
      className="-mx-5 -mt-10 flex flex-col min-h-[100dvh] bg-[#f8f9fa] pt-14 px-5 pb-28"
    >
      {/* ── 오늘의 주문 (SpellCard) ── */}
      <motion.section variants={fadeUp} className="mb-5">
        <p className="text-[11px] font-black text-slate-400 tracking-[0.15em] mb-2 px-1">오늘의 좋은 말</p>
        <SpellCard
          isLoggedIn={isLoggedIn}
          userKey={userKey}
          drawCount={drawCount}
          onTicketUpdate={onTicketUpdate}
          hasViewedFortuneToday={hasViewedFortuneToday}
          onGoToFortune={onGoToFortune}
          gender={gender}
          birthday={birthday}
          ageGroup={ageGroup}
          bootstrapSpell={bootstrapSpell}
        />
      </motion.section>

      {/* ── 부적 카테고리 선택 ── */}
      <motion.section variants={fadeUp}>
        <div className="flex items-center justify-between mb-3 px-1">
          <div>
            <h2 className="text-[18px] font-extrabold text-slate-900">오늘의 부적</h2>
            <p className="text-[12px] font-bold text-slate-400 mt-0.5">원하는 종류를 골라 부적을 받아보세요</p>
          </div>
          <span className="text-[11px] font-black text-emerald-500 bg-emerald-50 px-2.5 py-1 rounded-full">무료</span>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {CATEGORIES.map(({ key, label, icon: Icon, color, bg }) => (
            <motion.button
              key={key}
              whileTap={{ scale: 0.97 }}
              onClick={() => void handleCategory(key)}
              disabled={loading || !isLoggedIn}
              className="w-full flex items-center gap-3.5 rounded-[20px] border border-slate-100 bg-white p-4 text-left shadow-sm transition-all group active:bg-slate-50 disabled:opacity-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110"
                style={{ backgroundColor: bg }}>
                <Icon size={20} style={{ color }} />
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-black text-slate-800">{label}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center">
                <ArrowRight size={16} className="text-slate-300" strokeWidth={3} />
              </div>
            </motion.button>
          ))}
        </div>

        {errorMsg && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-[13px] font-bold text-red-400 mt-3 text-center">{errorMsg}</motion.p>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 mt-4 text-slate-400">
            <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            <span className="text-[13px] font-bold">부적을 준비하고 있어요...</span>
          </div>
        )}
      </motion.section>

      {/* ── 광고 ── */}
      <motion.div variants={fadeUp} className="mt-5">
        <PromotedBanner variant="card" className="opacity-70" />
      </motion.div>

      {/* ── 부적 결과 바텀시트 ── */}
      <AnimatePresence>
        {showResult && talisman && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowResult(false)}
              className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 350 }}
              className="fixed bottom-0 inset-x-0 z-50 rounded-t-[32px] px-6 pt-6 pb-10 shadow-2xl"
              style={{ background: '#0f0a28' }}
            >
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-6" />

              {/* 부적 카드 */}
              <div className={`relative rounded-[24px] bg-gradient-to-br ${frameGradient(talisman.category)} border border-white/10 p-6 mb-5 overflow-hidden`}>
                {/* 장식 */}
                <div className="absolute top-3 left-3 w-8 h-8 border border-white/10 rounded-sm rotate-45 pointer-events-none" />
                <div className="absolute bottom-3 right-3 w-8 h-8 border border-white/10 rounded-sm rotate-45 pointer-events-none" />

                <div className="text-center relative z-10">
                  <p className="text-[11px] font-black text-white/40 tracking-[0.3em] uppercase mb-3">
                    {CATEGORIES.find(c => c.key === talisman.category)?.label ?? '부적'}
                  </p>
                  <h3 className="text-[24px] font-black text-white mb-4 tracking-wide">{talisman.title}</h3>
                  <div className="space-y-1.5">
                    {talisman.lines.map((line, i) => (
                      <p key={i} className="text-[15px] font-bold text-white/80 leading-relaxed">{line}</p>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowResult(false)}
                  className="flex-1 py-3.5 rounded-[16px] bg-white/[0.06] border border-white/10 text-[14px] font-black text-white/60 hover:bg-white/[0.1] transition-colors"
                >
                  닫기
                </button>
                <button
                  onClick={async () => {
                    try {
                      const text = `${talisman.title}\n${talisman.lines.join('\n')}`;
                      await navigator.clipboard.writeText(text);
                    } catch { /* ignore */ }
                  }}
                  className="flex-1 py-3.5 rounded-[16px] bg-violet-500/20 border border-violet-400/30 text-[14px] font-black text-violet-200 hover:bg-violet-500/30 transition-colors"
                >
                  복사하기
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

TalismanPage.displayName = 'TalismanPage';
