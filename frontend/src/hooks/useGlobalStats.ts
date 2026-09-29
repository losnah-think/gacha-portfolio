import { useState, useEffect } from 'react';
import { apiUrl } from '../shared/api/client';

export interface GlobalStats {
  lottoUserCount: number;
  fortuneUserCount: number;
  totalActions: number;
  updatedAt: string;
}

/**
 * 홈 화면용 글로벌 통계 (누적 로또/운세 확인 유저수) 훅
 * - 1분 서버 캐시(Cache-Control) 적용 API 사용
 * - 컴포넌트 마운트 시 1회 호출
 */
export function useGlobalStats() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      try {
        const res = await fetch(apiUrl('/stats/global'));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled && json.resultType === 'SUCCESS') {
          setStats(json.data);
        }
      } catch (e) {
        console.warn('[GlobalStats] 통계 로드 실패:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchStats();
    return () => { cancelled = true; };
  }, []);

  return { stats, loading };
}
