import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, Sparkles, Lock } from 'lucide-react';
import { apiUrl } from '../../../shared/api/client';

interface SpellData {
  spell: string;
  description: string;
  expiresAt: number;
}

interface SpellCardProps {
  isLoggedIn: boolean;
  userKey?: string;
  drawCount: number;
  onTicketUpdate: (tickets: number | ((prev: number) => number)) => void;
  hasViewedFortuneToday: boolean;
  onGoToFortune: () => void;
  // 유저 프로필 (선택, AI 맥락용)
  gender?: string | null;
  birthday?: string | null;
  ageGroup?: number | null;
  // bootstrap에서 이미 받은 spell
  bootstrapSpell?: SpellData | null;
}

function getDateString() {
  return new Date().toISOString().slice(0, 10);
}

function getCountdown(expiresAt?: number): string {
  const target = expiresAt
    ? new Date(expiresAt)
    : (() => {
        const now = new Date();
        const next = new Date(now);
        next.setDate(next.getDate() + (now.getHours() >= 6 ? 1 : 0));
        next.setHours(6, 0, 0, 0);
        return next;
      })();
  const diff = Math.max(0, target.getTime() - Date.now());
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}시간 ${m}분`;
}

export const SpellCard = ({
  isLoggedIn, userKey, drawCount, onTicketUpdate,
  hasViewedFortuneToday, onGoToFortune,
  gender, birthday, ageGroup,
  bootstrapSpell,
}: SpellCardProps) => {
  const [spell, setSpell] = useState<SpellData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // bootstrap spell 또는 sessionStorage 캐시에서 복원
  useEffect(() => {
    if (spell) return; // 이미 세팅됨
    // bootstrap에서 받은 spell 우선
    if (bootstrapSpell?.spell) {
      setSpell(bootstrapSpell);
      if (userKey) {
        sessionStorage.setItem(`spell_today_${getDateString()}_${userKey}`, JSON.stringify(bootstrapSpell));
      }
      return;
    }
    // sessionStorage 캐시 확인
    if (!userKey) return;
    const cached = sessionStorage.getItem(`spell_today_${getDateString()}_${userKey}`);
    if (cached) {
      try { setSpell(JSON.parse(cached) as SpellData); } catch { /* invalid */ }
    }
  }, [isLoggedIn, userKey, bootstrapSpell, spell]);

  // 카운트다운 업데이트
  useEffect(() => {
    const update = () => setCountdown(getCountdown(spell?.expiresAt));
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [spell?.expiresAt]);

  const handleUnlock = useCallback(async () => {
    if (!isLoggedIn || !userKey || loading || spell) return;
    // 클라이언트 사전 체크 (UX용, 서버가 최종 결정)
    if (!hasViewedFortuneToday) { setErrorMsg('먼저 운세를 봐야 좋은 말을 받을 수 있어요'); return; }
    if (drawCount < 1) { setErrorMsg('이용권이 없어요'); return; }

    setLoading(true);
    setErrorMsg(null);

    try {
      const body: Record<string, unknown> = {};
      if (gender) body.gender = gender;
      if (birthday) body.birthday = birthday;
      if (ageGroup) body.ageGroup = ageGroup;

      const res = await fetch(apiUrl('/spell/today'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-key': userKey },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (json.resultType === 'SUCCESS' && json.data?.spell) {
        const data: SpellData = {
          spell: json.data.spell,
          description: json.data.description ?? '',
          expiresAt: json.data.expiresAt ?? 0,
        };
        setSpell(data);
        sessionStorage.setItem(`spell_today_${getDateString()}_${userKey}`, JSON.stringify(data));
        setShowSheet(true);

        // 서버 응답에서 티켓 절대 동기화
        if (typeof json.data.tickets === 'number') {
          onTicketUpdate(json.data.tickets);
        }
      } else {
        // 에러 코드 분기
        const code = json.error?.code;
        if (code === 'FORTUNE_REQUIRED') {
          setErrorMsg('먼저 운세를 봐야 좋은 말을 받을 수 있어요');
        } else if (code === 'INSUFFICIENT_TICKETS') {
          setErrorMsg('이용권이 부족해요');
          onTicketUpdate(0);
        } else {
          setErrorMsg(json.error?.message ?? '오류가 발생했어요');
        }
      }
    } catch {
      setErrorMsg('네트워크 오류가 발생했어요');
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, userKey, hasViewedFortuneToday, drawCount, loading, spell, gender, birthday, ageGroup, onTicketUpdate]);

  const handleCopy = useCallback(async () => {
    if (!spell) return;
    try {
      await navigator.clipboard.writeText(spell.spell);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [spell]);

  const spellLines = spell?.spell.split('\n').filter(Boolean) ?? [];
  const isUnlocked = !!spell;

  // UI 블락 조건
  const blockReason = !isLoggedIn
    ? { msg: '로그인하면 오늘의 좋은 말을 받아요', action: null }
    : !hasViewedFortuneToday
    ? { msg: '먼저 운세를 봐야 좋은 말을 받을 수 있어요', action: { label: '운세 보러 가기', fn: onGoToFortune } }
    : drawCount < 1
    ? { msg: '이용권이 없어요 · 홈에서 받을 수 있어요', action: null }
    : null;

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={() => {
          if (isUnlocked) { setShowSheet(true); return; }
          if (blockReason?.action) { blockReason.action.fn(); return; }
          if (!blockReason) { void handleUnlock(); }
        }}
        className="relative flex w-full flex-col overflow-hidden rounded-[24px] border border-indigo-100/80 bg-[linear-gradient(135deg,rgba(15,10,40,0.97),rgba(30,15,80,0.97)_58%,rgba(20,10,60,0.97))] px-4 py-4 text-left shadow-[0_6px_18px_rgba(15,23,42,0.12)] group"
      >
        {[...Array(6)].map((_, i) => (
          <div key={i} className="absolute rounded-full bg-white pointer-events-none"
            style={{ width: i % 2 === 0 ? 2 : 1, height: i % 2 === 0 ? 2 : 1,
              opacity: 0.08 + (i % 3) * 0.04,
              left: `${(i * 37 + 5) % 88}%`, top: `${(i * 53 + 8) % 70}%` }} />
        ))}

        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-[14px]">✨</span>
          <span className="t-micro font-black tracking-[0.18em] text-violet-300/60">오늘의 좋은 말</span>
          {!isUnlocked && (
            <span className="t-micro ml-auto flex items-center gap-1 font-black text-white/30">
              <Lock size={9} />
              이용권 1장
            </span>
          )}
        </div>

        {!isUnlocked ? (
          blockReason ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-bold text-white/50">{blockReason.msg}</p>
              {blockReason.action && (
                <button
                  onClick={(e) => { e.stopPropagation(); blockReason.action!.fn(); }}
                  className="self-start px-3 py-1.5 rounded-xl bg-violet-500/20 border border-violet-400/30 text-[12px] font-black text-violet-300"
                >
                  {blockReason.action.label}
                </button>
              )}
            </div>
          ) : loading ? (
            <div className="flex flex-col gap-1.5">
              {[3, 2, 2.5].map((w, i) => (
                <div key={i} className="h-3 rounded animate-pulse bg-white/10" style={{ width: `${w * 25}%` }} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-[14px] font-bold text-white/60">오늘의 좋은 말을 받아봐요</p>
              <p className="text-[12px] text-white/30">눌러서 이용권 1장으로 열어보세요</p>
              {errorMsg && <p className="text-[11px] text-red-400 mt-1">{errorMsg}</p>}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-0.5">
            {spellLines.slice(0, 3).map((line, i) => (
              <p key={i} className="text-[14px] font-bold text-white/90 leading-snug italic">{line}</p>
            ))}
          </div>
        )}

        <div className="mt-2.5 flex items-center justify-between">
          <span className="t-micro font-bold text-white/30">{countdown} 후 새 좋은 말</span>
          {isUnlocked && (
            <span className="t-micro flex items-center gap-1 font-black text-violet-300/60">
              <Sparkles size={9} /> 눌러서 전체 보기
            </span>
          )}
        </div>
      </motion.button>

      <AnimatePresence>
        {showSheet && spell && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowSheet(false)}
              className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 350 }}
              className="fixed bottom-0 inset-x-0 z-50 bg-gradient-to-b from-[#0f0a28] to-[#1a0f50] rounded-t-[32px] px-6 pt-5 pb-10 shadow-2xl"
            >
              <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />

              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="t-micro font-black tracking-[0.2em] text-violet-300/50">오늘의 좋은 말</p>
                  <p className="text-[18px] font-black text-white mt-0.5">오늘의 좋은 말</p>
                </div>
                <button
                  type="button"
                  aria-label="닫기"
                  onClick={() => setShowSheet(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-md bg-white/10 text-white/50"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-4 mb-4">
                {spellLines.map((line, i) => (
                  <p key={i} className="text-[16px] font-bold text-white/90 leading-relaxed italic">{line}</p>
                ))}
              </div>

              {spell.description && (
                <p className="text-[13px] font-medium text-violet-200/70 leading-relaxed mb-5">{spell.description}</p>
              )}

              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] text-white/30">{countdown} 후 새 좋은 말로 바뀌어요</span>
              </div>

              <button
                onClick={handleCopy}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-[16px] bg-violet-500/20 border border-violet-400/30 text-[15px] font-black text-violet-200 transition-colors hover:bg-violet-500/30"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? '좋은 말이 복사됐어요' : '좋은 말 복사하기'}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
