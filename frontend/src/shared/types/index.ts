export interface Persona {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category?: string;
  priority?: number;
  ctaCount?: number;
  recommendation?: string;
  isActive?: boolean;
  isNew?: boolean;
  isRecommended?: boolean;
  imageUrl?: string;
}

export interface PersonaGroup {
  category: string;
  label: string;
  personas: Persona[];
}

export interface Situation {
  id: string;
  title: string;
  category?: string;
  priority?: number;
  ctaCount?: number;
  recommendation?: string;
  isActive?: boolean;
  isRecommended?: boolean;
  icon?: string;
}

export type CardRarity = 'diamond' | 'platinum' | 'gold' | 'silver' | 'normal';

export interface GachaResult {
  type: 'quote' | 'lotto' | 'fortune';
  title: string;
  content: string;
  rarity?: CardRarity;
  score?: number;
  moral?: string; // 과거 저장 데이터 호환용(교훈 필드)
  persona?: string;
  fortune?: {
    score: number;
    description: string;
    details?: Record<string, { label: string; score: number } | number>;
    tarotCard?: string; 
    cardNameKo?: string; // [추가] 카드 한글명
    isUpright?: boolean; // [추가] 정방향 여부
  };
  share?: {
    title: string;
    description: string;
  };
  zodiacFortune?: ZodiacFortune; // 별자리 운세
  zodiacRanking?: { sign: string; rank: number; score: number }[]; // [추가] 별자리 순위 랭킹
  fontSize?: 'SMALL' | 'MEDIUM' | 'LARGE'; // [추가] 노안 배려용 폰트 크기 추천
  promotion?: PromotionReward; // [추가] 프로모션 보상 결과
  isTomorrow?: boolean; // [추가] 18시 이후 내일 운세 여부
  appliedBoost?: {
    diamondBoostPct?: number;
    platinumBoostPct?: number;
  };
  characterLevelSnapshot?: number;
  isPreview?: boolean; // [추가] 티켓 0개일 때 예시 결과 표시용
  needsLogin?: boolean; // [추가] 비로그인 상태에서 로그인 유도용
  isError?: boolean; // API 실패/로그인 필요 상태. 가짜 결과 카드 렌더 방지용
  errorMessage?: string;
  retryable?: boolean;
  detailedAnalysis?: DetailedAnalysis; // [추가] 광고 시청 후 상세 해석
}

/** 광고 시청 후 볼 수 있는 상세 결과 해석 */
export interface DetailedAnalysis {
  summary: string;           // 한 줄 요약
  interpretation: string;    // 본문 해석 (2~3문단)
  actionItems: string[];     // 실천 가이드 (3~5개)
  luckyTip?: string;         // 오늘의 행운 팁
  compatibility?: string;    // 궁합/상성 정보
}

export interface PromotionReward {
  amount: number;
  message: string;
}

export interface Promotion {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  linkUrl?: string;
  priority?: number;
  promotionCode?: string;
  goal?: number;
  current?: number;
  isCompleted?: boolean;
  isClaimed?: boolean;
  status?: 'PROGRESS' | 'COMPLETED' | 'CLAIMED';
  statusText?: string;
  isJackpot?: boolean;
  cashReward?: number;
}

export interface PromotionProgress {
  pullCount: number;
  attendanceCount: number;
  promotions: {
    [key: string]: {
      goal: number;
    };
  };
}

export interface ZodiacFortune {
  sign: string;
  summary: string;
  content?: string;
  quote?: string;
  score: number;
  luckyItems: {
    color: string;
    number: string;
    direction: string;
    food: string;
  };
  ratings: {
    love: { label: string; score: number } | number;
    wealth: { label: string; score: number } | number;
    business: { label: string; score: number } | number;
    health: { label: string; score: number } | number;
    exam: { label: string; score: number } | number;
    total: { label: string; score: number } | number;
  };
}

export interface ResultHistoryItem {
  id: string;
  summary: string;
  personaName?: string;
  situation?: string;
  title: string;
  content: string;
  timestamp: number;
  type?: 'quote' | 'lotto' | 'fortune';
  numbers?: number[];
  rarity?: CardRarity;
  score?: number;
  fortune?: GachaResult['fortune'];
  moral?: string;
  zodiacFortune?: ZodiacFortune;
  isTomorrow?: boolean;
  appliedBoost?: {
    diamondBoostPct?: number;
    platinumBoostPct?: number;
  };
  characterLevelSnapshot?: number;
  detailedAnalysis?: DetailedAnalysis; // [추가] 광고 시청 후 상세 해석
}

export interface RankingEntry {
  userKey: string;
  nickname: string;
  score: number;
  rank: number;
  rewardScore?: number;
  adViewsTotal?: number;
  consultCount?: number;
  isMe?: boolean;
}

export type RankingPeriod = 'daily' | 'weekly' | 'monthly';

// Personalized Ranking Types
export interface PersonaRanking {
  personaId: string;
  personaName: string;
  data: RankingEntry[];
  myRank: RankingEntry | null;
}

export interface RankingCategory {
  data: RankingEntry[];
  myRank: RankingEntry | null;
}

export interface PersonalizedRankingData {
  rankings: {
    global: RankingCategory;
    byAge: RankingCategory;
    byGender: RankingCategory;
    byPersona: PersonaRanking[];
  };
  recommendations: {
    message: string;
    personas: string[];
    situations: string[];
  };
}

export interface PersonalizedRankingResponse {
  resultType: 'SUCCESS' | 'FAILURE';
  data: PersonalizedRankingData;
  error?: string;
}

export interface RecommendedPersona {
  personaId: string;
  personaName: string;
  reason: string;
  usageCount: number;
}

export interface RecommendedPersonasResponse {
  resultType: 'SUCCESS' | 'FAILURE';
  data: RecommendedPersona[];
}

export interface ActivitySummary {
  totalPulls: number;
  totalScore: number;
  favoritePersona: string;
  luckyScore: number;
  recentActivity: {
    date: string;
    pulls: number;
  }[];
}

export interface ActivitySummaryResponse {
  resultType: 'SUCCESS' | 'FAILURE';
  data: ActivitySummary;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  status?: 'sending' | 'sent' | 'failed';
}

export interface ChatSession {
  id: string;
  personaId: string;
  personaName?: string;
  personaIcon?: string;
  title: string;
  preview: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  messageCount?: number;
}
