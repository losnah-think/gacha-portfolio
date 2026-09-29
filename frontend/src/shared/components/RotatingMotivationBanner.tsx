import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── 문구 풀 ── */
const MOTIVATION_MESSAGES = [
    { text: '오늘 최대한 많이 모아두면 내일이 더 즐거워요', emoji: '🔥' },
    { text: '지금 포인트를 모아두면 혜택을 받을 수 있어요', emoji: '🎯' },
    { text: '10점만 모으면 포인트를 사용할 수 있어요', emoji: '💎' },
    { text: '광고 한 편이면 포인트가 쑥쑥 쌓여요', emoji: '📈' },
    { text: '꾸준히 모으면 더 큰 혜택이 다가와요', emoji: '🏆' },
    { text: '지금 쌓으면 나중에 더 큰 혜택으로 돌아와요', emoji: '🎁' },
    { text: '짧은 영상 하나로 포인트가 적립돼요', emoji: '⚡' },
    { text: '포인트는 쌓을수록 쓸 기회가 많아져요', emoji: '✨' },
    { text: '다른 사용자들은 벌써 30점 넘게 모았어요', emoji: '👀' },
    { text: '오늘의 포인트 기록을 세워보세요', emoji: '🚀' },
    { text: '복권도 긁고, 광고도 보고, 포인트 두 배!', emoji: '🎰' },
    { text: '광고 보는 동안 포인트가 통장에 쌓여요', emoji: '💰' },
];

/** 광고 시청 후 보여줄 감사/격려 메시지 */
const POST_AD_MESSAGES = [
    { text: '포인트가 적립되었어요! 한 번 더 도전해볼까요?', emoji: '🎉' },
    { text: '잘하고 있어요! 계속 모아보세요', emoji: '💪' },
    { text: '포인트가 들어왔어요! 다음 혜택도 기다리고 있어요', emoji: '🌟' },
    { text: '포인트가 쑥! 목표까지 얼마 안 남았어요', emoji: '📊' },
    { text: '대단해요! 벌써 이만큼 모았네요', emoji: '👏' },
];

interface RotatingMotivationBannerProps {
    /** 광고 시청 트리거 — 값이 변할 때마다 POST_AD 메시지로 잠시 전환 */
    adWatchTrigger?: number;
    /** 자동 회전 간격 (ms). 기본 4500 */
    intervalMs?: number;
    /** 추가 className */
    className?: string;
    /** 배경 스타일 variant */
    variant?: 'default' | 'subtle' | 'accent';
}

/**
 * 광고 시청 유도 & 격려 문구가 자동으로 로테이션되는 배너.
 * adWatchTrigger가 바뀌면 잠시 격려 메시지를 보여준 뒤 다시 일반 로테이션으로 돌아감.
 */
export const RotatingMotivationBanner = memo(({
    adWatchTrigger = 0,
    intervalMs = 4500,
    className = '',
    variant = 'default',
}: RotatingMotivationBannerProps) => {
    const [index, setIndex] = useState(() => Math.floor(Math.random() * MOTIVATION_MESSAGES.length));
    const [currentPool, setCurrentPool] = useState<typeof MOTIVATION_MESSAGES>(MOTIVATION_MESSAGES);
    const prevTriggerRef = useRef(adWatchTrigger);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // 광고 시청 후 → post-ad 메시지로 전환 → 5초 후 복귀
    useEffect(() => {
        if (adWatchTrigger !== prevTriggerRef.current && adWatchTrigger > 0) {
            prevTriggerRef.current = adWatchTrigger;
            const postIdx = adWatchTrigger % POST_AD_MESSAGES.length;
            const switchTimeout = setTimeout(() => {
                setCurrentPool(POST_AD_MESSAGES);
                setIndex(postIdx);
            }, 0);

            clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
                setCurrentPool(MOTIVATION_MESSAGES);
                setIndex(adWatchTrigger % MOTIVATION_MESSAGES.length);
            }, 5000);
            return () => {
                clearTimeout(switchTimeout);
                clearTimeout(timeoutRef.current);
            };
        }
        return () => clearTimeout(timeoutRef.current);
    }, [adWatchTrigger]);

    // 자동 로테이션
    const rotate = useCallback(() => {
        setIndex(prev => (prev + 1) % currentPool.length);
    }, [currentPool.length]);

    useEffect(() => {
        const iv = setInterval(rotate, intervalMs);
        return () => clearInterval(iv);
    }, [rotate, intervalMs]);

    const message = currentPool[index % currentPool.length];

    const bgClass = variant === 'accent'
        ? 'bg-gradient-to-r from-toss-blue/5 to-indigo-50/60 border-toss-blue/10'
        : variant === 'subtle'
            ? 'bg-toss-gray-50/60 border-toss-gray-100/40'
            : 'bg-gradient-to-r from-amber-50/60 to-orange-50/40 border-amber-100/40';

    return (
        <div className={`px-5 ${className}`}>
            <div className={`rounded-2xl border px-4 py-2.5 overflow-hidden ${bgClass}`}>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={`${index}-${currentPool === POST_AD_MESSAGES ? 'post' : 'main'}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-center gap-2"
                    >
                        <span className="text-[14px] flex-shrink-0">{message.emoji}</span>
                        <span className="text-[12px] font-bold text-toss-gray-500 leading-snug">
                            {message.text}
                        </span>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
});
