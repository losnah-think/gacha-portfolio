import { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { apiUrl } from '../../../shared/api/client';
import { REWARD_POINT_LIMITS, clampRewardPoints } from '../../../shared/constants/rewardEconomy';

/* ── 타입 ─────────────────────────────────────────────────────────────── */

interface IdiomChoice {
  id: string;
  text: string;
}

interface IdiomQuestion {
  id: string;
  type: 'idiom' | 'proverb' | string;
  question: string;
  hint?: string;
  choices: IdiomChoice[];
}

interface IdiomSubmitResultItem {
  questionId: string;
  correct: boolean;
  correctId: string;
  term: string;
  question: string;
  explanation?: string;
  selectedId: string;
}

interface IdiomSubmitResult {
  totalQuestions: number;
  correctCount: number;
  pointsAwarded: number;
  totalPoints?: number;
  results: IdiomSubmitResultItem[];
}

interface IdiomQuizPageProps {
  onBack: () => void;
  drawCount: number;
  userKey: string;
  onTicketUse?: (remainingTickets?: number) => void;
  onQuizReward?: (pointsAwarded: number, totalPoints?: number) => void;
}

/* ── 헬퍼 ─────────────────────────────────────────────────────────────── */

const TOTAL = 5;

const typeLabel = (type: string) =>
  type === 'proverb' ? '속담' : '사자성어';

/* ── 컴포넌트 ─────────────────────────────────────────────────────────── */

export const IdiomQuizPage = memo(({
  onBack,
  drawCount,
  userKey,
  onTicketUse,
  onQuizReward,
}: IdiomQuizPageProps) => {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'playing' | 'submitting' | 'result'>('idle');
  const [sessionId, setSessionId] = useState('');
  const [questions, setQuestions] = useState<IdiomQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({}); // { questionId: selectedId }
  const [result, setResult] = useState<IdiomSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const isInGame = phase === 'playing' || phase === 'submitting';

  const handleBackPress = useCallback(() => {
    if (isInGame) {
      setShowExitConfirm(true);
    } else {
      onBack();
    }
  }, [isInGame, onBack]);

  useAppNavigationBar({ title: '사자성어/속담 문제', onBackPress: handleBackPress });

  const currentQ = questions[currentIndex] as IdiomQuestion | undefined;
  const selectedId = currentQ ? (answers[currentQ.id] ?? null) : null;

  /* ── API: 세션 시작 ─────────────────────────────────── */
  const startQuiz = useCallback(async () => {
    if (drawCount < 1) return;
    setPhase('loading');
    setError(null);
    setTicketError(false);
    try {
      const res = await fetch(apiUrl('/idiom-quiz/start'), {
        method: 'POST',
        headers: { 'x-user-key': userKey },
      });
      if (!res.ok && res.headers.get('content-type')?.includes('text/html')) {
        throw new Error(`서버 오류 (${res.status})`);
      }
      const json = await res.json();
      if (json.resultType === 'FAIL') {
        if (json.error?.code === 'INSUFFICIENT_TICKETS') {
          setTicketError(true);
          setPhase('idle');
          return;
        }
        throw new Error(json.error?.message || '시작에 실패했어요');
      }
      const data = json.data;
      setSessionId(data.sessionId);
      setQuestions(data.questions ?? []);
      setCurrentIndex(0);
      setAnswers({});
      setResult(null);
      onTicketUse?.(data.remainingTickets);
      setPhase('playing');
    } catch (e) {
      setError(e instanceof Error ? e.message : '문제를 불러오지 못했어요');
      setPhase('idle');
    }
  }, [drawCount, userKey, onTicketUse]);

  /* ── API: 결과 제출 ─────────────────────────────────── */
  const submitQuiz = useCallback(async (finalAnswers: Record<string, string>) => {
    setPhase('submitting');
    setError(null);
    try {
      const payload = {
        sessionId,
        answers: questions.map(q => ({
          questionId: q.id,
          selectedId: finalAnswers[q.id] ?? '',
        })),
      };
      const res = await fetch(apiUrl('/idiom-quiz/submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-key': userKey },
        body: JSON.stringify(payload),
      });
      if (!res.ok && res.headers.get('content-type')?.includes('text/html')) {
        throw new Error(`서버 오류 (${res.status})`);
      }
      const json = await res.json();
      if (json.resultType === 'FAIL') {
        const code = json.error?.code;
        if (code === 'INVALID_SESSION') {
          setError('시간이 지나 다시 시작해 주세요.');
          setPhase('idle');
          return;
        }
        if (code === 'ALREADY_SUBMITTED') {
          setError('이미 제출된 문제예요.');
          setPhase('idle');
          return;
        }
        throw new Error(json.error?.message || '제출에 실패했어요');
      }
      const rawData: IdiomSubmitResult = json.data;
      const data: IdiomSubmitResult = {
        ...rawData,
        correctCount: clampRewardPoints(rawData.correctCount, TOTAL),
        pointsAwarded: clampRewardPoints(rawData.pointsAwarded, REWARD_POINT_LIMITS.idiomQuiz),
      };
      setResult(data);
      onQuizReward?.(data.pointsAwarded, data.totalPoints);
      setPhase('result');
    } catch (e) {
      setError(e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
      setPhase('playing');
    }
  }, [sessionId, questions, userKey, onQuizReward]);

  /* ── 보기 선택 ─────────────────────────────────────── */
  const handleSelect = useCallback((choiceId: string) => {
    if (!currentQ) return;
    setAnswers(prev => ({ ...prev, [currentQ.id]: choiceId }));
  }, [currentQ]);

  /* ── 다음 / 결과 제출 ───────────────────────────────── */
  const handleNext = useCallback(() => {
    if (!currentQ) return;
    if (currentIndex < TOTAL - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      void submitQuiz(answers);
    }
  }, [currentQ, currentIndex, answers, submitQuiz]);

  /* ── 이전 문제로 ────────────────────────────────────── */
  const handlePrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  }, [currentIndex]);

  const progressPct = phase === 'playing' ? ((currentIndex + 1) / TOTAL) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="-mx-5 -mt-10 flex min-h-[100dvh] flex-col bg-cream pt-14 pb-20 surface-play"
    >
      <AnimatePresence mode="wait">

        {/* ━━━━ IDLE / LOADING: 시작 화면 ━━━━ */}
        {(phase === 'idle' || phase === 'loading') && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="flex-1 flex flex-col px-5"
          >
            <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
              {/* 아이콘 */}
              <div className="w-20 h-20 rounded-[28px] bg-amber-50 flex items-center justify-center text-[40px] shadow-sm border border-amber-100">
                📖
              </div>

              <div>
                <h1 className="text-[24px] font-black text-slate-900 leading-tight">사자성어/속담 문제</h1>
                <p className="text-[14px] font-bold text-slate-400 mt-2">뜻풀이를 보고 알맞은 표현을 골라요</p>
              </div>

              <div className="w-full max-w-xs space-y-3">
                <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white border border-slate-100">
                  <span className="text-[13px] font-bold text-slate-500">참가 비용</span>
                  <span className="text-[14px] font-black text-orange-500">이용권 1장</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white border border-slate-100">
                  <span className="text-[13px] font-bold text-slate-500">문제 수</span>
                  <span className="text-[14px] font-black text-slate-700">5문제 (보기 4개)</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white border border-slate-100">
                  <span className="text-[13px] font-bold text-slate-500">맞히면</span>
                  <span className="text-[14px] font-black text-amber-600">정답 1개당 2포인트</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white border border-slate-100">
                  <span className="text-[13px] font-bold text-slate-500">내 이용권</span>
                  <span className="text-[14px] font-black text-slate-700">{drawCount}장</span>
                </div>
              </div>

              {/* 중도 이탈 안내 */}
              <div className="w-full max-w-xs rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3 text-[12px] font-bold text-slate-400 text-center">
                ⚠️ 5문제를 모두 풀어야 점수를 받을 수 있어요.<br />중간에 나가면 포인트가 지급되지 않아요.
              </div>

              {/* 티켓 부족 안내 */}
              {ticketError && (
                <div className="w-full max-w-xs rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-[13px] font-bold text-red-500 text-center">
                  이용권이 부족해요. 홈에서 이용권을 받아주세요.
                </div>
              )}
            </div>

            <div className="mt-auto px-2 pb-6 space-y-3">
              {error && (
                <p className="text-[13px] font-bold text-red-500 text-center">{error}</p>
              )}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={startQuiz}
                disabled={drawCount < 1 || phase === 'loading'}
                className={`w-full py-4 rounded-[20px] text-[16px] font-black transition-all ${
                  drawCount >= 1
                    ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25 active:bg-amber-600'
                    : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                }`}
              >
                {phase === 'loading' ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={18} className="animate-spin" />
                    문제 불러오는 중...
                  </span>
                ) : drawCount >= 1 ? '문제 시작하기' : '이용권이 부족해요'}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={onBack}
                className="w-full py-3.5 rounded-[20px] bg-slate-50 border border-slate-100 text-[15px] font-black text-slate-500"
              >
                돌아가기
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ━━━━ PLAYING: 문제 화면 ━━━━ */}
        {phase === 'playing' && currentQ && (
          <motion.div
            key={`q-${currentIndex}`}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="flex-1 flex flex-col px-5"
          >
            {/* 진행 인디케이터 */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex gap-1.5">
                  {Array.from({ length: TOTAL }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        i <= currentIndex ? 'bg-amber-500 w-6' : 'bg-slate-200 w-2'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[13px] font-bold text-slate-400">{currentIndex + 1} / {TOTAL}</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-amber-400"
                  initial={false}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            </div>

            {/* 문제 카드 */}
            <div className="w-full rounded-[28px] bg-white border border-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-6 mb-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[20px]">💡</span>
                <span className="text-[12px] font-black text-amber-600 tracking-wide">
                  이 {typeLabel(currentQ.type)}는 무엇일까요?
                </span>
              </div>
              <p className="text-[17px] font-bold text-slate-800 leading-relaxed break-keep">
                {currentQ.question}
              </p>
            </div>

            {/* 4지선다 */}
            <div className={`${currentQ.type === 'proverb' || currentQ.choices.some((choice) => choice.text.length > 6) ? 'grid grid-cols-1' : 'grid grid-cols-2'} gap-3 mb-5`}>
              {currentQ.choices.map((choice) => {
                const isSelected = selectedId === choice.id;
                return (
                  <motion.button
                    key={choice.id}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => handleSelect(choice.id)}
                    className={`py-4 px-3 rounded-[20px] text-[15px] font-black transition-all border-2 ${currentQ.type === 'proverb' || choice.text.length > 6 ? 'text-left' : 'text-center'} ${
                      isSelected
                        ? 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/20'
                        : 'bg-white text-slate-700 border-slate-100 active:bg-amber-50 active:border-amber-200'
                    }`}
                  >
                    {choice.text}
                  </motion.button>
                );
              })}
            </div>

            {/* 이전 / 다음 버튼 */}
            <div className="mt-auto pb-4 flex gap-3">
              {currentIndex > 0 && (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={handlePrev}
                  className="flex items-center justify-center gap-1 px-5 py-4 rounded-[20px] bg-slate-100 text-slate-500 text-[15px] font-black"
                >
                  <ChevronLeft size={18} />
                  이전
                </motion.button>
              )}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleNext}
                disabled={!selectedId}
                className={`flex-1 flex items-center justify-center gap-1 py-4 rounded-[20px] text-[16px] font-black transition-all ${
                  selectedId
                    ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25 active:bg-amber-600'
                    : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                }`}
              >
                {currentIndex < TOTAL - 1 ? (
                  <>다음 문제<ChevronRight size={18} /></>
                ) : (
                  '결과 보기'
                )}
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ━━━━ SUBMITTING: 채점 중 ━━━━ */}
        {phase === 'submitting' && (
          <motion.div
            key="submitting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center gap-6 px-5 text-center"
          >
            <Loader2 size={40} className="animate-spin text-amber-500" />
            <p className="text-[17px] font-black text-slate-700">결과를 채점 중이에요...</p>
          </motion.div>
        )}

        {/* ━━━━ RESULT: 결과 화면 ━━━━ */}
        {phase === 'result' && result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col px-5 pb-6"
          >
            {/* 헤더 */}
            <div className="flex flex-col items-center text-center pt-2 pb-6">
              <div className="text-[48px] mb-3">🎉</div>
              <h2 className="text-[26px] font-black text-slate-900">문제를 다 풀었어요!</h2>
              <p className="text-[15px] font-bold text-slate-400 mt-1">
                {result.totalQuestions}문제 중{' '}
                <span className="text-toss-blue">{result.correctCount}개</span> 정답
              </p>

              {/* 포인트 박스 */}
              <div className="mt-4 rounded-[24px] bg-amber-50 border border-amber-100 px-8 py-4">
                <p className="text-[13px] font-bold text-amber-600 mb-1">맞힌 문제 ({result.correctCount}개 × 2점)</p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-[34px] font-black text-amber-600 tabular-nums">
                    +{result.pointsAwarded}
                  </span>
                  <span className="text-[18px] font-black text-amber-700">점</span>
                </div>
              </div>
            </div>

            {/* 문제별 결과 리스트 */}
            <div className="space-y-3 flex-1">
              {result.results.map((item) => (
                <div
                  key={item.questionId}
                  className={`rounded-[20px] border p-4 ${
                    item.correct
                      ? 'bg-emerald-50 border-emerald-100'
                      : 'bg-red-50 border-red-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {item.correct ? (
                        <CheckCircle2 size={20} className="text-emerald-500" />
                      ) : (
                        <XCircle size={20} className="text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[15px] font-black leading-tight ${item.correct ? 'text-emerald-700' : 'text-red-600'}`}>
                        {item.term}
                        {item.correct && <span className="ml-2 text-[12px] font-bold text-emerald-500">(정답)</span>}
                      </p>
                      {!item.correct && (
                        <>
                          <p className="text-[12px] font-bold text-slate-500 mt-1">
                            내 답:{' '}
                            <span className="text-red-400">
                              {result.results.find(r => r.questionId === item.questionId)
                                ? (() => {
                                    const q = questions.find(q => q.id === item.questionId);
                                    const choice = q?.choices.find(c => c.id === item.selectedId);
                                    return choice?.text ?? item.selectedId;
                                  })()
                                : item.selectedId}
                            </span>
                            {' → '}정답:{' '}
                            <span className="text-emerald-600 font-black">{item.term}</span>
                          </p>
                          {item.explanation && (
                            <p className="text-[12px] font-medium text-slate-400 mt-1.5 leading-relaxed break-keep">
                              {item.explanation}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 버튼 */}
            <div className="mt-6 space-y-3">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={startQuiz}
                disabled={drawCount < 1}
                className={`w-full py-4 rounded-[20px] text-[16px] font-black transition-all ${
                  drawCount >= 1
                    ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25 active:bg-amber-600'
                    : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                }`}
              >
                {drawCount >= 1 ? '다시 하기 · 이용권 1장' : '이용권 부족'}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={onBack}
                className="w-full py-4 rounded-[20px] bg-slate-50 border border-slate-100 text-[15px] font-black text-slate-500"
              >
                홈으로
              </motion.button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* 중도 이탈 확인 모달 */}
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 pb-safe"
            onClick={() => setShowExitConfirm(false)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md mx-4 mb-4 rounded-[28px] bg-white p-6 shadow-xl"
            >
              <p className="text-[18px] font-black text-slate-900 text-center">문제를 그만 풀까요?</p>
              <p className="text-[14px] font-bold text-slate-400 text-center mt-2">
                지금 나가면 포인트가 지급되지 않아요.
              </p>
              <div className="mt-5 flex gap-3">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setShowExitConfirm(false)}
                  className="flex-1 py-4 rounded-[18px] bg-slate-100 text-[15px] font-black text-slate-600"
                >
                  계속 풀기
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={onBack}
                  className="flex-1 py-4 rounded-[18px] bg-red-50 text-[15px] font-black text-red-500"
                >
                  나가기
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

IdiomQuizPage.displayName = 'IdiomQuizPage';
