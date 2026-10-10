/**
 * Toss OAuth 및 데이터 복호화 관련 유틸리티
 * Provider credentials and mTLS belong exclusively on the backend.
 */

import { appLogin } from '@apps-in-toss/web-framework';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { apiUrl } from './shared/api/client';
import { IS_PUBLIC_BROWSER } from './public-browser/config';


interface TossUserInfo {
  userKey: string | number;
  name?: string;
  phone?: string;
  email?: string;
  birthday?: string;
  ci?: string;
  gender?: string;
  nationality?: string;
  scope: string;
  agreedTerms: string[];
}

/**
 * 날짜(yyyyMMdd)로부터 별자리를 계산합니다.
 */
export const getZodiacSign = (birthday: string): string => {
  if (!birthday || birthday.length < 8) return '';
  const month = parseInt(birthday.substring(4, 6), 10);
  const day = parseInt(birthday.substring(6, 8), 10);

  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return '물병자리';
  if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return '물고기자리';
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return '양자리';
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return '황소자리';
  if ((month === 5 && day >= 21) || (month === 6 && day <= 21)) return '쌍둥이자리';
  if ((month === 6 && day >= 22) || (month === 7 && day <= 22)) return '게자리';
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return '사자자리';
  if ((month === 8 && day >= 23) || (month === 9 && day <= 23)) return '처녀자리';
  if ((month === 9 && day >= 24) || (month === 10 && day <= 22)) return '천칭자리';
  if ((month === 10 && day >= 23) || (month === 11 && day <= 22)) return '전갈자리';
  if ((month === 11 && day >= 23) || (month === 12 && day <= 24)) return '사수자리';
  return '염소자리';
};

interface AccessTokenResponse {
  resultType: string;
  success?: {
    tokenType: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    scope: string;
  };
  error?: string;
}

interface TossCallbackPayload {
  userKey: string | number;
  referrer: 'DEFAULT' | 'SANDBOX';
}

/**
 * 1단계: 인가 코드 받기
 * Toss 미니앱 환경에서 appLogin 함수 호출
 */
export const getTossAuthCode = async (): Promise<{
  authorizationCode: string;
  referrer: 'DEFAULT' | 'SANDBOX';
} | null> => {
  if (IS_PUBLIC_BROWSER) return null;
  try {
    if (typeof appLogin === 'function') {
      const result = await appLogin();
      return {
        authorizationCode: result.authorizationCode,
        referrer: result.referrer
      };
    } else {
      console.error('❌ appLogin not available - 이 앱은 Toss 미니앱 환경에서만 실행 가능합니다');
      throw new Error('Toss Mini App environment required');
    }
  } catch (error) {
    console.error('Failed to get auth code:', error);
    return null;
  }
};

/**
 * 2단계: AccessToken 받기
 * Basic Auth 헤더를 사용하여 토큰 발급
 */
export const getAccessToken = async (
  authorizationCode: string,
  referrer: 'DEFAULT' | 'SANDBOX'
): Promise<AccessTokenResponse | null> => {
  if (IS_PUBLIC_BROWSER) return null;
  try {
    const response = await fetch(apiUrl('/toss/token'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        authorizationCode,
        referrer
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to get access token:', response.status, errorText);
      return {
        resultType: 'FAIL',
        error: `HTTP_${response.status} ${errorText || 'NO_BODY'}`
      };
    }

    return response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error getting access token:', message);
    return {
      resultType: 'FAIL',
      error: `NETWORK_ERROR ${message}`
    };
  }
};

/**
 * 3단계: 사용자 정보 받기
 */
export const getTossUserInfo = async (
  accessToken: string
): Promise<TossUserInfo | null> => {
  if (IS_PUBLIC_BROWSER) return null;
  try {
    const response = await fetch(apiUrl('/toss/userinfo'), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to get user info:', response.status, errorText);
      return null;
    }

    const data = await response.json();

    // [개선] 응답 형식이 { success: ... } 인 경우와 직접 데이터가 오는 경우 모두 지원
    const userInfo = data.success || data;

    if (userInfo && userInfo.userKey) {
      return userInfo;
    }

    console.error('Invalid user info response format:', data);
    return null;
  } catch (error) {
    console.error('Error getting user info:', error);
    return null;
  }
};

/**
 * 4단계: 암호화된 개인정보 복호화 (Backend API)
 * 민감키는 백엔드에서만 관리합니다.
 */
export const decryptTossDataWebCrypto = async (
  encryptedData: string
): Promise<string | null> => {
  if (IS_PUBLIC_BROWSER) return null;
  try {
    if (!encryptedData) {
      return null;
    }

    const response = await fetch(apiUrl('/toss/decrypt'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ encryptedData })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend decryption failed:', response.status, errorText);
      return null;
    }

    const json = await response.json();
    const decryptedValue =
      json?.decryptedData ??
      json?.decrypted ??
      json?.data?.decryptedData ??
      json?.data?.decrypted ??
      json?.success?.decryptedData ??
      json?.success?.decrypted;

    if (typeof decryptedValue === 'string' && decryptedValue.length > 0) {
      return decryptedValue;
    }

    return null;
  } catch (error) {
    console.error('Backend API decryption failed:', error);
    return null;
  }
};

/**
 * 콜백 서명 검증
 * Toss에서 전송한 콜백의 무결성 검증
 */
export const verifyTossCallbackSignature = async (
  _: TossCallbackPayload
): Promise<boolean> => {
  // Callback signatures must be verified by a trusted backend implementation.
  // A downloaded certificate alone cannot establish payload authenticity.
  return false;
};

/**
 * Toss 로그인 통합 플로우
 * 전체 OAuth 프로세스 자동화
 */
export const performTossLogin = async (): Promise<TossUserInfo | null> => {
  if (IS_PUBLIC_BROWSER) throw new Error('토스 로그인은 토스 앱에서만 사용할 수 있어요.');
  try {
    // 1. 인가 코드 받기
    const authResult = await getTossAuthCode();
    if (!authResult) {
      console.error('Failed to get authorization code');
      throw new Error('AUTH_CODE_FAILED');
    }

    console.log('Authorization code obtained:', {
      authorizationCode: authResult.authorizationCode.substring(0, 10) + '...',
      referrer: authResult.referrer
    });

    // 2. AccessToken 받기
    const tokenResult = await getAccessToken(
      authResult.authorizationCode,
      authResult.referrer
    );
    if (!tokenResult || !tokenResult.success) {
      console.error('Failed to get access token', tokenResult?.error);
      throw new Error(tokenResult?.error || 'TOKEN_EXCHANGE_FAILED');
    }

    console.log('Access token obtained:', {
      tokenType: tokenResult.success.tokenType,
      expiresIn: tokenResult.success.expiresIn
    });

    // 3. 사용자 정보 받기
    const userInfo = await getTossUserInfo(tokenResult.success.accessToken);
    if (!userInfo) {
      console.error('Failed to get user info');
      throw new Error('USERINFO_FAILED');
    }

    console.log('User info obtained:', {
      userKey: userInfo.userKey,
      scope: userInfo.scope
    });

    // 4. 암호화된 필드 복호화 (전화번호, 이메일 등)
    // 가능한 모든 PII 필드에 대해 복호화를 시도합니다.
    const encryptedFields: (keyof TossUserInfo)[] = ['name', 'phone', 'email', 'birthday', 'ci', 'gender', 'nationality'];

    for (const field of encryptedFields) {
      const val = userInfo[field];
      if (typeof val === 'string' && val.length > 0) {
        const decrypted = await decryptTossDataWebCrypto(val);
        if (decrypted) {
          // @ts-expect-error - index signature issue
          userInfo[field] = decrypted;
        } else {
          // 복호화 실패 시: 암호화된 문자열이 UI에 노출되지 않도록 제거
          // 한글/한자가 포함되지 않은 긴 문자열은 암호화된 값으로 간주
          const isLikelyEncrypted = val.length > 10 && !/[가-힣\u4e00-\u9fff]/.test(val);
          if (isLikelyEncrypted) {
            console.warn(`[Auth] Field '${field}' decryption failed, clearing encrypted value`);
            // @ts-expect-error - index signature issue
            userInfo[field] = undefined;
          }
        }
      }
    }

    // 5. Firestore에 유저 정보 저장 (복호화된 데이터 포함)
    try {
      if (!db) throw new Error('Firebase is not configured');
      const userRef = doc(db, 'users', String(userInfo.userKey));
      await setDoc(userRef, {
        ...userInfo,
        lastLoginAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      console.log('✅ User info saved to Firestore:', userInfo.userKey);
    } catch (dbError) {
      console.error('❌ Failed to save user info to Firestore:', dbError);
      // DB 저장이 실패해도 로그인은 성공으로 처리
    }

    // 토큰 및 사용자 정보 저장 (localStorage 사용 - 탭/앱 종료 후에도 세션 유지)
    const storagePromises: Promise<void>[] = [
      (async () => window.localStorage.setItem('toss_access_token', tokenResult.success!.accessToken))(),
      (async () => window.localStorage.setItem('toss_refresh_token', tokenResult.success!.refreshToken))(),
      (async () => window.localStorage.setItem('toss_user_key', userInfo.userKey.toString()))()
    ];

    // 복호화된 정보들도 저장
    if (userInfo.name) storagePromises.push((async () => window.localStorage.setItem('toss_user_name', userInfo.name!))());
    if (userInfo.birthday) storagePromises.push((async () => window.localStorage.setItem('toss_user_birthday', userInfo.birthday!))());
    if (userInfo.gender) storagePromises.push((async () => window.localStorage.setItem('toss_user_gender', userInfo.gender!))());
    if (userInfo.phone) storagePromises.push((async () => window.localStorage.setItem('toss_user_phone', userInfo.phone!))());
    if (userInfo.email) storagePromises.push((async () => window.localStorage.setItem('toss_user_email', userInfo.email!))());

    await Promise.all(storagePromises);

    return userInfo;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('개발 환경: Mock 로그인을 시도합니다 (Real Toss Login Failed).');
      const mockUserInfo: TossUserInfo = {
        userKey: 100000 + Math.floor(Math.random() * 900000), // Random ID
        scope: 'openid',
        agreedTerms: [],
        name: '테스트유저',
        birthday: '19950510' // [New] 예시: 5월 10일 (황소자리)
      };

      // localStorage 사용 - 탭/앱 종료 후에도 세션 유지
      window.localStorage.setItem('toss_access_token', 'mock_access_token_dev');
      window.localStorage.setItem('toss_refresh_token', 'mock_refresh_token_dev');
      window.localStorage.setItem('toss_user_key', mockUserInfo.userKey.toString());
      window.localStorage.setItem('toss_user_name', mockUserInfo.name!);
      window.localStorage.setItem('toss_user_birthday', mockUserInfo.birthday!);
      return mockUserInfo;
    }

    console.error('Toss login flow failed:', error);
    throw error;
  }
};

/**
 * 5단계: AccessToken 재발급 (백엔드 프록시 경유)
 */
export const refreshAccessToken = async (
  refreshToken: string
): Promise<AccessTokenResponse | null> => {
  if (IS_PUBLIC_BROWSER) return null;
  try {
    const response = await fetch(
      apiUrl('/toss/refresh'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refreshToken
        })
      }
    );

    if (!response.ok) {
      console.error('Failed to refresh access token:', response.status);
      return null;
    }

    const result = await response.json();

    if (result.success) {
      window.localStorage.setItem('toss_access_token', result.success.accessToken);
      window.localStorage.setItem('toss_refresh_token', result.success.refreshToken);
    }

    return result;
  } catch (error) {
    console.error('Error refreshing access token:', error);
    return null;
  }
};

/**
 * 6단계: 연결 끊기 (선택)
 */
export const disconnectTossLogin = async (accessToken?: string): Promise<boolean> => {
  if (IS_PUBLIC_BROWSER) return false;
  try {
    let token = accessToken;
    if (!token) {
      token = window.localStorage.getItem('toss_access_token') || undefined;
    }

    if (!token) {
      console.error('No access token found');
      return false;
    }

    // [변경] CORS 문제로 인해 백엔드 프록시 API 사용
    // (BACKEND_REQUESTS.md #8 참조)
    const response = await fetch(
      apiUrl('/toss/revoke'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ accessToken: token })
      }
    );

    if (response.ok) {
      // 저장소 정리
      await clearTossSession();
      return true;
    }

    // Provider token revocation requires a configured backend.
    return false;
  } catch (error) {
    console.error('Failed to disconnect Toss login:', error);
    // 실패하더라도 로컬 로그아웃은 진행되도록 true 반환 고려 가능하지만
    // 여기서는 false 반환하여 호출 측이 알 수 있게 함
    return false;
  }
};

/**
 * 저장된 세션 정보 삭제 (Logout)
 */
export const clearTossSession = async () => {
  if (IS_PUBLIC_BROWSER) return;
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('toss_access_token');
  window.localStorage.removeItem('toss_refresh_token');
  window.localStorage.removeItem('toss_user_key');
  window.localStorage.removeItem('toss_user_name');
  window.localStorage.removeItem('toss_user_birthday');
  window.localStorage.removeItem('toss_user_gender');
  window.localStorage.removeItem('toss_user_phone');
  window.localStorage.removeItem('toss_user_email');
};

/**
 * 저장된 Toss 사용자 정보 조회
 */
export const getTossSavedUserKey = async (): Promise<string | number | null> => {
  if (IS_PUBLIC_BROWSER) return null;
  if (typeof window === 'undefined') return null;
  const userKey = window.localStorage.getItem('toss_user_key');
  if (!userKey) return null;
  // 숫자로 변환 가능하면 숫자로, 아니면 문자열 그대로 반환
  const num = parseInt(userKey, 10);
  return isNaN(num) || num.toString() !== userKey ? userKey : num;
};

/**
 * 저장된 Toss 사용자 이름 조회
 */
export const getTossSavedUserName = async (): Promise<string | null> => {
  if (IS_PUBLIC_BROWSER) return null;
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('toss_user_name');
};

/**
 * 저장된 Toss 사용자 생일 조회
 */
export const getTossSavedUserBirthday = async (): Promise<string | null> => {
  if (IS_PUBLIC_BROWSER) return null;
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('toss_user_birthday');
};

/**
 * 저장된 Toss AccessToken 조회
 */
export const getTossSavedAccessToken = async (): Promise<string | null> => {
  if (IS_PUBLIC_BROWSER) return null;
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('toss_access_token');
};

/**
 * 저장된 Toss 사용자 성별 조회
 */
export const getTossSavedUserGender = async (): Promise<string | null> => {
  if (IS_PUBLIC_BROWSER) return null;
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('toss_user_gender');
};

/**
 * 저장된 Toss 사용자 연령대 조회 (생년월일 기반)
 */
export const getTossSavedUserAgeGroup = async (): Promise<number | null> => {
  if (IS_PUBLIC_BROWSER) return null;
  if (typeof window === 'undefined') return null;
  const birthday = window.localStorage.getItem('toss_user_birthday');
  if (!birthday || birthday.length < 4) return null;

  try {
    const birthYear = parseInt(birthday.substring(0, 4), 10);
    const currentYear = new Date().getFullYear();
    const age = currentYear - birthYear + 1;
    return Math.floor(age / 10) * 10;
  } catch (_e) {
    return null;
  }
};

/**
 * Toss 로그인 상태 확인
 */
export const isTossLoggedIn = async (): Promise<boolean> => {
  if (IS_PUBLIC_BROWSER) return false;
  if (typeof window === 'undefined') return false;
  return !!window.localStorage.getItem('toss_access_token');
};

/**
 * 앱 시작 시 토큰 선제 갱신
 * localStorage에 refreshToken이 있으면 accessToken을 새로 발급받습니다.
 * 세션 복원(restoreSession) 직후 호출하면 만료된 토큰 문제를 예방합니다.
 * @returns 갱신 성공 여부
 */
export const ensureFreshToken = async (): Promise<boolean> => {
  if (IS_PUBLIC_BROWSER) return false;
  if (typeof window === 'undefined') return false;

  const refreshToken = window.localStorage.getItem('toss_refresh_token');
  if (!refreshToken) return false;

  try {
    const result = await refreshAccessToken(refreshToken);
    if (result?.success) {
      console.log('[ensureFreshToken] Token refreshed on startup');
      return true;
    }
    console.warn('[ensureFreshToken] Refresh failed — token may be expired');
    return false;
  } catch (err) {
    console.error('[ensureFreshToken] Error:', err);
    return false;
  }
};
