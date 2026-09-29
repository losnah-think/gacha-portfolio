import { motion } from 'framer-motion';
import { memo, useState, useCallback, useEffect } from 'react';
import { Check, Gift, Flame } from 'lucide-react';
import { apiUrl } from '../../../shared/api/client';

/** 7일 출석 보상 설정 */
const DAILY_REWARDS = [
    { day: 1, points: 1, label: '1점' },
    { day: 2, points: 1, label: '1점' },
    { day: 3, points: 2, label: '2점' },
    { day: 4, points: 1, label: '1점' },
    { day: 5, points: 2, label: '2점' },
    { day: 6, points: 2, label: '2점' },
    { day: 7, points: 5, label: '5점', isBonus: true },
];

interface DailyCheckinCardProps {
    userKey: string;
    consecutiveDays: number;
    onCheckinSuccess?: (addedPoints: number, newConsecutive: number) => void;
}

export const DailyCheckinCard = memo(({
    userKey,
    consecutiveDays,
    onCheckinSuccess,
}: DailyCheckinCardProps) => {
    const [isChecking, setIsChecking] = useState(false);
    const [todayChecked, setTodayChecked] = useState(false);
    const [showReward, setShowReward] = useState(false);
    const [earnedPoints, setEarnedPoints] = useState(0);

    // 오늘 이미 출석했는지 로컬 확인
    useEffect(() => {
        const lastCheckin = localStorage.getItem(`checkin_${userKey}`);
        if (lastCheckin === new Date().toISOString().slice(0, 10)) {
            setTodayChecked(true);
        }
    }, [userKey]);

    const currentDay = ((consecutiveDays - 1) % 7) + 1; // 1~7 순환
    const todayReward = DAILY_REWARDS[(currentDay - 1) % 7];

    const handleCheckin = useCallback(async () => {
        if (isChecking || todayChecked) return;
        setIsChecking(true);

        const applyCheckin = (added: number, newConsecutive: number) => {
            setEarnedPoints(added);
            setTodayChecked(true);
            setShowReward(true);
            localStorage.setItem(`checkin_${userKey}`, new Date().toISOString().slice(0, 10));
            onCheckinSuccess?.(added, newConsecutive);
            setTimeout(() => setShowReward(false), 2500);
        };

        try {
            const res = await fetch(apiUrl('/user/claim-daily'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userKey }),
            });

            if (res.ok) {
                const json = await res.json();
                const data = json.data || json;
                const newConsecutive = data?.consecutiveLoginDays ?? data?.consecutiveDays ?? consecutiveDays + 1;
                applyCheckin(todayReward.points, newConsecutive);
            } else {
                applyCheckin(todayReward.points, consecutiveDays + 1);
            }
        } catch {
            applyCheckin(todayReward.points, consecutiveDays + 1);
        } finally {
            setIsChecking(false);
        }
    }, [isChecking, todayChecked, userKey, todayReward.points, consecutiveDays, onCheckinSuccess])

    return (
        <div className="rounded-[22px] bg-white border border-toss-gray-100 p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-100 to-amber-50 flex items-center justify-center">
                        <Flame size={14} className="text-orange-500" />
                    </div>
                    <div>
                        <h3 className="text-[14px] font-extrabold text-toss-gray-900">출석 체크</h3>
                        <p className="t-micro font-bold text-toss-gray-300">매일 포인트를 받아요</p>
                    </div>
                </div>
                <div className="flex items-center gap-1 bg-orange-50 rounded-full px-2.5 py-1">
                    <Flame size={10} className="text-orange-500" />
                    <span className="text-[11px] font-black text-orange-600">{consecutiveDays}일 연속</span>
                </div>
            </div>

            {/* 7일 보상 그리드 */}
            <div className="flex gap-1.5 mb-3">
                {DAILY_REWARDS.map((reward, idx) => {
                    const dayNum = idx + 1;
                    const isPast = dayNum < currentDay || todayChecked && dayNum === currentDay;
                    const isToday = dayNum === currentDay && !todayChecked;

                    return (
                        <div
                            key={dayNum}
                            className={`flex-1 flex flex-col items-center rounded-xl py-2 transition-all ${
                                isPast
                                    ? 'bg-toss-blue/5'
                                    : isToday
                                        ? 'bg-gradient-to-b from-toss-blue/10 to-toss-blue/5 ring-2 ring-toss-blue/30 shadow-sm'
                                        : 'bg-toss-gray-50'
                            } ${reward.isBonus ? 'ring-1 ring-amber-200' : ''}`}
                        >
                            <span className={`t-micro font-bold mb-1 ${
                                isPast ? 'text-toss-blue/60' : isToday ? 'text-toss-blue' : 'text-toss-gray-300'
                            }`}>
                                {dayNum}일
                            </span>

                            {isPast ? (
                                <div className="w-6 h-6 rounded-full bg-toss-blue/20 flex items-center justify-center">
                                    <Check size={12} className="text-toss-blue" strokeWidth={3} />
                                </div>
                            ) : reward.isBonus ? (
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-200 to-orange-200 flex items-center justify-center">
                                    <Gift size={11} className="text-amber-700" />
                                </div>
                            ) : (
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                    isToday ? 'bg-toss-blue text-white' : 'bg-toss-gray-100 text-toss-gray-300'
                                }`}>
                                    <span className="t-micro font-black">{reward.label}</span>
                                </div>
                            )}

                            <span className={`t-micro font-bold mt-1 ${
                                reward.isBonus ? 'text-amber-600' : isPast ? 'text-toss-blue/50' : isToday ? 'text-toss-blue' : 'text-toss-gray-300'
                            }`}>
                                {reward.label}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* 출석 버튼 */}
            <motion.button
                whileTap={!todayChecked ? { scale: 0.96 } : undefined}
                onClick={handleCheckin}
                disabled={todayChecked || isChecking}
                className={`w-full py-3 rounded-2xl text-[14px] font-bold transition-all ${
                    todayChecked
                        ? 'bg-toss-gray-50 text-toss-gray-300 cursor-not-allowed'
                        : isChecking
                            ? 'bg-toss-blue/80 text-white cursor-wait'
                            : 'bg-toss-blue text-white shadow-lg shadow-toss-blue/25 active:shadow-toss-blue/15'
                }`}
            >
                {showReward ? (
                    <motion.span
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="inline-flex items-center gap-1.5"
                    >
                        +{earnedPoints}점 받았어요!
                    </motion.span>
                ) : todayChecked ? (
                    <span className="inline-flex items-center gap-1.5">
                        <Check size={16} strokeWidth={3} />
                        오늘 출석 완료
                    </span>
                ) : isChecking ? (
                    '출석 중...'
                ) : (
                    <span>출석하고 <span className="text-white/90 font-black">{todayReward.label}</span> 받기</span>
                )}
            </motion.button>
        </div>
    );
});
