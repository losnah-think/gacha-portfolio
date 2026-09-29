import { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, Check, X, RefreshCw } from 'lucide-react';
import { logClick } from '../../../utils/analytics';

interface QuizItem {
    question: string;
    choices: string[];
    answer: number; // 정답 인덱스
}

/** 로컬 퀴즈 뱅크 – 추후 백엔드 API로 교체 */
const QUIZ_BANK: QuizItem[] = [
    { question: '대한민국의 수도는?', choices: ['부산', '서울', '대전', '인천'], answer: 1 },
    { question: '1년은 몇 개월?', choices: ['10개월', '11개월', '12개월', '13개월'], answer: 2 },
    { question: '물의 화학식은?', choices: ['CO2', 'O2', 'H2O', 'NaCl'], answer: 2 },
    { question: '지구에서 가장 큰 대양은?', choices: ['대서양', '인도양', '북극해', '태평양'], answer: 3 },
    { question: '무지개는 몇 가지 색?', choices: ['5가지', '6가지', '7가지', '8가지'], answer: 2 },
    { question: '한글을 만든 왕은?', choices: ['태종', '세종대왕', '영조', '정조'], answer: 1 },
    { question: '빛의 속도는 초속 약 몇 km?', choices: ['30만 km', '15만 km', '3만 km', '100만 km'], answer: 0 },
    { question: '커피 원두의 원산지 대륙은?', choices: ['아시아', '유럽', '아프리카', '남미'], answer: 2 },
    { question: '1 + 1 × 2 = ?', choices: ['2', '3', '4', '6'], answer: 1 },
    { question: '대한민국 광복절은 몇 월?', choices: ['3월', '6월', '8월', '10월'], answer: 2 },
];

function pickRandom(): QuizItem {
    return QUIZ_BANK[Math.floor(Math.random() * QUIZ_BANK.length)];
}

interface RewardQuizCardProps {
    /** 퀴즈 정답 시 포인트 지급 콜백 (백엔드 연동) */
    onCorrectAnswer?: () => void;
}

export const RewardQuizCard = memo(({ onCorrectAnswer }: RewardQuizCardProps) => {
    const [quiz, setQuiz] = useState<QuizItem>(pickRandom);
    const [selected, setSelected] = useState<number | null>(null);
    const [result, setResult] = useState<'correct' | 'wrong' | null>(null);

    const handleSelect = useCallback((idx: number) => {
        if (selected !== null) return; // 이미 선택함
        logClick('reward_quiz_answer');
        setSelected(idx);

        if (idx === quiz.answer) {
            setResult('correct');
            onCorrectAnswer?.();
        } else {
            setResult('wrong');
        }
    }, [selected, quiz.answer, onCorrectAnswer]);

    const handleNext = useCallback(() => {
        setQuiz(pickRandom());
        setSelected(null);
        setResult(null);
        logClick('reward_quiz_next');
    }, []);

    return (
        <div className="w-full rounded-[24px] bg-white border border-slate-100 shadow-sm overflow-hidden text-left">
            {/* 헤더 */}
            <div className="flex items-center gap-3 p-5 pb-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <HelpCircle size={24} className="text-emerald-500" />
                </div>
                <div className="flex-1">
                    <p className="text-[16px] font-black text-slate-800 leading-tight">오늘의 문제</p>
                    <p className="text-[12px] font-bold text-slate-400 mt-1">맞추면 1점 받아요!</p>
                </div>
            </div>

            {/* 문제 */}
            <div className="px-5 pb-2">
                <p className="text-[15px] font-bold text-slate-700 leading-snug">{quiz.question}</p>
            </div>

            {/* 선택지 */}
            <div className="px-5 pb-4 grid grid-cols-2 gap-2">
                {quiz.choices.map((choice, idx) => {
                    const isSelected = selected === idx;
                    const isCorrectAnswer = idx === quiz.answer;
                    let btnClass = 'border-slate-100 bg-slate-50/80 text-slate-700 active:bg-slate-100';

                    if (selected !== null) {
                        if (isCorrectAnswer) {
                            btnClass = 'border-emerald-200 bg-emerald-50 text-emerald-700';
                        } else if (isSelected && !isCorrectAnswer) {
                            btnClass = 'border-red-200 bg-red-50 text-red-500';
                        } else {
                            btnClass = 'border-slate-100 bg-slate-50/40 text-slate-300';
                        }
                    }

                    return (
                        <motion.button
                            key={idx}
                            whileTap={selected === null ? { scale: 0.95 } : undefined}
                            onClick={() => handleSelect(idx)}
                            disabled={selected !== null}
                            className={`relative px-3 py-2.5 rounded-2xl border text-[13px] font-bold transition-all ${btnClass}`}
                        >
                            {choice}
                            {selected !== null && isCorrectAnswer && (
                                <Check size={14} className="absolute top-1.5 right-1.5 text-emerald-500" strokeWidth={3} />
                            )}
                            {isSelected && !isCorrectAnswer && (
                                <X size={14} className="absolute top-1.5 right-1.5 text-red-400" strokeWidth={3} />
                            )}
                        </motion.button>
                    );
                })}
            </div>

            {/* 결과 & 다음 문제 */}
            <AnimatePresence>
                {result && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="border-t border-slate-100"
                    >
                        <div className="flex items-center justify-between px-5 py-3">
                            <span className={`text-[13px] font-bold ${result === 'correct' ? 'text-emerald-600' : 'text-red-500'}`}>
                                {result === 'correct' ? '정답! 1점 받았어요' : '아쉬워요!'}
                            </span>
                            <motion.button
                                whileTap={{ scale: 0.92 }}
                                onClick={handleNext}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100 text-[12px] font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                            >
                                <RefreshCw size={12} />
                                다음 문제
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});
