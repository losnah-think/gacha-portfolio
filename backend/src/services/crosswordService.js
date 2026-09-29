/**
 * [Crossword Service] 단어찾기 퍼즐 비즈니스 로직
 *
 * - generatePuzzle   : 랜덤 퍼즐 생성 → 세션 저장
 * - unlockPuzzle     : 티켓 1장 소모 → 잠금해제
 * - submitWord       : 단어 검증 → 전부 완료 시 포인트 지급
 * - claimFreeTicket  : 단어찾기 전용 일일 무료 티켓 수령
 */
import { firestore, FieldValue } from '../lib/firebaseAdmin.js';
import { getKstDateKey, getUserDocRef, getTicketBalance, getExpToNext, logUserAction } from '../utils/helpers.js';

const CROSSWORD_SESSIONS = 'crossword_sessions';
const USERS = 'users';
const REWARD_POINTS = 15;
const REWARD_EXP = 10;
const GRID_SIZE = 7;
const MAX_WORDS = 6;

// ─── 단어 뱅크 ─────────────────────────────────────────────────────────────────
// 카테고리별 한국어 단어 (4~6글자 위주)
const WORD_BANK = [
  { answer: '김치찌개', hint: '한국의 대표 찌개' },
  { answer: '비빔밥', hint: '여러 재료를 섞어 먹는 밥' },
  { answer: '떡볶이', hint: '매콤달콤한 길거리 음식' },
  { answer: '삼겹살', hint: '구워 먹는 돼지고기' },
  { answer: '냉면', hint: '여름에 시원하게 먹는 면' },
  { answer: '불고기', hint: '양념에 재운 고기 요리' },
  { answer: '잡채', hint: '당면과 야채를 볶은 요리' },
  { answer: '된장찌개', hint: '콩 발효 장으로 끓인 찌개' },
  { answer: '갈비탕', hint: '소갈비로 끓인 탕' },
  { answer: '순두부', hint: '부드러운 두부 요리' },
  { answer: '김밥', hint: '밥과 재료를 김으로 만 음식' },
  { answer: '만두', hint: '속을 넣어 빚은 음식' },
  { answer: '호떡', hint: '달콤한 겨울 간식' },
  { answer: '붕어빵', hint: '물고기 모양 간식' },
  { answer: '치킨', hint: '튀긴 닭고기' },
  { answer: '라면', hint: '뜨거운 물에 끓이는 면' },
  { answer: '족발', hint: '삶은 돼지 다리' },
  { answer: '감자탕', hint: '감자와 등뼈로 끓인 탕' },
  { answer: '칼국수', hint: '칼로 썰어 만든 면' },
  { answer: '팥빙수', hint: '여름 대표 빙수' },
  { answer: '오징어', hint: '바다에 사는 연체동물' },
  { answer: '고구마', hint: '달콤한 뿌리채소' },
  { answer: '수박', hint: '여름 대표 과일' },
  { answer: '딸기', hint: '빨간 봄 과일' },
  { answer: '사과', hint: '빨간 가을 과일' },
  { answer: '바나나', hint: '노란 열대 과일' },
  { answer: '포도', hint: '알이 여러 개 달린 과일' },
  { answer: '귤', hint: '제주도 대표 과일' },
  { answer: '토끼', hint: '귀가 긴 동물' },
  { answer: '고양이', hint: '야옹 하고 우는 동물' },
  { answer: '강아지', hint: '멍멍 하고 짖는 동물' },
  { answer: '다람쥐', hint: '도토리를 모으는 동물' },
  { answer: '코끼리', hint: '코가 긴 큰 동물' },
  { answer: '기린', hint: '목이 긴 동물' },
  { answer: '판다', hint: '흑백 무늬의 곰' },
  { answer: '해바라기', hint: '해를 바라보는 꽃' },
  { answer: '장미', hint: '가시가 있는 꽃' },
  { answer: '무궁화', hint: '한국의 국화' },
  { answer: '벚꽃', hint: '봄에 피는 분홍빛 꽃' },
  { answer: '튤립', hint: '네덜란드 대표 꽃' },
  { answer: '우산', hint: '비 올 때 쓰는 물건' },
  { answer: '안경', hint: '눈에 쓰는 물건' },
  { answer: '지갑', hint: '돈을 넣는 물건' },
  { answer: '시계', hint: '시간을 알려주는 물건' },
  { answer: '거울', hint: '자신을 비춰보는 물건' },
  { answer: '한라산', hint: '제주도에 있는 산' },
  { answer: '경복궁', hint: '서울의 대표 궁궐' },
  { answer: '서울', hint: '한국의 수도' },
  { answer: '부산', hint: '한국의 해양 도시' },
  { answer: '제주도', hint: '한국의 대표 섬' },
];

// ─── 한글 자모 채우기용 ─────────────────────────────────────────────────────────
const HANGUL_CHARS = [
  '가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하',
  '고', '노', '도', '로', '모', '보', '소', '오', '조', '초', '코', '토', '포', '호',
  '구', '누', '두', '루', '무', '부', '수', '우', '주', '추', '쿠', '투', '푸', '후',
  '기', '니', '디', '리', '미', '비', '시', '이', '지', '치', '키', '티', '피', '히',
  '개', '네', '데', '레', '메', '베', '세', '에', '제', '체', '케', '테', '페', '헤',
];

function randomChar() {
  return HANGUL_CHARS[Math.floor(Math.random() * HANGUL_CHARS.length)];
}

// ─── 퍼즐 생성 로직 ─────────────────────────────────────────────────────────────

/** 8x8 격자에 단어를 배치하고 빈 칸을 랜덤 한글로 채움 */
function buildPuzzleGrid(size, words) {
  // 빈 격자 생성
  const grid = Array.from({ length: size }, () => Array(size).fill(null));
  const placedWords = [];

  // 방향: 가로(→), 세로(↓), 대각선(↘)
  const directions = [
    { dr: 0, dc: 1 },  // 가로
    { dr: 1, dc: 0 },  // 세로
    { dr: 1, dc: 1 },  // 대각선
  ];

  // 단어를 셔플하여 랜덤 순서로 배치 시도
  const shuffled = [...words];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  for (const word of shuffled) {
    if (placedWords.length >= MAX_WORDS) break;

    const chars = [...word.answer]; // 한글은 spread로 정확히 분리
    const len = chars.length;
    let placed = false;

    // 방향 셔플
    const dirOrder = [...directions];
    for (let i = dirOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirOrder[i], dirOrder[j]] = [dirOrder[j], dirOrder[i]];
    }

    // 최대 시도 횟수
    for (let attempt = 0; attempt < 50 && !placed; attempt++) {
      const dir = dirOrder[attempt % dirOrder.length];
      const maxRow = size - (dir.dr * (len - 1));
      const maxCol = size - (dir.dc * (len - 1));

      if (maxRow <= 0 || maxCol <= 0) continue;

      const startRow = Math.floor(Math.random() * maxRow);
      const startCol = Math.floor(Math.random() * maxCol);

      // 충돌 검사
      let canPlace = true;
      const cells = [];
      for (let k = 0; k < len; k++) {
        const r = startRow + dir.dr * k;
        const c = startCol + dir.dc * k;
        const existing = grid[r][c];
        if (existing !== null && existing !== chars[k]) {
          canPlace = false;
          break;
        }
        cells.push({ row: r, col: c });
      }

      if (canPlace) {
        // 격자에 배치
        for (let k = 0; k < len; k++) {
          grid[cells[k].row][cells[k].col] = chars[k];
        }
        placedWords.push({
          id: placedWords.length,
          answer: word.answer,
          hint: word.hint,
          cells,
        });
        placed = true;
      }
    }
  }

  // 빈 칸을 랜덤 한글로 채우기
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === null) {
        grid[r][c] = randomChar();
      }
    }
  }

  return { grid, words: placedWords };
}

function generateSessionId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `cw_${ts}_${rand}`;
}

// ─── 퍼즐 생성 ──────────────────────────────────────────────────────────────────

export const generatePuzzle = async (userKey) => {
  const dateKey = getKstDateKey();

  // 랜덤 단어 8개 후보 뽑아서 격자에 배치 시도 (6개 목표) — 2~4글자만 허용
  const candidates = WORD_BANK.filter((w) => {
    const len = [...w.answer].length;
    return len >= 2 && len <= 4;
  });
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const selected = candidates.slice(0, 8); // 후보를 넉넉히

  const { grid, words } = buildPuzzleGrid(GRID_SIZE, selected);

  if (words.length === 0) {
    throw new Error('PUZZLE_GENERATION_FAILED');
  }

  // 세션 생성
  const sessionId = generateSessionId();

  await firestore.collection(CROSSWORD_SESSIONS).doc(sessionId).set({
    sessionId,
    userKey: String(userKey),
    size: GRID_SIZE,
    gridJson: JSON.stringify(grid),
    wordsJson: JSON.stringify(words),
    rewardPoints: REWARD_POINTS,
    unlocked: false,
    foundWordIds: [],
    solved: false,
    rewardClaimed: false,
    createdAt: FieldValue.serverTimestamp(),
    solvedAt: null,
    dateKey,
  });

  logUserAction(userKey, 'CROSSWORD_GENERATE', {
    sessionId,
    wordCount: words.length,
  }).catch(() => {});

  return {
    sessionId,
    size: GRID_SIZE,
    grid,
    words: words.map((w) => ({
      id: w.id,
      answer: w.answer,
      hint: w.hint,
      cells: w.cells,
    })),
    wordCount: words.length,
    rewardPoints: REWARD_POINTS,
    alreadySolved: false,
    foundWordIds: [],
  };
};

// ─── 퍼즐 잠금해제 ──────────────────────────────────────────────────────────────

export const unlockPuzzle = async (userKey, sessionId) => {
  const userRef = getUserDocRef(userKey);
  const sessionRef = firestore.collection(CROSSWORD_SESSIONS).doc(sessionId);
  const todayKey = getKstDateKey();

  const result = await firestore.runTransaction(async (tx) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) throw new Error('SESSION_NOT_FOUND');

    const session = sessionSnap.data();
    if (session.userKey !== String(userKey)) throw new Error('SESSION_NOT_FOUND');

    // 이미 잠금해제된 경우 — 정상 처리, 티켓 미소모
    if (session.unlocked) {
      const userSnap = await tx.get(userRef);
      const userData = userSnap.exists ? userSnap.data() : {};
      return {
        unlocked: true,
        tickets: getTicketBalance(userData),
        sessionId,
        alreadyUnlocked: true,
      };
    }

    // 티켓 차감
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : {};
    let ticketsTotal = getTicketBalance(userData);
    const lastDailyDate = userData?.lastDailyDate || null;
    const updates = { updatedAt: FieldValue.serverTimestamp() };

    // 데일리 티켓 체크
    if (lastDailyDate !== todayKey) {
      const dailyBonus = 1;
      if (!userSnap.exists || (userData.ticketsTotal === undefined && userData.tickets === undefined && userData.ticket === undefined)) {
        ticketsTotal = 2;
        updates.createdAt = FieldValue.serverTimestamp();
      } else {
        ticketsTotal = ticketsTotal + dailyBonus;
      }
      updates.lastDailyDate = todayKey;
      updates.ticketsDaily = (userData.ticketsDaily || 0) + dailyBonus;
      updates.ticketsTotal = ticketsTotal;
    }

    if (ticketsTotal <= 0) {
      throw new Error('INSUFFICIENT_TICKETS');
    }

    const finalTickets = ticketsTotal - 1;

    tx.set(userRef, {
      ...updates,
      ticketsTotal: finalTickets,
      tickets: finalTickets,
      ticket: finalTickets,
    }, { merge: true });

    // 세션 잠금해제
    tx.update(sessionRef, {
      unlocked: true,
      unlockedAt: FieldValue.serverTimestamp(),
    });

    return {
      unlocked: true,
      tickets: finalTickets,
      sessionId,
      alreadyUnlocked: false,
    };
  });

  logUserAction(userKey, 'CROSSWORD_UNLOCK', {
    sessionId,
    tickets: result.tickets,
  }).catch(() => {});

  return result;
};

// ─── 단어 제출 ──────────────────────────────────────────────────────────────────

export const submitWord = async (userKey, sessionId, wordId, cells) => {
  const userRef = getUserDocRef(userKey);
  const sessionRef = firestore.collection(CROSSWORD_SESSIONS).doc(sessionId);

  const result = await firestore.runTransaction(async (tx) => {
    // ── 모든 read를 먼저 수행 (Firestore 트랜잭션 규칙) ──
    const [sessionSnap, userSnap] = await Promise.all([
      tx.get(sessionRef),
      tx.get(userRef),
    ]);

    if (!sessionSnap.exists) throw new Error('SESSION_NOT_FOUND');

    const session = sessionSnap.data();
    if (session.userKey !== String(userKey)) throw new Error('SESSION_NOT_FOUND');
    if (!session.unlocked) throw new Error('NOT_UNLOCKED');
    if (session.solved) throw new Error('ALREADY_SOLVED');

    const foundWordIds = (session.foundWordIds || []).map(Number);
    const numWordId = Number(wordId);

    // 이미 찾은 단어인지 확인
    if (foundWordIds.includes(numWordId)) {
      throw new Error('ALREADY_FOUND');
    }

    // 정답 검증: wordId와 cells 매칭
    const words = typeof session.wordsJson === 'string' ? JSON.parse(session.wordsJson) : (session.wordsJson || []);
    const targetWord = words.find((w) => Number(w.id) === numWordId);

    if (!targetWord) {
      return {
        correct: false,
        wordId: null,
        foundWordIds,
        allSolved: false,
        remainingCount: words.length - foundWordIds.length,
      };
    }

    // cells 검증
    const expectedCells = targetWord.cells.map((c) => `${c.row},${c.col}`).sort().join('|');
    const submittedCells = [...cells].sort().join('|');

    if (expectedCells !== submittedCells) {
      return {
        correct: false,
        wordId: null,
        foundWordIds,
        allSolved: false,
        remainingCount: words.length - foundWordIds.length,
      };
    }

    // 정답!
    const newFoundWordIds = [...foundWordIds, numWordId];
    const allSolved = newFoundWordIds.length >= words.length;
    const remainingCount = words.length - newFoundWordIds.length;

    // ── 모든 write는 여기서부터 ──
    const sessionUpdates = { foundWordIds: newFoundWordIds };

    if (allSolved) {
      sessionUpdates.solved = true;
      sessionUpdates.solvedAt = FieldValue.serverTimestamp();
      sessionUpdates.rewardClaimed = true;
    }

    tx.update(sessionRef, sessionUpdates);

    // 전부 완료 시 포인트 + 경험치 지급
    if (allSolved && !session.rewardClaimed) {
      const userData = userSnap.exists ? userSnap.data() : {};
      const currentPoints = userData.points || 0;
      const newTotal = currentPoints + REWARD_POINTS;

      let characterLevel = userData.characterLevel || 1;
      let characterExp = (userData.characterExp || 0) + REWARD_EXP;
      let expToNext = getExpToNext(characterLevel);
      while (characterExp >= expToNext) {
        characterExp -= expToNext;
        characterLevel += 1;
        expToNext = getExpToNext(characterLevel);
      }

      tx.set(userRef, {
        points: newTotal,
        characterLevel,
        characterExp,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      const historyId = `crossword_${sessionId}`;
      const historyRef = userRef.collection('point_history').doc(historyId);
      tx.set(historyRef, {
        type: 'POINT_GRANT',
        source: 'CROSSWORD',
        points: REWARD_POINTS,
        exp: REWARD_EXP,
        description: `단어찾기 퍼즐 완료! ${REWARD_POINTS}P + ${REWARD_EXP}EXP 획득`,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        correct: true,
        wordId: numWordId,
        foundWordIds: newFoundWordIds,
        allSolved: true,
        remainingCount: 0,
        reward: {
          points: REWARD_POINTS,
          totalPoints: newTotal,
          exp: REWARD_EXP,
          characterLevel,
          characterExp,
          expToNext,
          message: `모든 단어를 찾았어요! ${REWARD_POINTS}P + ${REWARD_EXP}EXP 획득!`,
        },
      };
    }

    return {
      correct: true,
      wordId: numWordId,
      foundWordIds: newFoundWordIds,
      allSolved: false,
      remainingCount,
    };
  });

  logUserAction(userKey, 'CROSSWORD_SUBMIT', {
    sessionId,
    wordId,
    correct: result.correct,
    allSolved: result.allSolved,
  }).catch(() => {});

  return result;
};

// ─── 무료 티켓 수령 ──────────────────────────────────────────────────────────────

export const claimFreeTicket = async (userKey) => {
  const userRef = getUserDocRef(userKey);
  const todayKey = getKstDateKey();

  const result = await firestore.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : {};

    // 오늘 이미 수령했는지 확인
    if (userData.crosswordFreeClaimedDate === todayKey) {
      throw new Error('ALREADY_CLAIMED');
    }

    let ticketsTotal = getTicketBalance(userData);
    ticketsTotal += 1;

    tx.set(userRef, {
      ticketsTotal,
      tickets: ticketsTotal,
      ticket: ticketsTotal,
      crosswordFreeClaimedDate: todayKey,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      claimed: true,
      tickets: ticketsTotal,
    };
  });

  logUserAction(userKey, 'CROSSWORD_CLAIM_FREE', {
    tickets: result.tickets,
  }).catch(() => {});

  return result;
};
