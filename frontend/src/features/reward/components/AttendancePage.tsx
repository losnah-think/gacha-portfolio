import { motion } from 'framer-motion';
import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import { Check, Gift, Flame, Calendar, Trophy } from 'lucide-react';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
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

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

/* ── Animation variants ── */
const stagger = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

interface AttendancePageProps {
    userKey: string;
    consecutiveDays: number;
    onBack: () => void;
    onCheckinSuccess?: (addedPoints: number, newConsecutive: number) => void;
}

export const AttendancePage = memo(({
    userKey,
    consecutiveDays,
    onBack,
    onCheckinSuccess,
}: AttendancePageProps) => {
    useAppNavigationBar({
        title: '출석 체크',
        onBackPress: onBack,
    });

    const [isChecking, setIsChecking] = useState(false);
    const [todayChecked, setTodayChecked] = useState(false);
    const [showReward, setShowReward] = useState(false);
    const [earnedPoints, setEarnedPoints] = useState(0);
    const [attendanceHistory, setAttendanceHistory] = useState<string[]>([]);

    // 오늘 이미 출석했는지 로컬 확인
    useEffect(() => {
        const lastCheckin = localStorage.getItem(`checkin_${userKey}`);
        if (lastCheckin === new Date().toISOString().slice(0, 10)) {
            setTodayChecked(true);
        }
    }, [userKey]);

    // 출석 이력 가져오기
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(apiUrl('/attendance/history', { query: { userKey } }));
                if (res.ok) {
                    const json = await res.json();
                    const dates = json.data?.dates || json.dates || [];
                    setAttendanceHistory(dates);
                }
            } catch {
                // 실패 시 로컬 캐시 사용
                const cached = localStorage.getItem(`attendance_dates_${userKey}`);
                if (cached) setAttendanceHistory(JSON.parse(cached));
            }
        })();
    }, [userKey]);

    const currentDay = ((consecutiveDays - 1) % 7) + 1;
    const todayReward = DAILY_REWARDS[(currentDay - 1) % 7];

    // 이번 달 캘린더 데이터
    const calendarData = useMemo(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const firstDay = new Date(year, month, 1);
        // 월요일 시작 (0=월, 6=일)
        let startDow = firstDay.getDay() - 1;
        if (startDow < 0) startDow = 6;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = now.getDate();

        const weeks: (number | null)[][] = [];
        let week: (number | null)[] = Array(startDow).fill(null);
        for (let d = 1; d <= daysInMonth; d++) {
            week.push(d);
            if (week.length === 7) {
                weeks.push(week);
                week = [];
            }
        }
        if (week.length > 0) {
            while (week.length < 7) week.push(null);
            weeks.push(week);
        }

        const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

        return { year, month, weeks, today, monthStr, monthLabel: `${year}년 ${month + 1}월` };
    }, []);

    const isAttendDate = useCallback((day: number) => {
        const dateStr = `${calendarData.monthStr}-${String(day).padStart(2, '0')}`;
        return attendanceHistory.includes(dateStr);
    }, [attendanceHistory, calendarData.monthStr]);

    const thisMonthCount = useMemo(() => {
        return attendanceHistory.filter(d => d.startsWith(calendarData.monthStr)).length;
    }, [attendanceHistory, calendarData.monthStr]);

    const handleCheckin = useCallback(async () => {
        if (isChecking || todayChecked) return;
        setIsChecking(true);

        const applyCheckin = (added: number, newConsecutive: number) => {
            setEarnedPoints(added);
            setTodayChecked(true);
            setShowReward(true);
            const todayStr = new Date().toISOString().slice(0, 10);
            localStorage.setItem(`checkin_${userKey}`, todayStr);
            setAttendanceHistory(prev => [...prev, todayStr]);
            onCheckinSuccess?.(added, newConsecutive);
            setTimeout(() => setShowReward(false), 2500);
        };

        try {
            const res = await fetch(apiUrl('/user/claim-daily'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userKey }),
            });

            let newConsecutive = consecutiveDays + 1;
            if (res.ok) {
                const json = await res.json();
                const data = json.data || json;
                newConsecutive = data?.consecutiveLoginDays ?? data?.consecutiveDays ?? newConsecutive;
            }
            applyCheckin(todayReward.points, newConsecutive);
        } catch {
            applyCheckin(todayReward.points, consecutiveDays + 1);
        } finally {
            setIsChecking(false);
        }
    }, [isChecking, todayChecked, userKey, todayReward.points, consecutiveDays, onCheckinSuccess]);

    // 총 보상 합산
    const totalWeekReward = DAILY_REWARDS.reduce((s, r) => s + r.points, 0);

    return (
        <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, y: -20 }}
            className="-mx-5 -mt-10 flex flex-col min-h-[100dvh] bg-gradient-to-b from-orange-50/60 via-white to-slate-50"
        >
            {/* ━━━━ 히어로 ━━━━ */}
            <motion.section variants={fadeUp} className="relative pt-14 px-5 pb-4 overflow-hidden">
                <div className="absolute top-0 right-0 w-[280px] h-[280px] bg-gradient-to-br from-orange-200/20 to-amber-100/10 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4 pointer-events-none" />

                <div className="relative mb-5">
                    <h1 className="text-[24px] font-black text-toss-gray-900 tracking-tight">출석 체크</h1>
                    <p className="text-[13px] text-toss-gray-400 mt-0.5 font-medium">매일 출석하고 포인트를 모아보세요</p>
                </div>

                {/* 연속 출석 + 이번 달 통계 */}
                <div className="flex gap-3">
                    <div className="flex-1 rounded-[20px] bg-gradient-to-br from-orange-100/80 to-amber-50 border border-orange-200/40 p-4 text-center">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-200 to-amber-100 flex items-center justify-center mx-auto mb-2">
                            <Flame size={18} className="text-orange-600" />
                        </div>
                        <p className="text-[24px] font-black text-orange-600 leading-none">{consecutiveDays}</p>
                        <p className="text-[11px] font-bold text-orange-400 mt-1">연속 출석일</p>
                    </div>
                    <div className="flex-1 rounded-[20px] bg-gradient-to-br from-blue-50/80 to-indigo-50 border border-blue-200/40 p-4 text-center">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-50 flex items-center justify-center mx-auto mb-2">
                            <Calendar size={18} className="text-toss-blue" />
                        </div>
                        <p className="text-[24px] font-black text-toss-blue leading-none">{thisMonthCount}</p>
                        <p className="text-[11px] font-bold text-toss-blue/60 mt-1">이번 달 출석</p>
                    </div>
                    <div className="flex-1 rounded-[20px] bg-gradient-to-br from-purple-50/80 to-violet-50 border border-purple-200/40 p-4 text-center">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-100 to-violet-50 flex items-center justify-center mx-auto mb-2">
                            <Trophy size={18} className="text-purple-600" />
                        </div>
                        <p className="text-[24px] font-black text-purple-600 leading-none">{totalWeekReward}</p>
                        <p className="text-[11px] font-bold text-purple-400 mt-1">주간 받을 점수</p>
                    </div>
                </div>
            </motion.section>

            {/* ━━━━ 7일 보상 카드 ━━━━ */}
            <motion.section variants={fadeUp} className="px-5 pt-2 pb-2">
                <div className="rounded-[22px] bg-white border border-toss-gray-100 p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[15px] font-extrabold text-toss-gray-900">7일 혜택</h3>
                        <div className="flex items-center gap-1 bg-orange-50 rounded-full px-2.5 py-1">
                            <Flame size={10} className="text-orange-500" />
                            <span className="text-[11px] font-black text-orange-600">{currentDay}/7일차</span>
                        </div>
                    </div>

                    {/* 7일 보상 그리드 */}
                    <div className="flex gap-1.5 mb-4">
                        {DAILY_REWARDS.map((reward, idx) => {
                            const dayNum = idx + 1;
                            const isPast = dayNum < currentDay || (todayChecked && dayNum === currentDay);
                            const isToday = dayNum === currentDay && !todayChecked;

                            return (
                                <div
                                    key={dayNum}
                                    className={`flex-1 flex flex-col items-center rounded-xl py-2.5 transition-all ${
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
                                        <div className="w-7 h-7 rounded-full bg-toss-blue/20 flex items-center justify-center">
                                            <Check size={14} className="text-toss-blue" strokeWidth={3} />
                                        </div>
                                    ) : reward.isBonus ? (
                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-200 to-orange-200 flex items-center justify-center">
                                            <Gift size={13} className="text-amber-700" />
                                        </div>
                                    ) : (
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
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
                        className={`w-full py-3.5 rounded-2xl text-[15px] font-bold transition-all ${
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
                                <Check size={18} strokeWidth={3} />
                                오늘 출석 완료
                            </span>
                        ) : isChecking ? (
                            '출석 중...'
                        ) : (
                            <span>출석하고 <span className="text-white/90 font-black">{todayReward.label}</span> 받기</span>
                        )}
                    </motion.button>
                </div>
            </motion.section>

            {/* ━━━━ 출석 캘린더 ━━━━ */}
            <motion.section variants={fadeUp} className="px-5 pt-3 pb-2">
                <div className="rounded-[22px] bg-white border border-toss-gray-100 p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[15px] font-extrabold text-toss-gray-900">{calendarData.monthLabel}</h3>
                        <span className="text-[11px] font-bold text-toss-gray-300">{thisMonthCount}일 출석</span>
                    </div>

                    {/* 요일 헤더 */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {WEEKDAYS.map(d => (
                            <div key={d} className="text-center t-micro font-bold text-toss-gray-300 py-1">{d}</div>
                        ))}
                    </div>

                    {/* 날짜 그리드 */}
                    <div className="space-y-1">
                        {calendarData.weeks.map((week, wi) => (
                            <div key={wi} className="grid grid-cols-7 gap-1">
                                {week.map((day, di) => {
                                    if (day === null) return <div key={di} />;
                                    const isToday = day === calendarData.today;
                                    const attended = isAttendDate(day);
                                    return (
                                        <div
                                            key={di}
                                            className={`aspect-square flex items-center justify-center rounded-xl text-[12px] font-bold transition-all ${
                                                attended
                                                    ? 'bg-toss-blue/10 text-toss-blue'
                                                    : isToday
                                                        ? 'bg-orange-50 text-orange-600 ring-1 ring-orange-200'
                                                        : day > calendarData.today
                                                            ? 'text-toss-gray-200'
                                                            : 'text-toss-gray-400'
                                            }`}
                                        >
                                            {attended ? (
                                                <Check size={14} className="text-toss-blue" strokeWidth={3} />
                                            ) : (
                                                day
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </motion.section>

            {/* ━━━━ 출석 안내 ━━━━ */}
            <motion.section variants={fadeUp} className="px-5 pt-3 pb-40">
                <div className="rounded-[18px] bg-toss-gray-50/80 border border-toss-gray-100/50 px-4 py-3.5 space-y-1.5">
                    <div className="flex items-center gap-2 text-[12px] font-bold text-toss-gray-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-300/60 flex-shrink-0" />
                        <span>매일 자정 기준으로 출석이 초기화돼요</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px] font-bold text-toss-gray-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-300/60 flex-shrink-0" />
                        <span>7일 연속 출석 시 보너스 5점을 받아요</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px] font-bold text-toss-gray-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-300/60 flex-shrink-0" />
                        <span>출석이 끊기면 1일차부터 다시 시작해요</span>
                    </div>
                </div>
            </motion.section>
        </motion.div>
    );
});
