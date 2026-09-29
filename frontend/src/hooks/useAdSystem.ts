import { useState, useCallback, useRef } from 'react';
import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';
import { logClick, logErrorToBackend, logAdImpression, logAdRewardEarned, logAdFullscreenShown, logPointsEarned, logAdEvent } from '../utils/analytics';
import { triggerSmartMessage, MESSENGER_TEMPLATES } from '../shared/utils/messenger';
import { getTossSavedUserKey } from '../toss-auth';
import {
  FULLSCREEN_AD_ID, FULLSCREEN_AD_ID_2,
  GACHA_QUICK_FULLSCREEN_AD_ID, GACHA_REWARDED_AD_ID,
  REWARD_AD_LONG, REWARD_AD_SHORT,
} from '../shared/constants/app';
import { apiUrl } from '../shared/api/client';

// ── 보상 정책 ──
// 전면 광고 (홈)       → 1 티켓 (약 5초)
// 리워드 short (리워드) → 1 티켓 + 1 포인트 (약 15~30초)
// 리워드 long  (리워드) → 2 포인트 (약 15~30초)
const REWARD_TABLE = {
  interstitial: { tickets: 1, points: 0 },
  short: { tickets: 1, points: 1 },
  long: { tickets: 0, points: 2 },
} as const;

// ── 보상형 광고 로드 재시도 설정 ──
const REWARD_AD_MAX_RETRIES = 2;
const REWARD_AD_RETRY_DELAY_MS = 1_500;
// 폴백 광고 ID 체인: 예비 광고 ID가 별도로 있을 때만 사용
const REWARD_AD_FALLBACK_CHAIN: Record<string, string[]> = FULLSCREEN_AD_ID_2 === FULLSCREEN_AD_ID
  ? {}
  : { [FULLSCREEN_AD_ID]: [FULLSCREEN_AD_ID_2] };
const AD_SAFETY_TIMEOUT_MS = 60_000;

interface UseAdSystemOptions {
  tossUserKey: string | number | null;
  rewardProfile: { adViewsTotal: number; characterExp: number; expToNext: number };
  updateRewardProfile: (partial: Record<string, number>) => void;
  updateUserPoints: (fn: number | ((p: number) => number)) => void;
  syncRewardProfileFromPayload: (p: any, targetPersonaId?: string | null, options?: { skipPoints?: boolean }) => void;
  syncDailyProgressFromPayload: (p: any, options?: { skipPoints?: boolean }) => void;
  setDrawCount: (v: number | ((prev: number) => number)) => void;
  /** App-level alert (sets alertConfig state) */
  alert: (cfg: { title: string; description: string }) => void;
}

export function useAdSystem(opts: UseAdSystemOptions) {
  const {
    tossUserKey,
    rewardProfile, updateRewardProfile, updateUserPoints,
    syncRewardProfileFromPayload, syncDailyProgressFromPayload,
    setDrawCount, alert,
  } = opts;

  const [isAdLoading, setIsAdLoading] = useState(false);
  const [adLoadError, setAdLoadError] = useState<{ mode: 'short' | 'long'; retry: () => void } | null>(null);
  const lastInterstitialTimeRef = useRef<number>(0);
  const interstitialSessionCountRef = useRef<number>(0);
  // 사전 로드 상태 추적
  const preloadedAdsRef = useRef<Set<string>>(new Set());
  const preloadRetryCountRef = useRef<Record<string, number>>({});
  // 광고 시청 시간 측정을 위한 Refs
  const adShowStartTimeRef = useRef<number>(0);
  const adTotalTimeSecondsRef = useRef<number>(30); // 기본값 30초
  const adSafetyTimerRef = useRef<number | null>(null);

  const beginAdLoading = useCallback(() => {
    if (adSafetyTimerRef.current !== null) {
      window.clearTimeout(adSafetyTimerRef.current);
    }

    setIsAdLoading(true);
    adSafetyTimerRef.current = window.setTimeout(() => {
      console.warn('[AdSafety] 광고 종료 이벤트 미수신 — isAdLoading 강제 해제');
      adSafetyTimerRef.current = null;
      setIsAdLoading(false);
    }, AD_SAFETY_TIMEOUT_MS);
  }, []);

  const endAdLoading = useCallback(() => {
    if (adSafetyTimerRef.current !== null) {
      window.clearTimeout(adSafetyTimerRef.current);
      adSafetyTimerRef.current = null;
    }

    setIsAdLoading(false);
  }, []);

  const applyRewardPoints = useCallback((data: any, fallbackAdded: number) => {
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

    if (typeof data?.points === 'number') {
      updateUserPoints(data.points);
      return;
    }

    if (fallbackAdded > 0) {
      updateUserPoints((prev: number) => prev + fallbackAdded);
    }
  }, [updateUserPoints]);

  // ════════════════════════════════════════════════════════════════
  // 광고 사전 로드 (Preload) — 리워드 페이지 진입 시 호출
  // ════════════════════════════════════════════════════════════════
  const preloadRewardAd = useCallback((placementId: string) => {
    if (typeof loadFullScreenAd !== 'function') return;
    if (preloadedAdsRef.current.has(placementId)) return;

    try {
      logAdEvent({
        userKey: tossUserKey,
        action: 'AD_LOAD_START',
        details: { adFormat: 'preload', placementId: placementId }
      });

      // @ts-ignore
      loadFullScreenAd({
        options: { adGroupId: placementId },
        onEvent: (event: any) => {
          if (event.type === 'loaded') {
            console.log(`[Preload] ✅ Ad loaded: ${placementId}`);
            logAdEvent({
              userKey: tossUserKey,
              action: 'AD_LOAD_SUCCESS',
              details: { adFormat: 'preload', placementId: placementId }
            });
            preloadedAdsRef.current.add(placementId);
            preloadRetryCountRef.current[placementId] = 0;
          }
        },
        onError: (err: any) => {
          console.warn(`[Preload] ⚠️ Ad load failed: ${placementId}`, err?.message);
          logAdEvent({
            userKey: tossUserKey,
            action: 'AD_LOAD_FAIL',
            details: {
              adFormat: 'preload',
              placementId: placementId,
              errorName: err?.name,
              errorCode: err?.code,
              message: err?.message || String(err)
            }
          });
          const retries = preloadRetryCountRef.current[placementId] || 0;
          if (retries < REWARD_AD_MAX_RETRIES) {
            preloadRetryCountRef.current[placementId] = retries + 1;
            setTimeout(() => {
              preloadedAdsRef.current.delete(placementId);
              preloadRewardAd(placementId);
            }, REWARD_AD_RETRY_DELAY_MS * (retries + 1));
          }
        },
      });
    } catch (e) {
      console.warn('[Preload] Unexpected error:', e);
    }
  }, []);

  /** 리워드 페이지 진입 시 전면형 광고를 미리 로드 */
  const preloadAllRewardAds = useCallback(() => {
    preloadedAdsRef.current.clear();
    preloadRetryCountRef.current = {};
    preloadRewardAd(FULLSCREEN_AD_ID);
    preloadRewardAd(REWARD_AD_SHORT);
    preloadRewardAd(GACHA_QUICK_FULLSCREEN_AD_ID);
    preloadRewardAd(GACHA_REWARDED_AD_ID);
  }, [preloadRewardAd]);

  const grantInterstitialReward = useCallback(async () => {
    const { tickets } = REWARD_TABLE.interstitial;
    const userKey = tossUserKey ?? await getTossSavedUserKey();

    if (!userKey) {
      setDrawCount((prev: number) => prev + tickets);
      return;
    }

    try {
      const res = await fetch(apiUrl('/user/reward'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userKey: String(userKey),
          activityType: 'AD_INTERSTITIAL',
          adFormat: 'interstitial',
          adVerification: { placementId: FULLSCREEN_AD_ID, mode: 'interstitial' },
        }),
      });

      if (res.ok) {
        const json = await res.json();
        // skipPoints: true → 포인트는 별도 처리하지 않음 (전면광고는 포인트 보상 없음)
        syncDailyProgressFromPayload(json, { skipPoints: true });
        syncRewardProfileFromPayload(json, undefined, { skipPoints: true });
        // 서버에서 절대 포인트를 내려주면 반영
        const data = json.data || json.success || json;
        const serverPoints = data.balancePoints ?? data.currentPoints ?? data.remainingPoints ?? data.totalPoints ?? data.pointCount ?? data.points;
        if (typeof serverPoints === 'number') updateUserPoints(serverPoints);
        if (typeof data.tickets === 'number') {
          setDrawCount(data.tickets);
        } else {
          setDrawCount((prev: number) => prev + tickets);
        }
      } else {
        setDrawCount((prev: number) => prev + tickets);
      }
    } catch (e) {
      console.error('[Interstitial] Reward claim failed:', e);
      setDrawCount((prev: number) => prev + tickets);
    }
  }, [tossUserKey, syncDailyProgressFromPayload, syncRewardProfileFromPayload, updateUserPoints, setDrawCount]);

  // ════════════════════════════════════════════════════════════════
  // 전면형 광고 (Interstitial) → 1 티켓
  // ════════════════════════════════════════════════════════════════
  const showInterstitialAd = useCallback((onComplete?: () => void) => {
    if (isAdLoading) return;
    beginAdLoading();

    const now = Date.now();

    // DEV 환경에서는 광고 SDK 호출 없이 바로 티켓 부여
    if (import.meta.env.DEV) {
      console.log('[Interstitial] DEV fallback — granting 1 ticket');
      void grantInterstitialReward().finally(() => {
        endAdLoading();
        onComplete?.();
      });
      return;
    }

    try {
      if (typeof loadFullScreenAd !== 'function' || typeof showFullScreenAd !== 'function') {
        console.log('[Interstitial] Ad SDK not available');
        endAdLoading();
        alert({ title: '광고를 불러올 수 없어요', description: '잠시 후 다시 시도해 주세요' });
        return;
      }

      lastInterstitialTimeRef.current = now;
      interstitialSessionCountRef.current += 1;

      const adId = FULLSCREEN_AD_ID;

      logAdEvent({
        userKey: tossUserKey,
        action: 'AD_LOAD_START',
        details: { adFormat: 'interstitial', placementId: adId }
      });

      // @ts-ignore
      loadFullScreenAd({
        options: { adGroupId: adId },
        onEvent: (event: any) => {
          console.log('[Interstitial] Load event:', event.type);
          if (event.type === 'loaded') {
            logAdEvent({
              userKey: tossUserKey,
              action: 'AD_LOAD_SUCCESS',
              details: { adFormat: 'interstitial', placementId: adId }
            });
            // @ts-ignore
            showFullScreenAd({
              options: { adGroupId: adId },
              onEvent: (showEvent: any) => {
                console.log('[Interstitial] Show event:', showEvent.type);
                if (showEvent.type === 'impression') {
                  adShowStartTimeRef.current = Date.now();
                  logAdFullscreenShown(adId);
                  logAdImpression('interstitial', adId, adId);
                  logAdEvent({
                    userKey: tossUserKey,
                    action: 'AD_SHOW_START',
                    details: { adFormat: 'interstitial', placementId: adId }
                  });
                }
                if (showEvent.type === 'closed' || showEvent.type === 'dismissed') {
                  const playTimeSeconds = Math.floor((Date.now() - adShowStartTimeRef.current) / 1000);
                  logAdRewardEarned(0, 'interstitial');
                  logPointsEarned('ad_interstitial_ticket', 1);
                  logAdEvent({
                    userKey: tossUserKey,
                    action: 'AD_SHOW_COMPLETE', // Interstitial is usually short, but we log completion
                    details: { adFormat: 'interstitial', placementId: adId, playTimeSeconds }
                  });
                  void grantInterstitialReward().finally(() => {
                    endAdLoading();
                    onComplete?.();
                  });
                }
              },
              onError: (err: any) => {
                console.error('[Interstitial] Show error:', err);
                logErrorToBackend('interstitial_show_fail', { error: err?.message || String(err), adId });
                logAdEvent({
                  userKey: tossUserKey,
                  action: 'AD_SHOW_ERROR',
                  details: {
                    adFormat: 'interstitial',
                    placementId: adId,
                    errorName: err?.name,
                    errorCode: err?.code,
                    message: err?.message || String(err)
                  }
                });
                // 1차 ID 실패 → 2차 ID 폴백
                tryFallbackInterstitial(now, onComplete);
              }
            });
          }
        },
        onError: (err: any) => {
          console.error('[Interstitial] Load error:', err);
          logErrorToBackend('interstitial_load_fail', { error: err?.message || String(err) || 'unknown', adId });
          logAdEvent({
            userKey: tossUserKey,
            action: 'AD_LOAD_FAIL',
            details: {
              adFormat: 'interstitial',
              placementId: adId,
              errorName: err?.name,
              errorCode: err?.code,
              message: err?.message || String(err)
            }
          });
          // 1차 ID 실패 → 2차 ID 폴백
          tryFallbackInterstitial(now, onComplete);
        }
      });
    } catch (e) {
      console.error('[Interstitial] Unexpected error:', e);
      logErrorToBackend('interstitial_unexpected_error', { error: e instanceof Error ? e.message : String(e) });
      endAdLoading();
    }
  }, [tossUserKey, isAdLoading, grantInterstitialReward, beginAdLoading, endAdLoading, alert]);

  /** 2차 전면 광고 ID 폴백 */
  const tryFallbackInterstitial = useCallback((_originalTimestamp: number, onComplete?: () => void) => {
    try {
      logAdEvent({
        userKey: tossUserKey,
        action: 'AD_LOAD_START',
        details: { adFormat: 'interstitial_fallback', placementId: FULLSCREEN_AD_ID_2 }
      });

      // @ts-ignore
      loadFullScreenAd({
        options: { adGroupId: FULLSCREEN_AD_ID_2 },
        onEvent: (event: any) => {
          console.log('[Interstitial:Fallback] Load event:', event.type);
          if (event.type === 'loaded') {
            logAdEvent({
              userKey: tossUserKey,
              action: 'AD_LOAD_SUCCESS',
              details: { adFormat: 'interstitial_fallback', placementId: FULLSCREEN_AD_ID_2 }
            });
            // @ts-ignore
            showFullScreenAd({
              options: { adGroupId: FULLSCREEN_AD_ID_2 },
              onEvent: (showEvent: any) => {
                console.log('[Interstitial:Fallback] Show event:', showEvent.type);
                if (showEvent.type === 'impression') {
                  adShowStartTimeRef.current = Date.now();
                  logAdFullscreenShown(FULLSCREEN_AD_ID_2);
                  logAdImpression('interstitial', FULLSCREEN_AD_ID_2, FULLSCREEN_AD_ID_2);
                  logAdEvent({
                    userKey: tossUserKey,
                    action: 'AD_SHOW_START',
                    details: { adFormat: 'interstitial_fallback', placementId: FULLSCREEN_AD_ID_2 }
                  });
                }
                if (showEvent.type === 'closed' || showEvent.type === 'dismissed' || showEvent.type === 'completed' || showEvent.type === 'rewarded') {
                  const playTimeSeconds = Math.floor((Date.now() - adShowStartTimeRef.current) / 1000);
                  logAdEvent({
                    userKey: tossUserKey,
                    action: 'AD_SHOW_COMPLETE',
                    details: { adFormat: 'interstitial_fallback', placementId: FULLSCREEN_AD_ID_2, playTimeSeconds }
                  });
                  void grantInterstitialReward().finally(() => {
                    endAdLoading();
                    onComplete?.();
                  });
                }
              },
              onError: (err: any) => {
                console.error('[Interstitial:Fallback] Show error:', err);
                logErrorToBackend('interstitial_fallback_show_fail', { error: err?.message || String(err) });
                logAdEvent({
                  userKey: tossUserKey,
                  action: 'AD_SHOW_ERROR',
                  details: {
                    adFormat: 'interstitial_fallback',
                    placementId: FULLSCREEN_AD_ID_2,
                    errorName: err?.name,
                    errorCode: err?.code,
                    message: err?.message || String(err)
                  }
                });
                endAdLoading();
              }
            });
          }
        },
        onError: (err: any) => {
          console.error('[Interstitial:Fallback] Load error:', err);
          logErrorToBackend('interstitial_fallback_load_fail', { error: err?.message || String(err) });
          logAdEvent({
            userKey: tossUserKey,
            action: 'AD_LOAD_FAIL',
            details: {
              adFormat: 'interstitial_fallback',
              placementId: FULLSCREEN_AD_ID_2,
              errorName: err?.name,
              errorCode: err?.code,
              message: err?.message || String(err)
            }
          });
          // 에러 후에도 쿨다운 없이 재시도 가능
          lastInterstitialTimeRef.current = 0;
          endAdLoading();
        }
      });
    } catch (e) {
      console.error('[Interstitial:Fallback] Unexpected error:', e);
      endAdLoading();
    }
  }, [tossUserKey, grantInterstitialReward, endAdLoading]);

  // ════════════════════════════════════════════════════════════════
  // 보상형 광고 (Reward Ad)
  //   short → 1 티켓 + 1 포인트  |  long → 2 포인트
  // ════════════════════════════════════════════════════════════════
  const handleWatchAd = useCallback((mode: 'short' | 'long' = 'short') => {
    const isLongRewardAd = mode === 'long';
    const reward = REWARD_TABLE[mode];
    const pointsToGrant = reward.points;
    const ticketsToGrant = reward.tickets;

    const today = new Date().toDateString();
    const lastAdDate = localStorage.getItem('ad_reward_last_date');
    let adDailyCount = parseInt(localStorage.getItem('ad_reward_count') || '0', 10);

    if (lastAdDate !== today) {
      adDailyCount = 0;
      localStorage.setItem('ad_reward_last_date', today);
      localStorage.setItem('ad_reward_count', '0');
    }

    if (isAdLoading) return;
    beginAdLoading();
    logClick('ad_watch_click', { mode, pointsToGrant, ticketsToGrant });

    // 광고 보고 티켓 받기 전용 광고 ID를 사용합니다.
    const currentPlacementId = mode === 'long' ? REWARD_AD_LONG : REWARD_AD_SHORT;

    // ── 광고 시청 검증 토큰 생성 ──
    // 광고 로드 시점에 타임스탬프를 기록하고, 시청 완료 시점과의 차이를 검증합니다.
    const adSessionToken = `adv_${Date.now()}_${crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10)}`;
    const adLoadTimestamp = Date.now();
    // 전면형 광고는 5초 내외 — 최소 시청 검증 3초
    const MIN_WATCH_DURATION_MS = 3_000;

    logAdEvent({
      userKey: tossUserKey,
      action: 'AD_CLICK',
      details: { adFormat: mode, placementId: currentPlacementId }
    });

    const incrementAdCount = () => {
      const nextCount = adDailyCount + 1;
      localStorage.setItem('ad_reward_last_date', today);
      localStorage.setItem('ad_reward_count', nextCount.toString());
      updateRewardProfile({
        adViewsDaily: nextCount,
        adViewsTotal: rewardProfile.adViewsTotal + 1,
      });
      return nextCount;
    };

    const showAd = () => {
      console.log('Attempting to show reward ad...');
      let rewardEarned = false;

      // 🚨 광고 소진 처리: 시청 시도 시 preloaded 상태를 제거합니다.
      // 이렇게 해야 연속 시청 시 캐시된(이미 소진된) 광고를 다시 보여주려다 실패하는 프론트 문제가 방지됩니다.
      preloadedAdsRef.current.delete(currentPlacementId);

      // @ts-ignore
      showFullScreenAd({
        options: { adGroupId: currentPlacementId },
        onEvent: (event: any) => {
          console.log('Reward Ad Event:', event.type, event);

          if (event.type === 'failedToShow') {
            logErrorToBackend('reward_ad_failed_to_show_event', { currentPlacementId, mode });
            logAdEvent({
              userKey: tossUserKey,
              action: 'AD_SHOW_ERROR',
              details: { adFormat: mode, placementId: currentPlacementId, error: 'failedToShow' }
            });
            alert({ title: '광고 재생 실패', description: '잠시 후 다시 시도해 주세요' });
            endAdLoading();
            return;
          }

          if (event.type === 'impression') {
            adShowStartTimeRef.current = Date.now();
            logAdImpression('reward', currentPlacementId, currentPlacementId);
            logAdEvent({
              userKey: tossUserKey,
              action: 'AD_SHOW_START',
              details: { adFormat: mode, placementId: currentPlacementId }
            });
          }

          if (event.type === 'userEarnedReward' || event.type === 'completed' || event.type === 'rewarded') {
            if (!rewardEarned) {
              rewardEarned = true;
              logAdRewardEarned(pointsToGrant, mode);
              logPointsEarned('ad_' + mode, pointsToGrant);
              grantReward();
            }
          }

          if (event.type === 'closed' || event.type === 'dismissed') {
            console.log('Ad closed');
            const playTimeSeconds = Math.floor((Date.now() - adShowStartTimeRef.current) / 1000);

            if (!rewardEarned) {
              // 전면형 광고는 닫힘(dismissed)이 정상 완료 시점 → 보상 지급
              logAdEvent({
                userKey: tossUserKey,
                action: 'AD_SHOW_COMPLETE',
                details: {
                  adFormat: mode,
                  placementId: currentPlacementId,
                  playTimeSeconds,
                  totalTimeSeconds: adTotalTimeSecondsRef.current,
                  reason: 'interstitial_dismissed'
                }
              });

              rewardEarned = true;
              logAdRewardEarned(pointsToGrant, mode);
              if (ticketsToGrant > 0) logPointsEarned('ad_' + mode + '_ticket', ticketsToGrant);
              if (pointsToGrant > 0) logPointsEarned('ad_' + mode + '_point', pointsToGrant);
              void grantReward();
            } else {
              // 이미 보상을 받은 후 닫힌 경우 (정상 종료)
              logAdEvent({
                userKey: tossUserKey,
                action: 'AD_SHOW_COMPLETE', // 가이드에는 없지만 정상 종료 구분을 위해 추가
                details: { adFormat: mode, placementId: currentPlacementId, playTimeSeconds }
              });
            }
            endAdLoading();

            // 🚨 다음 시청을 대비하여 메인 광고를 다시 백그라운드에서 로드해둡니다.
            preloadRewardAd(currentPlacementId);
          }
        },
        onError: (err: any) => {
          console.error('Ad Show Failed:', err);
          logErrorToBackend('reward_ad_show_fail', { error: err?.message || String(err) || 'unknown', currentPlacementId });
          logAdEvent({
            userKey: tossUserKey,
            action: 'AD_SHOW_ERROR',
            details: {
              adFormat: mode,
              placementId: currentPlacementId,
              errorName: err?.name,
              errorCode: err?.code,
              message: err?.message || String(err)
            }
          });
          alert({ title: '광고 재생 실패', description: '광고를 재생할 수 없어요' });
          endAdLoading();
        }
      });
    };

    const grantReward = async () => {
      const userKey = tossUserKey ?? await getTossSavedUserKey();

      // ── 시청 시간 검증 ──
      const watchDuration = Date.now() - adLoadTimestamp;
      const verified = watchDuration >= MIN_WATCH_DURATION_MS;

      if (!verified) {
        console.warn(`[AdVerify] Watch duration too short: ${watchDuration}ms < ${MIN_WATCH_DURATION_MS}ms`);
        logErrorToBackend('ad_verify_duration_too_short', {
          watchDuration,
          minRequired: MIN_WATCH_DURATION_MS,
          mode,
          adSessionToken,
        });
      }

      /** 로컬 폴백: 서버 응답 없을 때 포인트 + 티켓 직접 지급 */
      const applyLocalFallback = () => {
        if (pointsToGrant > 0) updateUserPoints((prev: number) => prev + pointsToGrant);
        if (ticketsToGrant > 0) setDrawCount((prev: number) => prev + ticketsToGrant);
      };

      if (!userKey) {
        applyLocalFallback();
        incrementAdCount();
        endAdLoading();
        return;
      }

      try {
        const activityType = isLongRewardAd ? 'AD_LONG' : 'AD_SHORT';
        const adFormat = mode;

        const res = await fetch(apiUrl('/user/reward'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userKey: String(userKey),
            activityType,
            adFormat,
            idempotencyKey: adSessionToken,
            adVerification: {
              adSessionToken,
              placementId: currentPlacementId,
              adLoadTimestamp,
              watchDurationMs: watchDuration,
              verified,
              mode: adFormat,
            },
          }),
        });

        if (res.ok) {
          const json = await res.json();
          const data = json.data || json.success || json;
          // skipPoints: 포인트는 applyRewardPoints에서 한 번만 처리
          syncDailyProgressFromPayload(json, { skipPoints: true });
          syncRewardProfileFromPayload(json, undefined, { skipPoints: true });

          applyRewardPoints(data, pointsToGrant);

          // 티켓 반영
          if (typeof data.tickets === 'number') {
            setDrawCount(data.tickets);
          } else if (typeof data.addedTickets === 'number') {
            setDrawCount((prev: number) => prev + data.addedTickets);
          } else if (ticketsToGrant > 0) {
            setDrawCount((prev: number) => prev + ticketsToGrant);
          }

          if (data.characterLevel) {
            updateRewardProfile({
              characterLevel: Number(data.characterLevel),
              characterExp: Number(data.characterExp ?? rewardProfile.characterExp),
              expToNext: Number(data.expToNext ?? rewardProfile.expToNext),
            });
          }
        } else {
          // 1차 엔드포인트 실패 → 폴백 엔드포인트
          const activityRes = await fetch(apiUrl('/reward/activity'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userKey: String(userKey),
              activityType,
              adFormat,
              amount: pointsToGrant,
              ticketAmount: ticketsToGrant,
              adVerification: {
                adSessionToken,
                placementId: currentPlacementId,
                watchDurationMs: watchDuration,
                verified,
                mode: adFormat,
              },
            }),
          });

          if (activityRes.ok) {
            const activityJson = await activityRes.json();
            syncRewardProfileFromPayload(activityJson, undefined, { skipPoints: true });
            const data = activityJson.data || activityJson;
            applyRewardPoints(data, pointsToGrant);
            if (typeof data.tickets === 'number') {
              setDrawCount(data.tickets);
            } else if (ticketsToGrant > 0) {
              setDrawCount((prev: number) => prev + ticketsToGrant);
            }
          } else {
            applyLocalFallback();
          }
        }

        void triggerSmartMessage(MESSENGER_TEMPLATES.REWARD_BONUS, { type: '광고 시청' });
      } catch (e) {
        console.error('Ad reward claim failed:', e);
        applyLocalFallback();
      } finally {
        incrementAdCount();
        endAdLoading();
      }
    };

    try {
      if (typeof loadFullScreenAd === 'function' && typeof showFullScreenAd === 'function') {
        const adGroupId = currentPlacementId;
        console.log('Loading ad...', adGroupId);
        setAdLoadError(null);

        const devFallback = () => {
          if (import.meta.env.DEV) {
            if (pointsToGrant > 0) updateUserPoints((prev: number) => prev + pointsToGrant);
            if (ticketsToGrant > 0) setDrawCount((prev: number) => prev + ticketsToGrant);
            incrementAdCount();
            endAdLoading();
            return true;
          }
          return false;
        };

        // ── 재시도 + 폴백 체인 로드 함수 ──
        let retryCount = 0;
        const fallbackIds = REWARD_AD_FALLBACK_CHAIN[adGroupId] || [];

        const attemptLoad = (placementId: string) => {
          logAdEvent({
            userKey: tossUserKey,
            action: 'AD_LOAD_START',
            details: { adFormat: mode, placementId: placementId, retryCount }
          });

          // @ts-ignore
          loadFullScreenAd({
            options: { adGroupId: placementId },
            onEvent: (event: any) => {
              console.log('Reward Load Info:', event.type);
              if (event.type === 'loaded') {
                logAdEvent({
                  userKey: tossUserKey,
                  action: 'AD_LOAD_SUCCESS',
                  details: { adFormat: mode, placementId: placementId }
                });
                preloadedAdsRef.current.add(placementId);
                showAd();
              }
            },
            onError: (err: any) => {
              console.error('Reward Load Error:', err);
              logAdEvent({
                userKey: tossUserKey,
                action: 'AD_LOAD_FAIL',
                details: {
                  adFormat: mode,
                  placementId: placementId,
                  errorName: err?.name,
                  errorCode: err?.code,
                  message: err?.message || String(err)
                }
              });
              logErrorToBackend('reward_ad_load_fail', {
                error: err?.message || String(err) || 'unknown',
                adGroupId: placementId,
                mode,
                retryCount,
              });

              if (err.message?.includes('not supported') || err.message?.includes('Not supported')) {
                if (devFallback()) return;
              }

              // 1) 같은 ID로 재시도
              if (retryCount < REWARD_AD_MAX_RETRIES) {
                retryCount += 1;
                console.log(`[RewardAd] Retrying (${retryCount}/${REWARD_AD_MAX_RETRIES})...`);
                setTimeout(() => attemptLoad(placementId), REWARD_AD_RETRY_DELAY_MS);
                return;
              }

              // 2) 폴백 ID 체인으로 시도
              const nextFallback = fallbackIds.shift();
              if (nextFallback) {
                retryCount = 0;
                console.log(`[RewardAd] Trying fallback: ${nextFallback}`);
                attemptLoad(nextFallback);
                return;
              }

              // 3) 모두 실패 → 에러 상태 세팅 (UI에서 "다시 시도" 버튼 표시)
              endAdLoading();
              setAdLoadError({
                mode,
                retry: () => handleWatchAd(mode),
              });
            }
          });
        };

        // 사전 로드 완료된 광고면 바로 show, 아니면 load부터
        if (preloadedAdsRef.current.has(adGroupId)) {
          showAd();
        } else {
          attemptLoad(adGroupId);
        }
      } else {
        console.warn('SDK not found, fallback');
        if (pointsToGrant > 0) updateUserPoints((prev: number) => prev + pointsToGrant);
        if (ticketsToGrant > 0) setDrawCount((prev: number) => prev + ticketsToGrant);
        incrementAdCount();
        alert({ title: '보너스 도착 🎁', description: '토스에서 선물을 확인해보세요' });
        endAdLoading();
      }
    } catch (e: any) {
      console.error('Reward Ad Error:', e);
      if (e.message?.includes('not supported') && import.meta.env.DEV) {
        if (pointsToGrant > 0) updateUserPoints((prev: number) => prev + pointsToGrant);
        if (ticketsToGrant > 0) setDrawCount((prev: number) => prev + ticketsToGrant);
        incrementAdCount();
        endAdLoading();
        return;
      }
      endAdLoading();
      setAdLoadError({
        mode,
        retry: () => handleWatchAd(mode),
      });
    }
  }, [
    isAdLoading, tossUserKey,
    rewardProfile.adViewsTotal, rewardProfile.characterExp, rewardProfile.expToNext,
    updateRewardProfile, updateUserPoints,
    syncRewardProfileFromPayload, syncDailyProgressFromPayload,
    applyRewardPoints,
    setDrawCount, alert,
    beginAdLoading, endAdLoading,
  ]);

  /**
   * 가차 페이지 전용 5초 전면 광고
   * 포인트/티켓 보상 없이 광고 시청 완료 콜백만 호출합니다.
   */
  const showGachaInterstitialAd = useCallback((onComplete?: () => void) => {
    if (isAdLoading) {
      console.warn('[GachaInterstitial] Request ignored because another ad is already loading');
      return;
    }
    beginAdLoading();

    const adId = GACHA_QUICK_FULLSCREEN_AD_ID;
    console.log('[GachaInterstitial] Starting ad flow', { adId, tossUserKey });

    if (import.meta.env.DEV) {
      console.log('[GachaInterstitial] DEV fallback — completing without ad');
      endAdLoading();
      onComplete?.();
      return;
    }

    try {
      if (typeof loadFullScreenAd !== 'function' || typeof showFullScreenAd !== 'function') {
        console.log('[GachaInterstitial] Ad SDK not available');
        endAdLoading();
        return;
      }

      logAdEvent({
        userKey: tossUserKey,
        action: 'AD_LOAD_START',
        details: { adFormat: 'gacha_interstitial', placementId: adId }
      });

      // @ts-ignore
      loadFullScreenAd({
        options: { adGroupId: adId },
        onEvent: (event: any) => {
          console.log('[GachaInterstitial] Load event:', event?.type, event);
          if (event.type === 'loaded') {
            logAdEvent({
              userKey: tossUserKey,
              action: 'AD_LOAD_SUCCESS',
              details: { adFormat: 'gacha_interstitial', placementId: adId }
            });

            // @ts-ignore
            showFullScreenAd({
              options: { adGroupId: adId },
              onEvent: (showEvent: any) => {
                console.log('[GachaInterstitial] Show event:', showEvent?.type, showEvent);
                if (showEvent.type === 'impression') {
                  adShowStartTimeRef.current = Date.now();
                  logAdFullscreenShown(adId);
                  logAdImpression('gacha_interstitial', adId, adId);
                  logAdEvent({
                    userKey: tossUserKey,
                    action: 'AD_SHOW_START',
                    details: { adFormat: 'gacha_interstitial', placementId: adId }
                  });
                }

                if (showEvent.type === 'closed' || showEvent.type === 'dismissed' || showEvent.type === 'completed' || showEvent.type === 'rewarded') {
                  const playTimeSeconds = Math.floor((Date.now() - adShowStartTimeRef.current) / 1000);
                  console.log('[GachaInterstitial] Completing ad flow', { adId, eventType: showEvent.type, playTimeSeconds });
                  logAdEvent({
                    userKey: tossUserKey,
                    action: 'AD_SHOW_COMPLETE',
                    details: { adFormat: 'gacha_interstitial', placementId: adId, playTimeSeconds }
                  });
                  endAdLoading();
                  console.log('[GachaInterstitial] Invoking completion callback');
                  onComplete?.();
                }
              },
              onError: (err: any) => {
                console.error('[GachaInterstitial] Show error:', err);
                logErrorToBackend('gacha_interstitial_show_fail', { error: err?.message || String(err), adId });
                endAdLoading();
                alert({ title: '광고 재생 실패', description: '잠시 후 다시 시도해 주세요' });
              }
            });
          }
        },
        onError: (err: any) => {
          console.error('[GachaInterstitial] Load error:', err);
          logErrorToBackend('gacha_interstitial_load_fail', { error: err?.message || String(err), adId });
          endAdLoading();
          alert({ title: '광고를 불러올 수 없어요', description: '잠시 후 다시 시도해 주세요' });
        }
      });
    } catch (e) {
      console.error('[GachaInterstitial] Unexpected error:', e);
      logErrorToBackend('gacha_interstitial_unexpected_error', { error: e instanceof Error ? e.message : String(e), adId });
      endAdLoading();
    }
  }, [tossUserKey, isAdLoading, alert, beginAdLoading, endAdLoading]);

  /**
   * 가차 전용 광고 — 무료 뽑기용 광고 ID 사용
   * 광고 시청 완료(dismissed) 시 callback을 호출하여 무료 뽑기를 실행합니다.
   * 포인트/티켓 보상 없이 광고 시청만 검증합니다.
   */
  const showGachaRewardedAd = useCallback((onComplete: () => void) => {
    if (isAdLoading) {
      console.warn('[GachaRewarded] Request ignored because another ad is already loading');
      return;
    }
    beginAdLoading();

    const adId = GACHA_REWARDED_AD_ID;
    console.log('[GachaRewarded] Starting ad flow', { adId, tossUserKey });

    // DEV 환경에서는 광고 SDK 호출 없이 바로 뽑기 실행
    if (import.meta.env.DEV) {
      console.log('[GachaRewarded] DEV fallback — skipping ad, executing draw directly');
      endAdLoading();
      onComplete();
      return;
    }

    logAdEvent({
      userKey: tossUserKey,
      action: 'AD_LOAD_START',
      details: { adFormat: 'gacha_rewarded', placementId: adId }
    });

    try {
      if (typeof loadFullScreenAd !== 'function' || typeof showFullScreenAd !== 'function') {
        console.log('[GachaRewarded] Ad SDK not available');
        endAdLoading();
        return;
      }

      // @ts-ignore
      loadFullScreenAd({
        options: { adGroupId: adId },
        onEvent: (event: any) => {
          console.log('[GachaRewarded] Load event:', event.type);
          let completed = false;
          if (event.type === 'loaded') {
            logAdEvent({
              userKey: tossUserKey,
              action: 'AD_LOAD_SUCCESS',
              details: { adFormat: 'gacha_rewarded', placementId: adId }
            });
            // @ts-ignore
            showFullScreenAd({
              options: { adGroupId: adId },
              onEvent: (showEvent: any) => {
                console.log('[GachaRewarded] Show event:', showEvent.type);
                if (showEvent.type === 'impression') {
                  adShowStartTimeRef.current = Date.now();
                  logAdFullscreenShown(adId);
                  logAdImpression('reward', adId, adId);
                  logAdEvent({
                    userKey: tossUserKey,
                    action: 'AD_SHOW_START',
                    details: { adFormat: 'gacha_rewarded', placementId: adId }
                  });
                }
                if (showEvent.type === 'closed' || showEvent.type === 'dismissed' || showEvent.type === 'completed' || showEvent.type === 'rewarded' || showEvent.type === 'userEarnedReward') {
                  if (!completed) {
                    completed = true;
                    const playTimeSeconds = Math.floor((Date.now() - adShowStartTimeRef.current) / 1000);
                    console.log('[GachaRewarded] Completing ad flow', { adId, eventType: showEvent.type, playTimeSeconds });
                    logAdEvent({
                      userKey: tossUserKey,
                      action: 'AD_SHOW_COMPLETE',
                      details: { adFormat: 'gacha_rewarded', placementId: adId, playTimeSeconds }
                    });
                    endAdLoading();
                    console.log('[GachaRewarded] Invoking completion callback');
                    onComplete();
                  }
                }
              },
              onError: (err: any) => {
                console.error('[GachaRewarded] Show error:', err);
                logErrorToBackend('gacha_rewarded_show_fail', { error: err?.message || String(err), adId });
                alert({ title: '광고 재생 실패', description: '잠시 후 다시 시도해 주세요' });
                endAdLoading();
              }
            });
          }
        },
        onError: (err: any) => {
          console.error('[GachaRewarded] Load error:', err);
          logErrorToBackend('gacha_rewarded_load_fail', { error: err?.message || String(err), adId });
          alert({ title: '광고를 불러올 수 없어요', description: '잠시 후 다시 시도해 주세요' });
          endAdLoading();
        }
      });
    } catch (e) {
      console.error('[GachaRewarded] Unexpected error:', e);
      logErrorToBackend('gacha_rewarded_unexpected_error', { error: e instanceof Error ? e.message : String(e) });
      endAdLoading();
    }
  }, [tossUserKey, isAdLoading, alert, beginAdLoading, endAdLoading]);

  return { isAdLoading, adLoadError, showInterstitialAd, showGachaInterstitialAd, handleWatchAd, showGachaRewardedAd, preloadAllRewardAds };
}
