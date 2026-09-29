/**
 * 포인트 동기화 버그 재현 & 수정 검증 테스트
 *
 * 이슈:
 *  1) 뽑기로 포인트 뽑아도 포인트가 안 늘어남
 *  2) 포인트가 제대로 적립 안됨
 *  3) 광고 봐서 포인트 쌓으면 포인트가 사라짐
 *  4) 포인트 쌓는 시스템 에러
 */
import { describe, it, expect } from 'vitest';

// ── applyRewardPoints 로직을 순수 함수로 추출하여 테스트 ──
// useAdSystem.ts의 applyRewardPoints 콜백 로직을 그대로 재현
function applyRewardPoints(
  data: any,
  fallbackAdded: number,
  updateUserPoints: (fn: number | ((prev: number) => number)) => void,
) {
  const absolutePoints = [
    data?.balancePoints,
    data?.currentPoints,
    data?.remainingPoints,
    data?.totalPoints,
    data?.pointCount,
  ].find((value) => typeof value === 'number');

  if (typeof absolutePoints === 'number') {
    updateUserPoints(absolutePoints);
    return;
  }

  if (typeof data?.addedPoints === 'number') {
    updateUserPoints((prev: number) => prev + data.addedPoints);
    return;
  }

  if (typeof data?.pointsAdded === 'number') {
    updateUserPoints((prev: number) => prev + data.pointsAdded);
    return;
  }

  if (typeof data?.grantedPoints === 'number') {
    updateUserPoints((prev: number) => prev + data.grantedPoints);
    return;
  }

  // 수정됨: data.points는 항상 절대값으로 처리
  if (typeof data?.points === 'number') {
    updateUserPoints(data.points);
    return;
  }

  if (fallbackAdded > 0) {
    updateUserPoints((prev: number) => prev + fallbackAdded);
  }
}

// ── syncRewardProfileFromPayload의 포인트 처리 로직 ──
function syncRewardProfilePoints(
  payload: any,
  updateUserPoints: (fn: number | ((prev: number) => number)) => void,
  options?: { skipPoints?: boolean },
) {
  if (!payload || typeof payload !== 'object') return;
  const data = payload.data || payload.success || payload;

  if (!options?.skipPoints) {
    const points = data.points ?? data.pointCount;
    if (typeof points === 'number') updateUserPoints(points);
  }
}

// ── syncDailyProgressFromPayload의 포인트 처리 로직 ──
function syncDailyProgressPoints(
  payload: any,
  updateUserPoints: (fn: number | ((prev: number) => number)) => void,
  options?: { skipPoints?: boolean },
) {
  if (!payload || typeof payload !== 'object') return;
  const data = payload.data || payload.success || payload;

  if (!options?.skipPoints) {
    const balancePoints = data.balancePoints ?? data.currentPoints ?? data.points;
    if (typeof balancePoints === 'number') updateUserPoints(balancePoints);
  }
}

// ── syncPointsFromRewardPayload (handleRewardGachaClaim 내부) ──
function syncPointsFromRewardPayload(
  payload: any,
  fallbackAdded: number,
  updateUserPoints: (fn: number | ((prev: number) => number)) => void,
) {
  const absolutePoints = [
    payload?.balancePoints,
    payload?.currentPoints,
    payload?.remainingPoints,
    payload?.totalPoints,
    payload?.pointCount,
  ].find((value: any) => typeof value === 'number');

  if (typeof absolutePoints === 'number') {
    updateUserPoints(absolutePoints);
    return;
  }

  if (typeof payload?.addedPoints === 'number') {
    updateUserPoints((prev: number) => prev + payload.addedPoints);
    return;
  }

  if (typeof payload?.pointsAdded === 'number') {
    updateUserPoints((prev: number) => prev + payload.pointsAdded);
    return;
  }

  if (typeof payload?.grantedPoints === 'number') {
    updateUserPoints((prev: number) => prev + payload.grantedPoints);
    return;
  }

  // 수정됨: data.points는 항상 절대값으로 처리
  if (typeof payload?.points === 'number') {
    updateUserPoints(payload.points);
    return;
  }

  if (fallbackAdded > 0) {
    updateUserPoints((prev: number) => prev + fallbackAdded);
  }
}

// ── 일반 가차 draw 응답 포인트 처리 로직 ──
function syncPointsFromGachaDrawResponse(
  payload: any,
  updateUserPoints: (fn: number | ((prev: number) => number)) => void,
) {
  const data = payload?.data || payload || {};
  const absolutePoints = [
    payload?.balancePoints,
    payload?.currentPoints,
    payload?.remainingPoints,
    payload?.totalPoints,
    payload?.pointCount,
    payload?.points,
    data?.balancePoints,
    data?.currentPoints,
    data?.remainingPoints,
    data?.totalPoints,
    data?.pointCount,
    data?.points,
  ].find((value: any) => typeof value === 'number');

  if (typeof absolutePoints === 'number') {
    updateUserPoints(absolutePoints);
  }
}

// === 테스트 헬퍼 ===
function createPointTracker(initial = 0) {
  let points = initial;
  const update = (fnOrVal: number | ((prev: number) => number)) => {
    points = typeof fnOrVal === 'function' ? fnOrVal(points) : fnOrVal;
  };
  return { get: () => points, update };
}

// ═══════════════════════════════════════════════════
// 테스트 케이스
// ═══════════════════════════════════════════════════

describe('포인트 동기화 버그 수정 검증', () => {
  describe('이슈 1: 가차 뽑기(리워드 가차) 포인트 미적립', () => {
    it('서버가 addedPoints를 반환하면 증분 적립', () => {
      const { get, update } = createPointTracker(25);
      syncPointsFromRewardPayload({ addedPoints: 3 }, 1, update);
      expect(get()).toBe(28); // 25 + 3
    });

    it('서버가 balancePoints(절대값)를 반환하면 절대값으로 세팅', () => {
      const { get, update } = createPointTracker(25);
      syncPointsFromRewardPayload({ balancePoints: 30 }, 1, update);
      expect(get()).toBe(30); // 서버 잔액 그대로
    });

    it('서버 응답이 없으면 로컬 fallback 포인트 적립', () => {
      const { get, update } = createPointTracker(25);
      syncPointsFromRewardPayload({}, 3, update);
      expect(get()).toBe(28); // 25 + 3
    });

    it('서버가 points만 반환하면 절대값으로 세팅 (수정된 동작)', () => {
      const { get, update } = createPointTracker(25);
      syncPointsFromRewardPayload({ points: 27 }, 2, update);
      expect(get()).toBe(27); // 절대값 27 (기존 버그: 25+27=52)
    });

    it('일반 가차 응답 top-level points alias를 즉시 반영한다', () => {
      const { get, update } = createPointTracker(25);
      syncPointsFromGachaDrawResponse({ currentPoints: 31, tickets: 4 }, update);
      expect(get()).toBe(31);
    });

    it('일반 가차 응답 data 내부 points alias를 즉시 반영한다', () => {
      const { get, update } = createPointTracker(25);
      syncPointsFromGachaDrawResponse({ data: { balancePoints: 33, tickets: 3 } }, update);
      expect(get()).toBe(33);
    });
  });

  describe('이슈 2: 광고 보상 트리플-라이트 레이스 컨디션', () => {
    it('skipPoints 옵션을 사용하면 포인트를 업데이트하지 않음', () => {
      const { get, update } = createPointTracker(25);

      // 광고 시청 후 서버 응답: { data: { points: 27, addedPoints: 2 } }
      const serverResponse = { data: { points: 27, addedPoints: 2 } };

      // 수정된 동작: skipPoints로 포인트 트리플-라이트 방지
      syncDailyProgressPoints(serverResponse, update, { skipPoints: true });
      expect(get()).toBe(25); // 변경 없어야 함

      syncRewardProfilePoints(serverResponse, update, { skipPoints: true });
      expect(get()).toBe(25); // 변경 없어야 함

      // applyRewardPoints만 포인트 처리
      const data = serverResponse.data;
      applyRewardPoints(data, 2, update);
      expect(get()).toBe(27); // balancePoints 없으므로 addedPoints: 25+2=27
    });

    it('기존 버그 재현: skipPoints 없으면 3번 덮어쓰기 발생', () => {
      const { get, update } = createPointTracker(25);

      const serverResponse = { data: { points: 27, addedPoints: 2 } };

      // skipPoints 없이 호출하면 포인트가 변경됨
      syncDailyProgressPoints(serverResponse, update); // points=27 → 27로 세팅
      expect(get()).toBe(27);

      syncRewardProfilePoints(serverResponse, update); // points=27 → 27로 세팅
      expect(get()).toBe(27);

      // 이 시점에서 applyRewardPoints가 addedPoints로 +2 → 29가 되어버림!
      const data = serverResponse.data;
      applyRewardPoints(data, 2, update);
      expect(get()).toBe(29); // 버그: 실제로는 27이어야 하는데 29가 됨
    });

    it('수정된 동작: skipPoints로 정확한 값 유지', () => {
      const { get, update } = createPointTracker(25);

      const serverResponse = { data: { points: 27, addedPoints: 2 } };

      // 수정된 호출: skipPoints=true
      syncDailyProgressPoints(serverResponse, update, { skipPoints: true });
      syncRewardProfilePoints(serverResponse, update, { skipPoints: true });
      applyRewardPoints(serverResponse.data, 2, update);
      expect(get()).toBe(27); // 정확!
    });
  });

  describe('이슈 3: 광고 봐서 포인트 쌓으면 포인트가 사라짐', () => {
    it('서버 절대값이 로컬보다 작아도 서버를 신뢰 (수정된 동작)', () => {
      const { get, update } = createPointTracker(30); // 로컬에 인플레이션된 값

      // 서버가 실제 잔액 23P를 반환
      applyRewardPoints({ points: 23 }, 2, update);
      expect(get()).toBe(23); // 서버 값 신뢰 (기존 버그: 30+23=53)
    });

    it('balancePoints가 있으면 절대값 사용', () => {
      const { get, update } = createPointTracker(50);
      applyRewardPoints({ balancePoints: 45 }, 2, update);
      expect(get()).toBe(45); // 서버 잔액
    });

    it('grantedPoints가 있으면 증분 적용', () => {
      const { get, update } = createPointTracker(20);
      applyRewardPoints({ grantedPoints: 5 }, 2, update);
      expect(get()).toBe(25); // 20 + 5
    });
  });

  describe('이슈 4: 포인트 시스템 일반 에러 케이스', () => {
    it('빈 서버 응답에도 fallback 적립', () => {
      const { get, update } = createPointTracker(10);
      applyRewardPoints({}, 3, update);
      expect(get()).toBe(13); // 10 + 3
    });

    it('null 서버 응답에도 fallback 적립', () => {
      const { get, update } = createPointTracker(10);
      applyRewardPoints(null, 3, update);
      expect(get()).toBe(13); // 10 + 3
    });

    it('undefined 서버 응답에도 fallback 적립', () => {
      const { get, update } = createPointTracker(10);
      applyRewardPoints(undefined, 3, update);
      expect(get()).toBe(13); // 10 + 3
    });

    it('fallback이 0이면 포인트 변경 없음', () => {
      const { get, update } = createPointTracker(10);
      applyRewardPoints({}, 0, update);
      expect(get()).toBe(10);
    });

    it('syncDailyProgressPoints에 null payload → 에러 없이 무시', () => {
      const { get, update } = createPointTracker(10);
      syncDailyProgressPoints(null, update);
      expect(get()).toBe(10);
    });

    it('syncRewardProfilePoints에 undefined payload → 에러 없이 무시', () => {
      const { get, update } = createPointTracker(10);
      syncRewardProfilePoints(undefined, update);
      expect(get()).toBe(10);
    });
  });

  describe('applyRewardPoints 필드 우선순위', () => {
    it('balancePoints > addedPoints > points > fallback 순서', () => {
      const t1 = createPointTracker(10);
      applyRewardPoints({ balancePoints: 50, addedPoints: 3, points: 99 }, 1, t1.update);
      expect(t1.get()).toBe(50); // balancePoints 우선

      const t2 = createPointTracker(10);
      applyRewardPoints({ addedPoints: 3, points: 99 }, 1, t2.update);
      expect(t2.get()).toBe(13); // addedPoints 사용

      const t3 = createPointTracker(10);
      applyRewardPoints({ points: 99 }, 1, t3.update);
      expect(t3.get()).toBe(99); // points 절대값

      const t4 = createPointTracker(10);
      applyRewardPoints({}, 5, t4.update);
      expect(t4.get()).toBe(15); // fallback
    });

    it('currentPoints도 절대값으로 처리', () => {
      const { get, update } = createPointTracker(10);
      applyRewardPoints({ currentPoints: 42 }, 1, update);
      expect(get()).toBe(42);
    });

    it('remainingPoints도 절대값으로 처리', () => {
      const { get, update } = createPointTracker(10);
      applyRewardPoints({ remainingPoints: 33 }, 1, update);
      expect(get()).toBe(33);
    });

    it('totalPoints도 절대값으로 처리', () => {
      const { get, update } = createPointTracker(10);
      applyRewardPoints({ totalPoints: 100 }, 1, update);
      expect(get()).toBe(100);
    });

    it('pointCount도 절대값으로 처리', () => {
      const { get, update } = createPointTracker(10);
      applyRewardPoints({ pointCount: 77 }, 1, update);
      expect(get()).toBe(77);
    });
  });
});
