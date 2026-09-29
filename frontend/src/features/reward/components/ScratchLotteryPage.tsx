import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RotateCcw, Star, Coins, Play, Lock, Check, Loader2, Clock } from 'lucide-react';
import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { PromotedBanner } from '../../../shared/components/PromotedBanner';
import { RotatingMotivationBanner } from '../../../shared/components/RotatingMotivationBanner';
import { logScratchPageView, logScratchUnlock, logScratchReveal, logScratchAllComplete, logScratchRefresh, logScratchAdError, logClick, logErrorToBackend } from '../../../utils/analytics';
import { apiUrl } from '../../../shared/api/client';
import { BANNER_AD_TEXT_ID, REWARD_TICKET_AD_ID } from '../../../shared/constants/app';
import { REWARD_POINT_LIMITS, clampRewardPoints } from '../../../shared/constants/rewardEconomy';
import { REWARD_RARITY_CONFIG } from '../../../shared/constants/rarity';
import { AppImage } from '../../../shared/components/ui';

/* ── 광고 그룹 ID ── */
const SCRATCH_UNLOCK_AD_ID = REWARD_TICKET_AD_ID;  // 개별 티켓 잠금 해제
const SCRATCH_REFRESH_AD_ID = REWARD_TICKET_AD_ID; // 전체 새로고침

const scratchLog = (message: string, payload?: Record<string, unknown>) => {
    if (payload) {
        console.log(`[ScratchLottery] ${message}`, payload);
        return;
    }
    console.log(`[ScratchLottery] ${message}`);
};

/* ── API Helper ── */
const scratchApi = async <T = any>(path: string, body?: Record<string, unknown>): Promise<{ ok: boolean; data?: T; error?: { code: string; message: string } }> => {
    scratchLog('API request', { path, body });
    try {
        const res = await fetch(apiUrl(`/scratch${path}`), {
            method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const json = await res.json();
        scratchLog('API response', { path, ok: res.ok, resultType: json?.resultType, data: json?.data, error: json?.error });
        if (json.resultType === 'SUCCESS') return { ok: true, data: json.data };
        return { ok: false, error: json.error || { code: 'UNKNOWN', message: json.message || '알 수 없는 오류' } };
    } catch (e: any) {
        scratchLog('API network error', { path, error: e?.message || 'NETWORK_ERROR' });
        return { ok: false, error: { code: 'NETWORK_ERROR', message: e?.message || '네트워크 오류' } };
    }
};

/* ── Types ── */
interface Prize {
    label: string;
    image: string;
    points: number;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    color: string;
    bgGradient: string;
}

/** 백엔드에서 내려주는 확률 설정 */
interface PrizeConfigEntry {
    label: string;      // '1P', '2P', '3P', '5P', '10P'
    points: number;
    rarity: string;
    weight: number;     // 1000 기준 가중치 (ex: 450 = 45%)
}
type PrizeConfig = PrizeConfigEntry[];

/* ── 서버 prize → 프론트 Prize 변환 ── */
const PRIZE_STYLE_MAP: Record<string, Omit<Prize, 'label' | 'points' | 'rarity'>> = {
    '1P':  { image: '/images/point_1.svg', color: 'text-toss-gray-600', bgGradient: 'from-slate-100 to-slate-50' },
    '2P':  { image: '/images/point_2.svg', color: 'text-toss-blue', bgGradient: 'from-blue-50 to-slate-50' },
    '3P':  { image: '/images/point_3.svg', color: 'text-purple-600', bgGradient: 'from-purple-50 to-blue-50' },
    '5P':  { image: '/images/point_5.svg', color: 'text-amber-600', bgGradient: 'from-amber-50 to-yellow-50' },
    '10P': { image: '/images/point_10.svg', color: 'text-orange-600', bgGradient: 'from-orange-50 to-amber-50' },
};
const DEFAULT_STYLE = { image: '/images/point_2.svg', color: 'text-toss-blue', bgGradient: 'from-blue-50 to-slate-50' };

/** 포인트 기준 올바른 rarity 매핑 (서버가 잘못된 rarity를 보내는 경우 보정) */
const POINTS_TO_RARITY: Record<number, Prize['rarity']> = {
    1: 'common', 2: 'common', 3: 'rare', 5: 'epic', 10: 'legendary',
};

const formatPrizeLabel = (prize: Pick<Prize, 'label' | 'points'> | null | undefined): string => {
    if (!prize) return '';
    return typeof prize.points === 'number' ? `${prize.points}점` : prize.label.replace('P', '점');
};

function toFrontendPrize(serverPrize: { label: string; points: number; rarity: string } | null): Prize | null {
    if (!serverPrize) return null;
    const style = PRIZE_STYLE_MAP[serverPrize.label] || DEFAULT_STYLE;
    const correctedRarity = POINTS_TO_RARITY[serverPrize.points] ?? serverPrize.rarity as Prize['rarity'];
    return { label: serverPrize.label, points: serverPrize.points, rarity: correctedRarity, ...style };
}

function extractScratchAbsolutePoints(payload: Record<string, any> | undefined | null): number | null {
    if (!payload) return null;
    const absolutePoints = [
        payload.userPoints,
        payload.currentPoints,
        payload.totalPoints,
        payload.remainingPoints,
        payload.balancePoints,
        payload.points,
    ].find((value) => typeof value === 'number');

    return typeof absolutePoints === 'number' ? absolutePoints : null;
}

/** 클라이언트 폴백 기본 확률 (백엔드 연결 실패 시 사용)
 *  10P: 0.5%, 5P: 1.5%, 3P: 8%, 2P: 35%, 1P: 45%, 꽝 없음 (나머지 10%→1P) */
const DEFAULT_PRIZE_CONFIG: PrizeConfig = [
    { label: '10P', points: 10, rarity: 'legendary', weight: 5 },
    { label: '5P',  points: 5,  rarity: 'epic',      weight: 15 },
    { label: '3P',  points: 3,  rarity: 'rare',      weight: 80 },
    { label: '2P',  points: 2,  rarity: 'common',    weight: 350 },
    { label: '1P',  points: 1,  rarity: 'common',    weight: 550 },
];

function getRandomPrize(config: PrizeConfig = DEFAULT_PRIZE_CONFIG): Prize {
    const totalWeight = config.reduce((sum, c) => sum + c.weight, 0);
    const rand = Math.random() * totalWeight;
    let cumulative = 0;
    let picked = config[config.length - 1]; // 폴백: 마지막 항목
    for (const entry of config) {
        cumulative += entry.weight;
        if (rand < cumulative) { picked = entry; break; }
    }
    const style = PRIZE_STYLE_MAP[picked.label] || DEFAULT_STYLE;
    return { label: picked.label, points: picked.points, rarity: picked.rarity as Prize['rarity'], ...style };
}

const RARITY_GLOW: Record<string, string> = {
    common: 'shadow-rarity-common/20',
    rare: 'shadow-rarity-rare/20',
    epic: 'shadow-rarity-epic/20',
    legendary: 'shadow-rarity-legendary/20',
};

const RARITY_BORDER: Record<string, string> = {
    common: REWARD_RARITY_CONFIG.common.borderColor,
    rare: REWARD_RARITY_CONFIG.rare.borderColor,
    epic: REWARD_RARITY_CONFIG.epic.borderColor,
    legendary: REWARD_RARITY_CONFIG.legendary.borderColor,
};

const TOTAL_TICKETS = 3;

// ── 기본값 (백엔드 scratchConfig 없을 때 폴백) ──
const DEFAULT_MAX_SESSIONS = 5;
const DEFAULT_SESSION_WINDOW_MS = 3 * 60 * 60 * 1000; // 3시간

interface ScratchConfig {
    maxSessions: number;
    sessionWindowMs: number;
}
const DEFAULT_SCRATCH_CONFIG: ScratchConfig = {
    maxSessions: DEFAULT_MAX_SESSIONS,
    sessionWindowMs: DEFAULT_SESSION_WINDOW_MS,
};

/** localStorage 기반 세션 횟수 관리 (윈도우 크기는 config에서 결정) */
function getScratchSessionInfo(userKey: string, config: ScratchConfig = DEFAULT_SCRATCH_CONFIG): { count: number; windowStart: number; remaining: number; cooldownMs: number } {
    const key = `scratch_sessions_${userKey}`;
    try {
        const raw = localStorage.getItem(key);
        if (raw) {
            const { timestamps } = JSON.parse(raw) as { timestamps: number[] };
            const now = Date.now();
            const valid = timestamps.filter(t => now - t < config.sessionWindowMs);
            if (valid.length !== timestamps.length) {
                localStorage.setItem(key, JSON.stringify({ timestamps: valid }));
            }
            const remaining = Math.max(0, config.maxSessions - valid.length);
            const oldest = valid.length > 0 ? Math.min(...valid) : now;
            const cooldownMs = valid.length >= config.maxSessions ? (oldest + config.sessionWindowMs - now) : 0;
            return { count: valid.length, windowStart: oldest, remaining, cooldownMs };
        }
    } catch { /* ignore */ }
    return { count: 0, windowStart: Date.now(), remaining: config.maxSessions, cooldownMs: 0 };
}

function recordScratchSession(userKey: string, config: ScratchConfig = DEFAULT_SCRATCH_CONFIG): void {
    const key = `scratch_sessions_${userKey}`;
    try {
        const now = Date.now();
        const raw = localStorage.getItem(key);
        const timestamps = raw ? (JSON.parse(raw) as { timestamps: number[] }).timestamps.filter(t => now - t < config.sessionWindowMs) : [];
        timestamps.push(now);
        localStorage.setItem(key, JSON.stringify({ timestamps }));
    } catch { /* ignore */ }
}

/* ── 세션 상태 저장/복원 (치팅 방지) ── */
interface SavedSessionState {
    sessionId: string | null;
    tickets: Array<{ id: number; state: TicketState; prize: Prize | null }>;
    activeTicketId: number;
    totalWon: number;
    savedAt: number;
}

const SESSION_STATE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24시간 후 만료

function saveSessionState(userKey: string, state: Omit<SavedSessionState, 'savedAt'>): void {
    const key = `scratch_active_${userKey}`;
    try {
        const data: SavedSessionState = { ...state, savedAt: Date.now() };
        localStorage.setItem(key, JSON.stringify(data));
    } catch { /* ignore */ }
}

function loadSessionState(userKey: string): SavedSessionState | null {
    const key = `scratch_active_${userKey}`;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const data = JSON.parse(raw) as SavedSessionState;
        // 만료 체크
        if (Date.now() - data.savedAt > SESSION_STATE_EXPIRY_MS) {
            localStorage.removeItem(key);
            return null;
        }
        // 모든 티켓이 revealed 상태면 완료된 세션 — 새 세션 허용
        const allRevealed = data.tickets.every(t => t.state === 'revealed');
        if (allRevealed) {
            localStorage.removeItem(key);
            return null;
        }
        return data;
    } catch {
        return null;
    }
}

function clearSessionState(userKey: string): void {
    try {
        localStorage.removeItem(`scratch_active_${userKey}`);
    } catch { /* ignore */ }
}

/* ── Canvas Scratch Card ── */
interface ScratchCardProps {
    width: number;
    height: number;
    onComplete: () => void;
    children: React.ReactNode;
    resetKey: number;
}

function ScratchCard({ width, height, onComplete, children, resetKey }: ScratchCardProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawingRef = useRef(false);
    const completedRef = useRef(false);
    const lastPosRef = useRef<{ x: number; y: number } | null>(null);
    const strokeCountRef = useRef(0);
    const BRUSH = 28;

    // canvas 초기화
    const initCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: false });
        if (!ctx) return;

        completedRef.current = false;
        lastPosRef.current = null;
        strokeCountRef.current = 0;

        // CSS 크기 = 논리 크기, 내부 해상도도 동일 (DPR 무시 — 성능)
        canvas.width = width;
        canvas.height = height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // 은색 메탈릭 코팅
        const g = ctx.createLinearGradient(0, 0, width, height);
        g.addColorStop(0, '#B8B8B8'); g.addColorStop(0.3, '#D4D4D4');
        g.addColorStop(0.5, '#A8A8A8'); g.addColorStop(0.7, '#C8C8C8');
        g.addColorStop(1, '#C0C0C0');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);

        // 미세 줄무늬
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let y = 0; y < height; y += 3) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }

        // 가이드 텍스트
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = 'bold 14px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('여기를 긁어주세요', width / 2, height / 2);
    }, [width, height]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useState(() => { initCanvas(); });
    const prevResetKeyRef = useRef(resetKey);
    if (prevResetKeyRef.current !== resetKey) {
        prevResetKeyRef.current = resetKey;
        queueMicrotask(initCanvas);
    }
    const mountedRef = useRef(false);
    if (!mountedRef.current) {
        mountedRef.current = true;
        queueMicrotask(initCanvas);
    }

    const finishScratch = useCallback(() => {
        if (completedRef.current) return;
        completedRef.current = true;
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) { ctx.clearRect(0, 0, canvas.width, canvas.height); }
        }
        onComplete();
    }, [onComplete]);

    const scratch = useCallback((x: number, y: number) => {
        const canvas = canvasRef.current;
        if (!canvas || completedRef.current) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1.0;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = BRUSH * 2.6;

        const last = lastPosRef.current;
        if (last) {
            // 메인 스트로크
            ctx.beginPath();
            ctx.moveTo(last.x, last.y);
            ctx.lineTo(x, y);
            ctx.stroke();
            // 보조 원형 — 겹치는 부분 더 깊게 긁힘
            const dist = Math.hypot(x - last.x, y - last.y);
            if (dist > BRUSH * 0.3) {
                ctx.beginPath();
                ctx.arc(x, y, BRUSH * 1.2, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            ctx.beginPath();
            ctx.arc(x, y, BRUSH * 1.4, 0, Math.PI * 2);
            ctx.fill();
        }
        lastPosRef.current = { x, y };

        // 스트로크 카운트 기반 완료 (충분히 긁어야 열림)
        strokeCountRef.current++;
        if (strokeCountRef.current >= 35) {
            finishScratch();
        }
    }, [finishScratch]);

    const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        if ('touches' in e) {
            return {
                x: (e.touches[0].clientX - rect.left) * scaleX,
                y: (e.touches[0].clientY - rect.top) * scaleY,
            };
        }
        return {
            x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
            y: ((e as React.MouseEvent).clientY - rect.top) * scaleY,
        };
    }, []);

    const handleStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        e.preventDefault();
        isDrawingRef.current = true;
        lastPosRef.current = null;
        const pos = getPos(e);
        scratch(pos.x, pos.y);
        try { navigator?.vibrate?.(5); } catch { /* ignore */ }
    }, [getPos, scratch]);

    const handleMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
        e.preventDefault();
        if (!isDrawingRef.current) return;
        const pos = getPos(e);
        scratch(pos.x, pos.y);
    }, [getPos, scratch]);

    const handleEnd = useCallback(() => {
        isDrawingRef.current = false;
        lastPosRef.current = null;
    }, []);

    return (
        <div className="relative" style={{ width, height }}>
            <div className="absolute inset-0 flex items-center justify-center">
                {children}
            </div>
            <canvas
                ref={canvasRef}
                style={{ width, height, touchAction: 'none' }}
                className="absolute inset-0 rounded-2xl cursor-pointer z-10"
                onMouseDown={handleStart}
                onMouseMove={handleMove}
                onMouseUp={handleEnd}
                onMouseLeave={handleEnd}
                onTouchStart={handleStart}
                onTouchMove={handleMove}
                onTouchEnd={handleEnd}
            />
        </div>
    );
}

/* ── Ticket State ── */
type TicketState = 'locked' | 'ready' | 'scratching' | 'revealed';

interface TicketData {
    id: number;
    state: TicketState;
    prize: Prize | null;
}

/* ── Main Page ── */
interface ScratchLotteryPageProps {
    userKey: string;
    userPoints: number;
    drawCount: number;
    onBack: () => void;
    onClaimReward?: (points: number) => void;
    onPointsSync?: (newTotal: number) => void;
}

export const ScratchLotteryPage = memo(({
    userKey,
    userPoints,
    onBack,
    onClaimReward,
    onPointsSync,
}: ScratchLotteryPageProps) => {
    const [isAdLoading, setIsAdLoading] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [apiError, setApiError] = useState<string | null>(null);

    // 광고 시청 트리거 (RotatingMotivationBanner에 전달)
    const adWatchCountRef = useRef(0);
    const [adWatchTrigger, setAdWatchTrigger] = useState(0);
    const prevAdLoadingRef = useRef(isAdLoading);
    useEffect(() => {
        if (prevAdLoadingRef.current && !isAdLoading) {
            adWatchCountRef.current += 1;
            setAdWatchTrigger(adWatchCountRef.current);
        }
        prevAdLoadingRef.current = isAdLoading;
    }, [isAdLoading]);

    // 콜백 ref (무한 루프 방지)
    const onPointsSyncRef = useRef(onPointsSync);
    const onClaimRewardRef = useRef(onClaimReward);
    useEffect(() => { onPointsSyncRef.current = onPointsSync; }, [onPointsSync]);
    useEffect(() => { onClaimRewardRef.current = onClaimReward; }, [onClaimReward]);

    // 백엔드에서 받은 확률 설정 (없으면 DEFAULT_PRIZE_CONFIG 사용)
    const prizeConfigRef = useRef<PrizeConfig>(DEFAULT_PRIZE_CONFIG);

    // 페이지 진입 로깅
    useEffect(() => { logScratchPageView(); }, []);

    const [tickets, setTickets] = useState<TicketData[]>(() =>
        Array.from({ length: TOTAL_TICKETS }, (_, i) => ({
            id: i,
            state: i === 0 ? 'ready' : 'locked',
            prize: i === 0 ? getRandomPrize(DEFAULT_PRIZE_CONFIG) : null,
        }))
    );
    const [activeTicketId, setActiveTicketId] = useState(0);
    const [totalWon, setTotalWon] = useState(0);
    const [resetKey, setResetKey] = useState(0);
    const [localPoints, setLocalPoints] = useState(userPoints);

    // ── 백엔드 설정 (scratchConfig from /start) ──
    const scratchConfigRef = useRef<ScratchConfig>(DEFAULT_SCRATCH_CONFIG);
    const [scratchConfig, setScratchConfig] = useState<ScratchConfig>(DEFAULT_SCRATCH_CONFIG);

    // ── 3시간 N회 제한 ──
    const [sessionInfo, setSessionInfo] = useState(() => getScratchSessionInfo(userKey, DEFAULT_SCRATCH_CONFIG));
    const [cooldownText, setCooldownText] = useState('');
    const isLimitReached = sessionInfo.remaining <= 0;

    // 쿨다운 타이머
    useEffect(() => {
        if (!isLimitReached) {
            const timeout = setTimeout(() => setCooldownText(''), 0);
            return () => clearTimeout(timeout);
        }
        const update = () => {
            const info = getScratchSessionInfo(userKey, scratchConfigRef.current);
            setSessionInfo(info);
            if (info.cooldownMs <= 0) { setCooldownText(''); return; }
            const mins = Math.floor(info.cooldownMs / 60000);
            const secs = Math.floor((info.cooldownMs % 60000) / 1000);
            setCooldownText(mins > 0 ? `${mins}분 ${secs}초 후 가능` : `${secs}초 후 가능`);
        };
        const initial = setTimeout(update, 0);
        const iv = setInterval(update, 1000);
        return () => {
            clearTimeout(initial);
            clearInterval(iv);
        };
    }, [isLimitReached, userKey]);

    const incrementSessionCount = useCallback(() => {
        recordScratchSession(userKey, scratchConfigRef.current);
        setSessionInfo(getScratchSessionInfo(userKey, scratchConfigRef.current));
    }, [userKey]);

    // 고정 네비게이션 바 (← 뒤로가기 + 동전 아이콘은 전역 컨텍스트에서 자동 적용)
    useAppNavigationBar({ title: '복권 긁기', showBack: true, onBackPress: onBack });

    // ── 세션 상태 저장 (tickets 변경 시마다) ──
    const saveCurrentState = useCallback(() => {
        saveSessionState(userKey, {
            sessionId,
            tickets,
            activeTicketId,
            totalWon,
        });
    }, [userKey, sessionId, tickets, activeTicketId, totalWon]);

    // tickets/totalWon 변경 시 자동 저장
    useEffect(() => {
        if (!isLoading) saveCurrentState();
    }, [tickets, totalWon, isLoading, saveCurrentState]);

    // ── 세션 시작 (API 1) ──
    const startSession = useCallback(async () => {
        scratchLog('Starting session', { userKey });
        setIsLoading(true);
        setApiError(null);
        const result = await scratchApi<{
            sessionId: string;
            tickets: Array<{ ticketId: number; status: string; prize: { label: string; points: number; rarity: string } | null }>;
            userPoints: number;
            prizeConfig?: PrizeConfig; // 백엔드에서 확률 설정 내려주면 저장
            scratchConfig?: { maxSessions?: number; sessionWindowMs?: number }; // 세션 제한 설정
        }>('/start', { userKey });

        if (result.ok && result.data) {
            scratchLog('Session started from server', { sessionId: result.data.sessionId, tickets: result.data.tickets, scratchConfig: result.data.scratchConfig, prizeConfigLength: result.data.prizeConfig?.length ?? 0 });
            setSessionId(result.data.sessionId);
            // 백엔드 확률 설정이 있으면 저장
            if (result.data.prizeConfig?.length) {
                prizeConfigRef.current = result.data.prizeConfig;
            }
            // 백엔드 세션 제한 설정이 있으면 적용
            if (result.data.scratchConfig) {
                const sc = result.data.scratchConfig;
                scratchConfigRef.current = {
                    maxSessions: sc.maxSessions ?? DEFAULT_MAX_SESSIONS,
                    sessionWindowMs: sc.sessionWindowMs ?? DEFAULT_SESSION_WINDOW_MS,
                };
                setScratchConfig(scratchConfigRef.current);
                // 새 config로 세션 정보 재계산
                setSessionInfo(getScratchSessionInfo(userKey, scratchConfigRef.current));
            }
            const newTickets = result.data.tickets.slice(0, TOTAL_TICKETS).map((t, i) => ({
                id: i,
                state: t.status as TicketState,
                prize: toFrontendPrize(t.prize),
            }));
            setTickets(newTickets);
            const absolutePoints = extractScratchAbsolutePoints(result.data);
            if (absolutePoints !== null) {
                scratchLog('Syncing points after session start', { absolutePoints });
                setLocalPoints(absolutePoints);
                onPointsSyncRef.current?.(absolutePoints);
            }
            setActiveTicketId(0);
            setTotalWon(0);
            setResetKey(prev => prev + 1);
            incrementSessionCount();
        } else {
            console.warn('[ScratchLottery] /start failed:', result.error);
            scratchLog('Session start failed', { error: result.error as unknown as Record<string, unknown> | undefined });
            setApiError('복권 정보를 불러오지 못했어요. 다시 시도해 주세요.');
            setSessionId(null);
        }
        setIsLoading(false);
    }, [userKey, incrementSessionCount]);

    // ── 마운트 시: 저장된 세션 복원 or 새 세션 ──
    useEffect(() => {
        const saved = loadSessionState(userKey);
        if (saved) {
            // 미완료 세션이 있으면 복원 (치팅 방지)
            scratchLog('Restoring saved session', saved as unknown as Record<string, unknown>);
            const timeout = setTimeout(() => {
                setSessionId(saved.sessionId);
                setTickets(saved.tickets);
                setActiveTicketId(saved.activeTicketId);
                setTotalWon(saved.totalWon);
                setResetKey(prev => prev + 1);
                setIsLoading(false);
            }, 0);
            return () => clearTimeout(timeout);
        } else {
            // 저장된 세션 없음 → 새 세션 시작
            const timeout = setTimeout(() => {
                void startSession();
            }, 0);
            return () => clearTimeout(timeout);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const activeTicket = tickets[activeTicketId];
    const revealedCount = tickets.filter(t => t.state === 'revealed').length;
    const allDone = revealedCount === TOTAL_TICKETS;

    // 3장 모두 완료 시 로깅 + 저장된 세션 제거
    const prevAllDoneRef = useRef(false);
    useEffect(() => {
        if (allDone && !prevAllDoneRef.current) {
            logScratchAllComplete(totalWon);
            clearSessionState(userKey);
        }
        prevAllDoneRef.current = allDone;
    }, [allDone, totalWon, userKey]);

    // ── 카드 완료 후 자동 다음 카드 전환 ──
    useEffect(() => {
        if (activeTicket?.state !== 'revealed' || allDone) return;
        const timer = setTimeout(() => {
            // 다음 ready 카드 → 바로 이동
            const nextReady = tickets.find(t => t.state === 'ready' && t.id !== activeTicketId);
            if (nextReady) {
                setActiveTicketId(nextReady.id);
                setResetKey(prev => prev + 1);
                return;
            }
            // 다음 locked 카드 → 해당 카드 선택 (unlock 유도)
            const nextLocked = tickets.find(t => t.state === 'locked');
            if (nextLocked) {
                setActiveTicketId(nextLocked.id);
            }
        }, 1800);
        return () => clearTimeout(timer);
    }, [activeTicket?.state, activeTicketId, tickets, allDone]);

    const handleScratchComplete = useCallback(async () => {
        const prize = tickets[activeTicketId]?.prize;
        scratchLog('Scratch complete requested', { activeTicketId, sessionId, prizeLabel: prize?.label, prizePoints: prize?.points });

        // 서버에 reveal 호출 (API 3)
        if (sessionId) {
            const result = await scratchApi<{
                ticketId: number;
                prize: { label: string; points: number; rarity: string };
                grantedPoints: number;
                userPoints: number;
                revealedCount: number;
                allDone: boolean;
            }>('/reveal', { userKey, sessionId, ticketId: activeTicketId });

            if (result.ok && result.data) {
                scratchLog('Reveal succeeded on server', { ticketId: activeTicketId, grantedPoints: result.data.grantedPoints, prize: result.data.prize });
                const serverPrize = toFrontendPrize(result.data.prize);
                const grantedPoints = clampRewardPoints(result.data.grantedPoints, REWARD_POINT_LIMITS.scratch);
                setTickets(prev => prev.map(t =>
                    t.id === activeTicketId ? { ...t, state: 'revealed' as TicketState, prize: serverPrize || t.prize } : t
                ));
                setTotalWon(prev => prev + grantedPoints);
                const absolutePoints = extractScratchAbsolutePoints(result.data);
                if (absolutePoints !== null) {
                    scratchLog('Applying absolute points from reveal response', { absolutePoints, grantedPoints });
                    setLocalPoints(absolutePoints);
                    onPointsSyncRef.current?.(absolutePoints);
                } else if (typeof grantedPoints === 'number' && grantedPoints > 0) {
                    scratchLog('Applying incremental points from reveal response', { grantedPoints });
                    setLocalPoints(prev => prev + grantedPoints);
                    onClaimRewardRef.current?.(grantedPoints);
                }
                logScratchReveal(activeTicketId, result.data.prize.label, grantedPoints, result.data.prize.rarity);
                return;
            } else {
                scratchLog('Reveal failed on server', { ticketId: activeTicketId, error: result.error as unknown as Record<string, unknown> | undefined });
                logErrorToBackend('scratch_reveal_api_fail', { ticketId: activeTicketId, error: result.error });
                setApiError('포인트 적립 확인에 실패했어요. 다시 시도해 주세요.');
                return;
            }
        }

        scratchLog('Reveal blocked because no server session is available', { ticketId: activeTicketId, prizeLabel: prize?.label, prizePoints: prize?.points });
        logErrorToBackend('scratch_reveal_missing_session', { ticketId: activeTicketId });
        setApiError('복권 세션을 확인할 수 없어요. 다시 시도해 주세요.');
    }, [activeTicketId, tickets, sessionId, userKey]);

    const showAdAndUnlock = useCallback((adGroupId: string, onSuccess: () => void) => {
        if (typeof loadFullScreenAd !== 'function' || typeof showFullScreenAd !== 'function') {
            console.warn('[ScratchLottery] Ad SDK not available');
            scratchLog('Ad SDK unavailable, executing success callback directly', { adGroupId });
            onSuccess();
            return;
        }
        setIsAdLoading(true);
        scratchLog('Starting scratch ad flow', { adGroupId });

        // 안전장치: 5초 내 광고가 완료되지 않으면 자동 해제
        const safetyTimer = setTimeout(() => {
            console.warn('[ScratchLottery] Ad safety timeout triggered');
            setIsAdLoading(false);
        }, 5_000);
        const clearSafety = () => clearTimeout(safetyTimer);

        // @ts-ignore
        loadFullScreenAd({
            options: { adGroupId },
            onEvent: (event: any) => {
                scratchLog('Scratch ad load event', { adGroupId, eventType: event?.type });
                if (event.type === 'loaded') {
                    // @ts-ignore
                    showFullScreenAd({
                        options: { adGroupId },
                        onEvent: (showEvent: any) => {
                            scratchLog('Scratch ad show event', { adGroupId, eventType: showEvent?.type });
                            if (showEvent.type === 'closed' || showEvent.type === 'dismissed' || showEvent.type === 'completed' || showEvent.type === 'rewarded') {
                                clearSafety();
                                setIsAdLoading(false);
                                scratchLog('Scratch ad completed, invoking success callback', { adGroupId, eventType: showEvent.type });
                                onSuccess();
                            }
                        },
                        onError: (err: any) => {
                            console.error('[ScratchLottery] Ad show error:', err);
                            logScratchAdError(adGroupId, err?.message || 'show_error');
                            clearSafety();
                            setIsAdLoading(false);
                        },
                    });
                }
            },
            onError: (err: any) => {
                console.error('[ScratchLottery] Ad load error:', err);
                logScratchAdError(adGroupId, err?.message || 'load_error');
                clearSafety();
                setIsAdLoading(false);
            },
        });
    }, []);

    const handleUnlockTicket = useCallback((ticketId: number) => {
        if (isAdLoading) {
            scratchLog('Unlock ignored because ad is already loading', { ticketId });
            return;
        }
        scratchLog('Unlock ticket requested', { ticketId, sessionId, currentState: tickets[ticketId]?.state });
        logClick('scratch_unlock_ticket', { ticket_id: ticketId });
        showAdAndUnlock(SCRATCH_UNLOCK_AD_ID, async () => {
            scratchLog('Unlock ad completed', { ticketId });
            logScratchUnlock(ticketId, SCRATCH_UNLOCK_AD_ID);

            // 서버에 unlock 호출 (API 2)
            if (sessionId) {
                const result = await scratchApi<{
                    ticketId: number;
                    status: string;
                    prize: { label: string; points: number; rarity: string };
                }>('/unlock', {
                    userKey,
                    sessionId,
                    ticketId,
                    adVerification: { adGroupId: SCRATCH_UNLOCK_AD_ID, watchTimestamp: Date.now() },
                });

                if (result.ok && result.data) {
                    scratchLog('Unlock succeeded on server', { ticketId, prize: result.data.prize, status: result.data.status });
                    const serverPrize = toFrontendPrize(result.data.prize);
                    setTickets(prev => prev.map(t =>
                        t.id === ticketId ? { ...t, state: 'ready' as TicketState, prize: serverPrize } : t
                    ));
                    setActiveTicketId(ticketId);
                    setResetKey(prev => prev + 1);
                    return;
                } else if (result.error?.code === 'SESSION_EXPIRED' || result.error?.code === 'SESSION_NOT_FOUND') {
                    scratchLog('Unlock hit expired session, restarting', { ticketId, error: result.error as unknown as Record<string, unknown> | undefined });
                    startSession();
                    return;
                } else {
                    scratchLog('Unlock failed on server, using client fallback', { ticketId, error: result.error as unknown as Record<string, unknown> | undefined });
                    logErrorToBackend('scratch_unlock_api_fail', { ticketId, error: result.error });
                }
            }

            // 폴백: 클라이언트 로컬
            scratchLog('Unlock client fallback executing', { ticketId });
            setTickets(prev => prev.map(t =>
                t.id === ticketId ? { ...t, state: 'ready' as TicketState, prize: getRandomPrize(prizeConfigRef.current) } : t
            ));
            setActiveTicketId(ticketId);
            setResetKey(prev => prev + 1);
        });
    }, [isAdLoading, showAdAndUnlock, sessionId, tickets, userKey, startSession]);

    const handleSelectTicket = useCallback((ticketId: number) => {
        const ticket = tickets[ticketId];
        scratchLog('Ticket selected', { ticketId, ticketState: ticket?.state });
        if (!ticket) return;
        if (ticket.state === 'ready' || ticket.state === 'scratching') {
            setActiveTicketId(ticketId);
            setResetKey(prev => prev + 1);
        } else if (ticket.state === 'locked') {
            handleUnlockTicket(ticketId);
        }
    }, [tickets, handleUnlockTicket]);

    const handleResetAll = useCallback(() => {
        if (isAdLoading) {
            scratchLog('Reset ignored because ad is already loading');
            return;
        }
        // 세션 제한 체크 (백엔드 config 기반)
        const info = getScratchSessionInfo(userKey, scratchConfigRef.current);
        scratchLog('Reset all requested', { sessionId, remaining: info.remaining, cooldownMs: info.cooldownMs, count: info.count });
        if (info.remaining <= 0) {
            setSessionInfo(info);
            return;
        }
        logClick('scratch_refresh_all');
        showAdAndUnlock(SCRATCH_REFRESH_AD_ID, async () => {
            scratchLog('Reset ad completed', { sessionId });
            logScratchRefresh();

            // 서버에 refresh 호출 (API 4)
            if (sessionId) {
                const result = await scratchApi<{
                    sessionId: string;
                    tickets: Array<{ ticketId: number; status: string; prize: { label: string; points: number; rarity: string } | null }>;
                    totalSessionsPlayed: number;
                    userPoints: number;
                }>('/refresh', {
                    userKey,
                    sessionId,
                    adVerification: { adGroupId: SCRATCH_REFRESH_AD_ID, watchTimestamp: Date.now() },
                });

                if (result.ok && result.data) {
                    scratchLog('Refresh succeeded on server', { sessionId: result.data.sessionId, tickets: result.data.tickets });
                    setSessionId(result.data.sessionId);
                    setTickets(result.data.tickets.slice(0, TOTAL_TICKETS).map((t, i) => ({
                        id: i,
                        state: t.status as TicketState,
                        prize: toFrontendPrize(t.prize),
                    })));
                    const absolutePoints = extractScratchAbsolutePoints(result.data);
                    if (absolutePoints !== null) {
                        scratchLog('Syncing points after refresh', { absolutePoints });
                        setLocalPoints(absolutePoints);
                        onPointsSyncRef.current?.(absolutePoints);
                    }
                    setActiveTicketId(0);
                    setTotalWon(0);
                    setResetKey(prev => prev + 1);
                    incrementSessionCount();
                    return;
                } else if (result.error?.code === 'SESSION_EXPIRED' || result.error?.code === 'SESSION_NOT_FOUND') {
                    scratchLog('Refresh hit expired session, restarting', { error: result.error as unknown as Record<string, unknown> | undefined });
                    startSession();
                    return;
                } else {
                    scratchLog('Refresh failed on server, using client fallback', { error: result.error as unknown as Record<string, unknown> | undefined });
                    logErrorToBackend('scratch_refresh_api_fail', { error: result.error });
                }
            }

            // 폴백: 클라이언트 로컬
            scratchLog('Refresh client fallback executing');
            setTickets(
                Array.from({ length: TOTAL_TICKETS }, (_, i) => ({
                    id: i,
                    state: i === 0 ? 'ready' : 'locked',
                    prize: i === 0 ? getRandomPrize(prizeConfigRef.current) : null,
                }))
            );
            setActiveTicketId(0);
            setTotalWon(0);
            setResetKey(prev => prev + 1);
            incrementSessionCount();
        });
    }, [isAdLoading, showAdAndUnlock, sessionId, userKey, startSession, incrementSessionCount]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -20 }}
            className="-mx-5 -mt-10 flex min-h-[100dvh] flex-col bg-cream surface-play"
        >
            {/* ━━━━ 컴팩트 상태 바 ━━━━ */}
            <div className="px-5 pt-3 pb-2">
                <div className="flex gap-2">
                    <div className="flex-1 flex items-center gap-1.5 rounded-xl bg-white border border-toss-gray-100 px-3 py-2">
                        <Coins size={13} className="text-toss-blue flex-shrink-0" />
                        <span className="text-[11px] font-bold text-toss-gray-400">내 포인트</span>
                        <span className="text-[14px] font-black text-toss-gray-900 tabular-nums ml-auto">{localPoints.toLocaleString()}점</span>
                    </div>
                    <div className="flex-1 flex items-center gap-1.5 rounded-xl bg-white border border-toss-gray-100 px-3 py-2">
                        <Star size={13} className="text-amber-500 flex-shrink-0" />
                        <span className="text-[11px] font-bold text-toss-gray-400">받은 점수</span>
                        <span className="text-[14px] font-black text-toss-gray-900 tabular-nums ml-auto">{totalWon}점</span>
                    </div>
                    <div className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 ${
                        isLimitReached ? 'bg-red-50 border-red-200' : 'bg-white border-toss-gray-100'
                    }`}>
                        <Clock size={13} className={isLimitReached ? 'text-red-400 flex-shrink-0' : 'text-indigo-500 flex-shrink-0'} />
                        <span className={`text-[14px] font-black tabular-nums ${
                            isLimitReached ? 'text-red-500' : 'text-toss-gray-900'
                        }`}>{sessionInfo.remaining}회 남음</span>
                    </div>
                </div>
            </div>

            {/* ━━━━ 티켓 슬롯 ━━━━ */}
            <div className="px-5 pb-3">
                <div className="flex gap-2">
                    {tickets.map((ticket) => (
                        <motion.button
                            key={ticket.id}
                            whileTap={ticket.state !== 'revealed' ? { scale: 0.93 } : undefined}
                            onClick={() => handleSelectTicket(ticket.id)}
                            className={`flex-1 relative rounded-2xl p-2.5 border-2 transition-all ${
                                ticket.id === activeTicketId && ticket.state !== 'revealed'
                                    ? 'border-toss-blue bg-toss-blue/5 shadow-lg shadow-toss-blue/10'
                                    : ticket.state === 'revealed'
                                        ? `${RARITY_BORDER[ticket.prize?.rarity || 'common']} bg-gradient-to-br ${ticket.prize?.bgGradient || 'from-slate-50 to-white'}`
                                        : ticket.state === 'locked'
                                            ? 'border-toss-gray-200 bg-toss-gray-50'
                                            : 'border-toss-gray-200 bg-white'
                            }`}
                        >
                            <div className="flex flex-col items-center gap-1">
                                {ticket.state === 'locked' ? (
                                    <>
                                        <Lock size={18} className="text-toss-gray-300" />
                                        <span className="t-micro font-bold text-toss-gray-300">광고</span>
                                    </>
                                ) : ticket.state === 'revealed' && ticket.prize ? (
                                    <motion.div
                                        initial={{ scale: 0, rotate: -15 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                                        className="flex flex-col items-center gap-0.5"
                                    >
                                        <AppImage src={ticket.prize.image} alt={ticket.prize.label} width={32} className="w-8 h-8" />
                                        <span className={`text-[11px] font-black ${ticket.prize.color}`}>{formatPrizeLabel(ticket.prize)}</span>
                                    </motion.div>
                                ) : (
                                    <>
                                        <AppImage src="/images/point_2.svg" alt="복권" width={28} className="w-7 h-7 opacity-40 grayscale" />
                                        <span className="t-micro font-bold text-toss-blue">
                                            {ticket.id === 0 ? '무료' : '준비'}
                                        </span>
                                    </>
                                )}
                            </div>
                            {ticket.state === 'revealed' && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                                    <Check size={10} className="text-white" strokeWidth={3} />
                                </div>
                            )}
                        </motion.button>
                    ))}
                </div>
            </div>

            {/* ━━━━ 텍스트 배너 광고 ━━━━ */}
            <PromotedBanner label="행운의 복권" sublabel="광고" adGroupId={BANNER_AD_TEXT_ID} className="px-4 !my-1" />

            {/* ━━━━ 동기부여 로테이션 문구 ━━━━ */}
            <RotatingMotivationBanner
                adWatchTrigger={adWatchTrigger}
                variant="default"
                intervalMs={5000}
                className="pb-1"
            />

            {/* ━━━━ 스크래치 카드 영역 ━━━━ */}
            <div className="flex-1 flex flex-col items-center justify-center px-5 py-4">
                {isLoading ? (
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 size={32} className="text-toss-blue animate-spin" />
                        <p className="text-[14px] font-bold text-toss-gray-400">복권 준비중...</p>
                    </div>
                ) : apiError ? (
                    <div className="flex flex-col items-center gap-4">
                        <p className="text-[14px] font-bold text-red-400">{apiError}</p>
                        <motion.button whileTap={{ scale: 0.95 }} onClick={() => startSession()}
                            className="px-6 py-3 rounded-2xl bg-toss-blue text-white font-bold text-[15px]">
                            다시 시도
                        </motion.button>
                    </div>
                ) : (
                <AnimatePresence mode="wait">
                    {activeTicket?.state === 'ready' || activeTicket?.state === 'scratching' ? (
                        <motion.div
                            key={`scratch-${activeTicketId}-${resetKey}`}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                            className="relative"
                        >
                            <div className={`rounded-[28px] bg-gradient-to-br ${activeTicket.prize?.bgGradient || 'from-slate-50 to-white'} border-2 border-toss-gray-200 p-1 shadow-xl shadow-toss-gray-200/40`}>
                                <ScratchCard
                                    width={280}
                                    height={280}
                                    onComplete={handleScratchComplete}
                                    resetKey={resetKey}
                                >
                                    {activeTicket.prize && (
                                        <div className="flex flex-col items-center justify-center gap-3">
                                            <AppImage src={activeTicket.prize.image} alt={activeTicket.prize.label} width={96} className="w-24 h-24" />
                                            <div className="text-center">
                                                <p className={`text-[28px] font-black ${activeTicket.prize.color}`}>
                                                    {formatPrizeLabel(activeTicket.prize)}
                                                </p>
                                                <p className="text-[13px] font-bold text-toss-gray-400 mt-1">포인트 받았어요!</p>
                                            </div>
                                        </div>
                                    )}
                                </ScratchCard>
                            </div>

                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-toss-gray-900/80 backdrop-blur-sm text-white text-[12px] font-bold px-4 py-2 rounded-full whitespace-nowrap"
                            >
                                <Sparkles size={12} className="text-amber-300" />
                                {activeTicketId === 0 ? '무료 복권이에요! 긁어보세요!' : '손가락으로 긁어보세요!'}
                            </motion.div>
                        </motion.div>
                    ) : activeTicket?.state === 'revealed' && activeTicket.prize ? (
                        <motion.div
                            key={`revealed-${activeTicketId}`}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="flex flex-col items-center gap-6"
                        >
                            <div className={`rounded-[28px] bg-gradient-to-br ${activeTicket.prize.bgGradient} border-2 ${RARITY_BORDER[activeTicket.prize.rarity]} p-1 shadow-xl ${RARITY_GLOW[activeTicket.prize.rarity]}`}>
                                <div className="w-[280px] h-[280px] flex items-center justify-center">
                                    <div className="flex flex-col items-center justify-center gap-3">
                                        <motion.img
                                            src={activeTicket.prize.image}
                                            alt={activeTicket.prize.label}
                                            className="w-24 h-24"
                                            animate={{ scale: [1, 1.2, 1], rotate: [0, 8, -8, 0] }}
                                            transition={{ duration: 0.6, repeat: 0 }}
                                        />
                                        <div className="text-center">
                                            <p className={`text-[28px] font-black ${activeTicket.prize.color}`}>
                                                {formatPrizeLabel(activeTicket.prize)}
                                            </p>
                                            <p className="text-[13px] font-bold text-toss-gray-400 mt-1">포인트 받기 완료</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {activeTicket.prize.rarity === 'legendary' && (
                                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                                    className="flex items-center gap-1.5 bg-gradient-to-r from-red-100 to-orange-100 px-4 py-1.5 rounded-full">
                                    <Star size={12} className="text-red-600 fill-red-600" />
                                    <span className="text-[12px] font-black text-red-700">최고 점수예요!</span>
                                </motion.div>
                            )}
                            {activeTicket.prize.rarity === 'epic' && (
                                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                                    className="flex items-center gap-1.5 bg-gradient-to-r from-amber-100 to-orange-100 px-4 py-1.5 rounded-full">
                                    <Star size={12} className="text-amber-600 fill-amber-600" />
                                    <span className="text-[12px] font-black text-amber-700">높은 점수예요!</span>
                                </motion.div>
                            )}
                            {activeTicket.prize.rarity === 'rare' && (
                                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                                    className="flex items-center gap-1.5 bg-purple-100 px-4 py-1.5 rounded-full">
                                    <Sparkles size={12} className="text-purple-600" />
                                    <span className="text-[12px] font-black text-purple-700">좋은 점수예요!</span>
                                </motion.div>
                            )}
                            {activeTicket.prize.rarity === 'common' && (
                                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                                    className="flex items-center gap-1.5 bg-blue-50 px-4 py-1.5 rounded-full">
                                    <Coins size={12} className="text-toss-blue" />
                                    <span className="text-[12px] font-black text-toss-blue">{activeTicket.prize.points}점 받았어요</span>
                                </motion.div>
                            )}

                            {/* 다음 티켓으로 이동 */}
                            {!allDone && (() => {
                                const nextLocked = tickets.find(t => t.state === 'locked');
                                const nextReady = tickets.find(t => t.state === 'ready' && t.id !== activeTicketId);
                                if (nextReady) {
                                    return (
                                        <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                                            whileTap={{ scale: 0.95 }} onClick={() => handleSelectTicket(nextReady.id)}
                                            className="flex items-center gap-2 bg-toss-blue text-white px-8 py-3.5 rounded-2xl font-bold text-[15px] shadow-lg shadow-toss-blue/30">
                                            <RotateCcw size={16} />
                                            다음 복권 긁기
                                        </motion.button>
                                    );
                                }
                                if (nextLocked) {
                                    return (
                                        <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                                            whileTap={{ scale: 0.95 }} onClick={() => handleUnlockTicket(nextLocked.id)}
                                            disabled={isAdLoading}
                                            className={`flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-[15px] shadow-lg transition-all ${
                                                isAdLoading ? 'bg-toss-gray-300 text-white' : 'bg-gradient-to-r from-toss-blue to-indigo-500 text-white shadow-toss-blue/30'
                                            }`}>
                                            <Play size={16} className="fill-white" />
                                            {isAdLoading ? '광고 준비 중...' : '광고 보고 다음 복권 열기'}
                                        </motion.button>
                                    );
                                }
                                return null;
                            })()}
                        </motion.div>
                    ) : activeTicket?.state === 'locked' ? (
                        <motion.div
                            key={`locked-${activeTicketId}`}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="flex flex-col items-center gap-6"
                        >
                            <div className="rounded-[28px] bg-gradient-to-br from-toss-gray-100 to-toss-gray-50 border-2 border-toss-gray-200 border-dashed p-1 shadow-xl shadow-toss-gray-200/40">
                                <div className="w-[280px] h-[280px] flex flex-col items-center justify-center gap-4">
                                    <Lock size={48} className="text-toss-gray-300" />
                                    <div className="text-center">
                                        <p className="text-[18px] font-black text-toss-gray-400">잠겨있어요</p>
                                        <p className="text-[13px] font-medium text-toss-gray-300 mt-1">광고를 보면 열 수 있어요</p>
                                    </div>
                                </div>
                            </div>

                            <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                                whileTap={{ scale: 0.95 }} onClick={() => handleUnlockTicket(activeTicketId)}
                                disabled={isAdLoading}
                                className={`flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-[15px] shadow-lg transition-all ${
                                    isAdLoading ? 'bg-toss-gray-300 text-white' : 'bg-gradient-to-r from-toss-blue to-indigo-500 text-white shadow-toss-blue/30'
                                }`}>
                                <Play size={16} className="fill-white" />
                                {isAdLoading ? '광고 준비 중...' : '광고 보고 열기'}
                            </motion.button>
                        </motion.div>
                    ) : null}
                </AnimatePresence>
                )}

                {/* 전체 완료 */}
                {allDone && (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center gap-4 mt-6">
                        <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-100 to-teal-100 px-5 py-2 rounded-full">
                            <Sparkles size={14} className="text-emerald-600" />
                            <span className="text-[13px] font-black text-emerald-700">3장 모두 완료! 총 {totalWon}점 받았어요</span>
                        </div>
                        {isLimitReached ? (
                            <div className="flex flex-col items-center gap-2">
                                <div className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-red-50 border border-red-200">
                                    <Clock size={16} className="text-red-400" />
                                    <span className="text-[14px] font-bold text-red-500">
                                        {cooldownText || '잠시 후 다시 도전하세요'}
                                    </span>
                                </div>
                                <span className="text-[12px] font-medium text-toss-gray-400">{Math.round(scratchConfig.sessionWindowMs / 3600000)}시간에 {scratchConfig.maxSessions}번까지 긁을 수 있어요</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2">
                                <motion.button whileTap={{ scale: 0.95 }} onClick={handleResetAll}
                                    disabled={isAdLoading}
                                    className={`flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-[15px] shadow-lg transition-all ${
                                        isAdLoading ? 'bg-toss-gray-300 text-white' : 'bg-toss-blue text-white shadow-toss-blue/30'
                                    }`}>
                                    {isAdLoading ? (
                                        <><Play size={16} className="fill-white" /> 광고 준비 중...</>
                                    ) : (
                                        <><RotateCcw size={16} /> 광고 보고 다시 긁기</>
                                    )}
                                </motion.button>
                                <span className="text-[12px] font-medium text-toss-gray-300">남은 횟수 {sessionInfo.remaining}회</span>
                            </div>
                        )}
                    </motion.div>
                )}
            </div>

            {/* ━━━━ 이용 안내 ━━━━ */}
            <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="px-5 pb-10">
                <div className="rounded-[18px] bg-toss-gray-50/80 border border-toss-gray-100/50 px-4 py-3.5">
                    <p className="text-[11px] font-bold text-toss-gray-400 mb-2">복권 안내</p>
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-[11px] font-medium text-toss-gray-400">
                            <div className="w-1 h-1 rounded-full bg-toss-gray-300" />
                            <span>3장의 복권 중 첫 번째는 무료예요</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-medium text-toss-gray-400">
                            <div className="w-1 h-1 rounded-full bg-toss-gray-300" />
                            <span>나머지 2장은 광고를 보면 열 수 있어요</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-medium text-toss-gray-400">
                            <div className="w-1 h-1 rounded-full bg-toss-gray-300" />
                            <span>{Math.round(scratchConfig.sessionWindowMs / 3600000)}시간에 최대 {scratchConfig.maxSessions}번까지 긁을 수 있어요</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-medium text-toss-gray-400">
                            <div className="w-1 h-1 rounded-full bg-toss-gray-300" />
                            <span>당첨 포인트는 즉시 적립됩니다</span>
                        </div>
                    </div>
                </div>
            </motion.section>
        </motion.div>
    );
});
