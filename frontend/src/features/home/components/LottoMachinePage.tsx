import { AnimatePresence, motion } from 'framer-motion';
import { Gift } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { PromotedBanner } from '../../../shared/components/PromotedBanner';
import { deterministicRandom } from '../../../shared/utils/deterministicRandom';

interface LottoDrawResult {
    numbers?: number[];
    tickets: number;
    drawId?: string;
}

interface LottoMachinePageProps {
    onBack: () => void;
    drawCount: number;
    onDraw?: () => Promise<LottoDrawResult | null>;
    onTicketUpdate?: (newCount: number) => void;
    onSaveToHistory?: (numbers: number[]) => void;
}

/** 1~45 중 6개 무작위 추출 */
const drawLottoNumbers = (): number[] => {
    const pool = Array.from({ length: 45 }, (_, i) => i + 1);
    const picked: number[] = [];
    for (let i = 0; i < 6; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
};

/** 한국 로또 공 색상 */
const getBallColor = (n: number): { bg: string; text: string; shadow: string } => {
    if (n <= 10) return { bg: 'bg-[#FBC400]', text: 'text-white', shadow: 'shadow-[0_4px_12px_rgba(251,196,0,0.4)]' };
    if (n <= 20) return { bg: 'bg-[#69C8F2]', text: 'text-white', shadow: 'shadow-[0_4px_12px_rgba(105,200,242,0.4)]' };
    if (n <= 30) return { bg: 'bg-[#FF7272]', text: 'text-white', shadow: 'shadow-[0_4px_12px_rgba(255,114,114,0.4)]' };
    if (n <= 40) return { bg: 'bg-[#AAAAAA]', text: 'text-white', shadow: 'shadow-[0_4px_12px_rgba(170,170,170,0.3)]' };
    return { bg: 'bg-[#B0D840]', text: 'text-white', shadow: 'shadow-[0_4px_12px_rgba(176,216,64,0.4)]' };
};

/* ── 파티클 효과 ── */
const Particles = memo(({ count, color }: { count: number; color: string }) => {
    const particles = useMemo(() => Array.from({ length: count }, (_, i) => {
        const angle = (360 / count) * i;
        const distance = 40 + deterministicRandom(i + count * 11) * 40;
        const rad = (angle * Math.PI) / 180;
        return {
            x: Math.cos(rad) * distance,
            y: Math.sin(rad) * distance,
            scale: 0.3 + deterministicRandom(i + count * 13) * 0.5,
            delay: deterministicRandom(i + count * 17) * 0.1,
        };
    }), [count]);

    return (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {particles.map((p, i) => (
                <motion.div
                    key={i}
                    initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                    animate={{ x: p.x, y: p.y, scale: p.scale, opacity: 0 }}
                    transition={{ duration: 0.6, delay: p.delay, ease: 'easeOut' }}
                    className={`absolute h-1.5 w-1.5 rounded-full ${color}`}
                />
            ))}
        </div>
    );
});

/* ── 가차머신 ── */
const BALL_POSITIONS = [
    { x: 6, y: 126, size: 27, color: 'from-sky-400 to-blue-500' },
    { x: 32, y: 124, size: 29, color: 'from-amber-400 to-yellow-500' },
    { x: 60, y: 127, size: 26, color: 'from-emerald-400 to-green-500' },
    { x: 86, y: 123, size: 28, color: 'from-rose-400 to-pink-500' },
    { x: 112, y: 126, size: 27, color: 'from-violet-400 to-purple-500' },
    { x: 138, y: 125, size: 26, color: 'from-blue-400 to-indigo-500' },
    { x: 18, y: 100, size: 28, color: 'from-red-400 to-rose-500' },
    { x: 46, y: 98, size: 27, color: 'from-cyan-400 to-sky-500' },
    { x: 73, y: 101, size: 26, color: 'from-yellow-400 to-amber-500' },
    { x: 99, y: 97, size: 29, color: 'from-fuchsia-400 to-pink-600' },
    { x: 127, y: 100, size: 26, color: 'from-teal-400 to-emerald-500' },
];

const BALL_SHAKE_OFFSETS = BALL_POSITIONS.map((_, i) => ({
    y: deterministicRandom(i + 101) * 6,
    x: deterministicRandom(i + 201) * 4,
    rotate: deterministicRandom(i + 301) * 8,
}));

const GachaMachine = memo(({
    phase,
    activeBallColor,
    onClick,
    disabled,
}: {
    phase: string;
    activeBallColor?: string;
    onClick?: () => void;
    disabled?: boolean;
}) => (
    <motion.button
        type="button"
        whileTap={!disabled ? { scale: 0.96, y: 4 } : undefined}
        onClick={onClick}
        disabled={disabled}
        aria-label="로또 머신으로 번호 뽑기"
        className={`relative mx-auto block ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
        style={{ width: 180, height: 260 }}
    >
        {!disabled && (
            <motion.div
                aria-hidden="true"
                animate={phase === 'idle' || phase === 'done'
                    ? { opacity: [0.18, 0.32, 0.18], scale: [1, 1.06, 1] }
                    : { opacity: 0.12, scale: 1 }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-x-3 top-4 bottom-2 rounded-[32px] bg-gradient-to-b from-rose-200/45 via-amber-100/20 to-transparent blur-xl"
            />
        )}
        <motion.div
            animate={phase === 'shake'
                ? { rotate: [0, -1.5, 1.5, -0.8, 0.8, 0], y: [0, -1, 0] }
                : !disabled && (phase === 'idle' || phase === 'done')
                    ? { rotate: 0, y: [0, -3, 0] }
                    : { rotate: 0, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            className="relative h-full w-full"
        >
            <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[160px] h-[14px] rounded-t-xl bg-[#ea580c] z-10" />
            <div className="absolute left-1/2 top-[10px] -translate-x-1/2 w-[160px] h-[140px]">
                <div className="absolute inset-0 overflow-hidden rounded-b-lg border-[3px] border-sky-100 bg-gradient-to-b from-sky-200/40 via-sky-300/30 to-blue-300/45 shadow-[inset_0_-8px_16px_rgba(56,189,248,0.1)]">
                    {BALL_POSITIONS.map((ball, i) => (
                        <motion.div
                            key={i}
                            animate={phase === 'shake' ? {
                                y: [0, -8 - BALL_SHAKE_OFFSETS[i].y, 4, -2, 0],
                                x: [0, (i % 2 === 0 ? -1 : 1) * (2 + BALL_SHAKE_OFFSETS[i].x), 0],
                                rotate: [0, (i % 2 === 0 ? -1 : 1) * (8 + BALL_SHAKE_OFFSETS[i].rotate), 0],
                            } : {}}
                            transition={{ duration: 0.45, repeat: phase === 'shake' ? 2 : 0, delay: i * 0.015, ease: 'easeInOut' }}
                            className={`absolute rounded-full bg-gradient-to-br ${ball.color} shadow-[0_1px_4px_rgba(0,0,0,0.15)]`}
                            style={{ width: ball.size - 2, height: ball.size - 2, left: ball.x, top: ball.y - 10 }}
                        />
                    ))}
                </div>
            </div>
            <div className="absolute left-1/2 top-[150px] -translate-x-1/2 w-[160px] h-[100px]">
                <div className="absolute inset-0 rounded-b-2xl bg-gradient-to-b from-[#ffbe45] to-[#f59e0b] shadow-md" />
                <div className="absolute left-3 top-3">
                    <motion.div
                        animate={phase === 'shake' ? { rotate: [0, 180, 720] } : { rotate: 0 }}
                        transition={{ duration: 1, ease: 'easeInOut' }}
                        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white"
                    >
                        <div className="h-1 w-6 rounded-full bg-slate-200 rotate-[30deg]" />
                    </motion.div>
                </div>
                <div className="absolute right-3 top-2.5">
                    <div className="relative h-14 w-16 overflow-hidden rounded-xl border-[3px] border-[#f06292] bg-[#c2185b]">
                        <AnimatePresence mode='wait'>
                            {phase === 'drop' && (
                                <motion.div
                                    key="drop-ball"
                                    initial={{ y: -40, opacity: 0 }}
                                    animate={{ y: 15, opacity: 1 }}
                                    exit={{ y: 50, opacity: 0 }}
                                    transition={{ duration: 0.4 }}
                                    className={`absolute left-1/2 top-0 -translate-x-1/2 h-7 w-7 rounded-full ${activeBallColor ?? 'bg-amber-400'}`}
                                />
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </motion.div>
    </motion.button>
));

export const LottoMachinePage = memo(({ 
    onBack, 
    drawCount, 
    onDraw, 
    onTicketUpdate,
    onSaveToHistory 
}: LottoMachinePageProps) => {
    useAppNavigationBar({
        title: '로또 번호 뽑기',
        showBack: true,
        onBackPress: onBack,
    });

    const [phase, setPhase] = useState<'idle' | 'shake' | 'drop' | 'reveal' | 'sort' | 'done'>('idle');
    const [numbers, setNumbers] = useState<number[]>([]);
    const [displayNumbers, setDisplayNumbers] = useState<{id: string, value: number, isBonus?: boolean}[]>([]);
    const [revealedCount, setRevealedCount] = useState(0);
    const [localTickets, setLocalTickets] = useState(drawCount);
    const [bannerKey, setBannerKey] = useState(0);
    
    const intervalRef = useRef<any>(null);

    useEffect(() => { setLocalTickets(drawCount); }, [drawCount]);
    
    // Cleanup interval on unmount
    useEffect(() => {
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, []);

    const handleDraw = useCallback(async () => {
        if (phase !== 'idle' && phase !== 'done') return;
        if (localTickets <= 0) return;

        // Reset
        setPhase('shake');
        setNumbers([]);
        setDisplayNumbers([]);
        setRevealedCount(0);
        setBannerKey(k => k + 1);
        if (intervalRef.current) clearInterval(intervalRef.current);

        const drawPromise = onDraw ? onDraw() : Promise.resolve(null);

        // 1. Shake (1.0s)
        setTimeout(() => setPhase('drop'), 1000);

        // 2. Resolve result
        const serverData = await drawPromise;
        const finalResult = serverData?.numbers?.length === 6 ? serverData.numbers : drawLottoNumbers();
        
        // Update tickets
        if (serverData?.tickets !== undefined) {
            setLocalTickets(serverData.tickets);
            onTicketUpdate?.(serverData.tickets);
        } else {
            const next = Math.max(0, localTickets - 1);
            setLocalTickets(next);
            onTicketUpdate?.(next);
        }

        setNumbers(finalResult);

        // 3. Sequential Reveal Start (from index 0 to 5)
        setPhase('reveal');
        
        let count = 0;
        const interval = setInterval(() => {
            const num = finalResult[count];
            const isBonus = count === 5;
            
            setDisplayNumbers(prev => [
                ...prev, 
                { id: `ball-${count}-${num}`, value: num, isBonus }
            ]);
            
            count++;
            setRevealedCount(count);

            if (count === 6) {
                if (intervalRef.current) clearInterval(intervalRef.current);
                intervalRef.current = null;

                // 4. Sort phase (Excluding bonus ball at index 5)
                setTimeout(() => {
                    setPhase('sort');
                    const mainNums = finalResult.slice(0, 5);
                    const bonusNum = finalResult[5];
                    const sortedMain = [...mainNums].sort((a, b) => a - b);
                    
                    // Reconstruct display array with original IDs but sorted values for main balls
                    // To make animation look right, we should actually map the sorted values to the first 5 slots.
                    setDisplayNumbers([
                        ...sortedMain.map((val) => ({ id: `ball-main-${val}`, value: val })),
                        { id: `ball-bonus-${bonusNum}`, value: bonusNum, isBonus: true }
                    ]);

                    setTimeout(() => {
                        setPhase('done');
                        onSaveToHistory?.([...sortedMain, bonusNum]);
                    }, 1000);
                }, 1000);
            }
        }, 700);
        
        intervalRef.current = interval;
    }, [phase, localTickets, onDraw, onTicketUpdate, onSaveToHistory]);

    const canDraw = localTickets > 0 && (phase === 'idle' || phase === 'done');

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="-mx-5 -mt-10 flex min-h-[100dvh] flex-col overflow-x-hidden bg-cream px-6 pt-16 pb-12 surface-play"
        >
            <div className="pb-5 flex-shrink-0">
                <PromotedBanner
                    key={bannerKey}
                    label="번호를 확인하고 행운도 챙겨가요"
                    sublabel="광고"
                    variant="expanded"
                    className="px-0 mt-0 mb-0"
                />
            </div>

            <div className="flex justify-center">
                <div className="inline-flex items-center gap-3 rounded-2xl bg-white border border-rose-100 px-5 py-3 shadow-sm">
                    <Gift size={20} className="text-rose-500" />
                    <span className="text-[14px] font-bold text-toss-gray-600">남은 이용권</span>
                    <span className="text-[18px] font-black text-rose-500 tabular-nums">{localTickets}장</span>
                </div>
            </div>

            <div className="mt-10">
                <GachaMachine 
                    phase={phase} 
                    activeBallColor={numbers[revealedCount] ? getBallColor(numbers[revealedCount]).bg : undefined}
                    onClick={handleDraw}
                    disabled={!canDraw}
                />
                <motion.div
                    initial={false}
                    animate={canDraw ? { opacity: 1, y: 0 } : { opacity: 0.55, y: 0 }}
                    className="mt-4 flex flex-col items-center gap-1.5 text-center"
                >
                    <div className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-[11px] font-black tracking-[0.02em] ${canDraw ? 'bg-rose-50 text-rose-500 border border-rose-100' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                        {phase === 'done'
                            ? '머신을 다시 누르면 한 번 더 뽑아요'
                            : canDraw
                                ? '머신을 누르면 번호를 뽑아요'
                                : localTickets <= 0
                                    ? '이용권이 부족해요'
                                    : '번호를 뽑고 있어요'}
                    </div>
                    {canDraw && (
                        <motion.p
                            animate={{ opacity: [0.45, 0.85, 0.45] }}
                            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                            className="text-[12px] font-bold text-toss-gray-400"
                        >
                            버튼 없이 머신만 눌러도 바로 시작돼요
                        </motion.p>
                    )}
                </motion.div>
            </div>

            <div className="mt-12 flex flex-col items-center w-full px-2">
                <div className="flex flex-nowrap justify-center gap-1.5 min-h-[100px] w-full pt-2">
                    <AnimatePresence>
                        {displayNumbers.map((item) => (
                            <motion.div
                                key={item.id}
                                layout
                                initial={{ scale: 0, rotate: -180, y: 30, opacity: 0 }}
                                animate={{ scale: 1.1, rotate: 0, y: 0, opacity: 1 }}
                                transition={{ 
                                    layout: { type: 'spring', stiffness: 220, damping: 24 },
                                    opacity: { duration: 0.3 }
                                }}
                                className="flex flex-col items-center gap-2.5 flex-shrink-0"
                            >
                                <div className={`relative h-11 w-11 rounded-full flex items-center justify-center ${getBallColor(item.value).bg} ${getBallColor(item.value).shadow} shadow-lg`}>
                                    <Particles count={10} color={getBallColor(item.value).bg} />
                                    <span className="text-[17px] font-black text-white drop-shadow-sm select-none">
                                        {item.value}
                                    </span>
                                    <div className="absolute left-[18%] top-[12%] h-[28%] w-[28%] rounded-full bg-white/30 blur-[0.5px]" />
                                </div>
                                <div className="h-4 flex items-center justify-center">
                                    {item.isBonus && (
                                        <motion.span 
                                            initial={{ opacity: 0, scale: 0.5 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="t-micro font-black text-rose-500 px-1.5 py-0.5 rounded-full bg-rose-50 border border-rose-100 whitespace-nowrap"
                                        >
                                            BONUS
                                        </motion.span>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {/* Empty Slots */}
                    {displayNumbers.length < 6 && (
                        <div className="flex gap-1.5">
                            {Array.from({ length: 6 - displayNumbers.length }).map((_, i) => (
                                <div key={`empty-${i}`} className="h-11 w-11 rounded-full bg-white border-2 border-dashed border-rose-100 flex items-center justify-center self-start">
                                    <span className="text-rose-100 font-bold text-xs">?</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {phase === 'done' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-10 flex flex-col items-center gap-1"
                    >
                        <p className="text-[17px] font-black text-toss-gray-900">행운이 기대되는 번호예요 ✨</p>
                        <p className="text-[13px] font-bold text-toss-gray-400 text-center">보관함에 저장했어요. 이번 주 행운을 빌어요.</p>
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
});

LottoMachinePage.displayName = 'LottoMachinePage';
