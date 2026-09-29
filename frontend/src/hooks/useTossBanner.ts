import { useCallback, useEffect, useState } from 'react';
import { TossAds } from '@apps-in-toss/web-framework';
import {
  logBannerAdRendered,
  logBannerAdImpression,
  logBannerAdViewable,
  logBannerAdClicked,
  logBannerAdFailed,
  logBannerAdNoFill,
} from '../utils/analytics';

// ── 모듈 수준 싱글톤 ──
// TossAds.initialize는 앱 전체에서 단 한 번만 호출해야 합니다.
let _initialized = false;
let _pending = false;
const _listeners: Array<() => void> = [];

function initTossAds() {
  if (_initialized || _pending) return;

  try {
    if (!TossAds.initialize.isSupported()) {
      console.warn('[BannerAd] 배너 광고 기능을 사용할 수 없는 환경입니다.');
      return;
    }
  } catch (e) {
    console.warn('[BannerAd] Web environment detected, skipping TossAds init:', e);
    return;
  }

  _pending = true;
  TossAds.initialize({
    callbacks: {
      onInitialized: () => {
        console.log('[BannerAd] TossAds SDK 초기화 완료');
        _initialized = true;
        _pending = false;
        _listeners.forEach(fn => fn());
        _listeners.length = 0;
      },
      onInitializationFailed: (error: any) => {
        console.error('[BannerAd] TossAds SDK 초기화 실패:', error);
        _pending = false;
      },
    },
  });
}

/** 배너 광고 콜백에서 추출할 메타데이터 */
function extractMetadata(event: any): Record<string, unknown> | undefined {
  if (!event) return undefined;
  const meta: Record<string, unknown> = {};
  if (event.slotId) meta.slotId = event.slotId;
  if (event.adGroupId) meta.adGroupId = event.adGroupId;
  if (event.adMetadata) {
    if (event.adMetadata.requestId) meta.requestId = event.adMetadata.requestId;
    if (event.adMetadata.styleId) meta.styleId = event.adMetadata.styleId;
  }
  return Object.keys(meta).length > 0 ? meta : undefined;
}

/** adGroupId별 로깅 콜백 생성 */
function createAdCallbacks(adGroupId: string) {
  return {
    onAdRendered: (event: any) => {
      logBannerAdRendered(adGroupId, extractMetadata(event));
    },
    onAdImpression: (event: any) => {
      logBannerAdImpression(adGroupId, extractMetadata(event));
    },
    onAdViewable: (event: any) => {
      logBannerAdViewable(adGroupId, extractMetadata(event));
    },
    onAdClicked: (event: any) => {
      logBannerAdClicked(adGroupId, extractMetadata(event));
    },
    onAdFailedToRender: (event: any) => {
      logBannerAdFailed(adGroupId, event?.error);
    },
    onNoFill: (event: any) => {
      logBannerAdNoFill(adGroupId, extractMetadata(event));
    },
  };
}

export function useTossBanner() {
  const [isInitialized, setIsInitialized] = useState(_initialized);

  useEffect(() => {
    if (_initialized) {
      const timeout = setTimeout(() => setIsInitialized(true), 0);
      return () => clearTimeout(timeout);
    }
    // 초기화 완료 시 이 컴포넌트에 알림 등록
    const notify = () => setIsInitialized(true);
    _listeners.push(notify);

    initTossAds();

    return () => {
      const idx = _listeners.indexOf(notify);
      if (idx !== -1) _listeners.splice(idx, 1);
    };
  }, []);

  const attachBanner = useCallback(
    (adGroupId: string, element: HTMLElement, options?: any) => {
      if (!isInitialized) return;
      try {
        if (!TossAds.attachBanner.isSupported()) return;
        const callbacks = createAdCallbacks(adGroupId);
        const externalCallbacks = options?.callbacks || {};
        const callbackKeys = new Set([...Object.keys(callbacks), ...Object.keys(externalCallbacks)]);
        const mergedCallbacks = Array.from(callbackKeys).reduce<Record<string, (event: any) => void>>((acc, key) => {
          acc[key] = (event: any) => {
            callbacks[key as keyof typeof callbacks]?.(event);
            externalCallbacks[key]?.(event);
          };
          return acc;
        }, {});
        return TossAds.attachBanner(adGroupId, element, {
          ...options,
          callbacks: mergedCallbacks,
        });
      } catch (e) {
        console.warn('[BannerAd] Web environment detected, skipping TossAds attach:', e);
        logBannerAdFailed(adGroupId, { message: e instanceof Error ? e.message : String(e) });
        return;
      }
    },
    [isInitialized]
  );

  return { isInitialized, attachBanner };
}
