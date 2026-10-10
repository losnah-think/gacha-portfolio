import { IS_PUBLIC_BROWSER } from '../../public-browser/config';

export const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || 'http://127.0.0.1:8787';
export const API_V2 = '/api/v2';
export const API_V3 = '/api/v3';

export const isNative = () => {
    if (typeof window === 'undefined') return false;
    return !!(
        (window as any).nativeFlushQueue ||
        (window as any).__fbBatchedBridge ||
        (window as any).ReactNativeMobile
    );
};

// [수정] getBaseUrl이 항상 유효한 URL을 반환하도록 개선
export const getBaseUrl = () => {
    if (IS_PUBLIC_BROWSER) return '';
    // 1. 환경 변수가 정의되어 있으면 최우선 사용
    if (BACKEND_API_URL && !BACKEND_API_URL.includes('localhost')) {
        return BACKEND_API_URL;
    }

    // 2. 네이티브 환경이거나 로컬 개발 환경이 아닐 때 BACKEND_API_URL 사용
    if (isNative() || typeof window === 'undefined') {
        return BACKEND_API_URL;
    }

    // 3. 타 도메인에서 실행 중이거나 개발 서버일 때 (Vite 등)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return BACKEND_API_URL;
    }

    // 4. 배포된 도메인에서는 상대 경로 사용 가능 (Hosting Rewrite 사용 시)
    return '';
};
