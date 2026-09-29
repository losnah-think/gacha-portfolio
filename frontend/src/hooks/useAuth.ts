import { useState, useCallback } from 'react';
import {
  performTossLogin, isTossLoggedIn,
  getTossSavedUserKey, getTossSavedUserName,
  getTossSavedUserBirthday, getTossSavedUserGender,
  getTossSavedUserAgeGroup, clearTossSession, disconnectTossLogin,
} from '../toss-auth';
import { closeView } from '@apps-in-toss/web-framework';
import { logClick } from '../utils/analytics';
import { apiUrl } from '../shared/api/client';



interface UseAuthOptions {
  /** 로그인 성공 직후 호출할 추가 작업 함수들 */
  onLoginSuccess?: (userKey: string) => Promise<void>;
}

export function useAuth({ onLoginSuccess }: UseAuthOptions = {}) {
  const [tossUserKey, setTossUserKey] = useState<string | number | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [tossUserGender, setTossUserGender] = useState<string | null>(null);
  const [tossUserBirthday, setTossUserBirthday] = useState<string | null>(null);
  const [tossUserAgeGroup, setTossUserAgeGroup] = useState<number | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [ageGroup, setAgeGroup] = useState<number>(20);

  const isLoggedIn = Boolean(tossUserKey);

  const handleTossLogin = useCallback(async () => {
    logClick('login_button');
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const userInfo = await performTossLogin();
      if (userInfo) {
        const stringKey = String(userInfo.userKey);
        if (userInfo.name) {
          const isValidName = /[가-힣]/.test(userInfo.name) || userInfo.name.length <= 10;
          if (isValidName) {
            setUserName(userInfo.name);
          }
        }
        if (userInfo.gender) setTossUserGender(userInfo.gender);
        if (userInfo.birthday) {
          setTossUserBirthday(userInfo.birthday);
          try {
            const birthYear = parseInt(userInfo.birthday.substring(0, 4), 10);
            const currentYear = new Date().getFullYear();
            const age = currentYear - birthYear + 1;
            const ageGroupVal = Math.floor(age / 10) * 10;
            setTossUserAgeGroup(ageGroupVal);
            setAgeGroup(ageGroupVal);
          } catch (e) {
            console.error('Failed to calculate age group during login:', e);
          }
        }

        // 백엔드 유저 동기화
        try {
          await fetch(apiUrl('/user/sync'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userKey: stringKey,
              nickname: userInfo.name,
              name: userInfo.name,
              gender: userInfo.gender,
              birthdate: userInfo.birthday,
              phone: userInfo.phone,
              email: userInfo.email,
              deviceId: 'web-gacha-app'
            })
          });
          if (onLoginSuccess) await onLoginSuccess(stringKey);
        } catch (syncError) {
          console.error('Backend user sync failed:', syncError);
        }

        setTossUserKey(stringKey);
        return { userKey: stringKey, userInfo };
      } else {
        setLoginError('토큰을 발급하지 못했어요.');
        return null;
      }
    } catch (error) {
      console.error('Toss 로그인 실패:', error);
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      const hint = message.includes('NETWORK_ERROR')
        ? '네트워크 오류: 토큰 발급 API가 차단되었을 수 있습니다.'
        : null;
      setLoginError(hint ? `${message} · ${hint}` : `로그인하지 못했어요: ${message}`);
      return null;
    } finally {
      setIsLoggingIn(false);
    }
  }, [onLoginSuccess]);

  const handleLogout = useCallback(async (resetCallbacks?: () => void) => {
    try { await disconnectTossLogin(); } catch (err) { console.error('Logout: disconnect failed', err); }

    setTossUserKey(null);
    setUserName('');
    setTossUserGender(null);
    setTossUserBirthday(null);
    setTossUserAgeGroup(null);

    await clearTossSession();
    localStorage.removeItem('drawCount');
    localStorage.removeItem('userPoints');
    localStorage.removeItem('lastRechargeDate');

    resetCallbacks?.();

    try {
      if (typeof closeView === 'function') { await closeView(); }
      else { window.parent.postMessage({ type: 'close' }, '*'); }
    } catch (err) { console.error('Failed to close view:', err); }
  }, []);

  // 세션 복구 시 저장된 유저 정보 로드
  const restoreSession = useCallback(async (): Promise<string | null> => {
    const loggedIn = await isTossLoggedIn();
    if (!loggedIn) return null;

    const userKey = await getTossSavedUserKey();
    if (!userKey) return null;

    const stringKey = String(userKey);
    setTossUserKey(stringKey);

    const savedName = await getTossSavedUserName();
    if (savedName) setUserName(savedName);

    const savedAgeGroup = await getTossSavedUserAgeGroup();
    if (savedAgeGroup) {
      setTossUserAgeGroup(savedAgeGroup);
      setAgeGroup(savedAgeGroup);
    }

    const savedGender = await getTossSavedUserGender();
    if (savedGender) setTossUserGender(savedGender);

    const savedBirthday = await getTossSavedUserBirthday();
    if (savedBirthday) setTossUserBirthday(savedBirthday);

    return stringKey;
  }, []);

  return {
    tossUserKey, setTossUserKey,
    userName, setUserName,
    tossUserGender, setTossUserGender,
    tossUserBirthday, setTossUserBirthday,
    tossUserAgeGroup, setTossUserAgeGroup,
    ageGroup, setAgeGroup,
    isLoggingIn, loginError,
    isLoggedIn,
    handleTossLogin,
    handleLogout,
    restoreSession,
  };
}
