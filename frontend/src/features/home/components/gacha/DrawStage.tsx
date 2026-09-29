import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Ticket } from 'lucide-react';
import { Card, Skeleton } from '../../../../shared/components/ui';
import { REVEAL, SPRING } from '../../../../shared/motion';
import { haptic } from '../../../../shared/utils/haptics';

type DrawMode = 'fortune' | 'quote';

interface DrawStageProps {
  mode: DrawMode;
  personaName?: string;
  personaIcon?: ReactNode;
  onExitConfirm?: () => void;
  onSkip?: () => void;
}

const josa = (name: string) => {
  const last = name.charCodeAt(name.length - 1);
  const isHangul = last >= 0xac00 && last <= 0xd7a3;
  return isHangul && (last - 0xac00) % 28 > 0 ? '이' : '가';
};

const getMessages = (mode: DrawMode, personaName?: string) => {
  if (mode === 'fortune') {
    return [
      '별자리를 확인하고 있어요',
      '오늘의 기운을 읽고 있어요',
      '분야별 점수를 정리하고 있어요',
      '조금만 더 정성 들여 만들고 있어요',
    ];
  }

  const speaker = personaName ? `${personaName}${josa(personaName)}` : '상담가가';
  return [
    `${speaker} 고민을 읽고 있어요`,
    '꼭 맞는 조언을 고르고 있어요',
    '마음을 담아 정리하고 있어요',
  ];
};

const getTitle = (mode: DrawMode, personaName?: string) => {
  if (mode === 'fortune') return '오늘의 운세를 만들고 있어요';
  return `${personaName ? `${personaName}${josa(personaName)} ` : ''}조언을 준비하고 있어요`;
};

export function DrawStage({ mode, personaName, personaIcon, onExitConfirm, onSkip }: DrawStageProps) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<'drop' | 'wait'>(reduceMotion ? 'wait' : 'drop');
  const [messageIndex, setMessageIndex] = useState(0);
  const messages = useMemo(() => getMessages(mode, personaName), [mode, personaName]);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setTimeout(() => {
      setPhase('wait');
      haptic('tickWeak');
    }, REVEAL.dropMs);
    return () => window.clearTimeout(timer);
  }, [reduceMotion]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, REVEAL.messageMs);
    return () => window.clearInterval(timer);
  }, [messages.length]);

  const handleSkip = () => {
    if (phase !== 'drop') return;
    setPhase('wait');
    haptic('tickWeak');
    onSkip?.();
  };

  return (
    <div
      className="-mx-5 -mt-10 flex min-h-[100dvh] flex-col bg-cream px-5 pt-14 pb-12 surface-play"
      onClick={handleSkip}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-1 flex-col items-center justify-center">
        <Card surface="play" className="w-full max-w-md p-6 text-center">
          <div className="relative mx-auto mb-6 flex h-44 w-44 items-center justify-center">
            {!reduceMotion && (
              <motion.div
                className="absolute inset-6 rounded-full bg-toss-blue/10 blur-2xl"
                animate={{ scale: phase === 'drop' ? [1, 1.08, 1] : [1, 1.14, 1], opacity: [0.25, 0.42, 0.25] }}
                transition={{ duration: phase === 'drop' ? 0.9 : 2.2, repeat: Infinity }}
              />
            )}
            <motion.div
              initial={reduceMotion ? false : { y: -120, rotate: -18, scale: 0.9 }}
              animate={phase === 'drop'
                ? { y: 0, rotate: [0, -5, 4, 0], scale: [1, 1.05, 0.98, 1] }
                : reduceMotion
                  ? { y: 0 }
                  : { y: [0, -8, 0], rotate: [0, 2, 0] }}
              transition={phase === 'drop'
                ? { ...SPRING.bouncy, duration: REVEAL.dropMs / 1000 }
                : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              className="relative z-10 flex h-32 w-32 items-center justify-center rounded-lg border-2 border-ink bg-paper shadow-hard"
            >
              <div className="absolute inset-x-4 top-5 h-2 rounded-full bg-white/70" aria-hidden="true" />
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border-2 border-ink-soft bg-cream text-4xl">
                {personaIcon || <Ticket size={34} className="text-toss-blue" strokeWidth={2.6} />}
              </div>
            </motion.div>
          </div>

          <h2 className="t-title text-toss-gray-900 break-keep">{getTitle(mode, personaName)}</h2>
          <AnimatePresence mode="wait">
            <motion.p
              key={messages[messageIndex]}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="t-body mt-3 min-h-6 text-toss-gray-600 break-keep"
            >
              {messages[messageIndex]}
            </motion.p>
          </AnimatePresence>

          {reduceMotion ? (
            <div className="mt-6 space-y-2">
              <Skeleton className="mx-auto h-3 w-36" />
              <Skeleton className="mx-auto h-3 w-24" />
            </div>
          ) : (
            <div className="mt-6 flex justify-center gap-2">
              {[0, 1, 2, 3].map((item) => (
                <motion.span
                  key={item}
                  className="h-2 w-8 rounded-full bg-toss-blue"
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: item * 0.16 }}
                />
              ))}
            </div>
          )}

          {phase === 'drop' && !reduceMotion && (
            <p className="t-caption mt-5 text-toss-gray-400">탭해서 빠르게 보기</p>
          )}
        </Card>

        {onExitConfirm && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onExitConfirm();
            }}
            className="t-caption mt-5 min-h-11 px-4 text-toss-gray-500"
          >
            나가기
          </button>
        )}
      </div>
    </div>
  );
}
