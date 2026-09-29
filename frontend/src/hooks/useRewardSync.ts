import { useState, useCallback, useRef } from 'react';
import type { RewardProfile, PersonaRewardProfile, ProbabilityBoost } from '../shared/constants/app';
import { INITIAL_REWARD_PROFILE, INITIAL_PROBABILITY_BOOST } from '../shared/constants/app';
import { apiUrl } from '../shared/api/client';

export function useRewardSync() {
  const [userPoints, setUserPointsState] = useState<number>(0);
  const [rewardProfile, setRewardProfile] = useState<RewardProfile>(INITIAL_REWARD_PROFILE);
  const [personaRewardProfiles, setPersonaRewardProfiles] = useState<Record<string, PersonaRewardProfile>>({});
  const [probabilityBoost, setProbabilityBoost] = useState<ProbabilityBoost>(INITIAL_PROBABILITY_BOOST);
  const [consecutiveDays, setConsecutiveDays] = useState<number>(0);
  const lastAuthoritativePointsRef = useRef<{ value: number; at: number; source: string } | null>(null);

  const AUTHORITATIVE_POINT_SOURCES = new Set([
    'handleGacha:draw-response',
    'handleConvertPoints:server-balance',
    'handleRewardGachaClaim:absolute',
    'handleRewardGachaClaim:points',
    'roulette:spin',
    'reward-quiz:submit',
    'idiom-quiz:submit',
    'crossword:solve',
    'scratch:reveal',
  ]);

  const STALE_SYNC_PROTECTION_MS = 15000;

  const recordUserPointsDebug = useCallback((source: string, prev: number, next: number, mode: 'absolute' | 'updater') => {
    if (typeof window === 'undefined') return;

    const snapshot = {
      source,
      prev,
      next,
      delta: next - prev,
      mode,
      at: new Date().toISOString(),
      stack: new Error().stack?.split('\n').slice(2, 7).join('\n') || null,
    };

    window.sessionStorage.setItem('last_user_points_update', JSON.stringify(snapshot));
    console.log('[PointsTrace] userPoints updated', snapshot);
  }, []);

  const recordUserPointsPayload = useCallback((source: string, payload: unknown) => {
    if (typeof window === 'undefined') return;

    const snapshot = {
      source,
      at: new Date().toISOString(),
      payload,
    };

    window.sessionStorage.setItem('last_user_points_payload', JSON.stringify(snapshot));
    console.log('[PointsTrace] userPoints payload', snapshot);
  }, []);

  const recordUserPointsGuard = useCallback((source: string, prev: number, next: number, authoritative: { value: number; at: number; source: string }) => {
    if (typeof window === 'undefined') return;

    const snapshot = {
      source,
      prev,
      next,
      blockedBy: authoritative,
      at: new Date().toISOString(),
    };

    window.sessionStorage.setItem('last_user_points_guard', JSON.stringify(snapshot));
    console.warn('[PointsTrace] blocked stale userPoints overwrite', snapshot);
  }, []);

  // ── Normalize helpers ──

  /** 출석 API 응답에서 연속일 추출 (서버 필드 이름 차이 대응) */
  const parseConsecutiveDaysFromCheckinResponse = useCallback((data: any, fallback: number): number => {
    if (typeof data?.consecutiveLoginDays === 'number') return data.consecutiveLoginDays;
    if (typeof data?.consecutiveDays === 'number') return data.consecutiveDays;
    if (typeof data?.attendanceCount === 'number') return data.attendanceCount;
    return fallback;
  }, []);

  /** 출석 보상 포인트 추출 */
  const parsePointsFromCheckinResponse = useCallback((data: any, fallbackAdded: number): number => {
    const absolutePoints = [
      data?.balancePoints,
      data?.currentPoints,
      data?.remainingPoints,
      data?.totalPoints,
      data?.pointCount,
    ].find((value) => typeof value === 'number');

    if (typeof absolutePoints === 'number') return absolutePoints;

    if (typeof data?.addedPoints === 'number') return fallbackAdded + data.addedPoints;
    if (typeof data?.pointsAdded === 'number') return fallbackAdded + data.pointsAdded;
    if (typeof data?.grantedPoints === 'number') return fallbackAdded + data.grantedPoints;

    return fallbackAdded;
  }, []);

  // ── Update helpers ──

  const setUserPoints = useCallback((newPointsOrFn: number | ((prev: number) => number), source: string = 'setUserPoints') => {
    setUserPointsState((prev: number) => {
      const next = typeof newPointsOrFn === 'function' ? newPointsOrFn(prev) : newPointsOrFn;

      const lastAuthoritative = lastAuthoritativePointsRef.current;
      const isAbsoluteUpdate = typeof newPointsOrFn !== 'function';
      const isSyncSource = source === 'fetchUserStatus'
        || source === 'syncRewardProfileFromPayload'
        || source === 'syncDailyProgressFromPayload'
        || source === 'bootstrap:user';

      if (
        isAbsoluteUpdate
        && isSyncSource
        && lastAuthoritative
        && Date.now() - lastAuthoritative.at <= STALE_SYNC_PROTECTION_MS
        && next < lastAuthoritative.value
      ) {
        recordUserPointsGuard(source, prev, next, lastAuthoritative);
        return prev;
      }

      if (isAbsoluteUpdate && AUTHORITATIVE_POINT_SOURCES.has(source)) {
        lastAuthoritativePointsRef.current = {
          value: next,
          at: Date.now(),
          source,
        };
      }

      recordUserPointsDebug(source, prev, next, typeof newPointsOrFn === 'function' ? 'updater' : 'absolute');
      return next;
    });
  }, [recordUserPointsDebug, recordUserPointsGuard]);

  const updateUserPoints = useCallback((newPointsOrFn: number | ((prev: number) => number), source: string = 'updateUserPoints') => {
    setUserPoints(newPointsOrFn, source);
  }, [setUserPoints]);

  const updateRewardProfile = useCallback((partial: Partial<RewardProfile>) => {
    setRewardProfile(prev => {
      const next = {
        ...prev,
        ...Object.fromEntries(
          Object.entries(partial).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
        ),
      };

      // 자동 레벨업 판정 로직
      if (typeof next.characterExp === "number" && typeof next.expToNext === "number" && typeof next.characterLevel === "number" && next.expToNext > 0 && next.characterExp >= next.expToNext) {
        next.characterLevel += Math.floor(next.characterExp / next.expToNext);
        next.characterExp = next.characterExp % next.expToNext;
      }

      return next;
    });
  }, []);

  const updatePersonaRewardProfile = useCallback((personaId: string, partial: Partial<PersonaRewardProfile>) => {
    if (!personaId) return;
    setPersonaRewardProfiles(prev => {
      const current = prev[personaId] || { characterLevel: 1, characterExp: 0, expToNext: 100 };
      const next = {
        ...current,
        ...Object.fromEntries(
          Object.entries(partial).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
        ),
      };

      // 자동 레벨업 판정 로직
      if (typeof next.characterExp === "number" && typeof next.expToNext === "number" && typeof next.characterLevel === "number" && next.expToNext > 0 && next.characterExp >= next.expToNext) {
        next.characterLevel += Math.floor(next.characterExp / next.expToNext);
        next.characterExp = next.characterExp % next.expToNext;
      }

      return {
        ...prev,
        [personaId]: next,
      };
    });
  }, []);

  const getPersonaRewardProfile = useCallback((personaId?: string | null): RewardProfile => {
    if (!personaId || !personaRewardProfiles[personaId]) return rewardProfile;
    const pp = personaRewardProfiles[personaId];
    return { ...rewardProfile, characterLevel: pp.characterLevel, characterExp: pp.characterExp, expToNext: pp.expToNext };
  }, [personaRewardProfiles, rewardProfile]);

  // ── Sync from payload helpers ──

  const syncRewardProfileFromPayload = useCallback((payload: any, targetPersonaId?: string | null, options?: { skipPoints?: boolean }) => {
    if (!payload || typeof payload !== 'object') return;
    const data = payload.data || payload.success || payload;

    if (!options?.skipPoints) {
      const points = data.points ?? data.pointCount;
      if (typeof points === 'number') {
        recordUserPointsPayload('syncRewardProfileFromPayload', {
          points,
          pointCount: data.pointCount,
          balancePoints: data.balancePoints,
          currentPoints: data.currentPoints,
          totalPoints: data.totalPoints,
        });
        updateUserPoints(points, 'syncRewardProfileFromPayload');
      }
    }

    const safeProcessLevel = (level: any, exp: any, nextExt: any) => {
      let l = typeof level === 'number' ? level : Number(level || 1);
      let e = typeof exp === 'number' ? exp : Number(exp || 0);
      let n = typeof nextExt === 'number' ? nextExt : Number(nextExt || 100);
      n = Math.max(1, n);

      if (e >= n) {
        l += Math.floor(e / n);
        e = e % n;
      }
      return { l, e, n };
    };

    const globalLevel = safeProcessLevel(data.characterLevel, data.characterExp, data.expToNext);

    updateRewardProfile({
      adViewsDaily: data.adViewsDaily,
      adViewsTotal: data.adViewsTotal,
      consultCount: data.consultCount,
      characterLevel: globalLevel.l,
      characterExp: globalLevel.e,
      expToNext: globalLevel.n,
      userRank: data.userRank,
    });

    const applyPersonaProfile = (pId: string, src: any) => {
      if (!pId || !src || typeof src !== 'object') return;
      const pLevel = safeProcessLevel(src.characterLevel, src.characterExp, src.expToNext);
      updatePersonaRewardProfile(pId, {
        characterLevel: pLevel.l,
        characterExp: pLevel.e,
        expToNext: pLevel.n,
      });
    };

    const payloadPersonaId = String(targetPersonaId || data.personaId || data.advisorId || data.characterId || '');
    if (payloadPersonaId) applyPersonaProfile(payloadPersonaId, data);

    [data.personaProfiles, data.advisorProfiles, data.characterProfiles].forEach(map => {
      if (!map || typeof map !== 'object' || Array.isArray(map)) return;
      Object.entries(map).forEach(([pId, src]) => applyPersonaProfile(pId, src));
    });

    [data.personaProfileList, data.advisorProfileList, data.characterProfileList].forEach(arr => {
      if (!Array.isArray(arr)) return;
      arr.forEach((item: any) => {
        const pId = String(item?.personaId || item?.advisorId || item?.characterId || '');
        applyPersonaProfile(pId, item);
      });
    });
  }, [recordUserPointsPayload, updateRewardProfile, updateUserPoints, updatePersonaRewardProfile]);

  const syncDailyProgressFromPayload = useCallback((payload: any, options?: { skipPoints?: boolean }) => {
    if (!payload || typeof payload !== 'object') return;
    const data = payload.data || payload.success || payload;

    if (!options?.skipPoints) {
      const balancePoints = data.balancePoints ?? data.currentPoints ?? data.points;
      if (typeof balancePoints === 'number') {
        recordUserPointsPayload('syncDailyProgressFromPayload', {
          balancePoints: data.balancePoints,
          currentPoints: data.currentPoints,
          points: data.points,
        });
        updateUserPoints(balancePoints, 'syncDailyProgressFromPayload');
      }
    }

    // dailyGoalPoints는 일일 목표 포인트이므로 expToNext(레벨업 EXP)와 별개
    // 레벨 데이터가 포함되어 있으면 동기화
    if (typeof data.characterLevel === 'number') {
      updateRewardProfile({
        characterLevel: data.characterLevel,
        characterExp: Number(data.characterExp ?? 0),
        expToNext: Number(data.expToNext ?? 100),
      });
    }
  }, [recordUserPointsPayload, updateRewardProfile, updateUserPoints]);

  // ── Fetch functions ──

  const fetchRewardProfile = useCallback(async (userKey: string | number) => {
    try {
      const res = await fetch(apiUrl('/reward/profile', { query: { userKey } }));
      if (!res.ok) return;
      const json = await res.json();
      if (json.resultType && json.resultType !== 'SUCCESS') return;
      
      syncRewardProfileFromPayload(json);
    } catch (e) { console.error('[Reward] Failed to fetch reward profile:', e); }
  }, [syncRewardProfileFromPayload]);

  const fetchRewardDailyProgress = useCallback(async (userKey: string | number) => {
    try {
      const res = await fetch(apiUrl('/reward/daily-progress', { version: 'v3', query: { userKey } }));
      if (!res.ok) return;
      const json = await res.json();
      if (json.resultType && json.resultType !== 'SUCCESS') return;
      syncDailyProgressFromPayload(json);
    } catch (e) { console.error('[Reward] Failed to fetch daily progress:', e); }
  }, [syncDailyProgressFromPayload]);

  const fetchRewardHistory = useCallback(async (userKey: string | number) => {
    try {
      const res = await fetch(apiUrl('/reward/history', { version: 'v3', query: { userKey } }));
      if (!res.ok) return;
      const json = await res.json();
      if (json.resultType && json.resultType !== 'SUCCESS') return;
      const data = json.data || {};
      console.log('[Reward] History synced', {
        pointGrantCount: (data.pointGrantHistory || []).length,
        promotionReturnCount: (data.promotionReturnHistory || []).length,
      });
    } catch (e) { console.error('[Reward] Failed to fetch reward history:', e); }
  }, []);

  const fetchProbabilityBoost = useCallback(async (userKey: string | number) => {
    try {
      const res = await fetch(apiUrl('/reward/probability', { query: { userKey } }));
      if (!res.ok) return;
      const json = await res.json();
      if (json.resultType && json.resultType !== 'SUCCESS') return;
      const data = json.data || json.success || json;
      setProbabilityBoost({
        diamondBoostPct: Number(data.diamondBoostPct ?? 0),
        platinumBoostPct: Number(data.platinumBoostPct ?? 0),
      });
    } catch (e) { console.error('[Reward] Failed to fetch probability boost:', e); }
  }, []);

  /** 보상/리워드 탭 진입 시 전체 동기화 */
  const syncAllReward = useCallback(async (userKey: string | number) => {
    await Promise.all([
      fetchRewardProfile(userKey),
      fetchRewardDailyProgress(userKey),
      fetchRewardHistory(userKey),
      fetchProbabilityBoost(userKey),
    ]);
  }, [fetchRewardProfile, fetchRewardDailyProgress, fetchRewardHistory, fetchProbabilityBoost]);

  /** 로그아웃 시 상태 리셋 */
  const resetReward = useCallback(() => {
    setUserPoints(0, 'resetReward');
    setRewardProfile(INITIAL_REWARD_PROFILE);
    setPersonaRewardProfiles({});
    setProbabilityBoost(INITIAL_PROBABILITY_BOOST);
    setConsecutiveDays(0);
  }, [setUserPoints]);

  return {
    userPoints, setUserPoints, updateUserPoints,
    rewardProfile, setRewardProfile, updateRewardProfile,
    personaRewardProfiles, setPersonaRewardProfiles, updatePersonaRewardProfile,
    getPersonaRewardProfile,
    probabilityBoost, setProbabilityBoost,
    consecutiveDays, setConsecutiveDays,
    syncRewardProfileFromPayload,
    syncDailyProgressFromPayload,
    fetchRewardProfile,
    fetchRewardDailyProgress,
    fetchRewardHistory,
    fetchProbabilityBoost,
    syncAllReward,
    resetReward,
    parseConsecutiveDaysFromCheckinResponse,
    parsePointsFromCheckinResponse,
  };
}
