import { useState, useCallback, memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Circle, X, Trophy, Frown, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { BannerAdSlot } from '../../../shared/components/BannerAdSlot';
import { BANNER_AD_PERSONA_ID } from '../../../shared/constants/app';
import { REWARD_POINT_LIMITS, clampRewardPoints } from '../../../shared/constants/rewardEconomy';
import { logClick } from '../../../utils/analytics';
import { apiUrl } from '../../../shared/api/client';

/* ── 퀴즈 아이템 타입 ── */
interface QuizItem {
    id: string;
    question: string;
    answer?: boolean; // true = O, false = X
}

interface QuizAnswerItem {
    id: string;
    answer: boolean;
}

const getPayload = (json: any) => json?.data ?? json?.success ?? json ?? {};

const getQuestionList = (payload: any): any[] => {
    if (Array.isArray(payload?.questions)) return payload.questions;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.quizQuestions)) return payload.quizQuestions;
    return [];
};

interface RewardQuizPageProps {
    onBack: () => void;
    drawCount: number;
    userKey: string;
    onTicketUse?: (remainingTickets?: number) => void;
    onQuizReward?: (pointsAwarded: number, totalPoints?: number) => void;
}

export const RewardQuizPage = memo(({ onBack, drawCount, userKey, onTicketUse, onQuizReward }: RewardQuizPageProps) => {
    useAppNavigationBar({ title: '문제 맞추기' });

    const MAX_QUESTIONS = 10;

    const [phase, setPhase] = useState<'idle' | 'loading' | 'playing' | 'finished'>('idle');
    const [questions, setQuestions] = useState<QuizItem[]>([]);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [awardedPoints, setAwardedPoints] = useState(0);
    const [answers, setAnswers] = useState<QuizAnswerItem[]>([]);
    const [selectedAnswer, setSelectedAnswer] = useState<boolean | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const currentQ = questions[currentIdx] as QuizItem | undefined;
    const totalQuestions = questions.length || MAX_QUESTIONS;

    const fetchQuestions = useCallback(async () => {
        setPhase('loading');
        setLoadError(null);
        try {
            const res = await fetch(apiUrl('/quiz/questions', { query: { count: MAX_QUESTIONS } }), {
                headers: { 'x-user-key': userKey },
            });
            const json = await res.json();
            if (!res.ok || json.resultType === 'FAIL') {
                throw new Error(json.error?.message || `HTTP ${res.status}`);
            }

            const payload = getPayload(json);
            const nextSessionId = payload?.sessionId ?? payload?.session?.id ?? payload?.quizSessionId;
            const items: QuizItem[] = getQuestionList(payload).map((q: any) => ({
                id: String(q.id ?? ''),
                question: String(q.question ?? q.text ?? q.title ?? ''),
                answer: typeof q.answer === 'boolean' ? q.answer : undefined,
            }));
            if (!nextSessionId) throw new Error('문제 정보를 받지 못했어요');
            if (items.length === 0 || items.some((item) => !item.id || !item.question)) {
                throw new Error('문제 데이터를 불러오지 못했습니다');
            }

            return {
                sessionId: String(nextSessionId),
                questions: items,
                remainingTickets:
                    typeof payload?.remainingTickets === 'number'
                        ? payload.remainingTickets
                        : typeof payload?.tickets === 'number'
                            ? payload.tickets
                            : typeof payload?.user?.tickets === 'number'
                                ? payload.user.tickets
                                : undefined,
            };
        } catch (e) {
            console.warn('[Quiz] 백엔드 문제 로드 실패:', e);
            throw e;
        }
    }, [userKey]);

    const submitQuiz = useCallback(async (currentSessionId: string, submittedAnswers: QuizAnswerItem[]) => {
        const res = await fetch(apiUrl('/quiz/submit'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-key': userKey,
            },
            body: JSON.stringify({
                sessionId: currentSessionId,
                answers: submittedAnswers,
            }),
        });

        const json = await res.json();
        if (!res.ok || json.resultType === 'FAIL') {
            throw new Error(json.error?.message || `HTTP ${res.status}`);
        }

        const payload = getPayload(json);
        const results = Array.isArray(payload?.results) ? payload.results : [];
        const derivedCorrectCount = results.filter((item: any) => item?.correct === true).length;
        const normalizedCorrectCount = clampRewardPoints(
            payload?.correctCount ?? payload?.score?.correctCount ?? derivedCorrectCount ?? 0,
            MAX_QUESTIONS,
        );
        const rawAwardedPoints = payload?.pointsAwarded
            ?? payload?.awardedPoints
            ?? payload?.grantedPoints
            ?? normalizedCorrectCount;
        return {
            correctCount: normalizedCorrectCount,
            pointsAwarded: clampRewardPoints(rawAwardedPoints, REWARD_POINT_LIMITS.rewardQuiz),
            totalPoints:
                typeof payload?.totalPoints === 'number'
                    ? payload.totalPoints
                    : typeof payload?.user?.points === 'number'
                        ? payload.user.points
                        : undefined,
        };
    }, [userKey]);

    const retrySubmit = useCallback(async () => {
        if (!sessionId || answers.length === 0 || isSubmitting) return;
        setIsSubmitting(true);
        setSubmitError(null);
        try {
            const result = await submitQuiz(sessionId, answers);
            setCorrectCount(result.correctCount);
            setAwardedPoints(result.pointsAwarded);
            onQuizReward?.(result.pointsAwarded, result.totalPoints);
        } catch (error) {
            const message = error instanceof Error ? error.message : '퀴즈 결과 제출에 실패했어요.';
            setSubmitError(message);
            setAwardedPoints(0);
        } finally {
            setIsSubmitting(false);
        }
    }, [sessionId, answers, isSubmitting, submitQuiz, onQuizReward]);

    const startQuiz = useCallback(async () => {
        if (drawCount < 1) return;
        logClick('reward_quiz_start');
        setSubmitError(null);

        try {
            const result = await fetchQuestions();
            setSessionId(result.sessionId);
            setQuestions(result.questions);
            setCurrentIdx(0);
            setCorrectCount(0);
            setAwardedPoints(0);
            setAnswers([]);
            setSelectedAnswer(null);
            onTicketUse?.(result.remainingTickets);
            setPhase('playing');
        } catch (error) {
            const message = error instanceof Error ? error.message : '문제를 불러오지 못했어요. 다시 시도해주세요.';
            setLoadError(message);
            setPhase('idle');
        }
    }, [drawCount, onTicketUse, fetchQuestions]);

    const handleAnswer = useCallback((answer: boolean) => {
        if (selectedAnswer !== null || !currentQ || !sessionId || isSubmitting) return;
        logClick('reward_quiz_answer');
        setSelectedAnswer(answer);

        const nextAnswers = [...answers, { id: currentQ.id, answer }];
        setAnswers(nextAnswers);

        const hasLocalAnswer = typeof currentQ.answer === 'boolean';
        const isCorrect = hasLocalAnswer ? answer === currentQ.answer : false;
        if (isCorrect) setCorrectCount(c => c + 1);

        // 잠시 결과 보여주고 다음으로
        window.setTimeout(async () => {
            if (currentIdx + 1 >= MAX_QUESTIONS) {
                setIsSubmitting(true);
                try {
                    const result = await submitQuiz(sessionId, nextAnswers);
                    setCorrectCount(result.correctCount);
                    setAwardedPoints(result.pointsAwarded);
                    setSubmitError(null);
                    onQuizReward?.(result.pointsAwarded, result.totalPoints);
                } catch (error) {
                    const message = error instanceof Error ? error.message : '퀴즈 결과 제출에 실패했어요.';
                    setSubmitError(message);
                    setAwardedPoints(0);
                } finally {
                    setIsSubmitting(false);
                    setPhase('finished');
                }
            } else {
                setCurrentIdx(i => i + 1);
                setSelectedAnswer(null);
            }
        }, 1200);
    }, [selectedAnswer, currentQ, sessionId, isSubmitting, answers, currentIdx, submitQuiz, onQuizReward]);

    const progressPct = useMemo(() =>
        phase === 'playing' ? ((currentIdx + 1) / MAX_QUESTIONS) * 100 : 0
    , [phase, currentIdx]);

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
                            <div className="flex items-center gap-3 rounded-[28px] bg-white px-5 py-4 shadow-[0_8px_24px_rgba(0,0,0,0.05)] border border-slate-100">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500 ring-1 ring-emerald-100">
                                    <Circle size={24} strokeWidth={3} />
                                </div>
                                <div className="text-[16px] font-black tracking-[0.18em] text-slate-300">VS</div>
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-400 ring-1 ring-red-100">
                                    <X size={24} strokeWidth={3} />
                                </div>
                            </div>
                            <div>
                                <h1 className="text-[24px] font-black text-slate-900 leading-tight">맞다/아니다 문제</h1>
                                <p className="text-[14px] font-bold text-slate-400 mt-2">
                                    10문제를 풀고 맞춘 만큼 포인트를 받아요
                                </p>
                            </div>

                            <div className="w-full max-w-xs space-y-3">
                                <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white border border-slate-100">
                                    <span className="text-[13px] font-bold text-slate-500">참가 비용</span>
                                    <span className="text-[14px] font-black text-orange-500">이용권 1장</span>
                                </div>
                                <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white border border-slate-100">
                                    <span className="text-[13px] font-bold text-slate-500">문제 수</span>
                                    <span className="text-[14px] font-black text-slate-700">10문제</span>
                                </div>
                                <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white border border-slate-100">
                                    <span className="text-[13px] font-bold text-slate-500">받을 점수</span>
                                    <span className="text-[14px] font-black text-emerald-600">맞춘 수 × 1점</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-auto px-2 pb-6">
                            <BannerAdSlot adGroupId={BANNER_AD_PERSONA_ID} adOptions={{ variant: 'text' }} className="mb-4 opacity-60" />

                            {loadError && (
                                <p className="text-[13px] font-bold text-red-500 text-center mb-3">{loadError}</p>
                            )}

                            <motion.button
                                whileTap={{ scale: 0.96 }}
                                onClick={startQuiz}
                                disabled={drawCount < 1 || phase === 'loading'}
                                data-testid="reward-quiz-start"
                                className={`w-full py-4 rounded-[20px] text-[16px] font-black transition-all ${
                                    drawCount >= 1
                                        ? 'bg-toss-blue text-white shadow-lg shadow-toss-blue/25 active:bg-blue-600'
                                        : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                }`}
                            >
                                {phase === 'loading' ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <Loader2 size={18} className="animate-spin" />
                                        문제 불러오는 중...
                                    </span>
                                ) : drawCount >= 1 ? `문제 시작하기 (이용권 ${drawCount}장)` : '이용권이 부족해요'}
                            </motion.button>
                        </div>
                    </motion.div>
                )}

                {/* ━━━━ PLAYING: 퀴즈 진행 ━━━━ */}
                {phase === 'playing' && currentQ && (
                    <motion.div
                        key={`q-${currentIdx}`}
                        initial={{ opacity: 0, x: 60 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -60 }}
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                        className="flex-1 flex flex-col px-5"
                    >
                        {/* 진행 바 */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[13px] font-bold text-slate-400">{currentIdx + 1} / {totalQuestions}</span>
                                <span className="text-[13px] font-bold text-emerald-500">{correctCount}문제 정답</span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                                <motion.div
                                    className="h-full rounded-full bg-toss-blue"
                                    initial={false}
                                    animate={{ width: `${progressPct}%` }}
                                    transition={{ duration: 0.4 }}
                                />
                            </div>
                        </div>

                        {/* 문제 카드 */}
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <div className="w-full rounded-[28px] bg-white border border-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-8">
                                <p className="text-[11px] font-bold text-toss-blue uppercase tracking-widest mb-4">
                                    Q{currentIdx + 1}
                                </p>
                                <p data-testid="reward-quiz-question" className="text-[20px] font-black text-slate-900 leading-relaxed break-keep">
                                    {currentQ.question}
                                </p>

                                {/* O / X 결과 피드백 */}
                                {selectedAnswer !== null && typeof currentQ.answer === 'boolean' && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="mt-6 flex items-center justify-center"
                                    >
                                        {selectedAnswer === currentQ.answer ? (
                                            <div className="flex items-center gap-2 text-emerald-600">
                                                <CheckCircle2 size={22} />
                                                <span className="text-[15px] font-black">정답!</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-red-500">
                                                <XCircle size={22} />
                                                <span className="text-[15px] font-black">
                                                    오답 — 정답은 {currentQ.answer ? 'O' : 'X'}
                                                </span>
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </div>

                            {/* O / X 버튼 */}
                            <div className="flex gap-4 mt-8 w-full max-w-xs">
                                <motion.button
                                    whileTap={selectedAnswer === null ? { scale: 0.9 } : undefined}
                                    onClick={() => handleAnswer(true)}
                                    disabled={selectedAnswer !== null}
                                    data-testid="reward-quiz-answer-o"
                                    className={`flex-1 py-5 rounded-[22px] flex flex-col items-center gap-1 transition-all font-black text-[18px] ${
                                        selectedAnswer === null
                                            ? 'bg-emerald-50 text-emerald-600 border-2 border-emerald-100 active:bg-emerald-100'
                                            : typeof currentQ.answer !== 'boolean'
                                                ? selectedAnswer === true
                                                    ? 'bg-toss-blue text-white border-2 border-toss-blue'
                                                    : 'bg-slate-50 text-slate-200 border-2 border-slate-100'
                                            : selectedAnswer === true && selectedAnswer === currentQ.answer
                                                ? 'bg-emerald-500 text-white border-2 border-emerald-500'
                                                : selectedAnswer === true && selectedAnswer !== currentQ.answer
                                                    ? 'bg-red-100 text-red-400 border-2 border-red-200'
                                                    : 'bg-slate-50 text-slate-200 border-2 border-slate-100'
                                    }`}
                                >
                                    <Circle size={32} strokeWidth={3} />
                                    O
                                </motion.button>
                                <motion.button
                                    whileTap={selectedAnswer === null ? { scale: 0.9 } : undefined}
                                    onClick={() => handleAnswer(false)}
                                    disabled={selectedAnswer !== null}
                                    data-testid="reward-quiz-answer-x"
                                    className={`flex-1 py-5 rounded-[22px] flex flex-col items-center gap-1 transition-all font-black text-[18px] ${
                                        selectedAnswer === null
                                            ? 'bg-red-50 text-red-500 border-2 border-red-100 active:bg-red-100'
                                            : typeof currentQ.answer !== 'boolean'
                                                ? selectedAnswer === false
                                                    ? 'bg-toss-blue text-white border-2 border-toss-blue'
                                                    : 'bg-slate-50 text-slate-200 border-2 border-slate-100'
                                            : selectedAnswer === false && selectedAnswer === currentQ.answer
                                                ? 'bg-emerald-500 text-white border-2 border-emerald-500'
                                                : selectedAnswer === false && selectedAnswer !== currentQ.answer
                                                    ? 'bg-red-100 text-red-400 border-2 border-red-200'
                                                    : 'bg-slate-50 text-slate-200 border-2 border-slate-100'
                                    }`}
                                >
                                    <X size={32} strokeWidth={3} />
                                    X
                                </motion.button>
                            </div>

                            {/* 문제별 배너 광고 */}
                            <BannerAdSlot
                                key={`quiz-ad-${currentIdx}`}
                                adGroupId={BANNER_AD_PERSONA_ID}
                                adOptions={{ variant: 'text' }}
                                className="mt-6 opacity-60"
                            />

                            {isSubmitting && (
                                <div className="mt-4 flex items-center gap-2 text-[13px] font-bold text-slate-400">
                                    <Loader2 size={16} className="animate-spin" />
                                    결과 계산 중...
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
                {phase === 'finished' && (
                    <motion.div
                        key="finished"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex-1 flex flex-col items-center justify-center px-5 text-center"
                    >
                        <div className={`w-20 h-20 rounded-[28px] flex items-center justify-center mb-6 ${
                            correctCount >= 7 ? 'bg-amber-50' : correctCount >= 4 ? 'bg-emerald-50' : 'bg-slate-100'
                        }`}>
                            {correctCount >= 7 ? (
                                <Trophy size={36} className="text-amber-500" />
                            ) : correctCount >= 4 ? (
                                <CheckCircle2 size={36} className="text-emerald-500" />
                            ) : (
                                <Frown size={36} className="text-slate-400" />
                            )}
                        </div>

                        <h2 className="text-[26px] font-black text-slate-900">
                            {correctCount >= 7 ? '대단해요! 🎉' : correctCount >= 4 ? '좋아요! 👍' : '다음엔 더 잘할 수 있어요'}
                        </h2>
                        <p className="text-[15px] font-bold text-slate-400 mt-2 mb-8">
                            {totalQuestions}문제 중 <span className="text-toss-blue">{correctCount}문제</span> 정답
                        </p>

                        <div data-testid="reward-quiz-result" className="w-full max-w-xs rounded-[24px] bg-white border border-slate-100 shadow-sm p-6 mb-8">
                            <p className="text-[13px] font-bold text-slate-400 mb-1">받은 포인트</p>
                            <div className="flex items-baseline justify-center gap-1">
                                <span className="text-[36px] font-black text-emerald-600 tabular-nums">{awardedPoints}</span>
                                <span className="text-[18px] font-black text-slate-700">점</span>
                            </div>
                        </div>

                        {submitError && (
                            <p data-testid="reward-quiz-submit-error" className="text-[13px] font-bold text-red-500 mb-5">{submitError}</p>
                        )}

                        <BannerAdSlot adGroupId={BANNER_AD_PERSONA_ID} adOptions={{ variant: 'text' }} className="mb-4 opacity-60 w-full" />

                        <div className="w-full max-w-xs space-y-3">
                            {submitError && (
                                <motion.button
                                    whileTap={{ scale: 0.96 }}
                                    onClick={retrySubmit}
                                    disabled={isSubmitting}
                                    data-testid="reward-quiz-retry-submit"
                                    className={`w-full py-4 rounded-[20px] text-[15px] font-black transition-all ${
                                        isSubmitting
                                            ? 'bg-slate-100 text-slate-300 cursor-wait'
                                            : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                    }`}
                                >
                                    {isSubmitting ? '결과 다시 제출하는 중...' : '결과 다시 제출하기'}
                                </motion.button>
                            )}
                            <motion.button
                                whileTap={{ scale: 0.96 }}
                                onClick={() => {
                                    setPhase('idle');
                                }}
                                disabled={drawCount < 1}
                                data-testid="reward-quiz-restart"
                                className={`w-full py-4 rounded-[20px] text-[15px] font-black transition-all ${
                                    drawCount >= 1
                                        ? 'bg-toss-blue text-white shadow-lg shadow-toss-blue/25'
                                        : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                }`}
                            >
                                {drawCount >= 1 ? '한 번 더 도전하기 · 이용권 1장' : '이용권 부족'}
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
        </motion.div>
    );
});
