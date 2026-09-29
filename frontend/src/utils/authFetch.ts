/**
 * 인증 토큰 자동 갱신 Fetch 래퍼
 * 
 * 401 응답 감지 시 refreshToken으로 accessToken을 갱신하고 원래 요청을 재시도합니다.
 * Toss 인증 관련 엔드포인트(/toss/token, /toss/refresh 등)는 갱신 대상에서 제외됩니다.
 */

import { logApiLatency } from './analytics';
import { apiUrl } from '../shared/api/client';

/** 토큰 갱신 중복 방지 플래그 */
let isRefreshing = false;
/** 토큰 갱신 대기 중인 요청들의 resolve 큐 */
let refreshQueue: Array<(token: string | null) => void> = [];

/** 갱신 대상에서 제외할 경로들 (토큰 관련 엔드포인트) */
const SKIP_REFRESH_PATHS = [
  '/toss/token',
  '/toss/refresh',
  '/toss/revoke',
  '/toss/userinfo',
];

/**
 * URL이 토큰 갱신 대상에서 제외되는지 확인
 */
function shouldSkipRefresh(url: string): boolean {
  return SKIP_REFRESH_PATHS.some(path => url.includes(path));
}

/**
 * localStorage에서 refreshToken으로 accessToken 갱신
 * @returns 새 accessToken 또는 null
 */
async function doRefreshToken(): Promise<string | null> {
  const refreshToken = window.localStorage.getItem('toss_refresh_token');
  if (!refreshToken) {
    console.warn('[authFetch] No refresh token available');
    return null;
  }

  try {
    const response = await fetch(apiUrl('/toss/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      console.error('[authFetch] Token refresh failed:', response.status);
      return null;
    }

    const result = await response.json();

    if (result.success) {
      window.localStorage.setItem('toss_access_token', result.success.accessToken);
      window.localStorage.setItem('toss_refresh_token', result.success.refreshToken);
      console.log('[authFetch] Token refreshed successfully');
      return result.success.accessToken;
    }

    return null;
  } catch (error) {
    console.error('[authFetch] Token refresh error:', error);
    return null;
  }
}

/**
 * 토큰 갱신 (중복 요청 방지)
 * 동시에 여러 요청이 401을 받으면 첫 번째만 갱신하고 나머지는 대기
 */
function refreshTokenWithQueue(): Promise<string | null> {
  if (isRefreshing) {
    // 이미 갱신 중이면 큐에 추가하고 대기
    return new Promise(resolve => {
      refreshQueue.push(resolve);
    });
  }

  isRefreshing = true;

  return doRefreshToken().then(newToken => {
    // 대기 중인 요청들에게 새 토큰 전달
    refreshQueue.forEach(resolve => resolve(newToken));
    refreshQueue = [];
    isRefreshing = false;
    return newToken;
  });
}

/**
 * 세션 만료 처리 (refreshToken도 만료된 경우)
 */
function handleSessionExpired(): void {
  console.warn('[authFetch] Session expired — clearing stored tokens');
  window.localStorage.removeItem('toss_access_token');
  window.localStorage.removeItem('toss_refresh_token');
  window.localStorage.removeItem('toss_user_key');
  window.localStorage.removeItem('toss_user_name');
  window.localStorage.removeItem('toss_user_birthday');
  window.localStorage.removeItem('toss_user_gender');
  window.localStorage.removeItem('toss_user_phone');
  window.localStorage.removeItem('toss_user_email');
  // 필요 시 로그인 화면으로 리다이렉트하는 이벤트 발행 가능
  window.dispatchEvent(new CustomEvent('session-expired'));
}

/**
 * 인증 토큰 자동 갱신이 포함된 fetch 래퍼
 * 
 * 사용법: 기존 fetch()와 동일하게 사용
 * ```typescript
 * const res = await authFetch(apiUrl('/some-endpoint'), {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ ... })
 * });
 * ```
 * 
 * 동작:
 * 1. 요청 실행
 * 2. 401 응답 → refreshToken으로 accessToken 갱신
 * 3. 갱신 성공 → 원래 요청 재시도
 * 4. 갱신 실패 → 세션 만료 처리 후 원래 401 응답 반환
 */
export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const endpoint = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();

  // 1) 첫 번째 요청 실행
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    try {
      const duration = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start);
      logApiLatency(endpoint, duration, 0);
    } catch { /* best-effort */ }
    throw error;
  }

  try {
    const duration = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - start);
    logApiLatency(endpoint, duration, response.status);
  } catch { /* best-effort */ }

  // 2) 401이 아니거나, 토큰 관련 엔드포인트면 그대로 반환
  if (response.status !== 401 || shouldSkipRefresh(url)) {
    return response;
  }

  // 3) 401 → 토큰 갱신 시도
  console.log('[authFetch] 401 detected, attempting token refresh...');
  const newToken = await refreshTokenWithQueue();

  if (!newToken) {
    // 갱신 실패 → 세션 만료
    handleSessionExpired();
    return response;
  }

  // 4) 갱신 성공 → 원래 요청 재시도
  // Authorization 헤더가 있는 경우에만 교체
  const newInit = { ...init };
  if (newInit.headers) {
    const headers = new Headers(newInit.headers);
    if (headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${newToken}`);
      newInit.headers = headers;
    }
  }

  return fetch(input, newInit);
}

export default authFetch;
