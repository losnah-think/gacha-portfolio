import { Analytics } from "@apps-in-toss/web-framework";
import { logEvent, setUserProperties } from "firebase/analytics";
import { analytics, analytics2 } from "../firebase";
import { apiUrl } from "../shared/api/client";

// ════════════════════════════════════════════════════════════════
// 세션 관리
// ════════════════════════════════════════════════════════════════
let _sessionId: string | null = null;
let _sessionStartTime: number = 0;
let _pagesViewed: number = 0;

/** 세션 ID 생성 (탭 당 1개) */
const getSessionId = (): string => {
  if (!_sessionId) {
    _sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    _sessionStartTime = Date.now();
  }
  return _sessionId;
};

/** 현재 세션 지속 시간 (ms) */
export const getSessionDuration = (): number => {
  return _sessionStartTime ? Date.now() - _sessionStartTime : 0;
};

/** 세션에서 본 페이지 수 */
export const getPagesViewed = (): number => _pagesViewed;

// ════════════════════════════════════════════════════════════════
// 기본 로깅 유틸
// ════════════════════════════════════════════════════════════════

/**
 * Log an event to all configured Firebase Analytics instances.
 */
export const logToFirebase = (eventName: string, params?: Record<string, unknown>) => {
  try {
    if (analytics) {
      logEvent(analytics, eventName, params);
    }
  } catch (error) {
    if (typeof console !== 'undefined' && console.error) {
      console.error("[Analytics] Failed to log to primary Firebase:", error);
    }
  }

  try {
    if (analytics2) {
      logEvent(analytics2, eventName, params);
    }
  } catch (error) {
    if (typeof console !== 'undefined' && console.error) {
      console.error("[Analytics] Failed to log to secondary Firebase:", error);
    }
  }
};

/**
 * Log a click event.
 */
export const logClick = (buttonName: string, params?: Record<string, unknown>) => {
  try {
    Analytics.click({ button_name: buttonName, ...params });
    logToFirebase('click', { button_name: buttonName, ...params });
    if (typeof console !== 'undefined' && console.log) {
      console.log(`[Analytics] Click logged: ${buttonName}`, params);
    }
  } catch (error) {
    if (typeof console !== 'undefined' && console.error) {
      console.error("[Analytics] Failed to log click:", error);
    }
  }
};

/**
 * Log an impression event.
 */
export const logImpression = (itemId: string, params?: Record<string, unknown>) => {
  try {
    Analytics.impression({ item_id: itemId, ...params });
    logToFirebase('impression', { item_id: itemId, ...params });
    if (typeof console !== 'undefined' && console.log) {
      console.log(`[Analytics] Impression logged: ${itemId}`, params);
    }
  } catch (error) {
    if (typeof console !== 'undefined' && console.error) {
      console.error("[Analytics] Failed to log impression:", error);
    }
  }
};

/**
 * Log an error or client-side event to the backend.
 */
export const logErrorToBackend = async (eventName: string, data?: Record<string, unknown>) => {
  try {
    await fetch(apiUrl('/log/event'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event: eventName,
        timestamp: new Date().toISOString(),
        platform: typeof window !== 'undefined' ? 'web' : 'native',
        session_id: getSessionId(),
        ...data
      })
    });
  } catch (e) {
    if (typeof console !== 'undefined') {
      console.error('[Analytics] Failed to log error to backend:', e);
    }
  }
};

/**
 * Log a specific ad-related event to the backend for conversion analysis.
 * Endpoint: legacy POST /log
 */
export const logAdEvent = async (params: {
  userKey: string | number | null;
  action: string;
  details?: Record<string, unknown>;
}) => {
  try {
    const payload = {
      userKey: params.userKey ? String(params.userKey) : 'unknown',
      action: params.action,
      details: params.details || {},
      timestamp: new Date().toISOString(),
      session_id: getSessionId(),
    };

    // 로깅 디버깅을 위해 콘솔 출력
    console.log(`[AdLog] ${params.action}`, payload);

    await fetch(apiUrl('/log', { version: 'legacy' }), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    if (typeof console !== 'undefined') {
      console.error('[AdLog] Failed to log ad event:', e);
    }
  }
};

// ════════════════════════════════════════════════════════════════
// 1. 세션 & 앱 라이프사이클
// ════════════════════════════════════════════════════════════════

/** 앱 진입 */
export const logAppOpen = (params?: {
  source?: string;
  is_returning?: boolean;
  referrer?: string;
  user_key?: string;
}) => {
  const sessionId = getSessionId();
  logToFirebase('app_open', {
    session_id: sessionId,
    ...params,
  });
  console.log('[Analytics] app_open', { sessionId, ...params });
};

/** 앱 종료/이탈 */
export const logAppClose = (params?: {
  active_tab?: string;
}) => {
  const duration = getSessionDuration();
  logToFirebase('app_close', {
    session_id: getSessionId(),
    session_duration_ms: duration,
    pages_viewed: _pagesViewed,
    ...params,
  });
  // 세션 종료 시 백엔드에도 전송 (sendBeacon 사용)
  try {
    const payload = JSON.stringify({
      event: 'session_end',
      session_id: getSessionId(),
      session_duration_ms: duration,
      pages_viewed: _pagesViewed,
      timestamp: new Date().toISOString(),
      ...params,
    });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(apiUrl('/log/event'), payload);
    }
  } catch { /* best-effort */ }
};

// ════════════════════════════════════════════════════════════════
// 2. 페이지뷰 & 탭 전환
// ════════════════════════════════════════════════════════════════

/** 페이지(탭) 뷰 */
export const logPageView = (pageName: string, params?: {
  referrer_page?: string;
  [key: string]: unknown;
}) => {
  _pagesViewed += 1;
  logToFirebase('page_view', {
    page_name: pageName,
    session_id: getSessionId(),
    ...params,
  });
  console.log(`[Analytics] page_view: ${pageName}`, params);
};

/** 하단 네비게이션 탭 전환 */
export const logTabSwitch = (fromTab: string, toTab: string) => {
  logToFirebase('tab_switch', {
    from_tab: fromTab,
    to_tab: toTab,
    session_id: getSessionId(),
  });
  console.log(`[Analytics] tab_switch: ${fromTab} → ${toTab}`);
};

// ════════════════════════════════════════════════════════════════
// 3. 가챠 퍼널 (Core Feature)
// ════════════════════════════════════════════════════════════════

/** 캐릭터(페르소나) 선택 */
export const logGachaPersonaSelect = (personaId: string, personaName: string) => {
  logToFirebase('gacha_persona_select', {
    persona_id: personaId,
    persona_name: personaName,
    session_id: getSessionId(),
  });
  console.log(`[Analytics] gacha_persona_select: ${personaName}`);
};

/** 상황 선택 */
export const logGachaSituationSelect = (situationId: string, category?: string) => {
  logToFirebase('gacha_situation_select', {
    situation_id: situationId,
    category: category || 'unknown',
    session_id: getSessionId(),
  });
  console.log(`[Analytics] gacha_situation_select: ${situationId}`);
};

/** 뽑기 애니메이션 시작 */
export const logGachaAnimationStart = (personaId: string, situation: string) => {
  logToFirebase('gacha_animation_start', {
    persona_id: personaId,
    situation,
    session_id: getSessionId(),
  });
};

/** 결과 조회 */
export const logGachaResultView = (params: {
  rarity: string;
  score: number;
  persona_id: string;
  persona_name: string;
  type: string;
}) => {
  logToFirebase('gacha_result_view', {
    ...params,
    session_id: getSessionId(),
  });
  console.log(`[Analytics] gacha_result_view: ${params.rarity} (${params.score}점)`, params);
};

/** 결과 공유 */
export const logGachaResultShare = (rarity: string, shareChannel?: string) => {
  logToFirebase('gacha_result_share', {
    rarity,
    share_channel: shareChannel || 'default',
    session_id: getSessionId(),
  });
};

/** 재시도 */
export const logGachaRetry = (previousRarity?: string) => {
  logToFirebase('gacha_retry', {
    previous_rarity: previousRarity || 'unknown',
    session_id: getSessionId(),
  });
  console.log(`[Analytics] gacha_retry: previous=${previousRarity}`);
};

// ════════════════════════════════════════════════════════════════
// 4. 리워드 시스템
// ════════════════════════════════════════════════════════════════

/** 포인트 획득 */
export const logPointsEarned = (source: string, amount: number) => {
  logToFirebase('points_earned', {
    source,
    amount,
    session_id: getSessionId(),
  });
  console.log(`[Analytics] points_earned: +${amount} from ${source}`);
};

/** 포인트 사용 */
export const logPointsSpent = (purpose: string, amount: number) => {
  logToFirebase('points_spent', {
    purpose,
    amount,
    session_id: getSessionId(),
  });
  console.log(`[Analytics] points_spent: -${amount} for ${purpose}`);
};

/** 출석 체크 */
export const logDailyCheckin = (consecutiveDays: number) => {
  logToFirebase('daily_checkin', {
    consecutive_days: consecutiveDays,
    session_id: getSessionId(),
  });
};

/** 리워드 수령 */
export const logRewardClaim = (rewardType: string, pointsSpent?: number) => {
  logToFirebase('reward_claim', {
    reward_type: rewardType,
    points_spent: pointsSpent || 0,
    session_id: getSessionId(),
  });
  console.log(`[Analytics] reward_claim: ${rewardType}`);
};

// ════════════════════════════════════════════════════════════════
// 5. 광고 이벤트
// ════════════════════════════════════════════════════════════════

/** 광고 노출 (전면/보상형) */
export const logAdImpression = (adType: string, placementId: string, adGroupId?: string) => {
  const params = {
    ad_type: adType,
    placement_id: placementId,
    ad_group_id: adGroupId || 'unknown',
    session_id: getSessionId(),
  };
  logToFirebase('ad_impression', params);
  void logErrorToBackend('ad_impression', params);
  console.log(`[Analytics] ad_impression: ${adType} (${placementId})`);
};

/** 광고 리워드 지급 완료 */
export const logAdRewardEarned = (points: number, mode: string) => {
  const params = {
    points,
    mode,
    session_id: getSessionId(),
  };
  logToFirebase('ad_reward_earned', params);
  void logErrorToBackend('ad_reward_earned', params);
  console.log(`[Analytics] ad_reward_earned: +${points} (${mode})`);
};

/** 전면 광고 노출 */
export const logAdFullscreenShown = (placementId: string) => {
  const params = {
    placement_id: placementId,
    session_id: getSessionId(),
  };
  logToFirebase('ad_fullscreen_shown', params);
  void logErrorToBackend('ad_fullscreen_shown', params);
};

// ── 배너 광고 이벤트 ──

/** 배너 광고 렌더링 완료 */
export const logBannerAdRendered = (adGroupId: string, metadata?: Record<string, unknown>) => {
  const params = { ad_type: 'banner', ad_group_id: adGroupId, session_id: getSessionId(), ...metadata };
  logToFirebase('banner_ad_rendered', params);
  void logErrorToBackend('banner_ad_rendered', params);
  console.log(`[Analytics] banner_ad_rendered: ${adGroupId}`);
};

/** 배너 광고 노출 (1px 이상 뷰포트 진입) */
export const logBannerAdImpression = (adGroupId: string, metadata?: Record<string, unknown>) => {
  const params = { ad_type: 'banner', ad_group_id: adGroupId, session_id: getSessionId(), ...metadata };
  logToFirebase('banner_ad_impression', params);
  void logErrorToBackend('banner_ad_impression', params);
  console.log(`[Analytics] banner_ad_impression: ${adGroupId}`);
};

/** 배너 광고 뷰어블 (50% 이상 1초 노출) */
export const logBannerAdViewable = (adGroupId: string, metadata?: Record<string, unknown>) => {
  const params = { ad_type: 'banner', ad_group_id: adGroupId, session_id: getSessionId(), ...metadata };
  logToFirebase('banner_ad_viewable', params);
  void logErrorToBackend('banner_ad_viewable', params);
  console.log(`[Analytics] banner_ad_viewable: ${adGroupId}`);
};

/** 배너 광고 클릭 */
export const logBannerAdClicked = (adGroupId: string, metadata?: Record<string, unknown>) => {
  const params = { ad_type: 'banner', ad_group_id: adGroupId, session_id: getSessionId(), ...metadata };
  logToFirebase('banner_ad_clicked', params);
  void logErrorToBackend('banner_ad_clicked', params);
  console.log(`[Analytics] banner_ad_clicked: ${adGroupId}`);
};

/** 배너 광고 렌더 실패 */
export const logBannerAdFailed = (adGroupId: string, error?: { code?: number; message?: string }) => {
  const params = { ad_type: 'banner', ad_group_id: adGroupId, session_id: getSessionId(), error_code: error?.code, error_message: error?.message };
  logToFirebase('banner_ad_failed', params);
  void logErrorToBackend('banner_ad_failed', params);
  console.warn(`[Analytics] banner_ad_failed: ${adGroupId}`, error?.message);
};

/** 배너 광고 노필 (광고 없음) */
export const logBannerAdNoFill = (adGroupId: string, metadata?: Record<string, unknown>) => {
  const params = { ad_type: 'banner', ad_group_id: adGroupId, session_id: getSessionId(), ...metadata };
  logToFirebase('banner_ad_no_fill', params);
  void logErrorToBackend('banner_ad_no_fill', params);
  console.log(`[Analytics] banner_ad_no_fill: ${adGroupId}`);
};

// ════════════════════════════════════════════════════════════════
// 6. 구매 이벤트
// ════════════════════════════════════════════════════════════════

/** 구매 완료 */
export const logPurchaseComplete = (params: {
  sku: string;
  ticket_amount: number;
  order_id?: string;
}) => {
  logToFirebase('purchase_complete', {
    ...params,
    session_id: getSessionId(),
  });
  console.log(`[Analytics] purchase_complete: ${params.sku} (x${params.ticket_amount})`);
};

/** 구매 취소 */
export const logPurchaseCancel = (sku: string, reason?: string) => {
  logToFirebase('purchase_cancel', {
    sku,
    reason: reason || 'user_cancel',
    session_id: getSessionId(),
  });
  console.log(`[Analytics] purchase_cancel: ${sku}`);
};

// ════════════════════════════════════════════════════════════════
// 7. 랭킹
// ════════════════════════════════════════════════════════════════

/** 랭킹 페이지 진입 */
export const logRankingPageView = (myRank?: number, myScore?: number) => {
  logToFirebase('ranking_page_view', {
    my_rank: myRank || 0,
    my_score: myScore || 0,
    session_id: getSessionId(),
  });
};

/** 랭킹 탭 전환 */
export const logRankingTabSwitch = (tabType: string) => {
  logToFirebase('ranking_tab_switch', {
    tab_type: tabType,
    session_id: getSessionId(),
  });
};

// ════════════════════════════════════════════════════════════════
// 8. 상담 (Ask / Chat)
// ════════════════════════════════════════════════════════════════

/** 상담 시작 */
export const logAskStart = (personaId: string) => {
  logToFirebase('ask_start', {
    persona_id: personaId,
    session_id: getSessionId(),
  });
  console.log(`[Analytics] ask_start: ${personaId}`);
};

/** 메시지 전송 */
export const logAskMessageSent = (personaId: string, messageLength: number) => {
  logToFirebase('ask_message_sent', {
    persona_id: personaId,
    message_length: messageLength,
    session_id: getSessionId(),
  });
};

/** 상담 종료 */
export const logAskSessionEnd = (personaId: string, messageCount: number, durationMs: number) => {
  logToFirebase('ask_session_end', {
    persona_id: personaId,
    message_count: messageCount,
    duration_ms: durationMs,
    session_id: getSessionId(),
  });
  console.log(`[Analytics] ask_session_end: ${personaId} (${messageCount}msgs, ${Math.round(durationMs / 1000)}s)`);
};

// ════════════════════════════════════════════════════════════════
// 8-1. 스크래치 복권
// ════════════════════════════════════════════════════════════════

/** 복권 페이지 진입 */
export const logScratchPageView = () => {
  logToFirebase('scratch_page_view', { session_id: getSessionId() });
  console.log('[Analytics] scratch_page_view');
};

/** 복권 티켓 잠금 해제 (광고 시청 후) */
export const logScratchUnlock = (ticketId: number, adGroupId: string) => {
  const params = { ticket_id: ticketId, ad_group_id: adGroupId, session_id: getSessionId() };
  logToFirebase('scratch_ticket_unlock', params);
  void logErrorToBackend('scratch_ticket_unlock', params);
  console.log(`[Analytics] scratch_ticket_unlock: ticket=${ticketId}`);
};

/** 복권 긁기 완료 (결과 확인) */
export const logScratchReveal = (ticketId: number, prize: string, points: number, rarity: string) => {
  const params = { ticket_id: ticketId, prize, points, rarity, session_id: getSessionId() };
  logToFirebase('scratch_reveal', params);
  void logErrorToBackend('scratch_reveal', params);
  console.log(`[Analytics] scratch_reveal: ticket=${ticketId} prize=${prize} (${points}P, ${rarity})`);
};

/** 5장 모두 완료 */
export const logScratchAllComplete = (totalWon: number) => {
  const params = { total_won: totalWon, session_id: getSessionId() };
  logToFirebase('scratch_all_complete', params);
  void logErrorToBackend('scratch_all_complete', params);
  console.log(`[Analytics] scratch_all_complete: totalWon=${totalWon}P`);
};

/** 전체 새로고침 (광고 시청 후) */
export const logScratchRefresh = () => {
  logToFirebase('scratch_refresh', { session_id: getSessionId() });
  console.log('[Analytics] scratch_refresh');
};

/** 복권 광고 로드 실패 */
export const logScratchAdError = (adGroupId: string, errorMsg: string) => {
  const params = { ad_group_id: adGroupId, error: errorMsg, session_id: getSessionId() };
  logToFirebase('scratch_ad_error', params);
  void logErrorToBackend('scratch_ad_error', params);
  console.warn(`[Analytics] scratch_ad_error: ${adGroupId}`, errorMsg);
};

// ════════════════════════════════════════════════════════════════
// 8-2. 마이페이지 / 계정
// ════════════════════════════════════════════════════════════════

/** 회원 탈퇴 모달 열기 */
export const logAccountDeleteStart = () => {
  logToFirebase('account_delete_start', { session_id: getSessionId() });
  console.log('[Analytics] account_delete_start');
};

/** 회원 탈퇴 확인 (API 호출) */
export const logAccountDeleteConfirm = (userKey: string) => {
  const params = { user_key: userKey, session_id: getSessionId() };
  logToFirebase('account_delete_confirm', params);
  void logErrorToBackend('account_delete_confirm', params);
  console.log(`[Analytics] account_delete_confirm: ${userKey}`);
};

/** 로그아웃 */
export const logLogout = () => {
  logToFirebase('logout', { session_id: getSessionId() });
  console.log('[Analytics] logout');
};

/** 알림 토글 */
export const logNotificationToggle = (enabled: boolean) => {
  logToFirebase('notification_toggle', { enabled, session_id: getSessionId() });
  console.log(`[Analytics] notification_toggle: ${enabled ? 'on' : 'off'}`);
};

// ════════════════════════════════════════════════════════════════
// 9. 프로모션 / 이벤트
// ════════════════════════════════════════════════════════════════

/** 프로모션 노출 */
export const logPromotionView = (promotionId: string, promotionType?: string) => {
  logToFirebase('promotion_view', {
    promotion_id: promotionId,
    promotion_type: promotionType || 'unknown',
    session_id: getSessionId(),
  });
};

/** 프로모션 클릭 */
export const logPromotionClick = (promotionId: string) => {
  logToFirebase('promotion_click', {
    promotion_id: promotionId,
    session_id: getSessionId(),
  });
};

// ════════════════════════════════════════════════════════════════
// 10. 소셜 / 바이럴
// ════════════════════════════════════════════════════════════════

/** 공유 수단 */
export const logShareMethod = (method: string, contentType?: string) => {
  logToFirebase('share_method', {
    method,
    content_type: contentType || 'general',
    session_id: getSessionId(),
  });
  console.log(`[Analytics] share_method: ${method}`);
};

/** 초대 전송 */
export const logInviteSent = (channel: string) => {
  logToFirebase('invite_sent', {
    invite_channel: channel,
    session_id: getSessionId(),
  });
};

// ════════════════════════════════════════════════════════════════
// 11. 성능 & UX 품질
// ════════════════════════════════════════════════════════════════

/** 페이지 로드 시간 */
export const logPageLoadTime = (pageName: string, loadMs: number) => {
  logToFirebase('page_load_time', {
    page_name: pageName,
    load_ms: loadMs,
    session_id: getSessionId(),
  });
  if (loadMs > 3000) {
    console.warn(`[Analytics] Slow page load: ${pageName} (${loadMs}ms)`);
  }
};

/** API 응답시간 */
export const logApiLatency = (endpoint: string, durationMs: number, statusCode: number) => {
  logToFirebase('api_latency', {
    endpoint,
    duration_ms: durationMs,
    status_code: statusCode,
    session_id: getSessionId(),
  });
  if (durationMs > 5000) {
    console.warn(`[Analytics] Slow API: ${endpoint} (${durationMs}ms, ${statusCode})`);
  }
};

/** React 에러 바운더리 */
export const logErrorBoundary = (component: string, errorMessage: string) => {
  logToFirebase('error_boundary_hit', {
    component,
    error_message: errorMessage,
    session_id: getSessionId(),
  });
  void logErrorToBackend('error_boundary_hit', { component, error_message: errorMessage });
};

/** JS 런타임 에러 */
export const logJsError = (message: string, stack?: string, page?: string) => {
  try {
    logToFirebase('js_error', {
      message,
      stack: stack?.slice(0, 500),
      page: page || 'unknown',
      session_id: getSessionId(),
    });
  } catch {
    // 에러 핸들러 안에서 에러가 나면 무시 (재귀 방지)
  }
};

// ════════════════════════════════════════════════════════════════
// 12. 사용자 속성 (User Properties)
// ════════════════════════════════════════════════════════════════

/** Firebase User Properties 설정 */
export const setAnalyticsUserProperties = (properties: {
  user_tier?: string;
  total_draws?: number;
  total_points?: number;
  account_age_days?: number;
  zodiac_sign?: string;
  age_group?: string;
  gender?: string;
  consecutive_login_days?: number;
}) => {
  try {
    if (analytics) {
      setUserProperties(analytics, properties as Record<string, string>);
    }
    if (analytics2) {
      setUserProperties(analytics2, properties as Record<string, string>);
    }
    console.log('[Analytics] User properties set:', properties);
  } catch (error) {
    console.error('[Analytics] Failed to set user properties:', error);
  }
};

// ════════════════════════════════════════════════════════════════
// 13. API 추적 래퍼 (fetch with latency logging)
// ════════════════════════════════════════════════════════════════

/**
 * fetch 래퍼 — 자동으로 API 응답 시간을 측정하여 로깅합니다.
 * 기존 fetch와 동일한 시그니처를 유지합니다.
 */
export const trackedFetch = async (
  url: string | URL | Request,
  init?: RequestInit
): Promise<Response> => {
  const start = performance.now();
  const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

  // 짧은 endpoint 추출 (쿼리스트링 제거)
  const endpoint = urlStr.replace(/^https?:\/\/[^/]+/, '').split('?')[0];

  try {
    const response = await fetch(url, init);
    const duration = Math.round(performance.now() - start);
    logApiLatency(endpoint, duration, response.status);
    return response;
  } catch (error) {
    const duration = Math.round(performance.now() - start);
    logApiLatency(endpoint, duration, 0); // 0 = 네트워크 에러
    throw error;
  }
};

// ════════════════════════════════════════════════════════════════
// 14. 글로벌 에러 핸들러 등록
// ════════════════════════════════════════════════════════════════

/** 전역 에러 핸들러 (앱 초기화 시 1회 호출) */
export const registerGlobalErrorHandlers = () => {
  try {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
      try {
        logJsError(
          event.message || 'Unknown error',
          event.error?.stack,
          window.location.pathname
        );
      } catch { /* 재귀 방지 */ }
    });

    window.addEventListener('unhandledrejection', (event) => {
      try {
        const message = event.reason?.message || String(event.reason) || 'Unhandled rejection';
        logJsError(
          message,
          event.reason?.stack,
          window.location.pathname
        );
      } catch { /* 재귀 방지 */ }
    });

    console.log('[Analytics] Global error handlers registered');
  } catch (e) {
    console.error('[Analytics] Failed to register global error handlers:', e);
  }
};
