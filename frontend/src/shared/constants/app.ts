// ── App-level constants ──────────────────────────────────────────

export type HomeMenuKey = 'lotto' | 'fortune' | 'advice' | 'love';

export interface RewardProfile {
  adViewsDaily: number;
  adViewsTotal: number;
  consultCount: number;
  characterLevel: number;
  characterExp: number;
  expToNext: number;
  userRank?: number; // 상위 몇 위인지 여부 추가
}

export type PersonaRewardProfile = Pick<RewardProfile, 'characterLevel' | 'characterExp' | 'expToNext'>;

export interface ProbabilityBoost {
  diamondBoostPct: number;
  platinumBoostPct: number;
}

export const INITIAL_REWARD_PROFILE: RewardProfile = {
  adViewsDaily: 0,
  adViewsTotal: 0,
  consultCount: 0,
  characterLevel: 1,
  characterExp: 0,
  expToNext: 100,
  userRank: undefined,
};

export const INITIAL_PROBABILITY_BOOST: ProbabilityBoost = {
  diamondBoostPct: 0,
  platinumBoostPct: 0,
};

// ── 리워드 광고 (보상형 — 시청 시 포인트/티켓 지급) ──
export const REWARD_TICKET_AD_ID = import.meta.env.VITE_REWARD_TICKET_AD_ID || ''; // 광고 보고 티켓 받기
export const REWARD_AD_LONG = REWARD_TICKET_AD_ID;
export const REWARD_AD_SHORT = REWARD_TICKET_AD_ID;
export const GACHA_REWARDED_AD_ID = import.meta.env.VITE_GACHA_REWARDED_AD_ID || ''; // 가차 무료뽑기 광고
export const REWARD_AD_EXTRA = GACHA_REWARDED_AD_ID;

// ── 배너 광고 (eCPM) ──
export const BANNER_AD_TEXT_ID = import.meta.env.VITE_BANNER_AD_TEXT_ID || '';  // 문구형 배너
export const BANNER_AD_IMAGE_ID = import.meta.env.VITE_BANNER_AD_IMAGE_ID || ''; // 이미지형 배너

// ── 전면 광고 (인터스티셜) ──
export const HOME_TICKET_FULLSCREEN_AD_ID = import.meta.env.VITE_HOME_TICKET_FULLSCREEN_AD_ID || ''; // 홈 티켓 받기
export const GACHA_QUICK_FULLSCREEN_AD_ID = import.meta.env.VITE_GACHA_QUICK_FULLSCREEN_AD_ID || ''; // 가차 5초 전면
export const FULLSCREEN_AD_ID = HOME_TICKET_FULLSCREEN_AD_ID;
export const FULLSCREEN_AD_ID_2 = HOME_TICKET_FULLSCREEN_AD_ID;

// ── 하위 호환 alias ──
export const REWARD_AD_ID = REWARD_AD_LONG;
export const BANNER_AD_GROUP_ID = BANNER_AD_TEXT_ID;
export const BANNER_AD_PERSONA_ID = BANNER_AD_TEXT_ID;

/** 등록된 전체 광고 ID 목록 (디버깅용) */
export const ALL_AD_IDS = [
  REWARD_AD_LONG,
  REWARD_AD_SHORT,
  REWARD_AD_EXTRA,
  REWARD_TICKET_AD_ID,
  GACHA_REWARDED_AD_ID,
  BANNER_AD_TEXT_ID,
  BANNER_AD_IMAGE_ID,
  FULLSCREEN_AD_ID,
  FULLSCREEN_AD_ID_2,
  HOME_TICKET_FULLSCREEN_AD_ID,
  GACHA_QUICK_FULLSCREEN_AD_ID,
] as const;

// 전면형 광고 제한
export const INTERSTITIAL_COOLDOWN_MS = 0; // 쿨다운 없음
export const INTERSTITIAL_MAX_PER_SESSION = 999999;

// 앱 URL
export const APP_URL = import.meta.env.VITE_APP_URL || 'https://example.invalid';

// ── 카테고리 매핑 ──
export const MENU_CATEGORY_MAP: Record<HomeMenuKey, string[]> = {
  lotto: ['lotto', '로또', '번호'],
  fortune: ['fortune', '운세', '운명'],
  advice: ['advice', '조언', '상담'],
  love: ['love', '연애', '썸', '관계'],
};

// ── 기능 플래그 (Feature Flags) ──
export const FEATURE_FLAGS = {
  /** AI 상담(바로 조언 묻기) UI 노출 여부 */
  SHOW_QUICK_ASK: true,
};
