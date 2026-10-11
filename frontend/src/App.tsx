import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { getStorageUrl } from './shared/utils/storage';
import { IS_PUBLIC_BROWSER } from './public-browser/config';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { performTossLogin, isTossLoggedIn, getTossSavedUserKey, getTossSavedUserName, getTossSavedUserBirthday, getTossSavedUserGender, getTossSavedUserAgeGroup, getZodiacSign, clearTossSession, disconnectTossLogin, ensureFreshToken } from './toss-auth';
import { share, IAP, getTossShareLink, closeView, graniteEvent, contactsViral } from '@apps-in-toss/web-framework';
import { logClick, logErrorToBackend, logGachaPersonaSelect, logGachaSituationSelect, logGachaAnimationStart, logGachaResultView, logGachaRetry, logShareMethod } from './utils/analytics';
import { triggerSmartMessage, MESSENGER_TEMPLATES } from './shared/utils/messenger';
import { useAppHistory } from './hooks/useAppHistory';
import { useRewardSync } from './hooks/useRewardSync';
import { useAdSystem } from './hooks/useAdSystem';
import { useAnalytics } from './hooks/useAnalytics';
import { BottomNavigation } from './shared/components/BottomNavigation';
import { Button, LoginGateCard, PageLoader, Sheet, useModal } from './shared/components/ui';
import type { HomeMenuKey } from './shared/constants/app';
import { MENU_CATEGORY_MAP, GACHA_REWARDED_AD_ID, FEATURE_FLAGS } from './shared/constants/app';
import { POINT_CONVERT_COST, REWARD_POINT_LIMITS, clampRewardPoints } from './shared/constants/rewardEconomy';
import { apiUrl } from './shared/api/client';
import type { RankingServiceKey } from './features/ranking/services/rankingService';
import type { ActiveTab } from './shared/types/navigation';
import { TAB_KEYS, isActiveTab, isRootLocation, parseDeepLink } from './shared/types/navigation';
// 홈 화면(LandingView)은 첫 진입 시 즉시 필요하므로 eager import 유지
import { LandingView } from './features/home/components/LandingView';
// 나머지 feature 페이지는 lazy load (코드 스플리팅)
const HistoryDetailPage = lazy(() => import('./features/history/components/HistoryDetailPage').then(m => ({ default: m.HistoryDetailPage })));
const HistoryList = lazy(() => import('./features/history/components/HistoryList').then(m => ({ default: m.HistoryList })));
const RewardList = lazy(() => import('./features/home/components/RewardList').then(m => ({ default: m.RewardList })));
const QuoteChooseView = lazy(() => import('./features/home/components/QuoteChooseView').then(m => ({ default: m.QuoteChooseView })));
const QuoteResultView = lazy(() => import('./features/home/components/QuoteResultView').then(m => ({ default: m.QuoteResultView })));
const FortuneResultView = lazy(() => import('./features/home/components/FortuneResultView').then(m => ({ default: m.FortuneResultView })));
const SettingsPage = lazy(() => import('./features/settings/components/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ScratchLotteryPage = lazy(() => import('./features/reward/components/ScratchLotteryPage').then(m => ({ default: m.ScratchLotteryPage })));
const RewardGachaPage = lazy(() => import('./features/reward/components/RewardGachaPage').then(m => ({ default: m.RewardGachaPage })));
const LottoMachinePage = lazy(() => import('./features/home/components/LottoMachinePage').then(m => ({ default: m.LottoMachinePage })));
const RewardQuizPage = lazy(() => import('./features/reward/components/RewardQuizPage').then(m => ({ default: m.RewardQuizPage })));
const RoulettePage = lazy(() => import('./features/reward/components/RoulettePage').then(m => ({ default: m.RoulettePage })));
const TalismanPage = lazy(() => import('./features/home/components/TalismanPage').then(m => ({ default: m.TalismanPage })));
const CrosswordGame = lazy(() => import('./features/reward/components/CrosswordGame').then(m => ({ default: m.CrosswordGame })));
const IdiomQuizPage = lazy(() => import('./features/reward/components/IdiomQuizPage').then(m => ({ default: m.IdiomQuizPage })));
const AskView = lazy(() => import('./features/ask/components/AskView').then(m => ({ default: m.AskView })));
const ChatRoomView = lazy(() => import('./features/ask/components/ChatRoomView').then(m => ({ default: m.ChatRoomView })));
const RankingPage = lazy(() => import('./features/ranking/components/RankingPage').then(m => ({ default: m.RankingPage })));
const MyPage = lazy(() => import('./features/mypage/components/MyPage').then(m => ({ default: m.MyPage })));
const DetailedAnalysisPage = lazy(() => import('./features/history/components/DetailedAnalysisPage').then(m => ({ default: m.DetailedAnalysisPage })));
import { PERSONAS } from './shared/constants/personas';
import { DEFAULT_SITUATIONS, RECOMMENDED_SITUATIONS, AGE_SPECIFIC_SITUATIONS } from './shared/constants/situations';
import { NavAccessoryContext } from './contexts/NavAccessoryContext';
import type { Persona, Situation, GachaResult, ResultHistoryItem, ZodiacFortune, Promotion, DetailedAnalysis, ChatMessage, ChatSession, CardRarity } from './shared/types';
import { getVisibleCounselorPersonas, sortPersonasForDisplay } from './shared/utils/personaFilters';

const TODAY_TOTAL_FORTUNE_OPTION = {
  id: 'total',
  name: '전체운세',
  tickets: 1,
} as const;

const FORTUNE_OPTION_NAMES = {
  total: '전체운세',
  love: '연애운',
  business: '사업운',
  wealth: '재물운',
  health: '건강운',
  exam: '학업/시험',
} as const;

type FortuneOptionId = keyof typeof FORTUNE_OPTION_NAMES;
const HISTORY_STORAGE_KEY = IS_PUBLIC_BROWSER ? 'gacha_public_original_history_v1' : 'gacha_history';

const toFortuneOption = (id: string = 'total') => {
  const safeId = Object.prototype.hasOwnProperty.call(FORTUNE_OPTION_NAMES, id)
    ? id as FortuneOptionId
    : 'total';

  return {
    id: safeId,
    name: FORTUNE_OPTION_NAMES[safeId],
    tickets: 1,
  };
};

const resolveFortuneOption = (result: GachaResult | null, selectionSummary: string) => {
  const category = (result?.zodiacFortune as (ZodiacFortune & { category?: string }) | undefined)?.category;
  if (category) return toFortuneOption(category);

  const matched = Object.entries(FORTUNE_OPTION_NAMES)
    .find(([, name]) => selectionSummary.includes(name));

  return toFortuneOption(matched?.[0] ?? 'total');
};

const RARITY_KEYS: CardRarity[] = ['diamond', 'platinum', 'gold', 'silver', 'normal'];

const RANKING_SERVICE_TARGETS: Record<RankingServiceKey, ActiveTab> = {
  fortune_total: 'fortune',
  ask_chat: 'ask',
  reward_gacha: 'reward-gacha',
  scratch_lottery: 'scratch-lottery',
  reward_quiz: 'reward-quiz',
  idiom_quiz: 'idiom-quiz',
  crossword: 'crossword',
  roulette: 'roulette',
  lotto: 'lotto',
};

const normalizeCardRarity = (value: unknown): CardRarity | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.toLowerCase();
  return RARITY_KEYS.includes(normalized as CardRarity) ? normalized as CardRarity : null;
};

type PendingAction =
  | { type: 'quickAsk'; question: string }
  | {
    type: 'nav';
    tab: ActiveTab;
    step?: 'landing' | 'choose' | 'result';
    chooseStep?: 1 | 2 | 3;
  };

function App() {

  // [Performance] 이미지 프리로딩

  // Safe environment variable access
  const env = useMemo(() => ({ DEV: import.meta.env.DEV && !IS_PUBLIC_BROWSER }), []);
  const APP_URL = import.meta.env.VITE_APP_URL || 'https://example.invalid';

  const [result, setResult] = useState<GachaResult | null>(() => {
    if (typeof window !== 'undefined' && window.history.state?.result) {
      return window.history.state.result;
    }
    return null;
  });
  const [isSpinning, setIsSpinning] = useState(false);
  const [drawCount, setDrawCount] = useState<number>(() => {
    if (typeof localStorage === 'undefined') return 0;
    const saved = localStorage.getItem('drawCount');
    return saved ? parseInt(saved, 10) : 0;
  });

  // ── Reward Sync Hook ──
  const {
    userPoints, setUserPoints, updateUserPoints,
    rewardProfile, setRewardProfile, updateRewardProfile,
    personaRewardProfiles, setPersonaRewardProfiles, updatePersonaRewardProfile,
    getPersonaRewardProfile,
    probabilityBoost, setProbabilityBoost,
    consecutiveDays, setConsecutiveDays,
    syncRewardProfileFromPayload,
    syncDailyProgressFromPayload,
    fetchRewardProfile,
    fetchRewardDailyProgress,
    fetchRewardHistory,
    fetchProbabilityBoost,
  } = useRewardSync();

  const [step, setStep] = useState<'landing' | 'choose' | 'result'>(() => {
    if (typeof window !== 'undefined' && window.history.state?.step) {
      return window.history.state.step;
    }
    return 'landing';
  });
  // [Fix] 결과 화면에서 뒤로가기 시 데이터 유실 방지 및 흰 화면 보정
  useEffect(() => {
    if (step === 'result' && !result && !isSpinning) {
      console.warn('[App] Result data missing on result stage. Redirecting to landing.');
      setStep('landing');
    }
  }, [step, result, isSpinning]);

  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window !== 'undefined') {
      const target = parseDeepLink(window.location);
      if (target?.tab) return target.tab;
    }
    if (typeof window !== 'undefined' && window.history.state?.activeTab) {
      const savedTab = window.history.state.activeTab;
      if (savedTab === 'ask' || savedTab === 'ask-chat') return savedTab;
      if (isActiveTab(savedTab)) return savedTab;
    }
    return 'home';
  });
  const [personas, setPersonas] = useState<Persona[]>(() =>
    sortPersonasForDisplay(getVisibleCounselorPersonas(PERSONAS))
  );
  const [situations, setSituations] = useState<Situation[]>(DEFAULT_SITUATIONS);
  const [tossUserKey, setTossUserKey] = useState<string | number | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [tossUserGender, setTossUserGender] = useState<string | null>(null);
  const [tossUserBirthday, setTossUserBirthday] = useState<string | null>(null);
  const [tossUserAgeGroup, setTossUserAgeGroup] = useState<number | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isWelcomeSheetOpen, setIsWelcomeSheetOpen] = useState(false);
  const [activeChatSession, setActiveChatSession] = useState<{
    persona: Persona;
    chatId: string | null;
    initialMessages: ChatMessage[];
  } | null>(null);
  const [selectedRankingService, setSelectedRankingService] = useState<RankingServiceKey>('fortune_total');
  const fortuneAutoRequestRef = useRef(false);
  const pendingActionRef = useRef<PendingAction | null>(null);

  // [Performance] 이미지 프리로딩
  useEffect(() => {
    if (typeof window === 'undefined' || typeof Image === 'undefined') return;

    const baseImages = [
      getStorageUrl('images/ui/gacha_logo.png'),
      getStorageUrl('images/ui/box-blue.svg'),
      getStorageUrl('images/ui/star-premium.png'),
      getStorageUrl('images/ui/box-premium.png'),
      getStorageUrl('images/personas/digital.png'),
      getStorageUrl('images/personas/writer.png'),
      getStorageUrl('images/personas/musician.png'),
    ];

    // DB API에서 가져온 페르소나 이미지 추가
    const personaImages = personas
      .map(p => p.imageUrl || (p.icon && (p.icon.endsWith('.png') || p.icon.endsWith('.jpg') || p.icon.endsWith('.svg')) ? getStorageUrl(`images/personas/${p.icon}`) : null))
      .filter((src): src is string => !!src);

    const imagesToPreload = [...new Set([...baseImages, ...personaImages])];

    imagesToPreload.forEach(src => {
      const img = new Image();
      img.src = src;
    });
  }, [personas]);

  const [chooseStep, setChooseStep] = useState<1 | 2 | 3>(() => {
    if (typeof window !== 'undefined' && window.history.state?.chooseStep) {
      return window.history.state.chooseStep;
    }
    return 1;
  });
  const [isQuickMode, setIsQuickMode] = useState(false);

  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.history.state?.selectedPersonaId) {
      return window.history.state.selectedPersonaId;
    }
    return '';
  });
  const [selectedSituation, setSelectedSituation] = useState(() => {
    if (typeof window !== 'undefined' && window.history.state?.selectedSituation) {
      return window.history.state.selectedSituation;
    }
    return '';
  });
  const [situationQuery, setSituationQuery] = useState('');
  const [situationError, setSituationError] = useState<string | null>(null);
  const [selectedHomeMenu, setSelectedHomeMenu] = useState<HomeMenuKey | null>(() => {
    try {
      const saved = sessionStorage.getItem('selectedHomeMenu');
      if (saved && ['lotto', 'fortune', 'advice', 'love'].includes(saved)) {
        return saved as HomeMenuKey;
      }
    } catch { /* ignore */ }
    return null;
  });

  const [isSituationsExpanded, setIsSituationsExpanded] = useState(() => {
    if (typeof window !== 'undefined' && window.history.state?.isSituationsExpanded) {
      return window.history.state.isSituationsExpanded;
    }
    return false;
  });
  const [isPersonasExpanded, setIsPersonasExpanded] = useState(() => {
    if (typeof window !== 'undefined' && window.history.state?.isPersonasExpanded) {
      return window.history.state.isPersonasExpanded;
    }
    return false;
  });
  const [recommendedPersonas, setRecommendedPersonas] = useState<Persona[]>(() =>
    getVisibleCounselorPersonas(PERSONAS).filter(p => p.isRecommended)
  );
  // 그룹 해제 시 원래 추천 목록으로 복원하기 위한 기준값
  const baseRecommendedPersonasRef = useRef<Persona[]>(
    getVisibleCounselorPersonas(PERSONAS).filter(p => p.isRecommended)
  );

  // 선택된 홈 메뉴 카테고리에 따라 페르소나 필터링
  const filteredPersonas = useMemo(() => {
    if (!selectedHomeMenu) return personas;
    const keywords = MENU_CATEGORY_MAP[selectedHomeMenu];
    const matched = personas.filter(p => {
      const cat = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      const desc = (p.desc || '').toLowerCase();
      return keywords.some(kw => cat.includes(kw) || name.includes(kw) || desc.includes(kw));
    });
    return matched.length > 0 ? matched : personas;
  }, [personas, selectedHomeMenu]);

  const filteredRecommendedPersonas = useMemo(() => {
    if (!selectedHomeMenu) return recommendedPersonas;
    const keywords = MENU_CATEGORY_MAP[selectedHomeMenu];
    const matched = recommendedPersonas.filter(p => {
      const cat = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      const desc = (p.desc || '').toLowerCase();
      return keywords.some(kw => cat.includes(kw) || name.includes(kw) || desc.includes(kw));
    });
    return matched.length > 0 ? matched : recommendedPersonas;
  }, [recommendedPersonas, selectedHomeMenu]);

  // [New] API에서 페르소나 목록 가져오기 (전체 페르소나 - V2)
  useEffect(() => {
    const fetchDBPersonas = async () => {
      try {
        // V2 API 사용: 전체 페르소나 목록 (discover 엔드포인트)
        const response = await fetch(apiUrl('/discover/personas'));
        const result = await response.json();

        if (result.resultType === 'SUCCESS' && Array.isArray(result.data)) {
          const dbPersonas: Persona[] = result.data.map((p: any) => ({
            ...p,
            // icon이 전체 URL이면 그대로, 파일명이면 imageUrl로 설정
            imageUrl: p.icon && p.icon.startsWith('http') ? p.icon : undefined,
            icon: p.icon && !p.icon.startsWith('http') ? p.icon : undefined
          }));

          // 정렬 로직 적용
          const sortedPersonas = sortPersonasForDisplay(getVisibleCounselorPersonas(dbPersonas));

          setPersonas(sortedPersonas);
          const baseRecs = sortedPersonas.filter(p => p.isRecommended);
          setRecommendedPersonas(baseRecs);
          baseRecommendedPersonasRef.current = baseRecs;
          console.log('✅ Loaded ALL personas from V2 API:', sortedPersonas.length);
        }
      } catch (error) {
        console.error('❌ Failed to fetch personas from V2 API:', error);
        // Fallback: 로컬 하드코딩된 페르소나 사용
        console.log('Using fallback personas from PERSONAS constant');
      }
    };

    fetchDBPersonas();
  }, []);

  // ── selectedHomeMenu 변경 시 sessionStorage에 동기화 ──
  useEffect(() => {
    try {
      if (selectedHomeMenu) {
        sessionStorage.setItem('selectedHomeMenu', selectedHomeMenu);
      } else {
        sessionStorage.removeItem('selectedHomeMenu');
      }
    } catch { /* ignore */ }
  }, [selectedHomeMenu]);

  // ── 새로고침 시 selectedHomeMenu가 복원되면 그룹별 데이터 re-fetch ──
  useEffect(() => {
    if (!selectedHomeMenu) return;

    const refetchGroupData = async () => {
      const menuKeywordMap: Record<HomeMenuKey, string[]> = {
        lotto: ['lotto', '로또', '번호'],
        fortune: ['fortune', '운세', '운명'],
        advice: ['advice', '조언', '상담'],
        love: ['love', '연애', '썸', '관계']
      };

      try {
        const response = await fetch(apiUrl('/discover/situations', { query: { group: selectedHomeMenu } }));
        const json = await response.json();
        if (response.ok && (!json.resultType || json.resultType === 'SUCCESS')) {
          const data = json.data || json.success || json;
          let apiSituations: Situation[] = [];
          if (Array.isArray(data)) apiSituations = data;
          else if (Array.isArray(data?.[selectedHomeMenu])) apiSituations = data[selectedHomeMenu];
          else if (Array.isArray(data?.situations)) apiSituations = data.situations;
          else if (Array.isArray(json?.[selectedHomeMenu])) apiSituations = json[selectedHomeMenu];

          const keywords = menuKeywordMap[selectedHomeMenu];
          const filtered = apiSituations.filter(s => {
            const title = (s.title || '').toLowerCase();
            const category = (s.category || '').toLowerCase();
            return keywords.some(kw => title.includes(kw) || category.includes(kw));
          });
          const grouped = filtered.length > 0 ? filtered : apiSituations;
          if (grouped.length > 0) {
            setSituations(grouped);
            setRecommendedSituations(grouped.slice(0, 6));
          }
        }
      } catch (e) {
        console.error('[Refresh] Failed to re-fetch grouped situations:', e);
      }

      try {
        const pRes = await fetch(apiUrl('/discover/personas', { query: { group: selectedHomeMenu } }));
        const pJson = await pRes.json();
        if (pRes.ok && (!pJson.resultType || pJson.resultType === 'SUCCESS')) {
          const recs: any[] = pJson.recommendations?.length > 0
            ? pJson.recommendations
            : (pJson.data || []).filter((p: any) => p.isRecommended);
          if (recs.length > 0) {
            setRecommendedPersonas(getVisibleCounselorPersonas(recs.map((p: any) => ({
              ...p,
              desc: p.desc || p.description || '',
              imageUrl: p.icon && p.icon.startsWith('http') ? p.icon : p.imageUrl,
            }))));
          }
        }
      } catch (e) {
        console.error('[Refresh] Failed to re-fetch grouped personas:', e);
      }
    };

    refetchGroupData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 마운트 시 1회만 실행 (selectedHomeMenu 초기값이 복원된 경우)

  const [recommendedSituations, setRecommendedSituations] = useState<Situation[]>(RECOMMENDED_SITUATIONS);
  const [resultHistory, setResultHistory] = useState<ResultHistoryItem[]>(() => {
    if (typeof localStorage === 'undefined') return [];
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed)) return [];

      return parsed.map((item: any) => ({
        ...item,
        id: item.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)),
        timestamp: item.timestamp || Date.now()
      }));
    } catch (e) {
      console.error('Failed to load history:', e);
      return [];
    }
  });
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && window.history.state?.selectedHistoryId) {
      return window.history.state.selectedHistoryId;
    }
    return null;
  });
  const [selectedHistoryDetailItem, setSelectedHistoryDetailItem] = useState<ResultHistoryItem | null>(null);

  const [selectionSummary, setSelectionSummary] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.history.state?.selectionSummary) {
      return window.history.state.selectionSummary;
    }
    return '';
  });
  const [isTicketSheetOpen, setIsTicketSheetOpen] = useState(false);
  const [pendingShareRewardAmount, setPendingShareRewardAmount] = useState<number>(0);
  const [pendingPromoCode, setPendingPromoCode] = useState<string | null>(null);
  const [ageGroup, setAgeGroup] = useState<number>(20);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
  const [analysisPageData, setAnalysisPageData] = useState<{ analysis: DetailedAnalysis; title?: string; persona?: string; from: 'home' | 'history-detail' } | null>(null);
  // 프로모션 목록은 백엔드 동기화/머지에만 쓰여요(현재 UI 소비처 없음 — 값은 읽지 않아요).
  const [, setActivePromotions] = useState<Promotion[]>([]);
  const { showAlert, showConfirm, showModal } = useModal();

  // 재시도 로직을 위한 유틸리티 함수
  const fetchWithRetry = useCallback(async (
    url: string,
    options: RequestInit,
    maxRetries: number = 3,
    retryDelay: number = 1000
  ): Promise<Response> => {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`API 호출 시도 ${attempt}/${maxRetries}...`);
        const response = await fetch(url, options);
        if (response.ok || response.status === 403) return response;
        if (response.status >= 500 || response.status === 0) throw new Error(`서버 오류 (${response.status})`);
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('알 수 없는 오류');
        console.error(`시도 ${attempt} 실패:`, lastError.message);
        if (attempt < maxRetries) {
          const waitTime = retryDelay * attempt;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    throw lastError || new Error('API 호출 실패');
  }, []);

  // [New] 티켓 및 포인트 정보를 서버에서 가져와 동기화
  const fetchUserStatus = useCallback(async (userKey: string | number) => {
    try {
      console.log(`[Sync] Fetching status for user: ${userKey}`);
      const res = await fetch(apiUrl('/user/status', { query: { userKey } }));
      if (res.ok) {
        const json = await res.json();
        const data = json.data || json.success || json;

        // 티켓 수량 업데이트
        const serverTickets = data.tickets ?? data.ticketCount ?? json.tickets;
        const numTickets = Number(serverTickets);
        if (!isNaN(numTickets) && serverTickets !== undefined) {
          setDrawCount(numTickets);
          localStorage.setItem('drawCount', numTickets.toString());
        }

        // 포인트 수량 업데이트
        const serverPoints = data.points ?? data.pointCount ?? json.points;
        const numPoints = Number(serverPoints);
        if (!isNaN(numPoints) && serverPoints !== undefined) {
          if (typeof window !== 'undefined') {
            const payloadSnapshot = {
              source: 'fetchUserStatus',
              at: new Date().toISOString(),
              payload: {
                points: data.points,
                pointCount: data.pointCount,
                balancePoints: data.balancePoints,
                currentPoints: data.currentPoints,
                totalPoints: data.totalPoints,
                jsonPoints: json.points,
              },
            };
            window.sessionStorage.setItem('last_user_points_payload', JSON.stringify(payloadSnapshot));
            console.log('[PointsTrace] userPoints payload', payloadSnapshot);
          }
          updateUserPoints(numPoints, 'fetchUserStatus');
        }

        // [Fix] 백엔드에서 복호화된 nickname을 userName으로 사용
        const serverNickname = data.nickname ?? data.name ?? data.userName;
        if (typeof serverNickname === 'string' && serverNickname.length > 0) {
          // 한글이 포함된 정상적인 이름인지 확인 (암호화 문자열 방지)
          const isValidName = /[가-힣]/.test(serverNickname) || serverNickname.length <= 10;
          if (isValidName) {
            setUserName(serverNickname);
            window.sessionStorage.setItem('toss_user_name', serverNickname);
          }
        }

        updateRewardProfile({
          adViewsDaily: Number(data.adViewsDaily ?? 0),
          adViewsTotal: Number(data.adViewsTotal ?? 0),
          characterLevel: Number(data.characterLevel ?? 1),
          characterExp: Number(data.characterExp ?? 0),
          expToNext: Number(data.expToNext ?? 100),
        });

        if (data.consecutiveLoginDays !== undefined) {
          setConsecutiveDays(Number(data.consecutiveLoginDays));
        } else if (env.DEV) {
          setConsecutiveDays(7);
        }
      }
    } catch (e) {
      console.error('[Sync] Failed to sync status:', e);
    }
  }, [env.DEV]);

  // 구버전 호환성을 위해 fetchUserTickets를 fetchUserStatus로 연결
  const fetchUserTickets = useCallback(async (userKey: string | number) => {
    return fetchUserStatus(userKey);
  }, [fetchUserStatus]);

  // [New] 프로모션 정보 가져오기
  const fetchPromotions = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/promotion/list'));
      if (res.ok) {
        const json = await res.json();
        if (json.resultType === 'SUCCESS' && Array.isArray(json.data)) {
          setActivePromotions(json.data);
          console.log('Promotions loaded:', json.data.length);
        } else {
          setActivePromotions([]);
        }
      } else if (env.DEV) {
        // Mock promotions for dev
        setActivePromotions([
          {
            id: 'promo-1',
            title: '친구 초대 이벤트',
            description: '친구를 초대하고 이용권 5장을 더 받으세요',
            imageUrl: 'images/ui/star-premium.png',
            linkUrl: 'intoss://gacha?tab=history',
            priority: 1
          }
        ]);
      }
    } catch (e) {
      console.error('Failed to fetch promotions:', e);
    }
  }, [env.DEV]);

  useEffect(() => {
    fetchPromotions();
  }, [fetchPromotions]);


  const alert = useCallback((config: { title: string; description: string }) => {
    showAlert(config);
  }, [showAlert]);

  const confirm = useCallback((config: {
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  }) => {
    showConfirm(config);
  }, [showConfirm]);

  const restoreAppHistoryState = useCallback(() => {
    window.history.pushState({
      step,
      activeTab,
      chooseStep,
      isSituationsExpanded,
      isPersonasExpanded,
      selectedHistoryId,
      selectedPersonaId,
      selectedSituation,
      situationQuery,
      result,
      selectionSummary,
    }, '');
  }, [
    activeTab,
    chooseStep,
    isPersonasExpanded,
    isSituationsExpanded,
    result,
    selectedHistoryId,
    selectedPersonaId,
    selectedSituation,
    selectionSummary,
    situationQuery,
    step,
  ]);

  const updateDrawCount = useCallback((newCountOrFn: number | ((prev: number) => number)) => {
    if (IS_PUBLIC_BROWSER) return;
    setDrawCount((prev: number) => {
      const next = typeof newCountOrFn === 'function' ? newCountOrFn(prev) : newCountOrFn;
      // 로컬 스토리지 업데이트 (백업용)
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('drawCount', next.toString());
      }
      return next;
    });
  }, []);

  const rewardLevelsByPersona = useMemo(() => (
    Object.fromEntries(
      Object.entries(personaRewardProfiles).map(([personaId, profile]) => [personaId, profile.characterLevel])
    )
  ), [personaRewardProfiles]);


  // ── Ad System Hook ──
  const { isAdLoading, adLoadError, handleWatchAd, showInterstitialAd, showGachaInterstitialAd, showGachaRewardedAd } = useAdSystem({
    tossUserKey,
    rewardProfile,
    updateRewardProfile,
    updateUserPoints,
    syncRewardProfileFromPayload,
    syncDailyProgressFromPayload,
    setDrawCount,
    alert,
  });

  // ── Analytics Hook ── 세션/페이지뷰/유저속성 자동 트래킹
  useAnalytics({
    activeTab,
    step,
    tossUserKey,
    drawCount,
    userPoints,
    consecutiveDays,
    tossUserGender,
    tossUserAgeGroup,
    tossUserBirthday,
  });

  const isLoggedIn = Boolean(tossUserKey);
  const canUseContent = isLoggedIn || IS_PUBLIC_BROWSER;

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);

    // Reset step to landing when switching tabs unless we are in result
    if (step === 'choose') {
      setStep('landing');
      setChooseStep(1);
      setSelectedHomeMenu(null);
      // 그룹 해제 시 기본 추천 조언가로 복원
      setRecommendedPersonas(baseRecommendedPersonasRef.current);
      setIsSituationsExpanded(false);
      setIsPersonasExpanded(false);
    }

    // [FIX] 탭 전환 시 전면형 광고 제거 — 탭바는 유저가 수시로 사용하는 핵심 내비게이션이므로
    // 예측 불가능한 시점에 광고가 노출되어 UX를 저해함 (Android/iOS 공통 이슈)
  }, [step]);

  const goHomeLanding = useCallback(() => {
    setActiveTab('home');
    setStep('landing');
    setChooseStep(1);
    setSelectedHomeMenu(null);
    setIsQuickMode(false);
    setRecommendedPersonas(baseRecommendedPersonasRef.current);
    setIsSituationsExpanded(false);
    setIsPersonasExpanded(false);
  }, []);

  const startQuickAskFlow = useCallback((question: string) => {
    setSituationQuery(question);
    setSelectedSituation(question);
    setSelectedPersonaId('');
    setSelectedHomeMenu(null);
    setRecommendedPersonas(baseRecommendedPersonasRef.current);
    setIsQuickMode(true);
    setSituationError(null);
    setIsSituationsExpanded(false);
    setIsPersonasExpanded(false);
    setChooseStep(2);
    setStep('choose');
    setActiveTab('home');
  }, []);

  const createChatMessageId = () => (
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );

  const handleSaveChat = useCallback((session: ChatSession) => {
    try {
      const raw = localStorage.getItem('gacha_chat_sessions');
      const saved = raw ? JSON.parse(raw) : [];
      const previous = Array.isArray(saved) ? saved as ChatSession[] : [];
      const next = [session, ...previous.filter(item => item.id !== session.id)].slice(0, 30);
      localStorage.setItem('gacha_chat_sessions', JSON.stringify(next));
    } catch (error) {
      console.error('[Chat] Failed to save chat session locally:', error);
    }
  }, []);


  async function handleTossLogin() {
    if (IS_PUBLIC_BROWSER) {
      pendingActionRef.current = null;
      alert({ title: '웹 체험 안내', description: '토스 로그인과 실제 포인트·광고 보상은 이 웹 체험에 연결되어 있지 않습니다.' });
      return;
    }

    logClick('login_button');
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const userInfo = await performTossLogin();
      if (userInfo) {
        const stringKey = String(userInfo.userKey);
        // [Fix] 복호화된 이름만 사용 (암호화 문자열은 빈값 처리)
        if (userInfo.name) {
          const isValidName = /[가-힣]/.test(userInfo.name) || userInfo.name.length <= 10;
          if (isValidName) {
            setUserName(userInfo.name);
          } else {
            console.warn('[Login] Name appears encrypted, skipping:', userInfo.name.substring(0, 8) + '...');
          }
        }
        if (userInfo.gender) setTossUserGender(userInfo.gender);
        if (userInfo.birthday) {
          setTossUserBirthday(userInfo.birthday);
          // 연령대 계산
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
        console.log('Toss 로그인 성공(User Info):', userInfo);

        // [New] 백엔드 서버에 유저 정보 동기화 및 DB 저장 유도
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

          // [Fix] 로그인이 성공했을 때 티켓 정보를 즉시 가져와서 반영
          await fetchUserTickets(stringKey);
          await fetchRewardProfile(stringKey);
          await fetchRewardDailyProgress(stringKey);
          await fetchRewardHistory(stringKey);
          await fetchProbabilityBoost(stringKey);

        } catch (syncError) {
          console.error('Backend user sync failed:', syncError);
        }

        setTossUserKey(stringKey);

        if (typeof window !== 'undefined' && !localStorage.getItem('gacha_login_welcome_seen')) {
          localStorage.setItem('gacha_login_welcome_seen', '1');
          setIsWelcomeSheetOpen(true);
        }

        // [Fix] 비로그인 미리보기 결과에서 로그인한 경우 → 홈으로 이동
        if (result?.needsLogin) {
          setResult(null);
          setStep('landing');
        }

        const pendingAction = pendingActionRef.current;
        pendingActionRef.current = null;
        if (pendingAction) {
          if (pendingAction.type === 'quickAsk') {
            startQuickAskFlow(pendingAction.question);
          } else {
            if (pendingAction.step) setStep(pendingAction.step);
            if (pendingAction.chooseStep) setChooseStep(pendingAction.chooseStep);
            setActiveTab(pendingAction.tab);
          }
        }
      } else {
        setLoginError('토큰을 발급하지 못했어요. (콘솔 로그를 확인해 주세요)');
      }
    } catch (error) {
      console.error('Toss 로그인 실패:', error);
      const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      const hint = message.includes('NETWORK_ERROR')
        ? '네트워크 오류: 토큰 발급 API가 차단되었을 수 있습니다. 서버 프록시가 필요합니다.'
        : null;
      setLoginError(hint ? `${message} · ${hint}` : `로그인하지 못했어요: ${message}`);
    } finally {
      setIsLoggingIn(false);
    }
  }

  const openAskHome = useCallback(() => {
    if (!tossUserKey && !IS_PUBLIC_BROWSER) {
      pendingActionRef.current = { type: 'nav', tab: 'ask', step: 'landing' };
      void handleTossLogin();
      return;
    }
    setActiveTab('ask');
    setStep('landing');
    setChooseStep(1);
    setSelectedHomeMenu(null);
    setIsQuickMode(false);
  }, [tossUserKey, handleTossLogin]);

  const handleStartChat = useCallback((persona: Persona, query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    if (!tossUserKey && !IS_PUBLIC_BROWSER) {
      pendingActionRef.current = { type: 'nav', tab: 'ask', step: 'landing' };
      void handleTossLogin();
      return;
    }

    if (drawCount <= 0 && !IS_PUBLIC_BROWSER) {
      alert({
        title: '이용권이 필요해요',
        description: '상담을 시작하려면 이용권 1장이 필요해요.',
      });
      setIsTicketSheetOpen(true);
      return;
    }

    const initialMessage: ChatMessage = {
      id: createChatMessageId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    setActiveChatSession({
      persona,
      chatId: null,
      initialMessages: [initialMessage],
    });
    setActiveTab('ask-chat');
    setStep('landing');
    logClick('ask_start_chat', {
      persona_id: persona.id,
      persona_name: persona.name,
    });
  }, [alert, drawCount, tossUserKey, handleTossLogin]);

  const handleResumeChat = useCallback((session: ChatSession) => {
    const persona = personas.find(p => p.id === session.personaId) || {
      id: session.personaId,
      name: session.personaName || '상담가',
      desc: '지난 상담을 이어갈 수 있어요.',
      icon: session.personaIcon || '',
    };

    setActiveChatSession({
      persona,
      chatId: session.id,
      initialMessages: session.messages || [],
    });
    setActiveTab('ask-chat');
    setStep('landing');
    logClick('ask_resume_chat', {
      chat_id: session.id,
      persona_id: session.personaId,
    });
  }, [personas]);

  const handleLogout = async () => {
    // 0. 토스 연결 끊기 (실패해도 로그아웃 진행)
    try {
      await disconnectTossLogin();
    } catch (err) {
      console.error('Logout: disconnect failed', err);
    }

    // 1. 상태 초기화
    setTossUserKey(null);
    setResultHistory([]);
    setDrawCount(0);
    setUserPoints(0);
    setRewardProfile({
      adViewsDaily: 0,
      adViewsTotal: 0,
      consultCount: 0,
      characterLevel: 1,
      characterExp: 0,
      expToNext: 100,
    });
    setPersonaRewardProfiles({});
    setProbabilityBoost({
      diamondBoostPct: 0,
      platinumBoostPct: 0,
    });

    // 2. 저장소 클리어
    await clearTossSession();
    localStorage.removeItem('drawCount');
    localStorage.removeItem('userPoints');
    localStorage.removeItem('lastRechargeDate');

    // 3. 화면 리셋
    setStep('landing');
    setActiveTab('home');

    // 4. 앱 종료 (토스로 돌아가기)
    try {
      if (typeof closeView === 'function') {
        await closeView();
      } else {
        // Fallback for some environments
        window.parent.postMessage({ type: 'close' }, '*');
      }
    } catch (err) {
      console.error('Failed to close view:', err);
    }
  };

  const openExitModal = useCallback((mode: 'exit' | 'logout') => {
    showModal({
      title: mode === 'exit' ? '앱을 종료할까요?' : '로그아웃할까요?',
      description: mode === 'exit'
        ? '오늘의 조언이 도움이 되었기를 바라요.\n다음에 또 놀러오세요!'
        : '지금 로그아웃하면 다시 로그인해야 해요.\n정말 로그아웃하시겠어요?',
      onClose: restoreAppHistoryState,
      actions: [
        {
          label: mode === 'exit' ? '더 구경할게요' : '아니요, 유지할래요',
          variant: 'primary',
          onClick: restoreAppHistoryState,
        },
        {
          label: mode === 'exit' ? '종료하기' : '로그아웃',
          variant: 'ghost',
          onClick: async () => {
            if (mode === 'exit') {
              closeView();
              return;
            }
            await handleLogout();
          },
        },
      ],
    });
  }, [handleLogout, restoreAppHistoryState, showModal]);

  // ── 회원 탈퇴 ──
  const handleDeleteAccount = async () => {
    // 로그아웃과 동일한 상태 초기화 수행 (API 호출은 MyPage에서 처리)
    try {
      await disconnectTossLogin();
    } catch (err) {
      console.error('DeleteAccount: disconnect failed', err);
    }

    setTossUserKey(null);
    setResultHistory([]);
    setDrawCount(0);
    setUserPoints(0);
    setRewardProfile({
      adViewsDaily: 0,
      adViewsTotal: 0,
      consultCount: 0,
      characterLevel: 1,
      characterExp: 0,
      expToNext: 100,
    });
    setPersonaRewardProfiles({});
    setProbabilityBoost({ diamondBoostPct: 0, platinumBoostPct: 0 });

    await clearTossSession();
    localStorage.removeItem('drawCount');
    localStorage.removeItem('userPoints');
    localStorage.removeItem('lastRechargeDate');
    localStorage.removeItem('notifications_muted');

    setStep('landing');
    setActiveTab('home');

    try {
      if (typeof closeView === 'function') {
        await closeView();
      }
    } catch (err) {
      console.error('Failed to close view after delete:', err);
    }
  };



  // [New] Deep Link Routing Handling
  useEffect(() => {
    const handleDeepLink = () => {
      if (isRootLocation(window.location)) {
        setActiveTab('home');
        setStep('landing');
        return;
      }

      const target = parseDeepLink(window.location);
      if (!target) return;

      if (target.step) setStep(target.step);
      if (target.chooseStep) setChooseStep(target.chooseStep);
      if (target.tab === 'reward-gacha') {
        setSelectedHomeMenu(null);
      }

      setActiveTab(target.tab);
    };

    handleDeepLink();
  }, [setActiveTab, setStep, setChooseStep]);



  // [New] 페이지/탭 전환 시 최상단으로 스크롤
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [step, activeTab]);

  // [New] Age Group UI Logic
  useEffect(() => {
    // [DEV] Mock user data when age group changes
    if (import.meta.env.DEV && !IS_PUBLIC_BROWSER) {
      const mockNames: Record<number, string> = {
        20: '김민수(20대)',
        30: '이지혜(30대)',
        40: '박준호(40대)',
        50: '최영자(50대)',
        60: '이정섭(60대)'
      };
      setUserName(mockNames[ageGroup] || '테스터');

      if (!tossUserKey || (typeof tossUserKey === 'string' && tossUserKey.startsWith('mock_'))) {
        setTossUserKey(`mock_user_${ageGroup}`);
        // [DEV] Mock birthday/gender based on age group
        const mockBirthdays: Record<number, string> = {
          20: '20031015', 30: '19950510', 40: '19851120', 50: '19750301', 60: '19650620'
        };
        const mockBirthday = mockBirthdays[ageGroup] || '19950510';
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('toss_user_birthday', mockBirthday);
          window.localStorage.setItem('toss_user_gender', 'male');
        }
        setTossUserBirthday(mockBirthday);
        setTossUserGender('male');
      }

      // [New] Update recommended situations based on age group (put age-specific first)
      const ageSituations = AGE_SPECIFIC_SITUATIONS[ageGroup] || [];
      setRecommendedSituations([...ageSituations, ...RECOMMENDED_SITUATIONS]);
    }
  }, [ageGroup, tossUserKey]);



  // [History] 커스텀 훅 사용하여 브라우저 히스토리 연동
  useAppHistory({
    step,
    activeTab,
    chooseStep,
    isSituationsExpanded,
    isPersonasExpanded,
    selectedHistoryId,
    selectedPersonaId,
    selectedSituation,
    situationQuery,
    result,
    selectionSummary,
    setStep,
    setActiveTab,
    setChooseStep,
    setIsSituationsExpanded,
    setIsPersonasExpanded,
    setSelectedHistoryId,
    setSelectedPersonaId,
    setSelectedSituation,
    setSituationQuery,
    setResult,
    setSelectionSummary
  });

  // [New] Granite Native Back Button Listener
  useEffect(() => {
    try {
      if (typeof graniteEvent !== 'undefined' && typeof graniteEvent.addEventListener === 'function') {
        const cleanup = graniteEvent.addEventListener('backEvent', {
          onEvent: () => {
            console.log('[App] Back button pressed (Granite Event)');
            // 홈 화면(랜딩+홈탭)인 경우 종료 팝업, 그 외엔 뒤로가기
            if (step === 'landing' && activeTab === 'home') {
              openExitModal('exit');
            } else {
              window.history.back();
            }
          }
        });
        return cleanup;
      }
    } catch (e) {
      console.warn('[App] Web environment detected, skipping granite backEvent listener', e);
    }
  }, [step, activeTab, openExitModal]);

  const trackCta = async (type: 'persona' | 'situation', id: string) => {
    try {
      await fetch(apiUrl('/interactions/cta'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ type, id })
      });
    } catch (e) {
      console.error('Track CTA failed:', e);
    }
  };

  // ── 로또 머신 뽑기 API 호출 ──
  const handleQuickAsk = useCallback((question: string) => {
    if (!tossUserKey && !IS_PUBLIC_BROWSER) {
      pendingActionRef.current = { type: 'quickAsk', question };
      void handleTossLogin();
      return false;
    }
    startQuickAskFlow(question);
    return true;
  }, [tossUserKey, handleTossLogin, startQuickAskFlow]);

  const handleLottoDraw = useCallback(async () => {
    if (!tossUserKey) return null;
    try {
      const res = await fetch(apiUrl('/lotto/draw'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey: String(tossUserKey) }),
      });
      const json = await res.json();
      if (json.resultType === 'SUCCESS' && json.data) {
      const { tickets } = json.data as { numbers: number[]; tickets: number; drawId?: string };
        if (typeof tickets === 'number') updateDrawCount(tickets);
        return json.data as { numbers: number[]; tickets: number; drawId?: string };
      }
      return null;
    } catch (err) {
      console.error('[LottoDraw]', err);
      return null;
    }
  }, [tossUserKey, updateDrawCount]);

  const handleSaveLottoToStorage = useCallback((numbers: number[]) => {
    const newItem: ResultHistoryItem = {
      id: (crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).substring(2),
      title: '행운의 로또 번호',
      summary: '오늘의 대박 기운',
      content: `이번 주 추천 번호: ${numbers.join(', ')}`,
      timestamp: Date.now(),
      type: 'lotto',
      numbers: numbers,
    };

    setResultHistory(prev => [newItem, ...prev]);

    // 로그인 상태이면 백엔드 보관함에도 저장 (로그인 후 fetchHistory로 덮어쓰여 사라지는 문제 방지)
    if (tossUserKey) {
      fetch(apiUrl('/storage/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey: String(tossUserKey), item: newItem }),
      }).catch(err => console.error('[Lotto] Failed to save to storage:', err));
    }
  }, [tossUserKey]);

  const handleGacha = useCallback(async (persona: Persona, situationName?: string, currentSummary?: string, ticketCost: number = 1) => {
    // [추가] 중복 실행 방지 가드
    if (isSpinning) {
      console.log('Gacha is already in progress. Skipping.');
      return;
    }

    const createGachaErrorResult = (
      message: string,
      extra: Partial<GachaResult> = {}
    ): GachaResult => ({
      type: 'quote',
      title: '조언 생성 실패',
      content: message,
      persona: persona.name,
      isError: true,
      errorMessage: message,
      retryable: true,
      ...extra,
    });

    // 비로그인/0티켓 상태에서는 가짜 결과를 만들지 않는다.
    if (!tossUserKey && !env.DEV && !IS_PUBLIC_BROWSER) {
      setResult(createGachaErrorResult('로그인하면 나만의 결과를 만들 수 있어요.', { needsLogin: true, retryable: false }));
      setIsSpinning(false);
      setStep('result');
      return;
    }

    if (drawCount <= 0 && !env.DEV && !IS_PUBLIC_BROWSER) {
      setResult(createGachaErrorResult('이용권 1장이 있어야 결과를 만들 수 있어요.', { retryable: false }));
      setIsSpinning(false);
      setStep('result');
      return;
    }

    setIsSpinning(true);
    setResult(null);
    setStep('result');

    // [Analytics] 가챠 애니메이션 시작 로깅
    logGachaAnimationStart(persona.id, situationName || '');

    try {
      const userKey = tossUserKey ?? await getTossSavedUserKey();
      const birthday = await getTossSavedUserBirthday(); // [추가] 유저 생일 정보 가져오기
      if (!persona) return;

      const selectedPersonaRewardProfile = getPersonaRewardProfile(persona.id);

      const body = {
        personaId: persona.id,
        persona: persona.name,
        situation: situationName || '',
        userKey: userKey ? String(userKey) : null,
        requestId: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        userGender: tossUserGender || null,
        userAgeGroup: tossUserAgeGroup || ageGroup || null,
        userName: userName || null,
        birthday: tossUserBirthday || birthday || null,
        useBoost: true,
        boostSnapshot: {
          characterLevel: selectedPersonaRewardProfile.characterLevel,
          diamondBoostPct: probabilityBoost.diamondBoostPct,
          platinumBoostPct: probabilityBoost.platinumBoostPct,
        },
        ticketCost: IS_PUBLIC_BROWSER ? 0 : ticketCost,
        contentType: 'quote', // 홈 가차는 조언(quote) 전용이에요
      };

      const fetchPromise = fetchWithRetry(
        apiUrl('/gacha'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body)
        },
        3, // 최대 3회 재시도
        1000 // 초기 대기 시간 1초
      );

      const response = await fetchPromise;

      if (!response.ok) {
        if (response.status === 403 && !IS_PUBLIC_BROWSER) {
          // [추가] 403 발생 시 서버와 티켓 수 동기화 시도
          if (userKey) {
            void fetchUserTickets(userKey);
          }
          throw new Error('이용권이 부족합니다. 광고를 보거나 친구에게 공유하여 이용권을 받아보세요!');
        }
        const errorBody = await response.json().catch(() => null);
        const errText = errorBody?.error?.message || errorBody?.message || '조언을 만들지 못했어요. 잠시 후 다시 시도해 주세요.';
        console.error(`Gacha API fail (${response.status}):`, errText);
        // [수정] 에러 메시지가 'Family API' 관련이면 안심하라는 메시지 대신 원본 에러 노출
        throw new Error(errText || `서버 오류가 발생했습니다. (HTTP ${response.status})`);
      }

      const json = await response.json();
      const randomDoc = json.data || {};

      // [추가] 활동 기반 프로모션 보상 체크 (뽑기 5회 등)
      if (json.promotion) {
        const promoKey = `promo_seen_${json.promotion.id || json.promotion.message}`;
        if (!sessionStorage.getItem(promoKey)) {
          alert({
            title: '혜택을 받았어요',
            description: json.promotion.message
          });
          sessionStorage.setItem(promoKey, 'true');
        }
      }

      // [추가] 가차 성공 시 서버에서 내려준 최신 티켓 수로 동기화 (혹은 로컬 차감)
      if (json.tickets !== undefined) {
        updateDrawCount(Number(json.tickets));
      } else if (json.data && json.data.tickets !== undefined) {
        updateDrawCount(Number(json.data.tickets));
      } else {
        updateDrawCount(prev => Math.max(0, prev - 1));
      }

      // [Fix] 일반 가차 응답에 포함된 최신 포인트 총액을 즉시 반영
      const serverPoints = [
        json.balancePoints,
        json.currentPoints,
        json.remainingPoints,
        json.totalPoints,
        json.pointCount,
        json.points,
        randomDoc.balancePoints,
        randomDoc.currentPoints,
        randomDoc.remainingPoints,
        randomDoc.totalPoints,
        randomDoc.pointCount,
        randomDoc.points,
      ].find((value) => typeof value === 'number');

      if (typeof serverPoints === 'number') {
        updateUserPoints(serverPoints, 'handleGacha:draw-response');
      }

      const title = randomDoc.title || persona.name;
      const content = randomDoc.content || '내용을 불러올 수 없습니다.';
      const type = randomDoc.type || 'quote';
      const moral = randomDoc.moral;
      const fortune = randomDoc.fortune;
      const isExisting = json.isExisting || false; // 오늘 이미 뽑았는지 확인

      // 등급 및 점수는 서버 응답을 기준으로 고정한다.
      const rarity = normalizeCardRarity(randomDoc.rarity || randomDoc.grade) || 'normal';
      const score = typeof randomDoc.score === 'number' ? randomDoc.score : 0;

      // 별자리 운세 조회
      let zodiacFortune = randomDoc.zodiacFortune; // 1순위: 메인 API 응답에 포함된 경우

      // 2순위: 메인 응답에 없으면 별도 fetch 시도
      if (!isExisting && !zodiacFortune && userKey) {
        try {
          // 최신 생일 정보 다시 확인
          const currentBirthday = await getTossSavedUserBirthday() || tossUserBirthday;
          const sign = currentBirthday ? getZodiacSign(currentBirthday) : null;

          if (sign) {
            console.log(`Fetching zodiac fortune for ${sign}...`);
            const zodiacRes = await fetch(apiUrl('/fortune/zodiac'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userKey: String(userKey),
                zodiacSign: sign
              })
            });
            if (zodiacRes.ok) {
              const zodiacData = await zodiacRes.json();
              zodiacFortune = zodiacData.data;
              console.log('Zodiac fortune loaded successfully');
            }
          } else {
            console.log('No zodiac sign found (no birthday)');
          }
        } catch (err) {
          console.error('Failed to fetch zodiac fortune:', err);
        }
      }

      const fontSize = randomDoc.fontSize;
      const zodiacRanking = randomDoc.zodiacRanking; // [추가] 별자리 순위 데이터
      const isAfterSix = new Date().getHours() >= 18;
      const appliedBoost = randomDoc.appliedBoost || json.appliedBoost || {
        diamondBoostPct: probabilityBoost.diamondBoostPct,
        platinumBoostPct: probabilityBoost.platinumBoostPct,
      };
      const characterLevelSnapshot = Number(
        randomDoc.characterLevelSnapshot
        ?? json.characterLevelSnapshot
        ?? selectedPersonaRewardProfile.characterLevel
      );

      const newResult: GachaResult = {
        type,
        title,
        content,
        persona: persona.name,
        fortune,
        moral,
        rarity,
        score,
        zodiacFortune,
        zodiacRanking, // [추가]
        fontSize,
        isTomorrow: isAfterSix,
        appliedBoost,
        characterLevelSnapshot,
      };
      setResult(newResult);

      // [Analytics] 가챠 결과 조회 로깅
      logGachaResultView({
        rarity,
        score,
        persona_id: persona.id,
        persona_name: persona.name,
        type,
      });

      // [콤보] 로또/운세 결과 수신 시 콤보 스텝 마킹 (제거됨)

      // [New] 결과가 성공적으로 나오면 대기 중인 프로모션 코드 처리
      if (pendingPromoCode) {
        const claimPromotion = async () => {
          try {
            const userKey = tossUserKey || await getTossSavedUserKey();
            if (!userKey) return;

            const promoRes = await fetch(apiUrl('/promotion/claim'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userKey, promotionCode: pendingPromoCode })
            });

            if (promoRes.ok) {
              const processedPromos = JSON.parse(localStorage.getItem('processed_promos') || '[]');
              processedPromos.push(pendingPromoCode);
              localStorage.setItem('processed_promos', JSON.stringify(processedPromos));
            }
          } catch (err) {
            console.error('프로모션 보상 지급 실패:', err);
          } finally {
            setPendingPromoCode(null);
          }
        };
        void claimPromotion();
      }

      const finalSummary = currentSummary || selectionSummary;
      if (finalSummary) {
        const newItem: ResultHistoryItem = {
          id: Math.random().toString(36).substring(2, 11) + Date.now(),
          summary: finalSummary,
          personaName: persona.name,
          situation: situationName,
          title,
          content,
          timestamp: Date.now(),
          fortune,
          moral,
          type,
          rarity,
          score,
          zodiacFortune,
          appliedBoost,
          characterLevelSnapshot,
        };

        setResultHistory(prev => [newItem, ...prev].slice(0, 1000));

        // 백엔드 보관함 저장
        if (userKey) {
          fetch(apiUrl('/storage/save'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userKey: String(userKey), item: newItem })
          }).catch(err => console.error('Failed to save history:', err));

          // [추가] 가차 뽑기 경험치 적립 (비동기, UX 블로킹 없음)
          void fetch(apiUrl('/user/reward'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userKey: String(userKey),
              activityType: 'GACHA_PULL',
              idempotencyKey: `pull_${newItem.id}`,
              personaId: persona.id || undefined,
            }),
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((rewardJson) => {
              if (rewardJson) {
                syncRewardProfileFromPayload(rewardJson, persona.id);
              } else if (persona.id) {
                // 로컬 폴백: 서버 실패 시 경험치 +5 로컬 반영
                const current = personaRewardProfiles[persona.id] || {
                  characterLevel: 1,
                  characterExp: 0,
                  expToNext: 100,
                };
                const nextExp = current.characterExp + 5;
                if (nextExp >= Math.max(1, current.expToNext || 100)) {
                  updatePersonaRewardProfile(persona.id, {
                    characterLevel: current.characterLevel + 1,
                    characterExp: nextExp - Math.max(1, current.expToNext || 100),
                    expToNext: current.expToNext,
                  });
                } else {
                  updatePersonaRewardProfile(persona.id, { characterExp: nextExp });
                }
              }
            })
            .catch((err) => {
              console.error('[Reward] Failed to track gacha pull activity:', err);
              // 네트워크 에러 시에도 로컬 폴백
              if (persona.id) {
                const current = personaRewardProfiles[persona.id] || {
                  characterLevel: 1,
                  characterExp: 0,
                  expToNext: 100,
                };
                const nextExp = current.characterExp + 5;
                if (nextExp >= Math.max(1, current.expToNext || 100)) {
                  updatePersonaRewardProfile(persona.id, {
                    characterLevel: current.characterLevel + 1,
                    characterExp: nextExp - Math.max(1, current.expToNext || 100),
                    expToNext: current.expToNext,
                  });
                } else {
                  updatePersonaRewardProfile(persona.id, { characterExp: nextExp });
                }
              }
            });
        }
      }

    } catch (e: any) {
      console.error('Error:', e);
      logErrorToBackend('gacha_pull_system_error', {
        error: e.message || String(e) || 'unknown',
        persona: persona.name,
        situation: situationName
      });
      setResult({
        type: 'quote',
        title: '조언 생성 실패',
        content: e.message || '잠시 후 다시 시도해 주세요.',
        persona: persona.name,
        isError: true,
        errorMessage: e.message || '잠시 후 다시 시도해 주세요.',
        retryable: true,
      });
      setStep('result');
      // [수정] 에러 발생 시에는 티켓을 차감하지 않음
      // updateDrawCount(prev => prev - 1);
    } finally {
      setIsSpinning(false);
    }
  }, [drawCount, env, alert, tossUserKey, tossUserGender, tossUserAgeGroup, ageGroup, userName, tossUserBirthday, fetchWithRetry, fetchUserTickets, updateDrawCount, result, pendingPromoCode, selectionSummary, setResult, setStep, setChooseStep, probabilityBoost, getPersonaRewardProfile, syncRewardProfileFromPayload, personaRewardProfiles, updatePersonaRewardProfile]);

  // 운세: 가차 API 대신 /fortune/zodiac 직접 호출 (페르소나 DB 조회 없음)
  const handleFortuneSelect = useCallback(async (
    option: { id: string, name: string, tickets: number },
    opts: { forceRegenerate?: boolean } = {}
  ) => {
    if (isSpinning) return;
    const forceRegenerate = opts.forceRegenerate === true;

    setSelectedSituation(option.name);
    setSituationQuery(`오늘의 ${option.name}을 봐주세요.`);
    setSelectionSummary(`오늘의 ${option.name}`);
    setActiveTab('home');

    const createFortuneErrorResult = (message: string, extra: Partial<GachaResult> = {}): GachaResult => ({
      type: 'fortune',
      title: option.name,
      content: '',
      isError: true,
      errorMessage: message,
      retryable: true,
      ...extra,
    });

    const savedUserKey = tossUserKey ?? await getTossSavedUserKey() ?? (env.DEV ? 'mock_user_fortune' : null);
    if (savedUserKey && !tossUserKey) {
      setTossUserKey(String(savedUserKey));
    }

    // 비로그인
    if (!savedUserKey && !env.DEV && !IS_PUBLIC_BROWSER) {
      setIsSpinning(true); setResult(null); setStep('result');
      setTimeout(() => {
        setResult(createFortuneErrorResult('운세를 보려면 로그인이 필요해요.', { needsLogin: true, retryable: false }));
        setIsSpinning(false);
      }, 400);
      return;
    }
    setIsSpinning(true);
    setResult(null);
    setStep('result');

    try {
      const userKey = savedUserKey;
      const birthday = await getTossSavedUserBirthday() || tossUserBirthday;
      const sign = birthday ? getZodiacSign(birthday) : null;

      const res = await fetch(apiUrl('/fortune/zodiac'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-key': String(userKey) },
        body: JSON.stringify({
          userKey: String(userKey),
          zodiacSign: sign,
          category: option.id,
          ticketCost: IS_PUBLIC_BROWSER ? 0 : option.tickets,
          forceRegenerate,
          requestId: crypto.randomUUID?.() || `fortune_${forceRegenerate ? 'regen_' : ''}${Date.now()}_${Math.random().toString(36).slice(2)}`,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (res.ok && json.resultType === 'SUCCESS' && json.data) {
        const zf = json.data as ZodiacFortune;

        // 티켓 동기화 (서버값 우선, 없으면 로컬 차감)
        if (typeof json.data.tickets === 'number') {
          updateDrawCount(json.data.tickets);
        } else {
          updateDrawCount(prev => Math.max(0, prev - option.tickets));
        }

        // ZodiacFortune ratings → fortune.details 매핑 (숫자 or { label, score } 객체 모두 처리)
        const extractScore = (v: unknown): number | undefined => {
          if (typeof v === 'number') return v;
          if (v && typeof v === 'object' && 'score' in v && typeof (v as { score: unknown }).score === 'number')
            return (v as { score: number }).score;
          return undefined;
        };
        const details: Record<string, number> = {};
        if (zf.ratings) {
          const s0 = extractScore(zf.ratings.love);     if (s0 != null) details.love     = s0;
          const s1 = extractScore(zf.ratings.wealth);   if (s1 != null) details.wealth   = s1;
          const s2 = extractScore(zf.ratings.business); if (s2 != null) details.business = s2;
          const s3 = extractScore(zf.ratings.health);   if (s3 != null) details.health   = s3;
          const s4 = extractScore(zf.ratings.exam);     if (s4 != null) details.exam     = s4;
          const s5 = extractScore(zf.ratings.total);    if (s5 != null) details.total    = s5;
        }

        const newResult: GachaResult = {
          type: 'fortune',
          title: `오늘의 ${option.name}`,
          content: zf.quote || zf.content || zf.summary,
          fortune: {
            score: zf.score ?? 70,
            description: zf.summary,
            cardNameKo: zf.sign,
            details: Object.keys(details).length > 0 ? details : undefined,
          },
          zodiacFortune: zf,
          share: {
            title: `[오늘의 운세] 오늘의 ${option.name}`,
            description: zf.summary,
          },
          rarity: 'gold',
          score: zf.score ?? 70,
        };

        setResult(newResult);

        // 히스토리 저장 (hasViewedFortuneToday 연동)
        const summary = `오늘의 ${option.name}`;
        const historyItem: ResultHistoryItem = {
          id: Math.random().toString(36).substring(2, 11) + Date.now(),
          summary,
          title: newResult.title,
          content: newResult.content,
          timestamp: Date.now(),
          type: 'fortune',
          fortune: newResult.fortune,
          zodiacFortune: zf,
          rarity: 'gold',
          score: zf.score ?? 70,
        };
        setResultHistory(prev => [historyItem, ...prev].slice(0, 1000));

        if (userKey) {
          fetch(apiUrl('/storage/save'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userKey: String(userKey), item: historyItem }),
          }).catch(err => console.error('[Fortune] Failed to save history:', err));
        }
      } else {
        const code = json.error?.code;
        if (code === 'INSUFFICIENT_TICKETS') updateDrawCount(0);
        console.error('[Fortune] API failed:', { status: res.status, body: json });
        setResult(createFortuneErrorResult(json.error?.message || '운세를 불러올 수 없어요. 잠시 후 다시 시도해 주세요.', {
          retryable: code !== 'INSUFFICIENT_TICKETS',
        }));
      }
    } catch (error) {
      console.error('[Fortune] Network error:', error);
      setResult(createFortuneErrorResult('네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.'));
    } finally {
      setIsSpinning(false);
    }
  }, [isSpinning, tossUserKey, env.DEV, tossUserBirthday,
      updateDrawCount, setStep, setResult, setSelectionSummary, setActiveTab, setIsSpinning,
      setSelectedSituation, setSituationQuery, setResultHistory, setTossUserKey]);

  useEffect(() => {
    if (activeTab !== 'fortune') {
      fortuneAutoRequestRef.current = false;
      return;
    }
    if (fortuneAutoRequestRef.current || isSpinning) return;

    fortuneAutoRequestRef.current = true;
    void handleFortuneSelect(TODAY_TOTAL_FORTUNE_OPTION);
  }, [activeTab, isSpinning, handleFortuneSelect]);

  const handleShareHistoryItem = async (id: string) => {
    const item = resultHistory.find(i => i.id === id);
    if (!item) return;

    try {
      // 딥링크 생성 및 토스 공유 링크 변환
      const tossLink = await getTossShareLink(`intoss://gacha?historyId=${id}`);

      const message = item.personaName
        ? `[오늘의 이야기] ${item.personaName}가 들려주는 행운: ${item.title}\n\n"${item.content}"\n\n지금 확인하기: ${tossLink}`
        : `${item.title}\n\n"${item.content}"\n\n지금 확인하기: ${tossLink}`;

      handleShareReward(1, message);
      logClick('history_share_click', { id });
    } catch (e) {
      console.error('Failed to get share link:', e);
      const message = item.personaName
        ? `[오늘의 이야기] ${item.personaName}가 들려주는 행운: ${item.title}\n\n"${item.content}"`
        : `${item.title}\n\n"${item.content}"`;

      handleShareReward(1, message);
      logClick('history_share_click_fallback', { id });
    }
  };

  const handleDeleteHistoryItem = () => {
    if (!selectedHistoryId) return;

    confirm({
      title: '삭제할까요?',
      description: '보관함에서 이 행운의 말을 영구히 삭제합니다.',
      confirmText: '삭제',
      cancelText: '취소',
      isDestructive: true,
      onConfirm: async () => {
        const deletingId = selectedHistoryId;
        const deletingItem = selectedHistoryDetailItem || resultHistory.find(item => item.id === deletingId);
        if (tossUserKey) {
          try {
            const res = await fetch(apiUrl(`/storage/${encodeURIComponent(deletingId)}`, {
              query: {
                userKey: String(tossUserKey),
                ...(deletingItem?.type ? { type: deletingItem.type } : {}),
              },
            }), { method: 'DELETE' });
            if (!res.ok) {
              const json = await res.json().catch(() => ({}));
              throw new Error(json.error?.message || json.error || `DELETE_FAILED_${res.status}`);
            }
          } catch (error) {
            console.error('[History] Delete failed:', error);
            alert({
              title: '삭제 실패',
              description: '서버에서 기록을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.',
            });
            return;
          }
        }
        setResultHistory(prev => prev.filter(item => item.id !== selectedHistoryId));
        setSelectedHistoryDetailItem(null);
        handleTabChange('history');
        setSelectedHistoryId(null);
        logClick('history_delete');
      }
    });
  };


  const claimShareReward = useCallback(async () => {
    if (pendingShareRewardAmount <= 0) return;
    const amount = pendingShareRewardAmount;
    setPendingShareRewardAmount(0);

    // [New] 공유 보상 하루 3회 제한 체크
    const today = new Date().toDateString();
    const lastShareDate = localStorage.getItem('share_reward_last_date');
    let shareDailyCount = parseInt(localStorage.getItem('share_reward_count') || '0', 10);

    // 날짜가 변경되었으면 카운트 리셋
    if (lastShareDate !== today) {
      shareDailyCount = 0;
      localStorage.setItem('share_reward_last_date', today);
      localStorage.setItem('share_reward_count', '0');
    }

    if (shareDailyCount >= 3) { // 하루 3회로 확대
      alert({
        title: '혜택은 하루 3번',
        description: '내일 또 참여해주세요!'
      });
      return;
    }

    const nextCount = shareDailyCount + 1;

    const userKey = tossUserKey ?? await getTossSavedUserKey();
    if (userKey) {
      const stringKey = String(userKey);
      fetch(apiUrl('/user/share/reward/claim'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userKey: stringKey, tickets: amount })
      })
        .then(async (res) => {
          if (!res.ok) {
            throw new Error('SHARE_REWARD_FAILED');
          }
          const json = await res.json();
          const data = json.success || json.data || json;

          // [수정] 서버에서 갱신된 티켓 수량을 내려준다면 해당 값을 사용
          if (data && typeof data.tickets === 'number') {
            console.log('Share reward synced from server:', data.tickets);
            updateDrawCount(data.tickets);
          } else {
            // 내려주지 않는 경우 로컬에서 충전
            updateDrawCount(prev => prev + amount);
          }
        })
        .catch((error) => {
          console.error('Share reward claim failed:', error);
          // 실패 시에도 로컬 보정 (선택 사항)
          updateDrawCount(prev => prev + amount);
        })
        .finally(() => {
          localStorage.setItem('share_reward_last_date', today);
          localStorage.setItem('share_reward_count', nextCount.toString());
        });
    } else {
      // 비로그인 상태
      localStorage.setItem('share_reward_last_date', today);
      localStorage.setItem('share_reward_count', nextCount.toString());

      updateDrawCount(prev => prev + amount);
    }
  }, [pendingShareRewardAmount, tossUserKey, alert, updateDrawCount]);

  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(resultHistory));
  }, [resultHistory]);



  useEffect(() => {
    if (pendingShareRewardAmount <= 0) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // 앱으로 돌아왔을 때 보상 지급 시도
        console.log('Visibility changed to visible - claiming reward & syncing tickets');
        claimShareReward();

        // [Add] 앱 복귀 시 티켓 정보 최신화
        if (tossUserKey) {
          fetchUserTickets(tossUserKey);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pendingShareRewardAmount, tossUserKey, claimShareReward, fetchUserTickets]);

  const processPendingOrders = useCallback(async () => {
    try {
      // ── 1) Toss IAP SDK 미지급 주문 처리 ──
      if (!IAP || typeof IAP.getPendingOrders !== 'function') return;

      const result = await IAP.getPendingOrders();
      const pendingOrders = result?.orders;
      if (!pendingOrders || pendingOrders.length === 0) return;

      console.log('Pending orders found:', pendingOrders);

      for (const order of pendingOrders) {
        // 백엔드 지급 요청
        const userKey = tossUserKey ?? await getTossSavedUserKey();
        if (!userKey) continue;

        try {
          const response = await fetch(apiUrl('/toss/purchase/verify'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userKey,
              orderId: order.orderId,
              productId: order.sku, // SDK returns sku
              quantity: 1
            })
          });

          if (response.ok) {
            // [수정] 지급 완료 처리 (Toss SDK) - 서버 응답 먼저 확인
            const json = await response.json();
            const newTotalTickets = json.success?.tickets ?? json.data?.tickets ?? json.tickets;

            if (IAP && typeof IAP.completeProductGrant === 'function') {
              await IAP.completeProductGrant({ params: { orderId: order.orderId } });
            }
            console.log(`Order granted: ${order.orderId}`);

            // 화면 갱신: 서버에서 받은 최신 티켓 수로 동기화
            if (typeof newTotalTickets === 'number') {
              updateDrawCount(newTotalTickets);
            } else {
              // Fallback: 복원 갯수를 알 수 없으므로 기본값(5) 또는 가져오지 않음. 
              // 여기서는 안전하게 +1 처리하거나, 로그를 남김.
              console.warn('Restored order but no ticket count returned. Adding default.');
              updateDrawCount(prev => prev + 1);
            }

            alert({
              title: '이용권 복원 완료',
              description: '받지 못했던 이용권이 들어왔어요'
            });

            // [추가] 스마트 발송: 결제/충전 완료 알림
            void triggerSmartMessage(MESSENGER_TEMPLATES.PAYMENT_SUCCESS, {
              amount: String(newTotalTickets || 5)
            });
          } else {
            console.error('Verify failed for order:', order.orderId);
          }
        } catch (err) {
          console.error('Error processing order:', err);
        }
      }

      // ── 2) localStorage에 저장된 미검증 주문 재처리 ──
      try {
        const unverifiedRaw = localStorage.getItem('unverified_orders');
        if (unverifiedRaw) {
          const unverified: { orderId: string; sku: string; ticketAmount: number; userKey: string; timestamp: number }[] = JSON.parse(unverifiedRaw);
          const remaining: typeof unverified = [];

          for (const uOrder of unverified) {
            // 24시간 이상 지난 주문은 만료 처리
            if (Date.now() - uOrder.timestamp > 24 * 60 * 60 * 1000) {
              console.warn(`[UnverifiedOrder] Expired: ${uOrder.orderId}`);
              logErrorToBackend('unverified_order_expired', { orderId: uOrder.orderId, sku: uOrder.sku });
              continue;
            }

            try {
              const res = await fetch(apiUrl('/toss/purchase/verify'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userKey: uOrder.userKey,
                  orderId: uOrder.orderId,
                  productId: uOrder.sku,
                  quantity: 1,
                }),
              });

              if (res.ok) {
                const json = await res.json();
                const tickets = json.success?.tickets ?? json.data?.tickets ?? json.tickets;
                if (typeof tickets === 'number') updateDrawCount(tickets);
                console.log(`[UnverifiedOrder] Verified: ${uOrder.orderId}`);
              } else {
                // 아직 실패 → 다음에 재시도
                remaining.push(uOrder);
              }
            } catch {
              remaining.push(uOrder);
            }
          }

          if (remaining.length > 0) {
            localStorage.setItem('unverified_orders', JSON.stringify(remaining));
          } else {
            localStorage.removeItem('unverified_orders');
          }
        }
      } catch (e) {
        console.warn('[UnverifiedOrder] Failed to process:', e);
      }
    } catch (e) {
      console.error('Failed to process pending orders:', e);
    }
  }, [tossUserKey, updateDrawCount, alert]);

  useEffect(() => {
    const claimDailyTicket = async (userKey: string | number) => {
      try {
        const res = await fetch(apiUrl('/user/claim-daily'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ userKey })
        });

        if (res.ok) {
          const json = await res.json();
          const data = json.success || json.data || json;

          // [추가] 활동 기반 프로모션 보상 체크 (출석 3회 등)
          if (json.promotion) {
            const promoKey = `promo_seen_${json.promotion.id || json.promotion.message}`;
            if (!sessionStorage.getItem(promoKey)) {
              alert({
                title: '혜택을 받았어요',
                description: json.promotion.message
              });
              sessionStorage.setItem(promoKey, 'true');
            }
          }

          // 출석체크 성공 시 최신 티켓 개수로 갱신
          if (data && typeof data.tickets === 'number') {
            console.log('Daily ticket claimed. Total:', data.tickets);
            updateDrawCount(data.tickets);
          }
        }
      } catch (error) {
        console.error('Failed to claim daily ticket:', error);
      }
    };

    const fetchHistory = async (userKey: string | number) => {
      setIsHistoryLoading(true);
      try {
        const res = await fetch(apiUrl('/storage/list', { query: { userKey, limit: 1000 } }));
        if (res.ok) {
          const json = await res.json();
          if (json.data && Array.isArray(json.data)) {
            const rawLocalHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
            const localHistory = rawLocalHistory ? JSON.parse(rawLocalHistory) : [];
            const preservedLocalLotto = Array.isArray(localHistory)
              ? localHistory.filter((item: ResultHistoryItem) => item?.type === 'lotto')
              : [];

            const mergedHistory = [...json.data] as ResultHistoryItem[];

            preservedLocalLotto.forEach((item: ResultHistoryItem) => {
              const alreadyExists = mergedHistory.some((serverItem) => serverItem.id === item.id);
              if (!alreadyExists) {
                mergedHistory.push(item);
              }
            });

            mergedHistory.sort((a, b) => (Number(b?.timestamp) || 0) - (Number(a?.timestamp) || 0));

            setResultHistory(mergedHistory);
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(mergedHistory));
          }
        }
      } catch (err) {
        console.error('Failed to fetch history:', err);
      } finally {
        setIsHistoryLoading(false);
      }
    };

    const initSession = async () => {
      if (IS_PUBLIC_BROWSER) return;
      const loggedIn = await isTossLoggedIn();

      if (loggedIn) {
        // 앱 시작 시 토큰 선제 갱신 (만료 방지)
        await ensureFreshToken();

        const userKey = await getTossSavedUserKey();
        if (userKey) {
          const stringKey = String(userKey);
          setTossUserKey(stringKey);

          // [New] Bootstrap API: 한 번의 호출로 모든 초기 데이터 로드
          try {
            const bootstrapRes = await fetch(apiUrl('/bootstrap', { query: { userKey: stringKey } }));
            if (bootstrapRes.ok) {
              const bootstrapJson = await bootstrapRes.json();
              if (bootstrapJson.resultType === 'SUCCESS' && bootstrapJson.data) {
                const bd = bootstrapJson.data;

                // 유저 정보 동기화
                if (bd.user) {
                  if (typeof bd.user.tickets === 'number') {
                    updateDrawCount(bd.user.tickets);
                  }
                  if (typeof bd.user.points === 'number') {
                      if (typeof window !== 'undefined') {
                        const payloadSnapshot = {
                          source: 'bootstrap:user',
                          at: new Date().toISOString(),
                          payload: {
                            points: bd.user.points,
                            tickets: bd.user.tickets,
                            level: bd.user.level,
                          },
                        };
                        window.sessionStorage.setItem('last_user_points_payload', JSON.stringify(payloadSnapshot));
                        console.log('[PointsTrace] userPoints payload', payloadSnapshot);
                      }
                      updateUserPoints(bd.user.points, 'bootstrap:user');
                  }
                  if (bd.user.nickname) {
                    setUserName(bd.user.nickname);
                  }
                  if (typeof bd.user.level === 'number') {
                    updateRewardProfile({
                      characterLevel: bd.user.level,
                      characterExp: bd.user.exp ?? 0,
                    });
                  }
                  if (typeof bd.user.attendanceCount === 'number') {
                    setConsecutiveDays(bd.user.attendanceCount);
                  }
                }

                // 페르소나 목록
                if (Array.isArray(bd.personas) && bd.personas.length > 0) {
                  const mappedPersonas = sortPersonasForDisplay(getVisibleCounselorPersonas(bd.personas.map((p: any) => ({
                    ...p,
                    desc: p.desc || p.description || '',
                    imageUrl: p.icon && p.icon.startsWith('http') ? p.icon : undefined,
                    icon: p.icon && !p.icon.startsWith('http') ? p.icon : undefined,
                  }))));
                  setPersonas(mappedPersonas);
                  const baseRecs = mappedPersonas.filter((p: Persona) => p.isRecommended);
                  setRecommendedPersonas(baseRecs);
                  baseRecommendedPersonasRef.current = baseRecs;
                }

                // 상황 목록
                if (Array.isArray(bd.situations) && bd.situations.length > 0) {
                  setSituations(bd.situations);
                  const recs = bd.situations.filter((s: any) => s.isRecommended);
                  if (recs.length > 0) setRecommendedSituations(recs);
                }

                // 프로모션
                if (bd.promotions) {
                  if (Array.isArray(bd.promotions.list)) {
                    // Merge: bootstrap 목록에 없는 기존 프로모션 보존
                    setActivePromotions(prev => {
                      const merged = new Map(prev.map(p => [p.id, p]));
                      for (const p of bd.promotions.list) merged.set(p.id, p);
                      return Array.from(merged.values());
                    });
                  }
                }

                // 보상 프로필
                if (bd.reward) {
                  if (bd.reward.profile) syncRewardProfileFromPayload({ data: bd.reward.profile });
                  if (bd.reward.daily) syncDailyProgressFromPayload({ data: bd.reward.daily });
                  if (bd.reward.probability) {
                    setProbabilityBoost({
                      diamondBoostPct: Number(bd.reward.probability.diamondBoostPct ?? 0),
                      platinumBoostPct: Number(bd.reward.probability.platinumBoostPct ?? 0),
                    });
                  }
                }

                console.log('✅ Bootstrap API loaded successfully');
              }
            }
          } catch (bootstrapErr) {
            console.warn('[Bootstrap] Failed, falling back to individual APIs:', bootstrapErr);
          }

          // 개별 동기화 (bootstrap 실패 시 fallback + 추가 작업)
          await fetchUserTickets(stringKey);
          void claimDailyTicket(stringKey);
          void fetchHistory(stringKey);

          // 정보 로드 (상수화 처리 고려)
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

          // 추가 정보 백그라운드 호출
          void processPendingOrders();
        }
      } else {
        // [Guest Mode] 일일 자동 충전 로직 (최소 1개 보장)
        const lastDate = localStorage.getItem('lastRechargeDate');
        const today = new Date().toDateString();
        let currentDraws = parseInt(localStorage.getItem('drawCount') || '0', 10);

        if (lastDate !== today) {
          console.log('[Guest] New day detected. Recharging ticket to 1.');
          currentDraws = Math.max(currentDraws, 1); // 0개면 1개로, 1개 이상이면 그대로 유지
          localStorage.setItem('lastRechargeDate', today);
          localStorage.setItem('drawCount', currentDraws.toString());
        }
        setDrawCount(currentDraws);
      }
    };
    void initSession();

    const fetchPersonas = async () => {
      try {
        const response = await fetch(apiUrl('/discover/personas'));
        const json = await response.json();
        if (!response.ok || (json.resultType && json.resultType !== 'SUCCESS')) {
          throw new Error(json.error || 'PERSONA_FETCH_FAILED');
        }
        // Backend might return 'description' instead of 'desc'
        const data = json.data || [];
        if (data.length > 0) {
          const mappedData = sortPersonasForDisplay(getVisibleCounselorPersonas(data.map((p: any) => ({
            ...p,
            desc: p.desc || p.description || '',
          }))));
          setPersonas(mappedData);
        }
        if (json.recommendations && json.recommendations.length > 0) {
          const recs = getVisibleCounselorPersonas(json.recommendations.map((p: any) => ({
            ...p,
            desc: p.desc || p.description || ''
          })));
          setRecommendedPersonas(recs);
          baseRecommendedPersonasRef.current = recs;
        }
      } catch (e) {
        console.error('Failed to fetch personas:', e);
        // 에러 시 목록을 초기화하지 않고 기존(DEFAULT) 목록 유지
      }
    };
    fetchPersonas();

    const fetchSituations = async () => {
      try {
        const response = await fetch(apiUrl('/discover/situations'));
        const json = await response.json();
        if (!response.ok || (json.resultType && json.resultType !== 'SUCCESS')) {
          throw new Error(json.error || 'SITUATIONS_FETCH_FAILED');
        }
        const allSituations: Situation[] = json.data || [];
        if (allSituations.length > 0) {
          setSituations(allSituations);
        }
        if (json.recommendations && json.recommendations.length > 0) {
          setRecommendedSituations(json.recommendations);
        }
      } catch (e) {
        console.error('Failed to fetch situations:', e);
        // 에러 시 목록을 초기화하지 않고 기존(DEFAULT) 목록 유지
      }
    };
    fetchSituations();
  }, [fetchUserTickets, processPendingOrders, updateDrawCount, tossUserKey]);

  const isPromoProcessing = useRef(false);
  useEffect(() => {
    const handlePromotion = async () => {
      if (isPromoProcessing.current) return;

      const urlParams = new URLSearchParams(window.location.search);
      const promoCode = urlParams.get('promo') || urlParams.get('promotion');
      if (!promoCode) return;

      // 이미 처리한 프로모션인지 확인
      const processedPromos = JSON.parse(localStorage.getItem('processed_promos') || '[]');
      if (processedPromos.includes(promoCode)) return;

      console.log('프로모션 코드 감지:', promoCode);
      isPromoProcessing.current = true;
      setPendingPromoCode(promoCode);

      // URL 정리
      urlParams.delete('promo');
      urlParams.delete('promotion');
      const newUrl = urlParams.toString() ? `${window.location.pathname}?${urlParams.toString()}` : window.location.pathname;
      window.history.replaceState({}, '', newUrl);

      // 페르소나 로드 대기
      let personaWaitCount = 0;
      while (personas.length === 0 && personaWaitCount < 30) {
        await new Promise(resolve => setTimeout(resolve, 100));
        personaWaitCount++;
      }

      if (personas.length > 0 && !isSpinning) {
        const randomPersona = personas[Math.floor(Math.random() * personas.length)];
        const lastChar = randomPersona.name.charCodeAt(randomPersona.name.length - 1);
        const josa = (lastChar >= 0xAC00 && lastChar <= 0xD7A3 && (lastChar - 0xAC00) % 28 > 0) ? '이' : '가';
        const summary = `${randomPersona.name}${josa}\n오늘의 행운을 알려줘요`;
        setSelectionSummary(summary);
        console.log('프로모션 가차 시퀀스 자동 시작');
        handleGacha(randomPersona, '오늘의 행운', summary);
      }
    };
    handlePromotion();
  }, [personas, isSpinning, handleGacha]);
















  const handleGachaSelection = useCallback(async (manualPersonaId?: string) => {
    if (isSpinning) return;
    const personaId = manualPersonaId || selectedPersonaId;
    const persona = personas.find(p => p.id === personaId);

    if (!persona) {
      alert({
        title: '상담가 선택',
        description: '조언을 건넬 상담가를 골라주세요'
      });
      return;
    }

    const situationName = selectedSituation || situationQuery.trim();
    if (!situationName) {
      alert({
        title: '상황 입력',
        description: '어떤 상황인지 알려주세요'
      });
      return;
    }

    logClick('gacha_start', {
      mode: 'quote',
      persona_id: persona.id,
      persona_name: persona.name,
      situation: situationName
    });

    // [Analytics] 가챠 퍼널 이벤트
    logGachaPersonaSelect(persona.id, persona.name);
    logGachaSituationSelect(situationName, selectedHomeMenu || undefined);

    const lastChar = persona.name.charCodeAt(persona.name.length - 1);
    // 한글 음절 범위: AC00 ~ D7A3
    const isHg = lastChar >= 0xAC00 && lastChar <= 0xD7A3;
    const hasBatchim = isHg ? (lastChar - 0xAC00) % 28 > 0 : false;
    const josa = hasBatchim ? '이' : '가';

    const newSummary = `${persona.name}${josa}\n${situationName} 상황인 나에게 해주는 조언이에요`;

    setSelectionSummary(newSummary);

    // 가차 시퀀스 실행 (광고 및 패치 통합)
    await handleGacha(persona, situationName, newSummary);
  }, [selectedPersonaId, personas, selectedSituation, handleGacha, alert, situationQuery]);

  const handleConvertPoints = async () => {
    const userKey = tossUserKey ?? await getTossSavedUserKey();

    if (!userKey) {
      alert({ title: '로그인 필요', description: '포인트는 로그인 후 사용할 수 있어요.' });
      return;
    }

    if (userPoints < POINT_CONVERT_COST) {
      alert({ title: '포인트 부족', description: `포인트가 부족해요. (현재 ${userPoints}점)` });
      return;
    }

    try {
      console.log('[ConvertPoints] userKey:', userKey);

      const res = await fetch(apiUrl('/user/points/convert'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userKey: String(userKey), points: POINT_CONVERT_COST }),
      });

      const json = await res.json().catch(() => ({}));
      console.log('[ConvertPoints] Response:', JSON.stringify(json));

      if (!res.ok || (json.resultType && json.resultType !== 'SUCCESS')) {
        const errMsg = json?.data?.message || json?.error?.message || json?.error || 'CONVERT_FAILED';
        throw new Error(errMsg);
      }

      const data = json.data || json;

      // 서버에서 잔액을 내려주면 절대값으로 동기화, 아니면 로컬 차감
      const serverBalance = data.balancePoints ?? data.currentPoints ?? data.remainingPoints ?? data.totalPoints ?? data.points;
      if (typeof serverBalance === 'number') {
        updateUserPoints(serverBalance, 'handleConvertPoints:server-balance');
      } else {
        updateUserPoints((prev) => Math.max(0, prev - POINT_CONVERT_COST), 'handleConvertPoints:fallback-decrement');
      }

      // 티켓 수량 업데이트 (서버 응답에 티켓 정보가 있으면 동기화)
      if (typeof data.tickets === 'number' && data.tickets > 0) {
        updateDrawCount(data.tickets);
      } else if (typeof data.ticketsAdded === 'number' && data.ticketsAdded > 0) {
        updateDrawCount((prev) => prev + data.ticketsAdded);
      }

      alert({
        title: '신청이 완료됐어요',
        description: '혜택을 받기까지 최대 2일이 걸릴 수 있어요.'
      });

      // 전환 후 상태 동기화 (서버의 최신 포인트/티켓 반영)
      void fetchUserStatus(String(userKey));

    } catch (e: any) {
      console.error('[ConvertPoints] Error:', e);
      const msg = e?.message || '';
      if (msg.includes('INSUFFICIENT') || msg.includes('부족')) {
        alert({ title: '포인트 부족', description: '포인트가 부족해요.' });
      } else if (msg.includes('ALREADY') || msg.includes('DUPLICATED') || msg.includes('이미')) {
        alert({ title: '이미 사용됨', description: '이미 사용한 혜택이에요.' });
      } else {
        alert({ title: '신청 실패', description: '잠시 후 다시 시도해 주세요.' });
      }
    }
  };

  const applyBalancedRewardPoints = useCallback((
    source: string,
    pointsAwarded: unknown,
    totalPoints: unknown,
    maxPoints: number,
  ) => {
    const safeAward = clampRewardPoints(pointsAwarded, maxPoints);

    if (typeof totalPoints === 'number' && Number.isFinite(totalPoints) && totalPoints >= 0) {
      const delta = totalPoints - userPoints;
      if (delta >= 0 && delta <= maxPoints) {
        updateUserPoints(totalPoints, source);
        return;
      }

      console.warn('[RewardBalance] Ignoring suspicious total points payload', {
        source,
        userPoints,
        totalPoints,
        delta,
        pointsAwarded,
        safeAward,
        maxPoints,
      });
    }

    if (safeAward > 0) {
      updateUserPoints((prev) => prev + safeAward, `${source}:balanced-delta`);
    }
  }, [updateUserPoints, userPoints]);

  const handleRewardGachaClaim = useCallback((reward: { points: number; label: string; rarity: 'common' | 'rare' | 'epic' | 'legendary'; consumeTicket: boolean; serverData?: any }) => {
    console.log('[RewardGachaClaim] Received reward payload', reward);
    const awardedPoints = clampRewardPoints(
      typeof reward.serverData?.addedPoints === 'number' ? reward.serverData.addedPoints : reward.points,
      REWARD_POINT_LIMITS.rewardGacha,
    );

    const syncPointsFromRewardPayload = (payload: any, fallbackAdded: number) => {
      const absolutePoints = [
        payload?.balancePoints,
        payload?.currentPoints,
        payload?.remainingPoints,
        payload?.totalPoints,
        payload?.pointCount,
      ].find((value) => typeof value === 'number');

      if (typeof absolutePoints === 'number') {
        console.log('[RewardGachaClaim] Applying absolute points', { absolutePoints, payload });
        applyBalancedRewardPoints('handleRewardGachaClaim:absolute', fallbackAdded, absolutePoints, REWARD_POINT_LIMITS.rewardGacha);
        return;
      }

      if (typeof payload?.addedPoints === 'number') {
        console.log('[RewardGachaClaim] Applying addedPoints delta', { addedPoints: payload.addedPoints, payload });
        const safeAdded = clampRewardPoints(payload.addedPoints, REWARD_POINT_LIMITS.rewardGacha);
        if (safeAdded > 0) updateUserPoints((prev) => prev + safeAdded, 'handleRewardGachaClaim:addedPoints');
        return;
      }

      if (typeof payload?.pointsAdded === 'number') {
        console.log('[RewardGachaClaim] Applying pointsAdded delta', { pointsAdded: payload.pointsAdded, payload });
        const safeAdded = clampRewardPoints(payload.pointsAdded, REWARD_POINT_LIMITS.rewardGacha);
        if (safeAdded > 0) updateUserPoints((prev) => prev + safeAdded, 'handleRewardGachaClaim:pointsAdded');
        return;
      }

      if (typeof payload?.grantedPoints === 'number') {
        console.log('[RewardGachaClaim] Applying grantedPoints delta', { grantedPoints: payload.grantedPoints, payload });
        const safeAdded = clampRewardPoints(payload.grantedPoints, REWARD_POINT_LIMITS.rewardGacha);
        if (safeAdded > 0) updateUserPoints((prev) => prev + safeAdded, 'handleRewardGachaClaim:grantedPoints');
        return;
      }

      if (typeof payload?.points === 'number') {
        console.log('[RewardGachaClaim] Applying payload.points absolute', { points: payload.points, payload });
        applyBalancedRewardPoints('handleRewardGachaClaim:points', fallbackAdded, payload.points, REWARD_POINT_LIMITS.rewardGacha);
        return;
      }

      if (fallbackAdded > 0) {
        console.log('[RewardGachaClaim] Applying fallbackAdded delta', { fallbackAdded, payload });
        const safeAdded = clampRewardPoints(fallbackAdded, REWARD_POINT_LIMITS.rewardGacha);
        if (safeAdded > 0) updateUserPoints((prev) => prev + safeAdded, 'handleRewardGachaClaim:fallbackAdded');
      }
    };

    if (reward.serverData) {
      // 서버 응답이 있으면 절대값으로 동기화
      console.log('[RewardGachaClaim] Server data received', reward.serverData);
      if (typeof reward.serverData.tickets === 'number') updateDrawCount(reward.serverData.tickets);
      syncPointsFromRewardPayload(reward.serverData, awardedPoints);
    } else {
      // API 실패 시 로컬 폴백
      console.warn('[RewardGachaClaim] Missing server data, using client fallback', { consumeTicket: reward.consumeTicket, awardedPoints });
      if (reward.consumeTicket) updateDrawCount((prev) => Math.max(0, prev - 1));
      updateUserPoints((prev) => prev + awardedPoints, 'handleRewardGachaClaim:client-fallback');
    }
  }, [applyBalancedRewardPoints, updateDrawCount, updateUserPoints]);

  /** 가차 뽑기 API 호출 — RewardGachaPage의 onDraw prop */
  const handleGachaDraw = useCallback(async (drawType: 'ticket' | 'bonus' | 'ad_interstitial' | 'ad_rewarded') => {
    const userKey = tossUserKey;
    if (!userKey) {
      console.warn('[GachaDraw] Aborted because userKey is missing', { drawType });
      return null;
    }

    try {
      let endpoint: string;
      let body: Record<string, any>;
      const requestId = (
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `rgacha_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      );

      if (drawType === 'ad_rewarded') {
        // 리워드 광고 → 무료 뽑기 (POST /ad-draw)
        endpoint = apiUrl('/reward-gacha/ad-draw');
        body = { userKey: String(userKey), adGroupId: GACHA_REWARDED_AD_ID, adType: 'rewarded', requestId };
      } else {
        // 티켓/보너스/전면광고 → 일반 뽑기 (POST /draw)
        endpoint = apiUrl('/reward-gacha/draw');
        body = { userKey: String(userKey), drawType, requestId };
      }

      console.log('[GachaDraw] Request prepared', { drawType, endpoint, body });

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      console.log('[GachaDraw] Response received', { drawType, endpoint, status: res.status, ok: res.ok });

      if (res.ok) {
        const json = await res.json();
        const data = json.data || json;
        console.log('[GachaDraw] Parsed success payload', { drawType, json, data });
        return data;
      } else {
        const errJson = await res.json().catch(() => ({ error: { code: 'UNKNOWN' } }));
        console.error('[GachaDraw] API error:', errJson);
        return null;
      }
    } catch (e) {
      console.error('[GachaDraw] Fetch error:', e);
      return null;
    }
  }, [tossUserKey]);

  useEffect(() => {
    // 리워드 탭이 홈으로 통합되어(포인트 지갑) 홈 진입 시 포인트/프로필을 동기화해요.
    // 행운 뽑기(reward-gacha) 진입 동기화는 그대로 유지해요.
    if ((activeTab === 'home' || activeTab === 'reward-gacha') && tossUserKey) {
      if (typeof window !== 'undefined') {
        const effectSnapshot = {
          source: 'reward-sync-effect',
          at: new Date().toISOString(),
          payload: {
            activeTab,
            tossUserKey,
          },
        };
        window.sessionStorage.setItem('last_user_points_effect', JSON.stringify(effectSnapshot));
        console.log('[PointsTrace] effect triggered', effectSnapshot);
      }
      void fetchUserStatus(tossUserKey);
      void fetchRewardProfile(tossUserKey);
      void fetchRewardDailyProgress(tossUserKey);
      void fetchRewardHistory(tossUserKey);
      void fetchProbabilityBoost(tossUserKey);
    }
  }, [activeTab, tossUserKey, fetchProbabilityBoost, fetchRewardDailyProgress, fetchRewardHistory, fetchRewardProfile, fetchUserStatus]);

  // 보관함 상세 진입 시 개별 항목 API 조회
  useEffect(() => {
    if (activeTab !== 'history-detail' || !selectedHistoryId || !tossUserKey) {
      if (activeTab !== 'history-detail') setSelectedHistoryDetailItem(null);
      return;
    }
    // 이미 로컬에 있으면 API 불필요
    const local = resultHistory.find(item => item.id === selectedHistoryId);
    if (local) { setSelectedHistoryDetailItem(local); return; }
    // 없으면 서버에서 조회
    (async () => {
      try {
        const res = await fetch(apiUrl(`/storage/${encodeURIComponent(selectedHistoryId)}`, { query: { userKey: String(tossUserKey) } }));
        if (res.ok) {
          const json = await res.json();
          if (json.resultType === 'SUCCESS' && json.data) {
            setSelectedHistoryDetailItem(json.data as ResultHistoryItem);
          }
        }
      } catch (e) {
        console.error('Failed to fetch storage detail:', e);
      }
    })();
  }, [activeTab, selectedHistoryId, tossUserKey, resultHistory]);

  const handleShareReward = async (ticketAmount: number = 3, customMessage?: string) => {
    logClick('share_click', { amount: ticketAmount });

    try {
      // customMessage가 있으면 무조건 일반 공유(share) 사용, 없으면 contactsViral 시도
      if (typeof contactsViral === 'function' && !customMessage) {
        logShareMethod('contacts_viral', customMessage ? 'custom' : 'general');
        // contactsViral SDK를 사용한 친구 초대 리워드
        const cleanup = contactsViral({
          options: {
            moduleId: 'ea5142d5-5001-44ad-a68b-1a92cd9e9674'
          },
          onEvent: (event) => {
            if (event.type === 'sendViral') {
              // 공유 완료 시 리워드 정보 수신
              console.log('공유 리워드:', event.data.rewardAmount, event.data.rewardUnit);

              // 티켓 지급 및 로컬/DB 저장 (updateDrawCount 내부에 DB 동기화 로직 통합)
              updateDrawCount(prev => prev + ticketAmount);

              logClick('share_reward_claimed', {
                rewardAmount: event.data.rewardAmount,
                rewardUnit: event.data.rewardUnit,
                ticketsAdded: ticketAmount
              });
            } else if (event.type === 'close') {
              console.log('공유 모듈 종료:', event.data.closeReason);
              cleanup();
            }
          },
          onError: (error) => {
            console.error('공유 리워드 에러:', error);
            cleanup?.();
          }
        });
      } else if (typeof share === 'function' && typeof getTossShareLink === 'function') {
        logShareMethod('toss_share', customMessage ? 'custom' : 'general');
        // customMessage가 있는 경우 또는 share SDK 사용 가능 시
        setPendingShareRewardAmount(ticketAmount);
        const tossLink = await getTossShareLink(APP_URL);

        const message = customMessage
          ? `${customMessage}\n\n${tossLink}`
          : `오늘의 이야기: 당신의 오늘을 확인해 보세요!\n${tossLink}`;

        await share({
          message,
        });
      } else {
        logShareMethod('clipboard', customMessage ? 'custom' : 'general');
        // PC/브라우저 Fallback (클립보드)
        const message = customMessage
          ? `${customMessage}\n\n${APP_URL}`
          : `오늘의 이야기: 당신의 오늘을 확인해 보세요!\n${APP_URL}`;

        await navigator.clipboard.writeText(message);
        // PC 버전은 바로 지급 (visibilitychange가 안 일어날 수 없으므로 amount 직접 전달)
        const today = new Date().toDateString();
        const lastShareDate = localStorage.getItem('share_reward_last_date');
        let shareDailyCount = parseInt(localStorage.getItem('share_reward_count') || '0', 10);
        if (lastShareDate !== today) {
          shareDailyCount = 0;
          localStorage.setItem('share_reward_last_date', today);
          localStorage.setItem('share_reward_count', '0');
        }
        if (shareDailyCount >= 3) {
          alert({ title: '혜택은 하루 3번', description: '내일 또 참여해주세요!' });
          return;
        }
        localStorage.setItem('share_reward_last_date', today);
        localStorage.setItem('share_reward_count', String(shareDailyCount + 1));
        updateDrawCount(prev => prev + ticketAmount);
      }
    } catch (e) {
      console.error('Share Error:', e);
      setPendingShareRewardAmount(0);
    }
  };

  // ── 상세 결과 보기 (광고 시청 후 AI 해석) ──
  const fetchDetailedAnalysis = useCallback(async (target: { id?: string; title: string; content: string; persona?: string; rarity?: string; type?: string; fortune?: any }) => {
    const userKey = tossUserKey ?? (await getTossSavedUserKey());
    const res = await fetch(apiUrl('/gacha/detailed-analysis'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userKey: userKey ? String(userKey) : undefined,
        storageId: target.id,
        storageType: target.type,
        resultTitle: target.title,
        resultContent: target.content,
        persona: target.persona,
        rarity: target.rarity,
        type: target.type,
        fortune: target.fortune,
      }),
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const json = await res.json();
    return json.data || json;
  }, [tossUserKey]);

  // 홈 결과 화면용
  const handleDetailedAnalysis = useCallback(async () => {
    if (!result || isAnalysisLoading) return;
    setIsAnalysisLoading(true);
    showInterstitialAd();

    try {
      const analysis = await fetchDetailedAnalysis(result);
      setResult(prev => prev ? { ...prev, detailedAnalysis: analysis } : prev);
      // 별도 페이지로 이동
      setAnalysisPageData({ analysis, title: result.title, persona: result.persona, from: 'home' });
      setActiveTab('detailed-analysis');
      logClick('detailed_analysis_success', { persona: result.persona, rarity: result.rarity });
    } catch (e: any) {
      console.error('[DetailedAnalysis] Error:', e);
      logErrorToBackend('detailed_analysis_error', { error: e?.message || String(e) });
      alert({ title: '해석 실패', description: '잠시 후 다시 시도해 주세요' });
    } finally {
      setIsAnalysisLoading(false);
    }
  }, [result, isAnalysisLoading, handleWatchAd, fetchDetailedAnalysis, alert]);

  // 보관함 상세 화면용
  const handleHistoryDetailedAnalysis = useCallback(async () => {
    const item = selectedHistoryDetailItem || resultHistory.find(i => i.id === selectedHistoryId);
    if (!item || isAnalysisLoading) return;
    setIsAnalysisLoading(true);
    showInterstitialAd();

    try {
      const analysis = await fetchDetailedAnalysis({
        id: item.id,
        title: item.title,
        content: item.content,
        persona: item.personaName,
        rarity: item.rarity,
        type: item.type,
        fortune: item.fortune,
      });

      // 보관함 아이템에 해석 결과 덮어씌우기
      setSelectedHistoryDetailItem(prev => prev ? { ...prev, detailedAnalysis: analysis } : prev);

      // resultHistory 배열에도 반영 (뒤로갔다 다시 들어와도 유지)
      setResultHistory(prev => prev.map(h => h.id === item.id ? { ...h, detailedAnalysis: analysis } : h));

      // 별도 페이지로 이동
      setAnalysisPageData({ analysis, title: item.title, persona: item.personaName, from: 'history-detail' });
      setActiveTab('detailed-analysis');

      logClick('history_detailed_analysis_success', { persona: item.personaName, rarity: item.rarity });
    } catch (e: any) {
      console.error('[HistoryDetailedAnalysis] Error:', e);
      logErrorToBackend('history_detailed_analysis_error', { error: e?.message || String(e) });
      alert({ title: '해석 실패', description: '잠시 후 다시 시도해 주세요' });
    } finally {
      setIsAnalysisLoading(false);
    }
  }, [selectedHistoryDetailItem, resultHistory, selectedHistoryId, isAnalysisLoading, handleWatchAd, fetchDetailedAnalysis, alert]);

  const renderLoginRequired = (title: string, description: string) => (
    <motion.div
      key={`login-required-${activeTab}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
    >
      <LoginGateCard
        title={title}
        description={description}
        onLogin={handleTossLogin}
        isLoading={isLoggingIn}
        error={loginError}
      />
    </motion.div>
  );

  const handleRankingServiceNavigate = useCallback((service: RankingServiceKey) => {
    setSelectedRankingService(service);
    setStep('landing');
    setChooseStep(1);
    setActiveTab(RANKING_SERVICE_TARGETS[service]);
  }, []);

  const navAccessoryValue = useMemo(() => ({
    userPoints,
    goToReward: () => setIsTicketSheetOpen(true),
  }), [userPoints]);

  return (
    <MotionConfig reducedMotion="user">
    <NavAccessoryContext.Provider value={navAccessoryValue}>
    <div className="flex flex-col min-h-screen bg-toss-gray-50/30 selection:bg-toss-blue/10 overflow-x-hidden">
      <main className="flex-1 px-5 pt-10 pb-36 overflow-y-auto">
        {IS_PUBLIC_BROWSER && (
          <p className="mb-5 t-caption text-toss-gray-600" role="note">
            원본 가차의 웹 체험입니다. AI 답변은 새로 생성하며 실제 인물의 발언이 아닙니다. 이용권 차감·현금 보상은 없고, 입력은 Google Cloud로 전달됩니다.
          </p>
        )}
        <Suspense fallback={<PageLoader />}>
          <AnimatePresence mode="wait">
            {activeTab === 'home' ? (
              <motion.div
                key={`${activeTab}-container`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {step === 'landing' && (
                    <LandingView
                      drawCount={drawCount}
                      consecutiveDays={consecutiveDays}
                      userName={userName}
                      isLoggedIn={isLoggedIn}
                      userPoints={userPoints}
                      onGoFortune={() => {
                        handleTabChange('fortune');
                      }}
                      onGoLotto={() => handleTabChange('lotto')}
                      onOpenTicketSheet={() => setIsTicketSheetOpen(true)}
                      onOpenProfile={() => handleTabChange('mypage')}
                      onLogin={handleTossLogin}
                      onQuickAsk={FEATURE_FLAGS.SHOW_QUICK_ASK ? handleQuickAsk : undefined}
                      onOpenAsk={openAskHome}
                      onConvertPoints={handleConvertPoints}
                      openConfirm={confirm}
                      onGoScratchLottery={() => handleTabChange('scratch-lottery')}
                      onGoRewardGacha={() => handleTabChange('reward-gacha')}
                      onGoQuiz={() => handleTabChange('reward-quiz')}
                      onGoRoulette={() => handleTabChange('roulette')}
                      onGoCrossword={() => handleTabChange('crossword')}
                      onGoIdiomQuiz={() => handleTabChange('idiom-quiz')}
                    />
                )}

                {step === 'choose' && (
                    <QuoteChooseView
                    setStep={(nextStep) => {
                      if (nextStep === 'landing') {
                        setSelectedHomeMenu(null);
                        setRecommendedPersonas(baseRecommendedPersonasRef.current);
                        setIsQuickMode(false);
                      }
                      setStep(nextStep);
                    }}
                    chooseStep={chooseStep}
                    setChooseStep={setChooseStep}
                    quickMode={isQuickMode}
                    situationQuery={situationQuery}
                    setSituationQuery={setSituationQuery}
                    setSituationError={setSituationError}
                    selectedSituation={selectedSituation}
                    setSelectedSituation={setSelectedSituation}
                    situationOptions={situations}
                    situationError={situationError}
                    trackCta={trackCta}
                    personas={filteredPersonas}
                    recommendedPersonas={filteredRecommendedPersonas}
                    recommendedSituations={recommendedSituations}
                    selectedPersonaId={selectedPersonaId}
                    setSelectedPersonaId={setSelectedPersonaId}
                    handleGachaSelection={handleGachaSelection}
                    isSituationsExpanded={isSituationsExpanded}
                    setIsSituationsExpanded={setIsSituationsExpanded}
                    isPersonasExpanded={isPersonasExpanded}
                    setIsPersonasExpanded={setIsPersonasExpanded}
                    rewardLevelsByPersona={rewardLevelsByPersona}
                    accountLevel={rewardProfile.characterLevel}
                    drawCount={drawCount}
                    isSubmitting={isSpinning}
                  />
                )}

                {step === 'result' && (
                  result?.type === 'fortune' ? (
                    <FortuneResultView
                      isSpinning={isSpinning}
                      result={result}
                      selectionSummary={selectionSummary}
                      onBack={() => {
                        setSelectedPersonaId('');
                        setSelectedSituation('');
                        setSituationQuery('');
                        setStep('landing');
                        setActiveTab('home');
                      }}
                      onRetry={() => {
                        confirm({
                          title: '운세를 재생성할까요?',
                          description: IS_PUBLIC_BROWSER ? '이용권 없이 새로운 운세를 만들어요.' : '새로운 운세를 만들면 이용권 1장을 더 사용해요.',
                          confirmText: IS_PUBLIC_BROWSER ? '무료로 다시 뽑기' : '1장 쓰고 재생성',
                          cancelText: '취소',
                          onConfirm: () => {
                            logGachaRetry(result?.rarity);
                            void handleFortuneSelect(resolveFortuneOption(result, selectionSummary), { forceRegenerate: true });
                          },
                        });
                      }}
                      onShare={handleShareReward}
                      openConfirm={confirm}
                    />
                  ) : (
                    <QuoteResultView
                      isSpinning={isSpinning}
                      result={result}
                      personas={personas}
                      selectedPersonaId={selectedPersonaId}
                      selectionSummary={selectionSummary}
                      setSelectedPersonaId={setSelectedPersonaId}
                      setSelectedSituation={setSelectedSituation}
                      setSituationQuery={setSituationQuery}
                      setSituationError={setSituationError}
                      setChooseStep={setChooseStep}
                      setStep={setStep}
                      setIsSituationsExpanded={setIsSituationsExpanded}
                      setIsPersonasExpanded={setIsPersonasExpanded}
                      handleShareReward={handleShareReward}
                      ageGroup={ageGroup}
                      onRecharge={() => setIsTicketSheetOpen(true)}
                      onLogin={handleTossLogin}
                      handleRetryGacha={() => {
                        if (drawCount <= 0 && !IS_PUBLIC_BROWSER) {
                          alert({ title: '이용권이 없어요', description: '이용권을 받아야 다시 뽑을 수 있어요.' });
                          setIsTicketSheetOpen(true);
                          return;
                        }
                        confirm({
                          title: '다시 뽑기',
                          description: IS_PUBLIC_BROWSER ? '이용권 없이 새로운 조언을 만들어요.' : '이용권 1장을 사용해서 다시 뽑을까요?',
                          confirmText: IS_PUBLIC_BROWSER ? '무료로 다시 뽑기' : '뽑기',
                          cancelText: '취소',
                          onConfirm: () => {
                            // [Analytics] 재시도 로깅
                            logGachaRetry(result?.rarity);
                            // selectedPersonaId가 비어있으면 현재 결과의 페르소나 이름으로 fallback
                            const retryPersonaId = selectedPersonaId || personas.find(p => p.name === result?.persona)?.id;
                            handleGachaSelection(retryPersonaId);
                          },
                        });
                      }}
                      onDetailedAnalysis={IS_PUBLIC_BROWSER ? undefined : handleDetailedAnalysis}
                      onViewAnalysis={result?.detailedAnalysis ? () => {
                        setAnalysisPageData({ analysis: result.detailedAnalysis!, title: result.title, persona: result.persona, from: 'home' });
                        setActiveTab('detailed-analysis');
                      } : undefined}
                      isAnalysisLoading={isAnalysisLoading}
                      openConfirm={confirm}
                    />
                  )
                )}
              </motion.div>
            ) : activeTab === 'ask' ? (
              canUseContent ? (
                <AskView
                  personas={personas}
                  drawCount={drawCount}
                  rewardProfile={rewardProfile}
                  personaRewardProfiles={personaRewardProfiles}
                  onStartChat={handleStartChat}
                  onResumeChat={handleResumeChat}
                  onBack={goHomeLanding}
                />
              ) : renderLoginRequired('고민 상담은 로그인 후 이용할 수 있어요', '토스 로그인하고 가차 캐릭터에게 고민을 이야기해보세요.')
            ) : activeTab === 'ask-chat' ? (
              canUseContent ? (
                activeChatSession ? (
                  <ChatRoomView
                    userKey={String(tossUserKey || '')}
                    chatId={activeChatSession.chatId}
                    initialPersona={activeChatSession.persona}
                    initialMessages={activeChatSession.initialMessages}
                    personas={personas}
                    drawCount={drawCount}
                    setDrawCount={updateDrawCount}
                    onBack={() => setActiveTab('ask')}
                    onSaveChat={handleSaveChat}
                    onRecharge={() => setIsTicketSheetOpen(true)}
                    openAlert={alert}
                    openConfirm={confirm}
                  />
                ) : (
                  <AskView
                    personas={personas}
                    drawCount={drawCount}
                    rewardProfile={rewardProfile}
                    personaRewardProfiles={personaRewardProfiles}
                    onStartChat={handleStartChat}
                    onResumeChat={handleResumeChat}
                    onBack={goHomeLanding}
                  />
                )
              ) : renderLoginRequired('고민 상담은 로그인 후 이용할 수 있어요', '토스 로그인하고 가차 캐릭터에게 고민을 이야기해보세요.')
            ) : activeTab === 'ranking' ? (
              <RankingPage
                userKey={tossUserKey ? String(tossUserKey) : undefined}
                initialServiceKey={selectedRankingService}
                onBack={goHomeLanding}
                onNavigateToService={handleRankingServiceNavigate}
              />
            ) : activeTab === 'history' ? (
              canUseContent ? (
                <HistoryList
                  userKey={String(tossUserKey || '')}
                  resultHistory={resultHistory}
                  personas={personas}
                  setSelectedHistoryId={(id) => {
                    // 아이템 즉시 세팅 (useEffect 타이밍 이슈 방지)
                    const item = resultHistory.find(i => i.id === id);
                    setSelectedHistoryId(id);
                    if (item) setSelectedHistoryDetailItem(item);
                  }}
                  logClick={logClick}
                  setActiveTab={handleTabChange}
                  ageGroup={tossUserAgeGroup || 20}
                  isLoading={isHistoryLoading}
                />
              ) : renderLoginRequired('기록은 로그인 후 볼 수 있어요', '토스 로그인하면 보관함을 확인하실 수 있어요.')
            ) : activeTab === 'history-detail' ? (
              canUseContent ? (
                <HistoryDetailPage
                  selectedItem={selectedHistoryDetailItem || resultHistory.find(item => item.id === selectedHistoryId) || null}
                  personas={personas}
                  setActiveTab={handleTabChange}
                  handleShareHistoryItem={handleShareHistoryItem}
                  handleDeleteHistoryItem={handleDeleteHistoryItem}
                  logClick={logClick}
                  ageGroup={ageGroup}
                  onDetailedAnalysis={IS_PUBLIC_BROWSER ? undefined : handleHistoryDetailedAnalysis}
                  onViewAnalysis={(() => {
                    const item = selectedHistoryDetailItem || resultHistory.find(i => i.id === selectedHistoryId);
                    return item?.detailedAnalysis ? () => {
                      setAnalysisPageData({ analysis: item.detailedAnalysis!, title: item.title, persona: item.personaName, from: 'history-detail' });
                      setActiveTab('detailed-analysis');
                    } : undefined;
                  })()}
                  isAnalysisLoading={isAnalysisLoading}
                />
              ) : renderLoginRequired('상세 기록은 로그인 후 확인 가능해요', '토스 로그인하고 내 기록 상세를 확인해 보세요.')
            ) : activeTab === 'detailed-analysis' && analysisPageData ? (
              <DetailedAnalysisPage
                analysis={analysisPageData.analysis}
                title={analysisPageData.title}
                persona={analysisPageData.persona}
                onBack={() => {
                  setActiveTab(analysisPageData.from);
                }}
              />
            ) : activeTab === 'detailed-analysis' ? (
              <motion.div
                key="analysis-fallback"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mx-auto mt-8 max-w-[520px] rounded-lg border border-toss-gray-100 bg-paper p-6 text-center shadow-soft"
              >
                <h3 className="t-title text-toss-gray-900">상세 해석을 불러오지 못했어요</h3>
                <p className="t-body mt-2 text-toss-gray-500">이전 화면에서 다시 열어 주세요.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className="mt-5 w-full rounded-md border-2 border-ink bg-cream px-4 py-3 t-body font-bold text-toss-gray-900 shadow-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  보관함으로 돌아가기
                </button>
              </motion.div>
            ) : activeTab === 'mypage' ? (
              isLoggedIn ? (
                <MyPage
                  userKey={String(tossUserKey || '')}
                  userInfo={{
                    name: userName,
                    gender: tossUserGender,
                    birthday: tossUserBirthday,
                    ageGroup: tossUserAgeGroup
                  }}
                  onUpdateName={setUserName}
                  consecutiveDays={consecutiveDays}
                  onBack={() => setActiveTab('history')}
                  onOpenSettings={() => setActiveTab('settings')}
                  onLogout={handleLogout}
                  onDeleteAccount={handleDeleteAccount}
                />
              ) : renderLoginRequired('마이페이지는 로그인 후 이용할 수 있어요', '토스 로그인하면 내 정보를 확인할 수 있어요.')
            ) : activeTab === 'settings' ? (
              isLoggedIn ? (
                <SettingsPage
                  onBack={() => setActiveTab('mypage')}
                  userKey={String(tossUserKey || '')}
                  onAlert={alert}
                />
              ) : renderLoginRequired('설정은 로그인 후 이용할 수 있어요', '알림 설정은 로그인 후 바꿀 수 있어요.')
            ) : activeTab === 'lotto' ? (
              <LottoMachinePage
                onBack={goHomeLanding}
                drawCount={drawCount}
                onDraw={isLoggedIn ? handleLottoDraw : undefined}
                onTicketUpdate={updateDrawCount}
                onSaveToHistory={handleSaveLottoToStorage}
              />
            ) : activeTab === 'roulette' ? (
              <RoulettePage
                onBack={goHomeLanding}
	                userKey={String(tossUserKey || '')}
	                drawCount={drawCount}
	                onTicketUpdate={updateDrawCount}
	                onPointsSync={(totalPoints, pointsAwarded) => applyBalancedRewardPoints('roulette:spin', pointsAwarded ?? 0, totalPoints, REWARD_POINT_LIMITS.roulette)}
	                isLoggedIn={isLoggedIn}
	              />
            ) : activeTab === 'talisman' ? (
              isLoggedIn ? (
                <TalismanPage
                  onBack={goHomeLanding}
                  userKey={tossUserKey ? String(tossUserKey) : undefined}
                  isLoggedIn={isLoggedIn}
                  drawCount={drawCount}
                  onTicketUpdate={updateDrawCount}
                  hasViewedFortuneToday={resultHistory.some(item =>
                    item.type === 'fortune' &&
                    new Date(item.timestamp).toDateString() === new Date().toDateString()
                  )}
                  onGoToFortune={() => setActiveTab('fortune')}
                  gender={tossUserGender}
                  birthday={tossUserBirthday}
                  ageGroup={tossUserAgeGroup}
                />
              ) : renderLoginRequired('부적은 로그인 후 이용할 수 있어요', '토스 로그인하고 오늘의 부적을 받아보세요.')
            ) : activeTab === 'fortune' ? (
              <FortuneResultView
                isSpinning
                result={null}
                selectionSummary="오늘의 전체운세"
                onBack={goHomeLanding}
                onRetry={() => handleFortuneSelect(TODAY_TOTAL_FORTUNE_OPTION)}
                onShare={handleShareReward}
                openConfirm={confirm}
              />
            ) : activeTab === 'reward-gacha' ? (
              isLoggedIn ? (
                <RewardGachaPage
                  drawCount={drawCount}
                  userPoints={userPoints}
                  isAdLoading={isAdLoading}
                  adLoadError={adLoadError}
                  onBack={goHomeLanding}
                  onRecharge={() => setIsTicketSheetOpen(true)}
                  onShowInterstitialAd={showInterstitialAd}
                  onShowQuickInterstitialAd={showGachaInterstitialAd}
                  onShowRewardedAd={showGachaRewardedAd}
                  onDraw={handleGachaDraw}
                  onClaimReward={handleRewardGachaClaim}
                />
              ) : renderLoginRequired('행운 뽑기는 로그인 후 이용할 수 있어요', '토스 로그인하고 포인트 뽑기를 시작해 보세요.')
            ) : activeTab === 'reward-quiz' ? (
              isLoggedIn ? (
                <RewardQuizPage
                  onBack={goHomeLanding}
                  drawCount={drawCount}
                  userKey={String(tossUserKey || '')}
                  onTicketUse={(remainingTickets) => {
                    if (typeof remainingTickets === 'number') {
                      updateDrawCount(remainingTickets);
                      return;
                    }
                    updateDrawCount(prev => Math.max(0, prev - 1));
                  }}
	                  onQuizReward={(pointsAwarded, totalPoints) => {
	                    applyBalancedRewardPoints('reward-quiz:submit', pointsAwarded, totalPoints, REWARD_POINT_LIMITS.rewardQuiz);
	                  }}
                />
              ) : renderLoginRequired('퀴즈는 로그인 후 이용할 수 있어요', '토스 로그인하고 퀴즈를 풀어보세요.')
            ) : activeTab === 'crossword' ? (
              isLoggedIn ? (
                <CrosswordGame
                  tickets={drawCount}
                  userKey={String(tossUserKey || '')}
                  onTicketUpdate={updateDrawCount}
                  onPointsSync={(totalPoints) => updateUserPoints(totalPoints, 'crossword:solve')}
                  onBack={goHomeLanding}
                  onAlert={alert}
                />
              ) : renderLoginRequired('단어 찾기는 로그인 후 이용할 수 있어요', '토스 로그인하고 숨은 단어를 찾아보세요.')
            ) : activeTab === 'idiom-quiz' ? (
              isLoggedIn ? (
                <IdiomQuizPage
                  onBack={goHomeLanding}
                  drawCount={drawCount}
                  userKey={String(tossUserKey || '')}
                  onTicketUse={(remainingTickets) => {
                    if (typeof remainingTickets === 'number') {
                      updateDrawCount(remainingTickets);
                      return;
                    }
                    updateDrawCount(prev => Math.max(0, prev - 1));
                  }}
	                  onQuizReward={(pointsAwarded, totalPoints) => {
	                    applyBalancedRewardPoints('idiom-quiz:submit', pointsAwarded, totalPoints, REWARD_POINT_LIMITS.idiomQuiz);
	                  }}
                />
              ) : renderLoginRequired('사자성어 퀴즈는 로그인 후 이용할 수 있어요', '토스 로그인하고 퀴즈를 풀어보세요.')
            ) : activeTab === 'scratch-lottery' ? (
              isLoggedIn ? (
                <ScratchLotteryPage
                  userKey={String(tossUserKey)}
                  userPoints={userPoints}
                  drawCount={drawCount}
                  onBack={goHomeLanding}
	                  onClaimReward={(points) => {
	                    const safePoints = clampRewardPoints(points, REWARD_POINT_LIMITS.scratch);
	                    if (safePoints > 0) updateUserPoints(prev => prev + safePoints, 'scratch:onClaimReward');
	                  }}
                  onPointsSync={(newTotal) => updateUserPoints(newTotal, 'scratch:reveal')}
                />
              ) : renderLoginRequired('복권 긁기는 로그인 후 이용할 수 있어요', '토스 로그인하고 복권을 긁어보세요.')
            ) : (
              <motion.div
                key="landing-empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            )}
          </AnimatePresence>
        </Suspense>
      </main>

      {/* 티켓받기 바텀시트 (광고 + 구매 진입) */}
      <AnimatePresence>
        {isTicketSheetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTicketSheetOpen(false)}
              className="fixed inset-0 bg-black/40 z-[100]"
            />
            <motion.div
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100) {
                  setIsTicketSheetOpen(false);
                }
              }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-[101] max-h-[85vh] overflow-y-auto rounded-t-[28px] bg-white px-6 pt-2 shadow-2xl pb-safe-4"
            >
              <div className="mx-auto my-4 h-1.5 w-12 cursor-grab rounded-full bg-toss-gray-200 active:cursor-grabbing" />
              <RewardList
                mode="rewardsOnly"
                handleWatchAd={handleWatchAd}
                isAdLoading={isAdLoading}
              />

            </motion.div>
          </>
        )}
      </AnimatePresence>

      <Sheet
        open={isWelcomeSheetOpen}
        onOpenChange={setIsWelcomeSheetOpen}
        ariaLabel="시작 안내"
      >
        <div className="pb-2 text-left">
          <h2 className="t-title text-toss-gray-900">환영해요</h2>
          <div className="mt-4 space-y-2">
            {['매일 무료 이용권을 받아요', '게임하면 포인트가 쌓여요', '포인트는 이용권으로 바꿔요'].map((text) => (
              <p key={text} className="rounded-md border border-toss-gray-100 bg-cream px-4 py-3 t-body font-bold text-toss-gray-700">
                {text}
              </p>
            ))}
          </div>
          <Button
            className="mt-5"
            onClick={() => {
              setIsWelcomeSheetOpen(false);
              setStep('choose');
              setChooseStep(1);
              setActiveTab('home');
            }}
          >
            첫 뽑기 하러 가기
          </Button>
        </div>
      </Sheet>



      {/* Bottom Floating Tab Bar */}
      {(TAB_KEYS as readonly ActiveTab[]).includes(activeTab) && step === 'landing' && (
        <BottomNavigation
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          logClick={logClick}
        />
      )}

    </div>
    </NavAccessoryContext.Provider>
    </MotionConfig>
  );
}

export default App;
