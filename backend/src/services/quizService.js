/**
 * [Quiz Service] O/X 퀴즈 비즈니스 로직
 *
 * - startQuizSession : 티켓 차감 → 랜덤 문제 추출 → 세션 생성
 * - submitQuizAnswers: 서버 채점 → 포인트 지급 → 결과 반환
 */
import { firestore, FieldValue } from '../lib/firebaseAdmin.js';
import { getKstDateKey, getTicketBalance, logUserAction } from '../utils/helpers.js';

const QUIZ_BANK = 'quizBank';
const QUIZ_SESSIONS = 'quizSessions';
const USERS = 'users';
const DEFAULT_COUNT = 10;
const MAX_COUNT = 10;
const POINTS_PER_CORRECT = 1;

// ─── 인메모리 캐시 (Firestore 읽기 비용 절약) ───────────────────────────────────
let _quizBankMap = null;
let _quizBankArray = null;
let _quizBankCacheAt = 0;
const QUIZ_CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

async function getCachedQuizBank() {
  const now = Date.now();
  if (_quizBankArray && now - _quizBankCacheAt < QUIZ_CACHE_TTL_MS) {
    return { array: _quizBankArray, map: _quizBankMap };
  }

  const snap = await firestore
    .collection(QUIZ_BANK)
    .where('active', '==', true)
    .get();

  const array = [];
  const map = {};
  snap.docs.forEach((d) => {
    const data = { id: d.id, ...d.data() };
    array.push(data);
    map[d.id] = data;
  });

  _quizBankArray = array;
  _quizBankMap = map;
  _quizBankCacheAt = now;

  console.log(`[QuizService] Quiz bank cached. count: ${array.length}`);
  return { array, map };
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

/** Firestore에서 active 문제를 랜덤 추출 (count개) */
async function pickRandomQuestions(count) {
  const { array } = await getCachedQuizBank();

  if (array.length === 0) throw new Error('NO_QUESTIONS_AVAILABLE');

  // array 원본 훼손 방지를 위해 얕은 복사
  const docs = [...array];

  // Fisher-Yates 셔플 후 앞에서 count개
  for (let i = docs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [docs[i], docs[j]] = [docs[j], docs[i]];
  }

  return docs.slice(0, count);
}

function generateSessionId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `quiz_${ts}_${rand}`;
}

// ─── 퀴즈 세션 시작 ──────────────────────────────────────────────────────────

export const startQuizSession = async (userKey, count = DEFAULT_COUNT) => {
  const finalCount = Math.min(Math.max(1, Number(count) || DEFAULT_COUNT), MAX_COUNT);
  const todayKey = getKstDateKey();
  const userRef = firestore.collection(USERS).doc(String(userKey));

  // 1. 티켓 차감 (트랜잭션)
  const ticketResult = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const data = snap.exists ? snap.data() : {};

    // 데일리 티켓 체크
    let ticketsTotal = getTicketBalance(data);
    const lastDailyDate = data?.lastDailyDate || null;
    const updates = { updatedAt: FieldValue.serverTimestamp() };

    if (lastDailyDate !== todayKey) {
      const dailyBonus = 1;
      if (!snap.exists || (data.ticketsTotal === undefined && data.tickets === undefined && data.ticket === undefined)) {
        ticketsTotal = 2;
        updates.createdAt = FieldValue.serverTimestamp();
      } else {
        ticketsTotal = ticketsTotal + dailyBonus;
      }
      updates.lastDailyDate = todayKey;
      updates.ticketsDaily = (data.ticketsDaily || 0) + dailyBonus;
      updates.ticketsTotal = ticketsTotal;
    }

    if (ticketsTotal <= 0) {
      const err = new Error('INSUFFICIENT_TICKETS');
      err.currentTickets = ticketsTotal;
      throw err;
    }

    const finalTickets = ticketsTotal - 1;

    tx.set(userRef, {
      ...updates,
      ticketsTotal: finalTickets,
      tickets: finalTickets,
      ticket: finalTickets,
    }, { merge: true });

    return { remainingTickets: finalTickets };
  });

  // 2. 랜덤 문제 추출
  const questions = await pickRandomQuestions(finalCount);

  // 3. 세션 생성
  const sessionId = generateSessionId();
  const questionIds = questions.map((q) => q.id);
  const answerMap = {};
  questions.forEach((q) => { answerMap[q.id] = q.answer; });

  await firestore.collection(QUIZ_SESSIONS).doc(sessionId).set({
    userKey: String(userKey),
    questions: questionIds,
    answerMap,
    correctCount: null,
    pointsAwarded: null,
    status: 'active',
    ticketUsed: 1,
    createdAt: FieldValue.serverTimestamp(),
    submittedAt: null,
  });

  // 4. 로그
  logUserAction(userKey, 'QUIZ_SESSION_STARTED', {
    sessionId,
    questionCount: finalCount,
    ticketUsed: 1,
    remainingTickets: ticketResult.remainingTickets,
  }).catch((e) => console.error('[quizService] log failed:', e));

  // 5. 응답 (Option A: answer 포함)
  return {
    sessionId,
    questions: questions.map((q) => ({
      id: q.id,
      question: q.question,
      answer: q.answer,
      explanation: q.explanation || null,
    })),
    ticketUsed: 1,
    remainingTickets: ticketResult.remainingTickets,
  };
};

// ─── 퀴즈 결과 제출 ──────────────────────────────────────────────────────────

export const submitQuizAnswers = async (userKey, sessionId, answers) => {
  const userRef = firestore.collection(USERS).doc(String(userKey));
  const sessionRef = firestore.collection(QUIZ_SESSIONS).doc(sessionId);

  const result = await firestore.runTransaction(async (tx) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) throw new Error('INVALID_SESSION');

    const session = sessionSnap.data();

    // 본인 세션인지 확인
    if (session.userKey !== String(userKey)) throw new Error('INVALID_SESSION');

    // 이미 제출 여부
    if (session.status === 'submitted') throw new Error('ALREADY_SUBMITTED');

    // 정답 채점 — 문제 원본에서 explanation 가져오기 (캐시 우선 활용하여 읽기 비요 절약)
    const { map: cachedBankMap } = await getCachedQuizBank();
    const answerMap = session.answerMap || {};
    const questionIds = session.questions || [];
    const questionDocs = {};
    for (const qId of questionIds) {
      if (cachedBankMap[qId]) {
        questionDocs[qId] = cachedBankMap[qId];
      } else {
        // 캐시에 없는 경우(새로 추가된 직후 등)에만 DB 접근
        const qSnap = await tx.get(firestore.collection(QUIZ_BANK).doc(qId));
        if (qSnap.exists) questionDocs[qId] = qSnap.data();
      }
    }

    const results = [];
    let correctCount = 0;

    for (const ans of answers) {
      const correctAnswer = answerMap[ans.id];
      if (correctAnswer === undefined) continue; // 해당 문제가 세션에 없으면 무시
      const isCorrect = ans.answer === correctAnswer;
      if (isCorrect) correctCount++;
      const qDoc = questionDocs[ans.id];
      results.push({
        id: ans.id,
        correct: isCorrect,
        correctAnswer,
        question: qDoc?.question || null,
        explanation: qDoc?.explanation || null,
      });
    }

    const pointsAwarded = correctCount * POINTS_PER_CORRECT;

    // 유저 포인트 지급
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : {};
    const currentPoints = userData.points || 0;
    const newTotal = currentPoints + pointsAwarded;

    tx.set(userRef, {
      points: newTotal,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // 포인트 히스토리
    const historyId = `quiz_${sessionId}`;
    const historyRef = userRef.collection('point_history').doc(historyId);
    tx.set(historyRef, {
      type: 'POINT_GRANT',
      source: 'QUIZ',
      points: pointsAwarded,
      description: `O/X 퀴즈 ${correctCount}/${session.questions.length} 정답`,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 세션 상태 업데이트
    const userAnswers = {};
    answers.forEach((a) => { userAnswers[a.id] = a.answer; });

    tx.update(sessionRef, {
      answers: userAnswers,
      correctCount,
      pointsAwarded,
      status: 'submitted',
      submittedAt: FieldValue.serverTimestamp(),
    });

    return {
      totalQuestions: session.questions.length,
      correctCount,
      pointsAwarded,
      totalPoints: newTotal,
      results,
    };
  });

  // 로그
  logUserAction(userKey, 'QUIZ_SUBMITTED', {
    sessionId,
    correctCount: result.correctCount,
    pointsAwarded: result.pointsAwarded,
    totalPoints: result.totalPoints,
  }).catch((e) => console.error('[quizService] log failed:', e));

  return result;
};
