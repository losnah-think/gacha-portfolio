import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Clock3, Coins, Gift, Home, Loader2, PlayCircle, RotateCcw, Sparkles, Star, Tv } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { logClick, logRewardClaim } from '../../../utils/analytics';
import {
    FULLSCREEN_AD_ID,
    GACHA_QUICK_FULLSCREEN_AD_ID,
    GACHA_REWARDED_AD_ID,
} from '../../../shared/constants/app';
import { REWARD_POINT_LIMITS, clampRewardPoints } from '../../../shared/constants/rewardEconomy';
import { REWARD_RARITY_CONFIG, type RewardRarity } from '../../../shared/constants/rarity';
import { deterministicRandom } from '../../../shared/utils/deterministicRandom';

interface RewardItem {
    label: string;
    points: number;
    rarity: RewardRarity;
    weight: number;
    capsuleColor: string;
    glow: string;
    textColor: string;
    badge: string;
    ringColor: string;
    bgColor: string;
}

type DrawType = 'ticket' | 'bonus' | 'ad_interstitial' | 'ad_rewarded';

interface DrawResult {
    reward?: { label: string; points: number; rarity: string };
    tickets: number;
    bonusDraws: number;
    points: number;
    addedPoints: number;
    drawId?: string;
}

const getAwardedPoints = (serverData: DrawResult | null | undefined, fallbackPoints: number): number => {
    if (typeof serverData?.addedPoints === 'number') return clampRewardPoints(serverData.addedPoints, REWARD_POINT_LIMITS.rewardGacha);
    if (typeof serverData?.reward?.points === 'number') return clampRewardPoints(serverData.reward.points, REWARD_POINT_LIMITS.rewardGacha);
    return clampRewardPoints(fallbackPoints, REWARD_POINT_LIMITS.rewardGacha);
};

const formatDuration = (ms: number): string => {
    const safeMs = Math.max(0, ms);
    const totalSeconds = Math.ceil(safeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
    }

    if (minutes > 0) {
        return seconds > 0 ? `${minutes}분 ${seconds}초` : `${minutes}분`;
    }

    return `${seconds}초`;
};

interface RewardGachaPageProps {
    drawCount: number;
    userPoints: number;
    isAdLoading?: boolean;
    adLoadError?: { mode: 'short' | 'long'; retry: () => void } | null;
    onBack: () => void;
    /** @deprecated 미사용 — 향후 제거 예정 */
    onRecharge?: () => void;
    /** 전면형 광고 표시 (첫 뽑기 — 티켓 획득용) */
    onShowInterstitialAd?: (callback?: () => void) => void;
    /** 가차 페이지용 5초 전면 광고 (보너스 뽑기용) */
    onShowQuickInterstitialAd?: (callback?: () => void) => void;
    /** 리워드 광고 표시 (연속 뽑기 — 무료 뽑기용) */
    onShowRewardedAd?: (callback: () => void) => void;
    /** 백엔드 뽑기 API 호출 (서버에서 보상 결정 + 티켓 차감) */
    onDraw?: (drawType: DrawType) => Promise<DrawResult | null>;
    onClaimReward: (reward: { points: number; label: string; rarity: RewardRarity; consumeTicket: boolean; serverData?: DrawResult }) => void;
}

const REWARD_TABLE: RewardItem[] = [
    { label: '1점', points: 1, rarity: 'common', weight: 48, capsuleColor: 'from-slate-300 to-slate-500', glow: '', textColor: 'text-slate-600', badge: '기본', ringColor: 'ring-slate-200', bgColor: 'bg-slate-50' },
    { label: '2점', points: 2, rarity: 'common', weight: 30, capsuleColor: 'from-sky-400 to-blue-500', glow: 'shadow-[0_0_30px_rgba(56,189,248,0.25)]', textColor: 'text-blue-600', badge: '보통', ringColor: 'ring-blue-200', bgColor: 'bg-blue-50' },
    { label: '3점', points: 3, rarity: 'rare', weight: 14, capsuleColor: 'from-violet-400 to-purple-600', glow: 'shadow-[0_0_40px_rgba(168,85,247,0.35)]', textColor: 'text-purple-600', badge: '좋음', ringColor: 'ring-purple-300', bgColor: 'bg-purple-50' },
    { label: '5점', points: 5, rarity: 'epic', weight: 6, capsuleColor: 'from-amber-400 to-orange-500', glow: 'shadow-[0_0_50px_rgba(251,191,36,0.4)]', textColor: 'text-amber-600', badge: '높음', ringColor: 'ring-amber-300', bgColor: 'bg-amber-50' },
    { label: '10점', points: 10, rarity: 'legendary', weight: 2, capsuleColor: 'from-rose-500 to-red-600', glow: 'shadow-[0_0_60px_rgba(244,63,94,0.45)]', textColor: 'text-red-500', badge: '최고', ringColor: 'ring-red-300', bgColor: 'bg-red-50' },
];

const rewardFromPoints = (points: number, rarity?: string, label?: string): RewardItem => {
    const safePoints = clampRewardPoints(points, REWARD_POINT_LIMITS.rewardGacha);
    const matched = REWARD_TABLE.find(item => item.points === safePoints);
    if (matched) return { ...matched, label: label || matched.label };

    const template = REWARD_TABLE.find(item => item.rarity === rarity) || REWARD_TABLE[0];
    const safeRarity = ['common', 'rare', 'epic', 'legendary'].includes(rarity || '')
        ? rarity as RewardRarity
        : template.rarity;
    return {
        ...template,
        label: label || `${safePoints}점`,
        points: safePoints,
        rarity: safeRarity,
    };
};

/* ── 파티클 폭발 컴포넌트 ── */
const Particles = memo(({ count, color }: { count: number; color: string }) => {
    const particles = useMemo(() => Array.from({ length: count }, (_, i) => {
        const angle = (360 / count) * i;
        const distance = 60 + deterministicRandom(i + count * 19) * 60;
        const rad = (angle * Math.PI) / 180;
        return {
            x: Math.cos(rad) * distance,
            y: Math.sin(rad) * distance,
            scale: 0.4 + deterministicRandom(i + count * 23) * 0.6,
            delay: deterministicRandom(i + count * 29) * 0.15,
        };
    }), [count]);

    return (
        <>
            {particles.map((p, i) => (
                <motion.div
                    key={i}
                    initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                    animate={{ x: p.x, y: p.y, scale: p.scale, opacity: 0 }}
                    transition={{ duration: 0.7, delay: p.delay, ease: 'easeOut' }}
                    className={`absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 border border-slate-950 ${color}`}
                />
            ))}
        </>
    );
});

/* ── 캡슐 위치 (중력 + 빽빽하게 쌓임, 레퍼런스처럼) ── */
const BALL_POSITIONS = [
    // 1층 바닥 (6개, 벽에 밀착)
    { x: 6, y: 126, size: 27, color: 'from-sky-400 to-blue-500' },
    { x: 32, y: 124, size: 29, color: 'from-amber-400 to-yellow-500' },
    { x: 60, y: 127, size: 26, color: 'from-emerald-400 to-green-500' },
    { x: 86, y: 123, size: 28, color: 'from-rose-400 to-pink-500' },
    { x: 112, y: 126, size: 27, color: 'from-violet-400 to-purple-500' },
    { x: 138, y: 125, size: 26, color: 'from-blue-400 to-indigo-500' },
    // 2층 (5개, 틈새에 끼임)
    { x: 18, y: 100, size: 28, color: 'from-red-400 to-rose-500' },
    { x: 46, y: 98, size: 27, color: 'from-cyan-400 to-sky-500' },
    { x: 73, y: 101, size: 26, color: 'from-yellow-400 to-amber-500' },
    { x: 99, y: 97, size: 29, color: 'from-fuchsia-400 to-pink-600' },
    { x: 127, y: 100, size: 26, color: 'from-teal-400 to-emerald-500' },
    // 3층 (5개)
    { x: 8, y: 76, size: 26, color: 'from-orange-400 to-red-500' },
    { x: 34, y: 74, size: 28, color: 'from-indigo-400 to-blue-500' },
    { x: 62, y: 77, size: 25, color: 'from-lime-400 to-green-500' },
    { x: 88, y: 73, size: 27, color: 'from-pink-400 to-rose-500' },
    { x: 116, y: 76, size: 26, color: 'from-sky-400 to-cyan-500' },
    // 4층 (4개)
    { x: 22, y: 52, size: 27, color: 'from-purple-400 to-violet-500' },
    { x: 50, y: 50, size: 26, color: 'from-amber-300 to-orange-500' },
    { x: 78, y: 53, size: 28, color: 'from-blue-400 to-sky-500' },
    { x: 106, y: 51, size: 25, color: 'from-green-400 to-emerald-500' },
    // 5층 꼭대기 (3개)
    { x: 36, y: 30, size: 26, color: 'from-red-300 to-pink-500' },
    { x: 64, y: 28, size: 27, color: 'from-yellow-300 to-amber-500' },
    { x: 92, y: 31, size: 25, color: 'from-violet-300 to-purple-500' },
];

const BALL_SHAKE_OFFSETS = BALL_POSITIONS.map((_, i) => ({
    y: deterministicRandom(i + 401) * 8,
    x: deterministicRandom(i + 503) * 5,
    rotate: deterministicRandom(i + 601) * 10,
}));

/* ── 배출구 공 색상 팔레트 ── */
const DROP_BALL_COLORS = [
    { gradient: 'from-sky-400 to-blue-500', shadow: 'rgba(56,189,248,0.5)' },
    { gradient: 'from-rose-400 to-pink-500', shadow: 'rgba(251,113,133,0.5)' },
    { gradient: 'from-emerald-400 to-green-500', shadow: 'rgba(52,211,153,0.5)' },
    { gradient: 'from-violet-400 to-purple-500', shadow: 'rgba(167,139,250,0.5)' },
    { gradient: 'from-amber-400 to-orange-500', shadow: 'rgba(251,191,36,0.5)' },
    { gradient: 'from-cyan-400 to-sky-500', shadow: 'rgba(34,211,238,0.5)' },
    { gradient: 'from-fuchsia-400 to-pink-600', shadow: 'rgba(232,121,249,0.5)' },
    { gradient: 'from-red-400 to-rose-500', shadow: 'rgba(248,113,113,0.5)' },
];

/* ── 가차머신 본체 ── */
const GachaMachine = memo(({ phase, ballColor }: { phase: 'idle' | 'shake' | 'drop' | 'reveal'; ballColor?: { gradient: string; shadow: string } }) => (
    <div className="relative mx-auto" style={{ width: 220, height: 300 }}>
        <motion.div
            animate={phase === 'shake' ? { rotate: [0, -2.4, 2.4, -1.4, 1.4, 0], x: [0, -2, 2, -1, 1, 0], y: [0, -3, 1, -2, 0] } : { rotate: 0, x: 0, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeInOut' }}
            className="relative h-full w-full"
        >
            {/* ─ 상단 헤더 (전구 포함) ─ */}
            <div className="absolute left-1/2 top-0 z-10 h-[20px] w-[190px] -translate-x-1/2 rounded-t-[8px] border-[3px] border-b-0 border-slate-950 bg-[#ff6b00] shadow-[4px_4px_0_#111827]">
                <div className="absolute inset-x-2 top-1 h-1 bg-white/35" />
                {[...Array(7)].map((_, i) => (
                    <motion.div
                        key={i}
                        animate={{ opacity: [0.65, 1, 0.65], y: [0, -1, 0] }}
                        transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.18 }}
                        className="absolute -top-2 h-4 w-4 rounded-[4px] border-2 border-slate-950 bg-yellow-300 shadow-[2px_2px_0_#111827]"
                        style={{ left: `${18 + i * 23}px` }}
                    />
                ))}
            </div>

            {/* ─ 유리 통 (직선 1자) ─ */}
            <div className="absolute left-1/2 top-[14px] -translate-x-1/2 w-[190px] h-[170px]">
                <div className="pixel-grid-bg absolute inset-0 overflow-hidden rounded-b-[10px] border-[4px] border-slate-950 bg-gradient-to-b from-cyan-100 via-sky-200 to-blue-300 shadow-[inset_0_-8px_0_rgba(14,165,233,0.28),4px_4px_0_#111827]">
                    <div className="pixel-scanline pointer-events-none absolute inset-0 opacity-35" />
                    {/* 유리 반사 */}
                    <div className="absolute left-3 top-5 h-20 w-4 rotate-[12deg] bg-white/55" />
                    <div className="absolute left-8 top-5 h-7 w-3 rotate-[12deg] bg-white/45" />
                    <div className="absolute right-5 top-11 h-12 w-3 rotate-[12deg] bg-white/35" />

                    {/* 캡슐들 — 빽빽하게 쌓임 */}
                    {BALL_POSITIONS.map((ball, i) => (
                        <motion.div
                            key={i}
                            animate={
                                phase === 'shake'
                                    ? {
                                        y: [0, -10 - BALL_SHAKE_OFFSETS[i].y, 6, -3, 0],
                                        x: [0, (i % 2 === 0 ? -1 : 1) * (3 + BALL_SHAKE_OFFSETS[i].x), 0],
                                        rotate: [0, (i % 2 === 0 ? -1 : 1) * (10 + BALL_SHAKE_OFFSETS[i].rotate), 0],
                                    }
                                    : {}
                            }
                            transition={{
                                duration: phase === 'shake' ? 0.45 : 0,
                                repeat: phase === 'shake' ? 1 : 0,
                                delay: i * 0.02,
                                ease: 'easeInOut',
                            }}
                            className={`absolute rounded-full border-2 border-slate-950 bg-gradient-to-br ${ball.color} shadow-[2px_2px_0_rgba(17,24,39,0.75)]`}
                            style={{ width: ball.size, height: ball.size, left: ball.x, top: ball.y }}
                        >
                            {/* 하이라이트 */}
                            <div className="absolute left-[18%] top-[14%] h-[24%] w-[24%] rounded-[2px] bg-white/65" />
                            {/* 별 무늬 */}
                            <span className="absolute inset-0 flex items-center justify-center t-micro text-yellow-100/90">★</span>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* ─ 머신 본체 (하단 — 주황/노랑) ─ */}
            <div className="absolute left-1/2 top-[180px] -translate-x-1/2 w-[190px] h-[112px]">
                <div className="pixel-card absolute inset-0 overflow-hidden rounded-b-[18px] border-[4px] border-slate-950 bg-gradient-to-b from-[#ffd247] via-[#ffb000] to-[#ff8a00] shadow-[6px_6px_0_#111827]">
                    <div className="absolute inset-x-0 top-0 h-2 bg-white/30" />
                    <div className="absolute inset-x-4 bottom-3 h-4 border-y-2 border-slate-950 bg-[repeating-linear-gradient(90deg,#111827_0_8px,#fef3c7_8px_16px)] opacity-85" />
                </div>

                {/* 다이얼 (왼쪽 — 흰색 원) */}
                <div className="absolute left-4 top-4">
                    <motion.div
                        animate={phase === 'shake' ? { rotate: [0, 120, 240, 240] } : { rotate: 0 }}
                        transition={{ duration: 0.55, ease: 'easeInOut' }}
                        className="relative flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-slate-950 bg-white shadow-[3px_3px_0_#111827]"
                    >
                        <div className="h-2 w-8 rotate-[30deg] rounded-[3px] border border-slate-950 bg-slate-300" />
                        <div className="absolute h-3 w-3 rounded-[3px] border border-slate-950 bg-slate-100" />
                    </motion.div>
                </div>

                {/* 배출구 (오른쪽 — 핑크 사각) */}
                <div className="absolute right-3 top-3">
                    <div className="relative h-[62px] w-[72px] overflow-hidden rounded-[8px] border-[4px] border-slate-950 bg-gradient-to-b from-[#ff4fa3] to-[#d91b72] shadow-[inset_0_4px_0_rgba(0,0,0,0.22),3px_3px_0_#111827]">
                        <div className="absolute inset-x-0 top-0 h-1 bg-white/30" />
                        <AnimatePresence>
                            {phase === 'drop' && (
                                <motion.div
                                    initial={{ y: -30, opacity: 0, rotate: -20 }}
                                    animate={{ y: 14, opacity: 1, rotate: 0 }}
                                    exit={{ y: 40, opacity: 0, scale: 0.7 }}
                                    transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                                    className={`absolute left-1/2 top-0 h-7 w-7 -translate-x-1/2 rounded-full border-2 border-slate-950 bg-gradient-to-br ${ballColor?.gradient ?? 'from-yellow-300 to-amber-500'}`}
                                    style={{ boxShadow: `3px 3px 0 #111827, 0 0 0 3px ${ballColor?.shadow ?? 'rgba(251,191,36,0.5)'}` }}
                                >
                                    <div className="absolute left-[18%] top-[14%] h-[24%] w-[24%] rounded-[2px] bg-white/65" />
                                    <span className="absolute inset-0 flex items-center justify-center t-micro text-yellow-100">★</span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* ─ 바닥 그림자 ─ */}
            <div className="absolute -bottom-1 left-1/2 h-3 w-44 -translate-x-1/2 border-2 border-slate-950 bg-slate-300 shadow-[4px_4px_0_#111827]" />
        </motion.div>
    </div>
));

/* ── 결과 리빌 카드 ── */
const ResultCard = memo(({ result, onClose }: { result: RewardItem; onClose: () => void }) => {
    const config = REWARD_RARITY_CONFIG[result.rarity];
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.35, y: 36, rotate: -3 }}
                animate={{ scale: 1, y: 0, rotate: 0 }}
                exit={{ scale: 0.86, opacity: 0, y: 16 }}
                transition={{ type: 'spring', damping: 14, stiffness: 180 }}
                onClick={(e) => e.stopPropagation()}
                className={`comfort-card relative w-full max-w-[300px] overflow-hidden rounded-[24px] bg-white p-5 ring-4 ${result.ringColor}`}
            >
                <div className="absolute inset-x-0 top-0 h-1.5 bg-toss-blue/70" />

                {/* 파티클 이펙트 */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <Particles count={config.particleCount} color={`bg-gradient-to-br ${result.capsuleColor}`} />
                </div>

                {/* 등급 뱃지 */}
                <div className="text-center">
                    <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className={`mt-3 text-[11px] font-black ${config.color}`}
                    >
                        ★ {config.label} ★
                    </motion.p>
                </div>

                {/* 캡슐 아이콘 */}
                <motion.div
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', damping: 10, stiffness: 200, delay: 0.1 }}
                    className="mx-auto mt-4 flex h-24 w-24 items-center justify-center"
                >
                    <div className={`relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br ${result.capsuleColor} shadow-lg`}>
                        <Gift size={32} className="text-white" />
                        <div className="absolute left-[18%] top-[14%] h-[24%] w-[24%] rounded-[2px] bg-white/55" />
                        {/* 회전 링 */}
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                            className={`absolute -inset-2 rounded-full border-2 border-dashed ${result.ringColor} opacity-45`}
                        />
                    </div>
                </motion.div>

                {/* 포인트 */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 }}
                    className="mt-5 text-center"
                >
                    <p className={`text-[36px] font-black leading-none ${result.textColor}`}>+{result.points}점</p>
                    <p className="mt-2 text-[13px] font-black text-slate-700">포인트가 들어왔어요</p>
                </motion.div>

                {/* 등급 태그 */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className={`mx-auto mt-4 w-fit rounded-full px-4 py-1.5 text-[12px] font-black ${result.bgColor} ${result.textColor}`}
                >
                    {result.badge}
                </motion.div>

                {/* 닫기 */}
                <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    whileTap={{ scale: 0.97, y: 2 }}
                    onClick={onClose}
                    className="comfort-press mt-5 w-full rounded-[18px] bg-slate-950 py-3.5 text-[15px] font-black text-white shadow-sm"
                >
                    확인
                </motion.button>
            </motion.div>
        </motion.div>
    );
});

/* ── 일일 뽑기 제한 ── */
const MAX_DAILY_TICKET_DRAWS = 30;
const MAX_DAILY_BONUS_DRAWS = 30;
const MAX_DAILY_AD_DRAWS = 30;
const ENABLE_INTERSTITIAL_START = false;
const ENABLE_REWARDED_REDRAW = false;

/* ── 세션 뽑기 제한 ── */
const SESSION_STORAGE_KEY = 'gacha_session_v2';
const MAX_DRAWS_PER_SESSION = 5;
const SESSION_DURATION_HOURS = 3;
const SESSION_DURATION_MS = SESSION_DURATION_HOURS * 60 * 60 * 1000;

/** localStorage에서 오늘 날짜 기준 카운트 읽기 */
const getDailyCount = (key: string): number => {
    try {
        const stored = localStorage.getItem(key);
        if (!stored) return 0;
        const { date, count } = JSON.parse(stored);
        if (date !== new Date().toDateString()) return 0;
        return count;
    } catch { return 0; }
};
const setDailyCount = (key: string, count: number) => {
    localStorage.setItem(key, JSON.stringify({ date: new Date().toDateString(), count }));
};

/** 세션 데이터 읽기/쓰기 (만료되면 자동 리셋) */
interface SessionData { startedAt: number; draws: number; }
const getSession = (): SessionData => {
    try {
        const stored = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!stored) return { startedAt: 0, draws: 0 };
        const data: SessionData = JSON.parse(stored);
        if (Date.now() - data.startedAt >= SESSION_DURATION_MS) return { startedAt: 0, draws: 0 };
        return data;
    } catch { return { startedAt: 0, draws: 0 }; }
};
const saveSession = (data: SessionData) => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
};

/* ── 메인 페이지 컴포넌트 ── */
export const RewardGachaPage = memo(({
    drawCount,
    userPoints,
    isAdLoading = false,
    adLoadError = null,
    onBack,
    onRecharge: _onRecharge,
    onShowInterstitialAd,
    onShowQuickInterstitialAd,
    onShowRewardedAd,
    onDraw,
    onClaimReward,
}: RewardGachaPageProps) => {
    useAppNavigationBar({
        title: '행운 뽑기',
        showBack: true,
        onBackPress: onBack,
    });

    type Phase = 'idle' | 'shake' | 'drop' | 'reveal';
    const [phase, setPhase] = useState<Phase>('idle');
    const [result, setResult] = useState<RewardItem | null>(null);
    const [showResult, setShowResult] = useState(false);

    // 배출구 공 색상 — result가 있으면 해당 캡슐 색, 없으면 랜덤
    const dropBallColor = useMemo(() => {
        if (result) return { gradient: result.capsuleColor, shadow: result.glow ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.2)' };
        return DROP_BALL_COLORS[Math.floor(deterministicRandom(901) * DROP_BALL_COLORS.length)];
    }, [result]);
    const [recentRewards, setRecentRewards] = useState<RewardItem[]>([]);
    const [bonusDrawCount, setBonusDrawCount] = useState(0);
    const [hasDrawnOnce, setHasDrawnOnce] = useState(false); // 첫 뽑기 여부 추적
    const [adMessage, setAdMessage] = useState('광고를 보면 한 번 더 뽑을 수 있어요');
    const [currentTime, setCurrentTime] = useState(() => Date.now());

    // ── 일일 뽑기 횟수 (로컬 트래킹, 서버 연동 시 서버 기준으로 대체) ──
    const [dailyTicketDraws, setDailyTicketDraws] = useState(() => getDailyCount('gacha_daily_ticket'));
    const [dailyBonusDraws, setDailyBonusDraws] = useState(() => getDailyCount('gacha_daily_bonus'));
    const [dailyAdDraws, setDailyAdDraws] = useState(() => getDailyCount('gacha_daily_ad'));

    // ── 세션 뽑기 횟수 (4시간 / 30회) ──
    const [sessionData, setSessionData] = useState<SessionData>(() => getSession());
    const sessionDrawsLeft = MAX_DRAWS_PER_SESSION - sessionData.draws;
    const sessionExpired = sessionData.startedAt > 0 && currentTime - sessionData.startedAt >= SESSION_DURATION_MS;
    const sessionExpiresAt = sessionData.startedAt > 0 ? new Date(sessionData.startedAt + SESSION_DURATION_MS) : null;
    const sessionRemainingMs = sessionExpiresAt ? Math.max(0, sessionExpiresAt.getTime() - currentTime) : SESSION_DURATION_MS;
    const sessionLimitReached = sessionDrawsLeft <= 0 && !sessionExpired;
    const sessionCountdownText = sessionLimitReached
        ? `${formatDuration(sessionRemainingMs)} 뒤에 다시 뽑을 수 있어요`
        : sessionData.startedAt > 0
            ? `${formatDuration(sessionRemainingMs)} 뒤에 참여 횟수가 다시 채워져요`
            : `첫 뽑기부터 ${SESSION_DURATION_HOURS}시간 동안 최대 ${MAX_DRAWS_PER_SESSION}번 참여할 수 있어요`;

    useEffect(() => {
        if (!sessionExpiresAt || sessionExpired) return;
        const initialTick = window.setTimeout(() => setCurrentTime(Date.now()), 0);
        const timer = window.setInterval(() => {
            setCurrentTime(Date.now());
        }, 1000);
        return () => {
            clearTimeout(initialTick);
            clearInterval(timer);
        };
    }, [sessionExpiresAt, sessionExpired]);

    // 세션 만료 자동 감지 (4시간 후 리셋)
    useEffect(() => {
        if (!sessionExpiresAt) return;
        const remaining = sessionExpiresAt.getTime() - Date.now();
        if (remaining <= 0) {
            const resetTimer = window.setTimeout(() => {
                const reset = { startedAt: 0, draws: 0 };
                setSessionData(reset);
                saveSession(reset);
                setAdMessage(`참여 횟수가 다시 열렸어요. 지금부터 다시 ${MAX_DRAWS_PER_SESSION}번 뽑을 수 있어요.`);
            }, 0);
            return () => clearTimeout(resetTimer);
        }
        const timer = window.setTimeout(() => {
            const reset = { startedAt: 0, draws: 0 };
            setSessionData(reset);
            saveSession(reset);
            setAdMessage(`참여 횟수가 다시 열렸어요. 지금부터 다시 ${MAX_DRAWS_PER_SESSION}번 뽑을 수 있어요.`);
        }, remaining);
        return () => clearTimeout(timer);
    }, [sessionExpiresAt]);

    /** 세션 뽑기 카운트 증가 (첫 뽑기 시 세션 시작) */
    const incrementSession = useCallback(() => {
        setSessionData(prev => {
            const startedAt = prev.startedAt || Date.now();
            const next = { startedAt, draws: prev.draws + 1 };
            saveSession(next);
            return next;
        });
    }, []);

    const ticketDrawsLeft = MAX_DAILY_TICKET_DRAWS - dailyTicketDraws;
    const bonusDrawsLeft = MAX_DAILY_BONUS_DRAWS - dailyBonusDraws;
    const adDrawsLeft = MAX_DAILY_AD_DRAWS - dailyAdDraws;

    const incrementDailyTicket = useCallback(() => {
        setDailyTicketDraws(prev => { const next = prev + 1; setDailyCount('gacha_daily_ticket', next); return next; });
    }, []);
    const incrementDailyBonus = useCallback(() => {
        setDailyBonusDraws(prev => { const next = prev + 1; setDailyCount('gacha_daily_bonus', next); return next; });
    }, []);
    const incrementDailyAd = useCallback(() => {
        setDailyAdDraws(prev => { const next = prev + 1; setDailyCount('gacha_daily_ad', next); return next; });
    }, []);
    const isDrawing = phase !== 'idle';

    /** 실제 뽑기 연출 실행 — API 호출 병렬, 서버 보상 우선 사용 */
    const executeDraw = useCallback((drawType: DrawType) => {
        const consumeTicket = drawType === 'ticket' || drawType === 'ad_interstitial';

        // Phase 1: 흔들기 (API 호출과 동시 시작)
        setPhase('shake');
        setResult(null);
        setShowResult(false);

        // API 호출 (애니메이션과 병렬)
        const drawPromise: Promise<DrawResult | null> = onDraw
            ? onDraw(drawType).catch((err: any) => { console.error('[GachaDraw] API error:', err); return null; })
            : Promise.resolve(null);

        // Phase 2: 캡슐 떨어지기 (700ms)
        window.setTimeout(() => setPhase('drop'), 700);

        // Phase 3: 결과 리빌 (1300ms + API 응답 대기)
        window.setTimeout(() => {
            void drawPromise.then((serverData) => {
                if (!serverData) {
                    console.warn('[RewardGachaPage] Draw failed without server result', { drawType });
                    setPhase('idle');
                    setAdMessage('뽑기 결과를 확인하지 못했어요. 다시 시도해 주세요');
                    return;
                }

                let reward: RewardItem;
                const serverReward = serverData.reward;
                if (serverReward) {
                    // 서버 보상을 REWARD_TABLE 항목과 매칭
                    const matched = REWARD_TABLE.find(
                        r => r.points === serverReward.points && r.rarity === serverReward.rarity
                    );
                    if (matched) {
                        reward = matched;
                    } else {
                        // 매칭 안 되면 rarity 기준 템플릿 + 서버 값
                        const template = REWARD_TABLE.find(r => r.rarity === (serverReward.rarity as RewardRarity)) || REWARD_TABLE[0];
                        reward = { ...template, label: serverReward.label, points: serverReward.points };
                    }
                } else {
                    const awardedOnly = getAwardedPoints(serverData, 0);
                    if (awardedOnly <= 0) {
                        console.warn('[RewardGachaPage] Draw response had no reward points', { drawType, serverData });
                        setPhase('idle');
                        setAdMessage('보상 정보를 확인하지 못했어요. 다시 시도해 주세요');
                        return;
                    }
                    reward = rewardFromPoints(awardedOnly);
                }

                const awardedPoints = getAwardedPoints(serverData, reward.points);
                const displayReward = awardedPoints === reward.points
                    ? reward
                    : {
                        ...reward,
                        label: `${awardedPoints}점`,
                        points: awardedPoints,
                    };

                if (serverData?.reward && awardedPoints !== reward.points) {
                    console.warn('[RewardGachaPage] Display reward and awarded points differ', {
                        reward,
                        awardedPoints,
                        serverData,
                    });
                }

                setPhase('reveal');
                setResult(displayReward);
                setShowResult(true);
                setHasDrawnOnce(true);
                setRecentRewards((prev) => [displayReward, ...prev].slice(0, 5));
                onClaimReward({
                    points: awardedPoints,
                    label: displayReward.label,
                    rarity: displayReward.rarity,
                    consumeTicket,
                    serverData: serverData ?? undefined,
                });
                logRewardClaim(`reward_gacha_${displayReward.rarity}`, awardedPoints);
                setAdMessage('광고를 보면 한 번 더 뽑을 수 있어요');

                // Phase 4: idle 복귀 (reveal 후 500ms)
                window.setTimeout(() => setPhase('idle'), 500);
            });
        }, 1300);
    }, [onClaimReward, onDraw]);

    const handleDraw = useCallback(() => {
        if (isDrawing || isAdLoading) return;

        if (sessionLimitReached) {
            setAdMessage(`이번 이용 가능 횟수를 모두 사용했어요. ${sessionCountdownText}`);
            return;
        }

        // 보너스 뽑기가 있으면 바로 사용
        if (bonusDrawCount > 0) {
            if (bonusDrawsLeft <= 0) {
                setAdMessage('오늘 추가 뽑기를 모두 했어요');
                return;
            }
            logClick('reward_gacha_draw_click', { draw_count: drawCount, bonus_draw: true });
            setBonusDrawCount((prev) => Math.max(0, prev - 1));
            incrementDailyBonus();
            incrementSession();
            executeDraw('bonus');
            return;
        }

        // 티켓이 있으면 바로 뽑기
        if (drawCount > 0) {
            if (ticketDrawsLeft <= 0) {
                setAdMessage('오늘 이용권으로 하는 뽑기를 모두 했어요');
                return;
            }
            logClick('reward_gacha_draw_click', { draw_count: drawCount, bonus_draw: false });
            incrementDailyTicket();
            incrementSession();
            executeDraw('ticket');
            return;
        }

        // 광고 뽑기 일일 한도 체크
        if (adDrawsLeft <= 0) {
            setAdMessage('오늘 광고 뽑기를 모두 했어요');
            return;
        }

        // 티켓 없음 → 뽑은 적 없으면: 전면형 광고로 티켓 획득
        if (!hasDrawnOnce) {
            if (!ENABLE_INTERSTITIAL_START) {
                setAdMessage('지금은 잠시 쉬는 중이에요. 광고를 보면 한 번 더 할 수 있어요');
                return;
            }

            logClick('reward_gacha_interstitial_ad', { ad_id: FULLSCREEN_AD_ID });
            setAdMessage('광고를 준비하고 있어요...');
            onShowInterstitialAd?.(() => {
                incrementDailyAd();
                incrementSession();
                executeDraw('ad_interstitial');
            });
            return;
        }

        // 티켓 없음 + 이미 뽑은 적 있음 → 리워드 광고로 무료 뽑기
        if (!ENABLE_REWARDED_REDRAW) {
            setAdMessage('지금은 잠시 쉬는 중이에요. 광고를 보면 한 번 더 할 수 있어요');
            return;
        }

        logClick('reward_gacha_rewarded_ad', { ad_id: GACHA_REWARDED_AD_ID });
        setAdMessage('광고를 준비하고 있어요...');
        onShowRewardedAd?.(() => {
            // 리워드 광고 완료 콜백 → 횟수 차감 후 무료 뽑기 실행
            incrementDailyAd();
            incrementSession();
            executeDraw('ad_rewarded');
        });
    }, [isDrawing, isAdLoading, sessionLimitReached, sessionCountdownText, bonusDrawCount, drawCount, hasDrawnOnce, ticketDrawsLeft, bonusDrawsLeft, adDrawsLeft, executeDraw, incrementDailyTicket, incrementDailyBonus, incrementDailyAd, incrementSession, onShowInterstitialAd, onShowRewardedAd]);

    const handleWatchBonusAd = useCallback(() => {
        if (isAdLoading) return;
        logClick('reward_gacha_bonus_interstitial_click', { ad_id: GACHA_QUICK_FULLSCREEN_AD_ID });
        setAdMessage('5초 광고를 준비하고 있어요...');
        onShowQuickInterstitialAd?.(() => {
            setBonusDrawCount((prev) => prev + 1);
            setAdMessage('한 번 더 뽑을 수 있어요!');
        });
    }, [isAdLoading, onShowQuickInterstitialAd]);

    const canDraw = !sessionLimitReached && ((drawCount > 0 && ticketDrawsLeft > 0) || (bonusDrawCount > 0 && bonusDrawsLeft > 0));
    const initialStartDisabled = !ENABLE_INTERSTITIAL_START && !canDraw && !hasDrawnOnce && adDrawsLeft > 0 && !sessionLimitReached;
    const canStartWithInterstitial = ENABLE_INTERSTITIAL_START && !canDraw && !hasDrawnOnce && adDrawsLeft > 0 && !sessionLimitReached && !!onShowInterstitialAd;
    const canRepeatWithRewardedAd = ENABLE_REWARDED_REDRAW && !canDraw && hasDrawnOnce && adDrawsLeft > 0 && !sessionLimitReached && !!onShowRewardedAd;
    const rewardedRedrawDisabled = !ENABLE_REWARDED_REDRAW && !canDraw && hasDrawnOnce && adDrawsLeft > 0 && !sessionLimitReached;
    const adEntryDisabled = initialStartDisabled || rewardedRedrawDisabled;
    /** 광고로 뽑기 가능 여부 (티켓 없어도 광고로 뽑기 가능, 세션 제한 적용) */
    const canDrawWithAd = canStartWithInterstitial || canRepeatWithRewardedAd;
    /** 모든 일일 한도를 소진했는지 */
    const allDailyLimitsReached = ticketDrawsLeft <= 0 && bonusDrawsLeft <= 0 && adDrawsLeft <= 0;
    const sessionProgressValue = Math.min((sessionData.draws / MAX_DRAWS_PER_SESSION) * 100, 100);
    const allLimitsReached = allDailyLimitsReached || sessionLimitReached;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="-mx-5 -mt-10 flex min-h-[100dvh] flex-col bg-cream text-slate-950 surface-play"
        >
            {/* ── 상단 스탯 바 ── */}
            <section className="px-4 pt-14 pb-2">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[13px] font-bold text-toss-gray-500">포인트 모으기</p>
                        <h1 className="text-[25px] font-black leading-tight text-slate-950">행운 뽑기</h1>
                    </div>
                    <motion.button
                        type="button"
                        whileTap={{ scale: 0.96, y: 2 }}
                        onClick={onBack}
                        className="comfort-card comfort-press flex h-11 shrink-0 items-center gap-1.5 rounded-[16px] bg-white px-3.5 text-[14px] font-black text-slate-950"
                    >
                        <Home size={15} strokeWidth={2.5} />
                        홈으로
                    </motion.button>
                </div>
                <div className="flex gap-2">
                    {/* 보유 포인트 */}
                    <div className="comfort-card min-w-0 flex-1 rounded-[18px] bg-white px-3 py-3">
                        <div className="flex items-center gap-1.5">
                            <Coins size={14} className="text-toss-blue" />
                            <span className="text-[12px] font-black text-slate-600">내 포인트</span>
                        </div>
                        <p className="mt-1 truncate text-[20px] font-black text-slate-950">{userPoints.toLocaleString()}<span className="text-[13px] font-black text-slate-500">점</span></p>
                    </div>
                    {/* 남은 이용권 */}
                    <div className="comfort-card min-w-0 flex-1 rounded-[18px] bg-white px-3 py-3">
                        <div className="flex items-center gap-1.5">
                            <Gift size={14} className="text-danger" />
                            <span className="text-[12px] font-black text-slate-600">이용권</span>
                        </div>
                        <p className="mt-1 text-[20px] font-black text-slate-950">{drawCount}<span className="text-[13px] font-black text-slate-500">장</span></p>
                    </div>
                </div>
            </section>

            {adLoadError && (
                <section className="px-4 pb-3">
                    <div className="comfort-card flex items-center gap-3 rounded-[18px] border border-rose-100 bg-rose-50 px-4 py-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-white text-rose-500">
                            <AlertCircle size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-black text-rose-900">광고를 불러오지 못했어요</p>
                            <p className="mt-0.5 text-[11px] font-bold text-rose-600">잠시 후 다시 시도해 주세요.</p>
                        </div>
                        <button
                            type="button"
                            onClick={adLoadError.retry}
                            className="shrink-0 rounded-[13px] bg-white px-3 py-2 text-[12px] font-black text-rose-600 shadow-sm"
                        >
                            다시 시도
                        </button>
                    </div>
                </section>
            )}

            <section className="px-4 pb-3">
                <div className="grid grid-cols-2 gap-2">
                    <div className="comfort-card min-w-0 rounded-[18px] bg-white px-3 py-3">
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-[11px] font-black leading-tight text-slate-700">이번 {SESSION_DURATION_HOURS}시간</p>
                            <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-500">
                                {sessionDrawsLeft}회 남음
                            </span>
                        </div>
                        <p className="mt-2 text-[22px] font-black text-slate-950">
                            {sessionData.draws}번 / {MAX_DRAWS_PER_SESSION}번
                        </p>
                        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-toss-gray-100">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${sessionProgressValue}%` }}
                                transition={{ duration: 0.45, ease: 'easeOut' }}
                                className="h-full rounded-full bg-toss-blue"
                            />
                        </div>
                    </div>

                    <div className="comfort-card min-w-0 rounded-[18px] bg-white px-3 py-3">
                        <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-700">
                            <Clock3 size={13} className="text-toss-blue" />
                            다시 되는 시간
                        </div>
                        <p className={`mt-2 text-[17px] font-black leading-tight ${sessionLimitReached ? 'text-danger' : 'text-slate-950'}`}>
                            {sessionData.startedAt > 0 ? formatDuration(sessionRemainingMs) : `${SESSION_DURATION_HOURS}시간 동안`}
                        </p>
                        <p className="mt-1 line-clamp-2 t-micro font-bold leading-[1.45] text-slate-500">
                            {sessionCountdownText}
                        </p>
                    </div>
                </div>
            </section>

            {/* ── 가차머신 ── */}
            <section className="relative px-5 pb-4">
                <div className="comfort-card relative overflow-hidden rounded-[24px] bg-white px-4 pt-6 pb-6">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-toss-blue/70" />
                    <div className="pointer-events-none absolute inset-x-5 top-8 h-2 rounded-full bg-toss-gray-100" />

                    <GachaMachine
                        phase={phase}
                        ballColor={dropBallColor}
                    />

                    {/* 상태 메시지 */}
                    <div className="mt-5 text-center">
                        <AnimatePresence mode="wait">
                            <motion.p
                                key={isDrawing ? 'drawing' : sessionLimitReached ? 'session-limit' : allDailyLimitsReached ? 'daily-limit' : bonusDrawCount > 0 ? 'bonus' : canDraw ? 'ready' : initialStartDisabled ? 'start-disabled' : rewardedRedrawDisabled ? 'ad-disabled' : canDrawWithAd ? (hasDrawnOnce ? 'ad-rewarded' : 'ad-interstitial') : 'empty'}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                className="mx-auto min-h-[42px] max-w-[310px] rounded-[16px] bg-toss-gray-50 px-3 py-2.5 text-[13px] font-bold leading-[1.45] text-slate-700 break-keep"
                            >
                                {isDrawing
                                    ? '뽑는 중...'
                                    : sessionLimitReached
                                        ? `${MAX_DRAWS_PER_SESSION}번을 모두 사용했어요 · ${sessionCountdownText}`
                                    : allDailyLimitsReached
                                        ? `오늘 가능한 뽑기를 모두 사용했어요 · 내일 다시 열려요`
                                        : bonusDrawCount > 0 && bonusDrawsLeft > 0
                                            ? `한 번 더 뽑을 수 있어요 · 오늘 ${dailyBonusDraws}번 했어요 · 이번 ${SESSION_DURATION_HOURS}시간 ${sessionData.draws}번 했어요`
                                            : canDraw
                                                ? `지금 바로 뽑을 수 있어요 · 이용권 ${drawCount}장 · 오늘 ${dailyTicketDraws}번 했어요`
                                                    : initialStartDisabled
                                                        ? '지금은 바로 뽑을 수 없어요. 광고를 보면 한 번 더 할 수 있어요'
                                                    : rewardedRedrawDisabled
                                                        ? '지금은 한 번 더 뽑을 수 없어요. 광고를 보면 다시 열릴 수 있어요'
                                                    : canDrawWithAd
                                                        ? hasDrawnOnce
                                                            ? `광고 보고 한 번 더 뽑기 · 오늘 ${dailyAdDraws}번 했어요 · 이번 ${SESSION_DURATION_HOURS}시간 ${sessionData.draws}번 했어요`
                                                            : '광고 보고 첫 뽑기 시작하기'
                                                        : '홈에서 이용권을 받으면 바로 다시 뽑을 수 있어요'}
                            </motion.p>
                        </AnimatePresence>
                    </div>

                    {/* 뽑기 버튼 */}
                    <motion.button
                        whileTap={(canDraw || canDrawWithAd) && !adEntryDisabled && !isDrawing && !allLimitsReached ? { scale: 0.97, y: 4 } : undefined}
                        onClick={handleDraw}
                        disabled={isDrawing || isAdLoading || allLimitsReached || adEntryDisabled}
                        className="comfort-press relative mt-4 min-h-[60px] w-full overflow-hidden rounded-[18px] py-4 text-[16px] font-black shadow-sm transition-all disabled:shadow-none"
                    >
                        {/* 버튼 배경 */}
                        <div className={`absolute inset-0 transition-all duration-300 ${
                            allLimitsReached || adEntryDisabled
                                ? 'bg-toss-gray-200'
                                : canDraw || canDrawWithAd
                                    ? 'bg-toss-blue'
                                    : 'bg-toss-gray-200'
                        }`} />
                        {(canDraw || canDrawWithAd) && !adEntryDisabled && !isDrawing && !allLimitsReached && (
                            <motion.div
                                animate={{ x: ['-100%', '100%'] }}
                                transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
                                className="absolute inset-y-0 w-8 bg-white/20"
                            />
                        )}
                        <span className={`relative z-10 inline-flex w-full items-center justify-center px-2 text-center leading-tight break-keep ${!allLimitsReached && !adEntryDisabled && (canDraw || canDrawWithAd) ? 'text-white' : 'text-slate-500'}`}>
                            {isDrawing ? (
                                <span className="inline-flex items-center gap-2">
                                    <Loader2 size={16} className="animate-spin" />
                                    뽑는 중...
                                </span>
                            ) : allLimitsReached ? (
                                sessionLimitReached ? (
                                    <span className="inline-flex flex-col items-center gap-1 leading-none">
                                        <span className="inline-flex items-center gap-1.5 text-[14px] font-black text-danger">
                                            <Clock3 size={15} />
                                            다시 뽑을 수 있기까지
                                        </span>
                                        <span className="text-[18px] font-black text-slate-700">
                                            {formatDuration(sessionRemainingMs)}
                                        </span>
                                    </span>
                                ) : '잠시 쉬는 시간이에요'
                            ) : initialStartDisabled ? (
                                '광고 보고 뽑기 시작하기'
                            ) : rewardedRedrawDisabled ? (
                                '광고 보고 다시 뽑기'
                            ) : isAdLoading ? (
                                <span className="inline-flex items-center gap-2">
                                    <Loader2 size={16} className="animate-spin" />
                                    광고 준비 중...
                                </span>
                            ) : bonusDrawCount > 0 ? (
                                <span className="inline-flex items-center gap-1.5">
                                    <Star size={16} className="fill-current text-yellow-300" />
                                    한 번 더 뽑기
                                </span>
                            ) : canDraw ? (
                                <span className="inline-flex items-center gap-1.5">
                                    <Sparkles size={16} />
                                    이용권 1장으로 뽑기
                                </span>
                            ) : hasDrawnOnce ? (
                                <span className="inline-flex items-center gap-1.5">
                                    <Tv size={16} />
                                    광고 보고 한 번 더 뽑기
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5">
                                    <Tv size={16} />
                                    광고 보고 뽑기 시작하기
                                </span>
                            )}
                        </span>
                    </motion.button>
                </div>
            </section>

            {/* ── 광고 추가 뽑기 ── */}
            <section className="px-5 pb-3">
                <div className="comfort-card flex items-center gap-3 rounded-[20px] bg-white px-4 py-3.5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-violet-50">
                        <PlayCircle size={20} className="text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-black text-slate-950">광고 보고 한 번 더</p>
                        <p className="mt-0.5 truncate text-[11px] font-bold text-slate-500">{adMessage}</p>
                    </div>
                    <motion.button
                        type="button"
                        whileTap={isAdLoading || isDrawing ? undefined : { scale: 0.95, y: 2 }}
                        onClick={handleWatchBonusAd}
                        disabled={isAdLoading || isDrawing}
                        className={`comfort-press shrink-0 rounded-[14px] px-3.5 py-2.5 text-[13px] font-black shadow-sm transition-all ${
                            isAdLoading || isDrawing
                                ? 'bg-slate-200 text-slate-400'
                                : 'bg-violet-600 text-white'
                        }`}
                    >
                        {isAdLoading ? (
                            <span className="inline-flex items-center gap-1">
                                <Loader2 size={12} className="animate-spin" />
                                준비중
                            </span>
                        ) : '5초 보기'}
                    </motion.button>
                </div>
            </section>

            {/* ── 최근 받은 포인트 ── */}
            <section className="px-5 pb-3">
                <div className="comfort-card rounded-[20px] bg-white px-4 py-4">
                    <div className="flex items-center justify-between">
                        <p className="text-[13px] font-black text-slate-950">최근 받은 포인트</p>
                        {recentRewards.length > 0 && (
                            <motion.button
                                type="button"
                                whileTap={{ scale: 0.94, y: 1 }}
                                onClick={() => setRecentRewards([])}
                                className="comfort-press inline-flex items-center gap-1 rounded-full bg-toss-gray-100 px-2.5 py-1 text-[12px] font-black text-slate-600 transition-transform"
                            >
                                <RotateCcw size={10} />
                                비우기
                            </motion.button>
                        )}
                    </div>
                    <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                        {recentRewards.length > 0 ? recentRewards.map((reward, index) => (
                            <motion.div
                                key={`${reward.label}-${index}`}
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className={`flex shrink-0 items-center gap-2 rounded-[14px] px-3 py-2 ${reward.bgColor}`}
                            >
                                <div className={`h-5 w-5 rounded-full bg-gradient-to-br ${reward.capsuleColor}`}>
                                    <div className="h-full w-full rounded-full bg-white/20" style={{ clipPath: 'circle(40% at 35% 35%)' }} />
                                </div>
                                <span className={`text-[12px] font-black ${reward.textColor}`}>{reward.label}</span>
                            </motion.div>
                        )) : (
                            <p className="py-1 text-[12px] font-bold text-slate-400">아직 뽑기 기록이 없어요</p>
                        )}
                    </div>
                </div>
            </section>

            {/* ── 나올 수 있는 포인트 ── */}
            <section className="px-5 pb-3">
                <div className="comfort-card rounded-[20px] bg-white px-4 py-4">
                    <p className="text-[13px] font-black text-slate-950">나올 수 있는 포인트</p>
                    <div className="mt-3 space-y-2">
                        {REWARD_TABLE.map((item) => {
                            const pct = (item.weight / REWARD_TABLE.reduce((s, i) => s + i.weight, 0) * 100);
                            return (
                                <div key={item.label} className="flex items-center gap-3">
                                    <div className={`h-5 w-5 shrink-0 rounded-full bg-gradient-to-br ${item.capsuleColor}`} />
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[12px] font-black text-slate-800">{item.label}</span>
                                            <span className="text-[11px] font-black text-slate-500">{pct.toFixed(0)}%</span>
                                        </div>
                                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-toss-gray-100">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${pct}%` }}
                                                transition={{ duration: 0.8, delay: 0.2 }}
                                                className={`h-full bg-gradient-to-r ${item.capsuleColor}`}
                                            />
                                        </div>
                                    </div>
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 t-micro font-black ${item.bgColor} ${item.textColor}`}>{item.badge}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ── 안내 ── */}
            <section className="px-5 pt-1 pb-3">
                <div className="comfort-card rounded-[20px] bg-white px-4 py-3">
                    <p className="text-[11px] font-bold leading-[1.7] text-slate-500">
                        · 첫 뽑기부터 {SESSION_DURATION_HOURS}시간 동안 최대 {MAX_DRAWS_PER_SESSION}번 할 수 있어요<br />
                        · 이용권 1장으로 한 번 뽑을 수 있어요<br />
                        · 광고를 보면 한 번 더 뽑을 수 있어요<br />
                        · 한 번에 받을 수 있는 포인트는 최대 {REWARD_POINT_LIMITS.rewardGacha}점이에요
                    </p>
                </div>
            </section>

            <div className="pb-40" />

            {/* ── 결과 모달 (풀스크린 리빌) ── */}
            <AnimatePresence>
                {showResult && result && (
                    <ResultCard result={result} onClose={() => setShowResult(false)} />
                )}
            </AnimatePresence>
        </motion.div>
    );
});
