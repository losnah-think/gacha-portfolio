// 앱 전역 내비게이션 타입 단일 소스 (RD2-1)
// 이 파일이 ActiveTab 정의의 유일한 출처예요. App / BottomNavigation / HistoryList /
// useAppHistory / useAnalytics 는 모두 여기서 가져다 써요.
// 결정 B(2026-07-06): 이벤트 기능 제거.

export type ActiveTab =
  | 'home'
  | 'fortune'
  | 'reward-gacha'
  | 'reward-quiz'
  | 'lotto'
  | 'scratch-lottery'
  | 'roulette'
  | 'talisman'
  | 'crossword'
  | 'idiom-quiz'
  | 'ask'
  | 'ask-chat'
  | 'ranking'
  | 'history'
  | 'history-detail'
  | 'settings'
  | 'mypage'
  | 'detailed-analysis';

export const ACTIVE_TABS = [
  'home',
  'fortune',
  'reward-gacha',
  'reward-quiz',
  'lotto',
  'scratch-lottery',
  'roulette',
  'talisman',
  'crossword',
  'idiom-quiz',
  'ask',
  'ask-chat',
  'ranking',
  'history',
  'history-detail',
  'settings',
  'mypage',
  'detailed-analysis',
] as const satisfies readonly ActiveTab[];

export const isActiveTab = (tab: unknown): tab is ActiveTab =>
  typeof tab === 'string' && (ACTIVE_TABS as readonly string[]).includes(tab);

/** 하단 탭 3개 (홈 · 랭킹 · 보관함) */
export const TAB_KEYS = ['home', 'ranking', 'history'] as const;
export type TabKey = (typeof TAB_KEYS)[number];

export const isTabKey = (tab: ActiveTab): tab is TabKey =>
  (TAB_KEYS as readonly string[]).includes(tab);

/** 앱 스텝(홈 가차 머신) */
export type AppStep = 'landing' | 'choose' | 'result';

export interface DeepLinkTarget {
  tab: ActiveTab;
  step?: AppStep;
  chooseStep?: 1 | 2 | 3;
}

interface DeepLinkLocation {
  pathname: string;
  search: string;
  href: string;
}

/**
 * 딥링크 파서 단일화 (RD2-4).
 * useState 초기값과 마운트 effect 가 이 함수 하나만 써요. 파싱 규칙은 기존과 동일해요.
 * - 매칭되는 딥링크가 없으면 null 을 반환해서 호출부가 기존 상태(홈)를 유지하게 해요.
 * - 결정 B에 따라 제거된 기능 딥링크는 매칭하지 않아 홈 랜딩으로 폴백돼요.
 */
export function parseDeepLink(loc: DeepLinkLocation): DeepLinkTarget | null {
  const path = loc.pathname || '';
  const params = new URLSearchParams(loc.search || '');
  const tab = params.get('tab');
  const mode = params.get('mode');
  const href = loc.href || '';

  // 1) 특수 액션 (기존 effect 의 2번째 블록 — 우선순위 높음)
  if (path.includes('/family') || mode === 'family' || href.includes(':family')) {
    return { tab: 'home', step: 'choose', chooseStep: 2 };
  }
  if (href.includes(':fortune') || mode === 'fortune') {
    return { tab: 'fortune', step: 'landing' };
  }
  if (href.includes(':lotto') || mode === 'lotto') {
    return { tab: 'reward-gacha', step: 'landing' };
  }

  // 2) 탭 전환 (기존 effect 의 1번째 블록)
  if (path.includes('/history') || tab === 'history' || href.includes(':history')) {
    return { tab: 'history' };
  }
  if (path.includes('/settings') || tab === 'settings' || href.includes(':settings')) {
    return { tab: 'settings' };
  }
  if (path.includes('/ranking') || tab === 'ranking' || href.includes(':ranking')) {
    return { tab: 'ranking', step: 'landing' };
  }
  if (path.includes('/ask') || tab === 'ask' || href.includes(':ask')) {
    return { tab: 'ask', step: 'landing' };
  }
  if (href.includes(':home') || tab === 'home' || path.includes('/quote') || href.includes(':quote')) {
    return { tab: 'home', step: 'landing' };
  }
  if (tab === 'reward' || href.includes(':reward')) {
    // 리워드 딥링크는 기존과 동일하게 홈 랜딩으로 진입해요.
    return { tab: 'home', step: 'landing' };
  }

  return null;
}

/** effect 에서 사용하는 "빈 루트" 판별 (기존 root 리셋 조건 그대로) */
export function isRootLocation(loc: DeepLinkLocation): boolean {
  const path = loc.pathname || '';
  const params = new URLSearchParams(loc.search || '');
  const tab = params.get('tab');
  const mode = params.get('mode');
  const href = loc.href || '';
  return href.endsWith('gacha/') || (path === '/' && !tab && !mode && !href.includes(':'));
}
