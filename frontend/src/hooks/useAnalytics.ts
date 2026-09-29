import { useEffect, useRef, useCallback } from 'react';
import {
  logAppOpen,
  logAppClose,
  logPageView,
  logTabSwitch,
  logPageLoadTime,
  registerGlobalErrorHandlers,
  setAnalyticsUserProperties,
} from '../utils/analytics';
import type { ActiveTab } from '../shared/types/navigation';

type TabName = ActiveTab;

interface UseAnalyticsOptions {
  activeTab: TabName;
  step: 'landing' | 'choose' | 'result';
  tossUserKey: string | number | null;
  drawCount: number;
  userPoints: number;
  consecutiveDays: number;
  tossUserGender?: string | null;
  tossUserAgeGroup?: number | null;
  tossUserBirthday?: string | null;
}

/**
 * 앱 전체 분석 로깅을 관리하는 훅.
 * 모든 로깅은 best-effort — 실패해도 앱을 crash하지 않습니다.
 */
export function useAnalytics(opts: UseAnalyticsOptions) {
  const {
    activeTab,
    step,
    tossUserKey,
    drawCount,
    userPoints,
    consecutiveDays,
    tossUserGender,
    tossUserAgeGroup,
    tossUserBirthday,
  } = opts;

  const prevTabRef = useRef<TabName>(activeTab);
  const prevStepRef = useRef<string>(step);
  const tabLoadTimeRef = useRef<number>(0);
  const isInitialized = useRef(false);

  // ── 1. 앱 초기화: 세션 시작 + 글로벌 에러 핸들러 ──
  useEffect(() => {
    try {
      if (isInitialized.current) return;
      isInitialized.current = true;
      tabLoadTimeRef.current = Date.now();

      registerGlobalErrorHandlers();

      const params = new URLSearchParams(window.location.search);
      const source = params.get('source') || params.get('utm_source') || undefined;
      const referrer = document.referrer || undefined;

      const lastVisit = localStorage.getItem('gacha_last_visit');
      const isReturning = Boolean(lastVisit);
      localStorage.setItem('gacha_last_visit', new Date().toISOString());

      logAppOpen({
        source,
        is_returning: isReturning,
        referrer,
        user_key: tossUserKey ? String(tossUserKey) : undefined,
      });

      logPageView('home');
    } catch (e) {
      console.error('[useAnalytics] Init failed:', e);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. 앱 종료 감지 (visibilitychange + beforeunload) ──
  useEffect(() => {
    const handleVisibilityChange = () => {
      try {
        if (document.visibilityState === 'hidden') {
          logAppClose({ active_tab: activeTab });
        }
      } catch { /* best-effort */ }
    };

    const handleBeforeUnload = () => {
      try {
        logAppClose({ active_tab: activeTab });
      } catch { /* best-effort */ }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [activeTab]);

  // ── 3. 탭 전환 & 페이지뷰 자동 트래킹 ──
  useEffect(() => {
    try {
      const prevTab = prevTabRef.current;

      if (prevTab !== activeTab) {
        const prevLoadTime = tabLoadTimeRef.current;
        const dwell = Date.now() - prevLoadTime;
        if (dwell > 0 && prevLoadTime > 0) {
          logPageLoadTime(prevTab, dwell);
        }

        logTabSwitch(prevTab, activeTab);
        logPageView(activeTab, { referrer_page: prevTab });

        prevTabRef.current = activeTab;
        tabLoadTimeRef.current = Date.now();
      }
    } catch (e) {
      console.error('[useAnalytics] Tab switch tracking failed:', e);
    }
  }, [activeTab]);

  // ── 4. 가챠 스텝 변화 트래킹 ──
  useEffect(() => {
    try {
      const prevStep = prevStepRef.current;
      if (prevStep !== step) {
        const pageName = activeTab === 'home' ? `home_${step}` : `${activeTab}_${step}`;
        logPageView(pageName, { referrer_page: `${activeTab}_${prevStep}` });
        prevStepRef.current = step;
      }
    } catch (e) {
      console.error('[useAnalytics] Step tracking failed:', e);
    }
  }, [step, activeTab]);

  // ── 5. 유저 속성 동기화 ──
  const syncUserProperties = useCallback(() => {
    try {
      if (!tossUserKey) return;

      const firstVisit = localStorage.getItem('gacha_first_visit');
      if (!firstVisit) {
        localStorage.setItem('gacha_first_visit', new Date().toISOString());
      }
      const accountAgeDays = firstVisit
        ? Math.floor((Date.now() - new Date(firstVisit).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      let userTier = 'new';
      if (accountAgeDays > 14 && drawCount > 20) {
        userTier = 'power';
      } else if (accountAgeDays > 3) {
        userTier = 'returning';
      }

      let zodiacSign: string | undefined;
      if (tossUserBirthday && tossUserBirthday.length >= 8) {
        try {
          const month = parseInt(tossUserBirthday.substring(4, 6), 10);
          const day = parseInt(tossUserBirthday.substring(6, 8), 10);
          if (!isNaN(month) && !isNaN(day)) {
            const signs: [number, number, string][] = [
              [1, 20, 'capricorn'], [2, 19, 'aquarius'], [3, 20, 'pisces'],
              [4, 20, 'aries'], [5, 21, 'taurus'], [6, 21, 'gemini'],
              [7, 22, 'cancer'], [8, 22, 'leo'], [9, 23, 'virgo'],
              [10, 23, 'libra'], [11, 22, 'scorpio'], [12, 21, 'sagittarius'],
            ];
            for (let i = signs.length - 1; i >= 0; i--) {
              if (month > signs[i][0] || (month === signs[i][0] && day > signs[i][1])) {
                zodiacSign = signs[i][2] as string;
                break;
              }
            }
            if (!zodiacSign) zodiacSign = 'capricorn';
          }
        } catch { /* ignore */ }
      }

      setAnalyticsUserProperties({
        user_tier: userTier,
        total_draws: drawCount,
        total_points: userPoints,
        account_age_days: accountAgeDays,
        zodiac_sign: zodiacSign,
        age_group: tossUserAgeGroup ? `${tossUserAgeGroup}s` : undefined,
        gender: tossUserGender || undefined,
        consecutive_login_days: consecutiveDays,
      });
    } catch (e) {
      console.error('[useAnalytics] syncUserProperties failed:', e);
    }
  }, [tossUserKey, drawCount, userPoints, consecutiveDays, tossUserGender, tossUserAgeGroup, tossUserBirthday]);

  // 유저 속성은 로그인 시에만 동기화 (drawCount/userPoints 변경 시 재실행 방지)
  useEffect(() => {
    if (tossUserKey) {
      syncUserProperties();
    }
  }, [tossUserKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    logPageView,
    syncUserProperties,
  };
}
