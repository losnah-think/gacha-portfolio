/**
 * 오늘의 단어찾기 퍼즐 생성기
 * - 날짜 기반 시드로 매일 같은 퍼즐 제공
 * - 한글 단어를 8×8 격자에 8방향으로 배치
 * - 나머지 빈 칸은 랜덤 한글로 채움
 */

// ── 단어 풀 (주제별) ──
const WORD_POOL = [
  // 음식
  '김치찌개', '떡볶이', '불고기', '비빔밥', '냉면',
  '삼겹살', '치킨', '라면', '만두', '잡채',
  '순두부', '갈비탕', '김밥', '호떡', '붕어빵',
  // 자연
  '벚꽃', '무지개', '태양', '별빛', '바람',
  '하늘', '구름', '나비', '바다', '산',
  '꽃잎', '이슬', '폭포', '노을', '숲',
  // 감정/추상
  '행복', '사랑', '희망', '용기', '자유',
  '평화', '감사', '열정', '기쁨', '지혜',
  '우정', '꿈', '믿음', '도전', '성장',
  // 일상
  '커피', '음악', '영화', '여행', '독서',
  '산책', '요리', '운동', '공부', '휴식',
  '쇼핑', '게임', '노래', '춤', '편지',
];

// 빈칸 채울 랜덤 한글 자모 (가~힣 범위에서 자주 쓰이는 글자)
const FILLER_CHARS = '가나다라마바사아자차카타파하고노도로모보소오조초코토포호구누두루무부수우주추쿠투푸후기니디리미비시이지치키티피히';

// 8방향 벡터
const DIRECTIONS: [number, number][] = [
  [0, 1],   // →
  [0, -1],  // ←
  [1, 0],   // ↓
  [-1, 0],  // ↑
  [1, 1],   // ↘
  [-1, -1], // ↖
  [1, -1],  // ↙
  [-1, 1],  // ↗
];

export interface WordEntry {
  id: number;
  answer: string;
  cells: { row: number; col: number }[];
}

export interface Puzzle {
  size: number;
  grid: string[][];
  words: WordEntry[];
  date: string;
}

/** 날짜 문자열 → 결정론적 시드 정수 */
function dateToSeed(dateStr: string): number {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) {
    h = (Math.imul(31, h) + dateStr.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** 시드 기반 의사 난수 생성기 (Mulberry32) */
function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 배열 셔플 (Fisher-Yates, 시드 난수 사용) */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** 단어를 격자에 배치 시도 */
function tryPlace(
  grid: (string | null)[][],
  word: string,
  row: number,
  col: number,
  dr: number,
  dc: number,
  size: number,
): { row: number; col: number }[] | null {
  const cells: { row: number; col: number }[] = [];
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    if (r < 0 || r >= size || c < 0 || c >= size) return null;
    if (grid[r][c] !== null && grid[r][c] !== word[i]) return null;
    cells.push({ row: r, col: c });
  }
  return cells;
}

/**
 * 퍼즐 생성 (프론트 전용 — 추후 백엔드로 교체 가능)
 * random=true(기본값)이면 매번 다른 퍼즐, false이면 날짜 고정 시드.
 */
export function generateDailyPuzzle(options?: { random?: boolean }): Puzzle {
  const random = options?.random ?? true;
  const today = new Date().toISOString().slice(0, 10);
  const seed = random
    ? (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0
    : dateToSeed(today);
  const rng = mulberry32(seed);

  const SIZE = 8;
  const TARGET_WORDS = 6; // 찾을 단어 수

  // 시드 기반으로 단어 셔플 후 길이 필터 (격자 크기 이하)
  const candidates = shuffle(
    WORD_POOL.filter(w => w.length <= SIZE),
    rng,
  );

  const grid: (string | null)[][] = Array.from({ length: SIZE }, () =>
    Array(SIZE).fill(null),
  );
  const words: WordEntry[] = [];
  let wordId = 0;

  for (const word of candidates) {
    if (words.length >= TARGET_WORDS) break;

    // 랜덤 방향 & 시작점 시도
    const dirs = shuffle([...DIRECTIONS], rng);
    let placed = false;

    for (const [dr, dc] of dirs) {
      if (placed) break;
      // 가능한 시작점 탐색
      const starts: [number, number][] = [];
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          starts.push([r, c]);
        }
      }
      const shuffledStarts = shuffle(starts, rng);

      for (const [sr, sc] of shuffledStarts) {
        const cells = tryPlace(grid, word, sr, sc, dr, dc, SIZE);
        if (cells) {
          // 배치
          for (let i = 0; i < word.length; i++) {
            grid[cells[i].row][cells[i].col] = word[i];
          }
          words.push({ id: wordId++, answer: word, cells });
          placed = true;
          break;
        }
      }
    }
  }

  // 빈 칸을 랜덤 한글로 채움
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === null) {
        grid[r][c] = FILLER_CHARS[Math.floor(rng() * FILLER_CHARS.length)];
      }
    }
  }

  return {
    size: SIZE,
    grid: grid as string[][],
    words,
    date: today,
  };
}
