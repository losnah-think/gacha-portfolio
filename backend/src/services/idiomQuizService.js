/**
 * [Idiom Quiz Service] 사자성어/속담 퀴즈 비즈니스 로직
 *
 * - startIdiomSession : 티켓 차감 → 랜덤 문제 5개 추출 → 세션 생성
 * - submitIdiomAnswers: 서버 채점 → 포인트 지급 → 결과 반환
 *
 * 게임 규칙:
 *   - 티켓 1장 소모
 *   - 5문제 출제 (4지선다)
 *   - 정답 1개당 2포인트 지급
 *   - 문제당 힌트/뜻풀이 포함
 */
import { firestore, FieldValue } from '../lib/firebaseAdmin.js';
import { getKstDateKey, getTicketBalance, logUserAction } from '../utils/helpers.js';

const IDIOM_BANK = 'idiomBank';
const IDIOM_SESSIONS = 'idiomSessions';
const USERS = 'users';

const QUESTION_COUNT = 5;
const POINTS_PER_CORRECT = 2;
const CHOICES_COUNT = 4; // 4지선다

// ─── 인메모리 캐시 ─────────────────────────────────────────────────────────────
let _idiomBankArray = null;
let _idiomBankMap = null;
let _idiomBankCacheAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

async function getCachedIdiomBank() {
  const now = Date.now();
  if (_idiomBankArray && now - _idiomBankCacheAt < CACHE_TTL_MS) {
    return { array: _idiomBankArray, map: _idiomBankMap };
  }

  const snap = await firestore
    .collection(IDIOM_BANK)
    .where('active', '==', true)
    .get();

  const array = [];
  const map = {};
  snap.docs.forEach((d) => {
    const data = { id: d.id, ...d.data() };
    array.push(data);
    map[d.id] = data;
  });

  _idiomBankArray = array;
  _idiomBankMap = map;
  _idiomBankCacheAt = now;

  console.log(`[IdiomQuizService] Idiom bank cached. count: ${array.length}`);
  return { array, map };
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateSessionId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `idiom_${ts}_${rand}`;
}

/**
 * 문제 1개에 대해 4지선다 보기를 구성
 * - 정답 1개 + 오답 3개 (전체 뱅크에서 랜덤 선택)
 * - type이 같은 것 우선으로 오답 구성 (같은 카테고리면 더 헷갈리는 문제가 됨)
 */
function buildChoices(correct, allItems) {
  const sameType = allItems.filter(
    (q) => q.id !== correct.id && q.type === correct.type,
  );
  const otherType = allItems.filter(
    (q) => q.id !== correct.id && q.type !== correct.type,
  );

  // 같은 타입에서 최대 3개, 부족하면 다른 타입으로 보충
  const pool = shuffle([...sameType, ...otherType]);
  const wrongItems = pool.slice(0, CHOICES_COUNT - 1);

  // 보기: 정답 포함 섞기
  const choices = shuffle([
    { id: correct.id, text: correct.term },
    ...wrongItems.map((w) => ({ id: w.id, text: w.term })),
  ]);

  return choices;
}

/**
 * 랜덤 문제 추출 + 보기 구성
 */
async function pickQuestionsWithChoices(count) {
  const { array } = await getCachedIdiomBank();

  if (array.length < CHOICES_COUNT) {
    throw new Error('NO_QUESTIONS_AVAILABLE');
  }

  const picked = shuffle(array).slice(0, count);

  return picked.map((q) => ({
    id: q.id,
    type: q.type,           // 'idiom' | 'proverb'
    question: q.question,   // 뜻/설명 (이걸 보여주고 사자성어를 맞히는 방식)
    hint: q.hint || null,   // 선택적 힌트
    choices: buildChoices(q, array), // [{ id, text }] 4지선다
    correctId: q.id,        // 서버에서만 사용 (응답 시 제외)
  }));
}

// ─── 세션 시작 ─────────────────────────────────────────────────────────────────

export const startIdiomSession = async (userKey) => {
  const todayKey = getKstDateKey();
  const userRef = firestore.collection(USERS).doc(String(userKey));

  // 1. 티켓 차감 (트랜잭션)
  const ticketResult = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const data = snap.exists ? snap.data() : {};

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

  // 2. 랜덤 문제 추출 + 보기 구성
  const questionsWithChoices = await pickQuestionsWithChoices(QUESTION_COUNT);

  // 3. 세션 저장 (answerMap은 서버에만 보관)
  const sessionId = generateSessionId();
  const answerMap = {};
  questionsWithChoices.forEach((q) => { answerMap[q.id] = q.correctId; });

  await firestore.collection(IDIOM_SESSIONS).doc(sessionId).set({
    userKey: String(userKey),
    questionIds: questionsWithChoices.map((q) => q.id),
    answerMap,
    status: 'active',
    ticketUsed: 1,
    correctCount: null,
    pointsAwarded: null,
    createdAt: FieldValue.serverTimestamp(),
    submittedAt: null,
  });

  // 4. 로그
  logUserAction(userKey, 'IDIOM_SESSION_STARTED', {
    sessionId,
    questionCount: QUESTION_COUNT,
    remainingTickets: ticketResult.remainingTickets,
  }).catch((e) => console.error('[idiomQuizService] log failed:', e));

  // 5. 응답 (correctId 제거)
  return {
    sessionId,
    questions: questionsWithChoices.map(({ correctId: _, ...q }) => q),
    ticketUsed: 1,
    remainingTickets: ticketResult.remainingTickets,
    rewardPoints: POINTS_PER_CORRECT * QUESTION_COUNT,
  };
};

// ─── 결과 제출 ─────────────────────────────────────────────────────────────────

/**
 * answers: [{ questionId: string, selectedId: string }]
 */
export const submitIdiomAnswers = async (userKey, sessionId, answers) => {
  const userRef = firestore.collection(USERS).doc(String(userKey));
  const sessionRef = firestore.collection(IDIOM_SESSIONS).doc(sessionId);

  const result = await firestore.runTransaction(async (tx) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) throw new Error('INVALID_SESSION');

    const session = sessionSnap.data();
    if (session.userKey !== String(userKey)) throw new Error('INVALID_SESSION');
    if (session.status === 'submitted') throw new Error('ALREADY_SUBMITTED');

    const { map: bankMap } = await getCachedIdiomBank();
    const answerMap = session.answerMap || {};

    // 채점
    const results = [];
    let correctCount = 0;

    for (const ans of answers) {
      const correctId = answerMap[ans.questionId];
      if (correctId === undefined) continue;
      const isCorrect = ans.selectedId === correctId;
      if (isCorrect) correctCount++;

      const qDoc = bankMap[ans.questionId];
      results.push({
        questionId: ans.questionId,
        correct: isCorrect,
        correctId,
        term: qDoc?.term || null,         // 정답 사자성어/속담
        question: qDoc?.question || null,
        explanation: qDoc?.explanation || null,
        selectedId: ans.selectedId,
      });
    }

    // 정답 개당 2포인트 지급
    const pointsAwarded = correctCount * POINTS_PER_CORRECT;

    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : {};
    const currentPoints = userData.points || 0;
    const newTotal = currentPoints + pointsAwarded;

    tx.set(userRef, {
      points: newTotal,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // 포인트 히스토리
    const historyRef = userRef.collection('point_history').doc(`idiom_${sessionId}`);
    tx.set(historyRef, {
      type: 'POINT_GRANT',
      source: 'IDIOM_QUIZ',
      points: pointsAwarded,
      description: `사자성어/속담 퀴즈 ${correctCount}/${QUESTION_COUNT} 정답`,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 세션 완료 처리
    const userAnswers = {};
    answers.forEach((a) => { userAnswers[a.questionId] = a.selectedId; });

    tx.update(sessionRef, {
      answers: userAnswers,
      correctCount,
      pointsAwarded,
      status: 'submitted',
      submittedAt: FieldValue.serverTimestamp(),
    });

    return {
      totalQuestions: QUESTION_COUNT,
      correctCount,
      pointsAwarded,
      totalPoints: newTotal,
      results,
    };
  });

  logUserAction(userKey, 'IDIOM_SUBMITTED', {
    sessionId,
    correctCount: result.correctCount,
    pointsAwarded: result.pointsAwarded,
  }).catch((e) => console.error('[idiomQuizService] log failed:', e));

  return result;
};
