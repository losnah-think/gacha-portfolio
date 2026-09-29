import { useState, useRef, useCallback, memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Share2 } from 'lucide-react';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { PromotedBanner } from '../../../shared/components/PromotedBanner';
import { apiUrl } from '../../../shared/api/client';
import { normalizeRoulettePoints } from '../../../shared/constants/rewardEconomy';
import { share, getTossShareLink } from '@apps-in-toss/web-framework';

// ── 보상 설정 ────────────────────────────────────────────────────────────────

const REWARDS = [
  { label: '1점',  points: 1,  color: '#64748B' },
  { label: '2점',  points: 2,  color: '#2563EB' },
  { label: '3점',  points: 3,  color: '#7C3AED' },
  { label: '5점',  points: 5,  color: '#059669' },
  { label: '10점', points: 10, color: '#DC2626' },
];

const ODDS = [
  { label: '1점', prob: '50%', color: '#64748B' },
  { label: '2점', prob: '40%', color: '#2563EB' },
  { label: '3점', prob: '9%',  color: '#7C3AED' },
  { label: '5점', prob: '0.8%', color: '#059669' },
  { label: '10점', prob: '0.2%', color: '#DC2626' },
];

// ── SVG 헬퍼 ──────────────────────────────────────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function segmentPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s = polarToCartesian(cx, cy, r, startDeg);
  const e = polarToCartesian(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M${cx},${cy} L${s.x},${s.y} A${r},${r},0,${large},1,${e.x},${e.y} Z`;
}

function textPosition(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const mid = (startDeg + endDeg) / 2;
  const pos = polarToCartesian(cx, cy, r * 0.65, mid);
  return { x: pos.x, y: pos.y, rotate: mid };
}

// ── 휠 컴포넌트 ───────────────────────────────────────────────────────────

const Wheel = memo(({ rotation }: { rotation: number }) => {
  const SIZE = 280;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = SIZE / 2 - 6;
  const segAngle = 360 / REWARDS.length;

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10">
        <div className="w-0 h-0"
          style={{ borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '20px solid white', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
        />
      </div>
      <svg width={SIZE} height={SIZE} style={{ transform: `rotate(${rotation}deg)`, transition: 'none' }}>
        <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
        {REWARDS.map((rw, i) => {
          const startDeg = i * segAngle;
          const endDeg = (i + 1) * segAngle;
          const tp = textPosition(cx, cy, r, startDeg, endDeg);
          return (
            <g key={i}>
              <path d={segmentPath(cx, cy, r, startDeg, endDeg)} fill={rw.color} stroke="rgba(0,0,0,0.2)" strokeWidth="1" />
              <path d={segmentPath(cx, cy, r, startDeg, endDeg)} fill="rgba(255,255,255,0.08)" />
              <text x={tp.x} y={tp.y} textAnchor="middle" dominantBaseline="central"
                transform={`rotate(${tp.rotate}, ${tp.x}, ${tp.y})`}
                fill="white" fontSize={14} fontWeight="900"
                style={{ pointerEvents: 'none', userSelect: 'none', fontFamily: 'inherit' }}>
                {rw.label}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={18} fill="white" opacity={0.95} />
        <circle cx={cx} cy={cy} r={12} fill="#7C3AED" />
      </svg>
    </div>
  );
});
Wheel.displayName = 'Wheel';

// ── 확률 표시 뱃지 ────────────────────────────────────────────────────────

const OddsTable = ({ odds }: { odds: Array<{ label: string; prob: string; color: string }> }) => (
  <div className="flex gap-1.5 flex-wrap justify-center">
    {odds.map((o) => (
      <div key={o.label} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black"
        style={{ backgroundColor: o.color + '22', border: `1px solid ${o.color}44`, color: o.color }}>
        <span>{o.label}</span>
        <span className="opacity-60">{o.prob}</span>
      </div>
    ))}
  </div>
);

// ── 메인 페이지 ───────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  userKey?: string;
  drawCount: number;
  onTicketUpdate: (tickets: number | ((prev: number) => number)) => void;
  onPointsSync: (totalPoints: number, pointsAwarded?: number) => void;
  isLoggedIn?: boolean;
}

export const RoulettePage = memo(({ onBack, userKey, drawCount, onTicketUpdate, onPointsSync, isLoggedIn = false }: Props) => {
  useAppNavigationBar({ title: '돌림판', showBack: true, onBackPress: onBack });

  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<typeof REWARDS[0] | null>(null);
  const [aiComment, setAiComment] = useState<string | null>(null);
  const [isCommentLoading, setIsCommentLoading] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [bannerKey, setBannerKey] = useState(0);
  const [spinCount, setSpinCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [odds, setOdds] = useState(ODDS);

  const totalRotationRef = useRef(0);
  const rafRef = useRef(0);
  const rotationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl('/roulette/config'))
      .then((res) => res.ok ? res.json() : null)
      .then((json) => {
        const table = json?.data?.prizeTable;
        if (cancelled || !Array.isArray(table)) return;
        setOdds(table.map((entry: any, index: number) => ({
          label: `${entry.points ?? entry.label?.replace('P', '')}점`,
          prob: `${Number((entry.probability ?? 0) * 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`,
          color: REWARDS[index]?.color || '#64748B',
        })));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  // Phase1: 일정 속도 회전 (API 응답 대기)
  const startFreeSpinLoop = useCallback(() => {
    const speed = 6; // deg/frame
    const tick = () => {
      rotationRef.current += speed;
      setRotation(rotationRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Phase2: 타겟 세그먼트에 easeOut 착지
  const landOnSegment = useCallback((winnerIdx: number) => {
    cancelAnimationFrame(rafRef.current);

    const segAngle = 360 / REWARDS.length;
    const winnerMidDeg = winnerIdx * segAngle + segAngle / 2;
    const landAngle = 360 - winnerMidDeg;
    // 현재 각도에서 최소 3바퀴 + 타겟까지
    const base = rotationRef.current;
    const extraSpins = 360 * (3 + Math.floor(Math.random() * 2));
    const target = base + extraSpins + ((landAngle - (base % 360)) + 360) % 360;

    const from = base;
    const duration = 3500;
    const startTime = performance.now();
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = from + (target - from) * easeOut(progress);
      rotationRef.current = current;
      setRotation(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rotationRef.current = target;
        totalRotationRef.current = target;
        setRotation(target);

        const winner = REWARDS[winnerIdx];
        setResult(winner);
        setShowResult(true);
        setIsSpinning(false);
        setSpinCount(c => c + 1);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const handleSpin = useCallback(async () => {
    if (isSpinning || drawCount < 1 || !userKey) return;

    setIsSpinning(true);
    setShowResult(false);
    setResult(null);
    setAiComment(null);
    setErrorMsg(null);
    setBannerKey(k => k + 1);

    // Phase1: 즉시 회전 시작
    rotationRef.current = totalRotationRef.current;
    startFreeSpinLoop();

    try {
      // 서버가 최종 결과를 결정
      const res = await fetch(apiUrl('/roulette/spin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-key': userKey },
        body: '{}',
      });

      const json = await res.json();

      if (json.resultType === 'SUCCESS' && json.data) {
        const { pointsAwarded, totalPoints, tickets } = json.data as {
          pointsAwarded: number; totalPoints: number; tickets: number; rouletteCount?: number;
        };
        const safePointsAwarded = normalizeRoulettePoints(pointsAwarded);
        if (safePointsAwarded === null) {
          cancelAnimationFrame(rafRef.current);
          setIsSpinning(false);
          setErrorMsg('돌림판 결과값이 올바르지 않아요. 잠시 후 다시 시도해 주세요');
          return;
        }

        // 서버값 절대 동기화
        if (typeof tickets === 'number') onTicketUpdate(tickets);
        if (typeof totalPoints === 'number') onPointsSync(totalPoints, safePointsAwarded);

        // pointsAwarded → 세그먼트 인덱스 매핑
        const winnerIdx = REWARDS.findIndex(r => r.points === safePointsAwarded);
        landOnSegment(winnerIdx >= 0 ? winnerIdx : 0);

        // AI 코멘트 (fire-and-forget)
        setIsCommentLoading(true);
        fetch(apiUrl('/roulette/comment'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-key': userKey },
          body: JSON.stringify({ result: `${safePointsAwarded}P` }),
        }).then(r => r.ok ? r.json() : null)
          .then(j => { if (j?.resultType === 'SUCCESS' && j.data?.comment) setAiComment(j.data.comment); })
          .catch(() => {})
          .finally(() => setIsCommentLoading(false));

      } else {
        // 에러
        cancelAnimationFrame(rafRef.current);
        setIsSpinning(false);

        const code = json.error?.code;
        if (code === 'INSUFFICIENT_TICKETS') {
          setErrorMsg('이용권이 부족해요');
          onTicketUpdate(0);
        } else {
          setErrorMsg(json.error?.message ?? '오류가 발생했어요');
        }
      }
    } catch {
      cancelAnimationFrame(rafRef.current);
      setIsSpinning(false);
      setErrorMsg('네트워크 오류가 발생했어요');
    }
  }, [isSpinning, drawCount, userKey, startFreeSpinLoop, landOnSegment, onTicketUpdate, onPointsSync]);

  const handleShare = async () => {
    if (!result) return;
    try {
      const link = typeof getTossShareLink === 'function' ? await getTossShareLink('intoss://gacha') : '';
      const msg = `돌림판에서 ${result.label}을 받았어요!\n오늘의 이야기에서 도전해봐요!\n${link}`;
      if (typeof share === 'function') await share({ message: msg });
      else await navigator.clipboard.writeText(msg);
    } catch { /* ignore */ }
  };

  const noTicket = drawCount < 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="-mx-5 -mt-10 flex min-h-[100dvh] flex-col overflow-x-hidden bg-cream px-5 pt-14 pb-28 surface-play"
    >
      <div className="relative mb-5 pt-2">
        <p className="t-caption mb-1 font-bold text-toss-blue">돌림판</p>
        <h1 className="t-display text-toss-gray-900">포인트 돌림판</h1>
        <p className="t-body mt-0.5 text-toss-gray-600">이용권 1장으로 포인트를 받아요</p>
      </div>

      <div className="mb-5"><OddsTable odds={odds} /></div>

      <div className="relative flex flex-col items-center">
        <div className="relative mb-5">
          <Wheel rotation={rotation} />
        </div>

        <div className="flex items-center gap-1.5 mb-4">
          <span className="t-caption font-bold text-toss-gray-500">내 이용권</span>
          <span className={`t-body font-bold ${drawCount > 0 ? 'text-toss-blue' : 'text-danger'}`}>
            {drawCount}장
          </span>
        </div>

        {errorMsg && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="t-caption mb-3 font-bold text-danger">{errorMsg}</motion.p>
        )}

        {noTicket && !isLoggedIn ? (
          <div className="rounded-md border border-toss-gray-100 bg-paper px-6 py-3 text-center t-body font-bold text-toss-gray-500 shadow-soft">
            로그인 후 이용할 수 있어요
          </div>
        ) : noTicket ? (
          <div className="rounded-md border border-danger/10 bg-danger/5 px-6 py-3 text-center t-body font-bold text-danger">
            광고 보고 이용권 받기
          </div>
        ) : (
          <motion.button
            onClick={handleSpin}
            disabled={isSpinning}
            whileTap={{ scale: 0.96 }}
            className={`px-10 py-4 rounded-[20px] text-[16px] font-black transition-all shadow-lg ${
              !isSpinning
                ? 'bg-toss-blue text-white shadow-hard'
                : 'border border-toss-gray-100 bg-paper text-toss-gray-400'
            }`}
          >
            {isSpinning ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                돌아가는 중...
              </span>
            ) : '돌리기 (이용권 1장)'}
          </motion.button>
        )}
      </div>

      {spinCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="t-caption mt-5 text-center font-bold text-toss-gray-500"
        >
          이번에 {spinCount}번 돌렸어요
        </motion.div>
      )}

      <div className="mt-5">
        <PromotedBanner key={bannerKey} variant="card" className="opacity-60" />
      </div>

      <AnimatePresence>
        {showResult && result && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowResult(false)}
              className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="fixed inset-x-5 bottom-24 z-50 rounded-lg border border-toss-gray-100 bg-paper p-6 shadow-soft"
            >
              <div className="text-center mb-5">
                <p className="t-caption mb-2 font-bold text-toss-blue">받은 포인트</p>
                <motion.p
                  initial={{ scale: 0.5 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 400, delay: 0.1 }}
                  className="mb-1 text-[48px] font-black leading-none text-toss-gray-900"
                  style={{ color: result.color }}
                >
                  {result.label}
                </motion.p>
                <p className="t-body font-bold text-toss-gray-600">포인트가 적립됐어요</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  {['🎉', '✨', '🎊'].map((e, i) => (
                    <motion.span key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.08 }} className="text-[18px]">{e}</motion.span>
                  ))}
                </div>
              </div>

              <div className="mb-4 flex min-h-[56px] items-center rounded-md border border-toss-gray-100 bg-toss-gray-50 p-3.5">
                {isCommentLoading ? (
                  <div className="flex items-center gap-2 text-toss-gray-400">
                    <span className="w-3 h-3 border border-toss-gray-200 border-t-toss-blue rounded-full animate-spin" />
                    <span className="t-caption">한마디 준비 중...</span>
                  </div>
                ) : aiComment ? (
                  <p className="t-caption text-toss-gray-700">{aiComment}</p>
                ) : (
                  <p className="t-caption text-toss-gray-500">결과를 즐겨봐요!</p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setShowResult(false); void handleSpin(); }}
                  disabled={isSpinning || drawCount < 1}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md border-2 border-ink bg-cream py-3 text-[14px] font-black text-toss-gray-900 shadow-hard-sm transition-colors disabled:opacity-30"
                >
                  <RotateCcw size={14} />
                  다시
                </button>
                <button
                  onClick={handleShare}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md border-2 border-ink-deep bg-toss-blue py-3 text-[14px] font-black text-white shadow-hard transition-colors"
                >
                  <Share2 size={14} />
                  공유
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

RoulettePage.displayName = 'RoulettePage';
