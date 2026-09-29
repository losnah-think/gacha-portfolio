import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { PromotedBanner } from '../../../shared/components/PromotedBanner';
import { apiUrl } from '../../../shared/api/client';

/* ── API Helper ── */
const crosswordApi = async <T = any>(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; data?: T; error?: string }> => {
  try {
    const res = await fetch(apiUrl(`/crossword${path}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.resultType === 'SUCCESS') return { ok: true, data: json.data };
    return { ok: false, error: json.error?.message || json.message || '알 수 없는 오류' };
  } catch (e: any) {
    return { ok: false, error: e?.message || '네트워크 오류' };
  }
};

/* ── Types (API 응답) ── */
interface WordEntry {
  id: number;
  answer: string;
  hint?: string;
  cells: { row: number; col: number }[];
}

interface PuzzleData {
  sessionId: string;
  size: number;
  grid: string[][];
  words: WordEntry[];
  wordCount: number;
  rewardPoints: number;
}

interface SubmitResult {
  correct: boolean;
  wordId: number | null;
  foundWordIds: number[];
  allSolved: boolean;
  remainingCount: number;
  reward?: { points: number; totalPoints: number; message: string };
}

/* ── Component ── */
interface CrosswordGameProps {
  tickets: number;
  userKey: string;
  onTicketUpdate: (tickets: number) => void;
  onPointsSync: (totalPoints: number) => void;
  onBack: () => void;
  onAlert?: (config: { title: string; description: string }) => void;
}

export function CrosswordGame({ tickets, userKey, onTicketUpdate, onPointsSync, onBack, onAlert }: CrosswordGameProps) {
  useAppNavigationBar({ title: '단어를 이어보세요' });

  const [phase, setPhase] = useState<'loading' | 'ready' | 'unlocking' | 'playing' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  const [foundIds, setFoundIds] = useState<Set<number>>(new Set());
  const [isSolvedModalOpen, setIsSolvedModalOpen] = useState(false);
  const foundIdsRef = useRef<Set<number>>(new Set());
  const submittingRef = useRef(false);

  // 드래그
  const [dragCells, setDragCells] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  /* ── 퍼즐 생성: 티켓은 아직 쓰지 않는다 ── */
  const initLock = useRef(false);
  const initPuzzle = useCallback(async () => {
    if (initLock.current) return;
    initLock.current = true;

    setPhase('loading');
    setFoundIds(new Set());
    foundIdsRef.current = new Set();
    setErrorMsg('');

    try {
      // 1. generate
      const gen = await crosswordApi<PuzzleData>('/generate', { userKey, size: 7 });
      if (!gen.ok || !gen.data) {
        setErrorMsg(gen.error || '퍼즐 생성에 실패했어요');
        setPhase('error');
        return;
      }

      setPuzzle(gen.data);
      setPhase('ready');
    } finally {
      initLock.current = false;
    }
  }, [userKey]);

  const unlockPuzzle = useCallback(async () => {
    if (!puzzle || phase === 'unlocking') return;
    if (tickets <= 0) {
      onAlert?.({
        title: '이용권이 필요해요',
        description: '단어찾기를 시작하려면 이용권 1장이 필요해요.',
      });
      return;
    }

    setErrorMsg('');
    setPhase('unlocking');
    const unlock = await crosswordApi<{ unlocked: boolean; tickets: number }>('/unlock', {
      userKey,
      sessionId: puzzle.sessionId,
    });

    if (!unlock.ok || !unlock.data?.unlocked) {
      setErrorMsg(unlock.error || '이용권이 부족해요');
      setPhase('ready');
      return;
    }

    onTicketUpdate(unlock.data.tickets);
    setPhase('playing');
  }, [onAlert, onTicketUpdate, phase, puzzle, tickets, userKey]);

  // 마운트 시 자동 시작 (1회만)
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    initPuzzle();
  }, [initPuzzle]);

  /* ── 파생 상태 ── */
  const size = puzzle?.size ?? 7;
  const grid = puzzle?.grid ?? [];
  const words = puzzle?.words ?? [];

  const foundCells = useMemo(() => {
    const set = new Set<string>();
    words.forEach(w => {
      if (foundIds.has(w.id)) {
        w.cells.forEach(c => set.add(`${c.row},${c.col}`));
      }
    });
    return set;
  }, [foundIds, words]);

  const dragCellSet = useMemo(() => new Set(dragCells), [dragCells]);

  /* ── 좌표 → 셀 ── */
  const getCellFromPoint = useCallback((clientX: number, clientY: number): string | null => {
    if (!gridRef.current) return null;
    const rect = gridRef.current.getBoundingClientRect();
    const GAP = 1.5;
    const cellSize = (rect.width - GAP * (size - 1)) / size;
    const stride = cellSize + GAP;
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;
    const col = Math.floor(relX / stride);
    const row = Math.floor(relY / stride);
    if (row < 0 || row >= size || col < 0 || col >= size) return null;
    return `${row},${col}`;
  }, [size]);

  /* ── 직선 보간 ── */
  const getLineCells = useCallback((cells: string[]): string[] | null => {
    if (cells.length < 2) return cells;
    const parsed = cells.map(c => {
      const [r, col] = c.split(',').map(Number);
      return { r, c: col };
    });
    const first = parsed[0];
    const last = parsed[parsed.length - 1];
    const dr = Math.sign(last.r - first.r);
    const dc = Math.sign(last.c - first.c);
    if (dr === 0 && dc === 0) return null;
    const dist = Math.max(Math.abs(last.r - first.r), Math.abs(last.c - first.c));
    const line: string[] = [];
    for (let i = 0; i <= dist; i++) {
      line.push(`${first.r + dr * i},${first.c + dc * i}`);
    }
    return line;
  }, []);

  /* ── 드래그 완료 → 서버 submit ── */
  const checkSelection = useCallback(async (cells: string[]) => {
    if (!puzzle || submittingRef.current) return;
    const line = getLineCells(cells);
    if (!line || line.length < 2) return;

    // 클라이언트 사전 매칭 (어떤 wordId인지 파악) — ref로 최신 foundIds 참조
    const selectedStr = line.map(key => {
      const [r, c] = key.split(',').map(Number);
      return grid[r]?.[c] ?? '';
    }).join('');
    const reversedStr = [...selectedStr].reverse().join('');

    let matchedWord: WordEntry | null = null;
    for (const word of words) {
      if (foundIdsRef.current.has(word.id)) continue;
      if (word.answer === selectedStr || word.answer === reversedStr) {
        matchedWord = word;
        break;
      }
    }
    if (!matchedWord) return;

    // 서버 submit
    submittingRef.current = true;
    const submitCells = matchedWord.cells.map(c => `${c.row},${c.col}`);
    try {
      const res = await crosswordApi<SubmitResult>('/submit', {
        userKey,
        sessionId: puzzle.sessionId,
        wordId: matchedWord.id,
        cells: submitCells,
      });

      if (res.ok && res.data?.correct) {
        const newFoundIds = new Set(res.data.foundWordIds);
        foundIdsRef.current = newFoundIds;
        setFoundIds(newFoundIds);

        if (res.data.allSolved && res.data.reward) {
          onPointsSync(res.data.reward.totalPoints);
          setIsSolvedModalOpen(true);
        } else if (res.data.allSolved) {
          setIsSolvedModalOpen(true);
        }
      } else {
        console.warn('[Crossword] submit failed:', res.error);
        onAlert?.({
          title: '제출에 실패했어요',
          description: res.error || '네트워크를 확인한 뒤 다시 시도해 주세요.',
        });
      }
    } catch (e) {
      console.warn('[Crossword] submit error:', e);
      onAlert?.({
        title: '제출에 실패했어요',
        description: '찾은 단어 상태는 유지했어요. 다시 시도해 주세요.',
      });
    }
    submittingRef.current = false;
  }, [puzzle, getLineCells, grid, words, userKey, onPointsSync, onAlert]);

  /* ── 터치 핸들러 ── */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const cell = getCellFromPoint(touch.clientX, touch.clientY);
    if (cell) { setIsDragging(true); setDragCells([cell]); }
  }, [getCellFromPoint]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    const cell = getCellFromPoint(touch.clientX, touch.clientY);
    if (cell && cell !== dragCells[dragCells.length - 1]) {
      setDragCells(prev => {
        const idx = prev.indexOf(cell);
        if (idx >= 0) return prev.slice(0, idx + 1);
        return [...prev, cell];
      });
    }
  }, [isDragging, getCellFromPoint, dragCells]);

  const handleTouchEnd = useCallback(() => {
    if (isDragging && dragCells.length >= 2) checkSelection(dragCells);
    setIsDragging(false);
    setDragCells([]);
  }, [isDragging, dragCells, checkSelection]);

  /* ── 마우스 핸들러 ── */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const cell = getCellFromPoint(e.clientX, e.clientY);
    if (cell) { setIsDragging(true); setDragCells([cell]); }
  }, [getCellFromPoint]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const cell = getCellFromPoint(e.clientX, e.clientY);
    if (cell && cell !== dragCells[dragCells.length - 1]) {
      setDragCells(prev => {
        const idx = prev.indexOf(cell);
        if (idx >= 0) return prev.slice(0, idx + 1);
        return [...prev, cell];
      });
    }
  }, [isDragging, getCellFromPoint, dragCells]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && dragCells.length >= 2) checkSelection(dragCells);
    setIsDragging(false);
    setDragCells([]);
  }, [isDragging, dragCells, checkSelection]);

  /* ── 로딩 / 에러 화면 ── */
  if (phase !== 'playing') {
    return (
      <div className="flex flex-col gap-4 px-1 pb-6">
        <div className="flex items-center gap-2 pt-1">
          <span className="text-[18px]">🔍</span>
          <span className="text-[16px] font-extrabold text-toss-gray-900">단어를 이어보세요</span>
        </div>

        {phase === 'error' ? (
          <div className="flex flex-col items-center gap-4 rounded-[24px] border border-toss-gray-100 bg-white p-7 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
            <div className="text-[44px]">😢</div>
            <p className="text-[15px] font-bold text-toss-gray-700 text-center">퍼즐을 불러오지 못했어요</p>
            <p className="text-[12px] text-toss-gray-400 text-center">{errorMsg}</p>
            <button
              onClick={() => initPuzzle()}
              className="w-full rounded-2xl bg-gradient-to-r from-toss-blue to-blue-500 py-3.5 text-[14px] font-bold text-white shadow-lg shadow-toss-blue/20 active:scale-[0.98] transition-transform"
            >
              다시 시도
            </button>
            <button
              onClick={onBack}
              className="w-full rounded-2xl border border-toss-gray-200 bg-white py-3 text-[14px] font-bold text-toss-gray-600 active:scale-[0.98] transition-transform"
            >
              돌아가기
            </button>
          </div>
        ) : phase === 'ready' || phase === 'unlocking' ? (
          <div className="flex flex-col items-center gap-4 rounded-[24px] border border-toss-gray-100 bg-white p-7 shadow-[0_2px_12px_rgba(15,23,42,0.06)]">
            <div className="text-[44px]">🔎</div>
            <div className="text-center">
              <p className="text-[17px] font-extrabold text-toss-gray-900">단어찾기를 시작할까요?</p>
              <p className="mt-2 text-[13px] font-semibold leading-relaxed text-toss-gray-500">
                이용권 1장을 사용해 퍼즐을 열어요.<br />
                모든 단어를 찾으면 15점을 받아요.
              </p>
              {puzzle && (
                <p className="mt-3 text-[12px] font-bold text-toss-blue">
                  숨은 단어 {puzzle.wordCount}개 · 보상 {puzzle.rewardPoints || 15}점
                </p>
              )}
              {errorMsg && (
                <p className="mt-3 text-[12px] font-bold text-rose-500">{errorMsg}</p>
              )}
            </div>
            <button
              type="button"
              onClick={unlockPuzzle}
              disabled={phase === 'unlocking' || tickets <= 0}
              className="w-full rounded-2xl bg-gradient-to-r from-toss-blue to-blue-500 py-3.5 text-[14px] font-bold text-white shadow-lg shadow-toss-blue/20 transition-transform active:scale-[0.98] disabled:from-toss-gray-200 disabled:to-toss-gray-200 disabled:text-toss-gray-400 disabled:shadow-none"
            >
              {phase === 'unlocking' ? '퍼즐 여는 중...' : tickets > 0 ? '1티켓 사용하고 시작' : '이용권이 필요해요'}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="w-full rounded-2xl border border-toss-gray-200 bg-white py-3 text-[14px] font-bold text-toss-gray-600 active:scale-[0.98] transition-transform"
            >
              돌아가기
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-toss-blue/20 border-t-toss-blue" />
          </div>
        )}
      </div>
    );
  }

  /* ── 퍼즐 플레이 화면 ── */
  return (
    <>
    <div className="flex flex-col gap-3 px-1 pb-6">
      {/* 헤더 */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[18px]">🔍</span>
        <span className="text-[16px] font-extrabold text-toss-gray-900">단어를 이어보세요</span>
      </div>

      <p className="px-1 text-[12px] text-toss-gray-500">숨겨진 단어를 이어서 찾아보세요! · 다 찾으면 15점을 받아요</p>

      {/* 진행률 */}
      <div className="flex items-center gap-2.5 px-1">
        <span className="text-[13px] font-bold text-toss-gray-700">{foundIds.size} / {words.length}</span>
        <div className="flex-1 h-[6px] rounded-full bg-toss-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-toss-blue to-blue-400 transition-all duration-300"
            style={{ width: `${words.length > 0 ? (foundIds.size / words.length) * 100 : 0}%` }}
          />
        </div>
      </div>


      {/* 격자 */}
      <div className="px-0.5">
        <div
          ref={gridRef}
          className="rounded-xl border-2 border-toss-gray-600 overflow-hidden select-none"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${size}, 1fr)`,
            gap: 1.5,
            background: '#cbd5e1',
            touchAction: 'none',
            WebkitUserSelect: 'none',
          } as React.CSSProperties}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {Array.from({ length: size }).map((_, r) =>
            Array.from({ length: size }).map((_, c) => {
              const key = `${r},${c}`;
              const char = grid[r]?.[c] ?? '';
              const isFound = foundCells.has(key);
              const isDragTarget = dragCellSet.has(key);
              return (
                <div
                  key={key}
                  className={`flex items-center justify-center aspect-square transition-colors duration-100 ${
                    isFound ? 'bg-emerald-100' : isDragTarget ? 'bg-blue-100' : 'bg-white'
                  }`}
                >
                  <span className={`text-[15px] font-bold leading-none pointer-events-none ${
                    isFound ? 'text-emerald-800' : 'text-toss-gray-900'
                  }`}>
                    {char}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 찾을 단어 목록 */}
      <div className="flex flex-col gap-1.5">
        <p className="px-1 text-[13px] font-bold text-toss-gray-700">찾을 단어</p>
        <div className="flex flex-wrap gap-2 px-1">
          {words.map(w => {
            const isFound = foundIds.has(w.id);
            return (
              <span
                key={w.id}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-bold transition-colors ${
                  isFound ? 'bg-emerald-100 text-emerald-700 line-through' : 'bg-toss-gray-50 text-toss-gray-700'
                }`}
              >
                {w.answer}
              </span>
            );
          })}
        </div>
      </div>

      <PromotedBanner />
    </div>

    {/* 완료 모달 */}
    {isSolvedModalOpen && (
      <>
        <div className="fixed inset-0 bg-black/60 z-[200] backdrop-blur-[2px]" />
        <div className="fixed inset-0 m-auto w-[320px] h-fit bg-[#FFFFFF] rounded-[24px] overflow-hidden z-[210] shadow-xl">
          <div className="p-7 text-center">
            <div className="text-[48px] mb-3">🎉</div>
            <h3 className="text-[20px] font-bold text-[#191F28] mb-2">모든 단어를 찾았어요!</h3>
            <p className="text-[17px] text-[#4E5968] leading-relaxed">+15점 받았어요</p>
          </div>
          <div className="flex border-t border-[#F2F4F6]">
            <button
              onClick={() => { setIsSolvedModalOpen(false); onBack(); }}
              className="flex-1 h-[62px] text-[19px] font-bold text-[#4E5968] border-r border-[#F2F4F6] active:bg-[#F9FAFB] transition-colors"
            >
              종료하기
            </button>
            <button
              onClick={() => { setIsSolvedModalOpen(false); initPuzzle(); }}
              className="flex-1 h-[62px] text-[19px] font-bold text-[#3182F6] active:bg-[#F9FAFB] transition-colors"
            >
              다시하기
            </button>
          </div>
        </div>
      </>
    )}
    </>
  );
}

export default CrosswordGame;
