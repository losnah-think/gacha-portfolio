import { motion } from 'framer-motion';
import { IS_PUBLIC_BROWSER } from '../../../public-browser/config';
import { useState, useEffect } from 'react';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import {
  ArrowRight,
  BookOpenCheck,
  ChevronRight,
  CircleDollarSign,
  CloudSun,
  HelpCircle,
  MessageCircle,
  Plus,
  Search,
  Send,
  Ticket,
  User,
  Wallet,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PromotedBanner } from '../../../shared/components/PromotedBanner';
import { GameCard } from '../../../shared/components/game/GameCard';
import { Button } from '../../../shared/components/ui/Button';
import { Card } from '../../../shared/components/ui/Card';
import { AppImage } from '../../../shared/components/ui/AppImage';
import { TicketCostButton } from '../../../shared/components/ui/TicketCostButton';
import { POINT_CONVERT_COST } from '../../../shared/constants/rewardEconomy';
import { fadeUp, staggerList } from '../../../shared/motion';
import { cn } from '../../../shared/utils/cn';

import { WeatherCard } from './WeatherCard';
import { logClick } from '../../../utils/analytics';

interface LandingViewProps {
  drawCount: number;
  userPoints?: number;
  userName?: string;
  isLoggedIn?: boolean;
  consecutiveDays?: number;
  /** 히어로 CTA — 오늘의 운세 (이용권 1장) */
  onGoFortune: () => void;
  /** 로또 번호 뽑기 */
  onGoLotto: () => void;
  /** 지갑 칩 탭 / 충전 → 티켓 시트 */
  onOpenTicketSheet: () => void;
  /** 프로필 아이콘 → 마이페이지 */
  onOpenProfile?: () => void;
  onLogin?: () => void;
  /** 고민 물어보기 — 전송 성공 시 true 반환(성공 시에만 입력을 비워요) */
  onQuickAsk?: (question: string) => boolean;
  onOpenAsk?: () => void;
  /** 포인트 지갑 → 포인트 사용(교환) */
  onConvertPoints?: () => void;
  /** 확인 시트 오픈(포인트 사용 확인용) */
  openConfirm?: (config: {
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  }) => void;
  // 게임 (결정 A — 홈 Z4 존치)
  onGoScratchLottery?: () => void;
  onGoRewardGacha?: () => void;
  onGoQuiz?: () => void;
  onGoRoulette?: () => void;
  onGoCrossword?: () => void;
  onGoIdiomQuiz?: () => void;
}

const stagger = staggerList(0.04);

const QUICK_ASK_PLACEHOLDERS = [
  '요즘 마음이 답답해요',
  '가족과 말이 잘 안 통해요',
  '일을 계속해야 할지 고민돼요',
  '돈 문제로 걱정이에요',
  '건강이 자꾸 신경 쓰여요',
  '오늘 중요한 선택을 해야 해요',
  '자녀와 사이가 어려워요',
  '마음 편해지는 말을 듣고 싶어요',
];

interface GameItem {
  title: string;
  desc: string;
  badge: string;
  meta: string;
  Icon: LucideIcon;
  onClick?: () => void;
  clickName: string;
  testId?: string;
}

const QuickAskInput = ({ onAsk }: { onAsk: (q: string) => boolean }) => {
  const [value, setValue] = useState('');
  const [phIndex, setPhIndex] = useState(0);

  // [RD2-13] 타자기 상시 리렌더를 4초 주기 페이드 로테이션으로 교체
  useEffect(() => {
    const id = setInterval(() => {
      setPhIndex((i) => (i + 1) % QUICK_ASK_PLACEHOLDERS.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const handleSend = () => {
    const question = value.trim();
    if (!question) return;
    const submitted = onAsk(question);
    // [RD2-9] 전송이 성공했을 때만 입력을 비워요(미로그인 등으로 막히면 보존)
    if (submitted) setValue('');
  };

  return (
    <div className="relative flex items-end gap-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder={QUICK_ASK_PLACEHOLDERS[phIndex]}
        rows={2}
        className="t-body-lg flex-1 resize-none rounded-md border-2 border-ink-soft bg-paper px-4 py-3 text-toss-gray-800 placeholder:text-toss-gray-300 focus:border-toss-blue focus:outline-none"
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={!value.trim()}
        aria-label="고민 보내기"
        className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-md border-2 border-ink-deep bg-toss-blue text-white shadow-hard active:translate-x-1 active:translate-y-1 active:shadow-none disabled:bg-toss-gray-200 disabled:text-toss-gray-400 disabled:shadow-none"
      >
        <Send size={16} />
      </button>
    </div>
  );
};

export const LandingView = ({
  drawCount,
  userPoints = 0,
  userName,
  isLoggedIn = false,
  onGoFortune,
  onGoLotto,
  onOpenTicketSheet,
  onOpenProfile,
  onLogin,
  onQuickAsk,
  onOpenAsk,
  onConvertPoints,
  openConfirm,
  onGoScratchLottery,
  onGoRewardGacha,
  onGoQuiz,
  onGoRoulette,
  onGoCrossword,
  onGoIdiomQuiz,
}: LandingViewProps) => {
  useAppNavigationBar({ title: '오늘의 이야기를 확인해요' });

  const showRewardHub = Boolean(isLoggedIn && onConvertPoints && openConfirm);

  const handleConvertPoints = () => {
    logClick('home_reward_convert');
    if (userPoints < POINT_CONVERT_COST) {
      openConfirm?.({
        title: `${POINT_CONVERT_COST}점부터 사용할 수 있어요`,
        description: `지금 ${userPoints.toLocaleString()}점을 모았어요.\n조금만 더 모아볼까요?`,
        confirmText: '확인',
        cancelText: '닫기',
        onConfirm: () => {},
      });
      return;
    }
    openConfirm?.({
      title: `${POINT_CONVERT_COST}점을 사용할까요?`,
      description: `포인트를 사용해 혜택을 받아요.\n지금 ${userPoints.toLocaleString()}점을 모았어요.`,
      confirmText: '지금 사용하기',
      cancelText: '나중에 할게요',
      onConfirm: () => onConvertPoints?.(),
    });
  };

  const greeting = isLoggedIn && userName?.trim()
    ? `${userName.trim()}님, 오늘의 운세가 준비됐어요`
    : '반가워요, 오늘의 운세를 확인해 보세요';

  const games: GameItem[] = [
    { title: '오늘의 돌림판', desc: '돌리고 포인트 확인', badge: '참여 가능', meta: '이용권 1장 · 최대 10점', Icon: CircleDollarSign, onClick: onGoRoulette, clickName: 'home_reward_roulette' },
    { title: '황금 복권', desc: '숫자 맞히고 포인트 받기', badge: '광고', meta: '광고 · 최대 10점', Icon: Ticket, onClick: onGoScratchLottery, clickName: 'home_reward_scratch_lottery' },
    { title: '행운 뽑기', desc: '이용권으로 포인트 뽑기', badge: '추천', meta: '이용권 1장 · 최대 10점', Icon: Zap, onClick: onGoRewardGacha, clickName: 'home_reward_gacha' },
    { title: '문제 맞히기', desc: '맞다·아니다 퀴즈 10개', badge: '10문제', meta: '이용권 1장 · 최대 10점', Icon: HelpCircle, onClick: onGoQuiz, clickName: 'home_reward_quiz', testId: 'home-reward-quiz' },
    { title: '사자성어', desc: '뜻풀이 보고 맞히기', badge: '2점', meta: '이용권 1장 · 최대 10점', Icon: BookOpenCheck, onClick: onGoIdiomQuiz, clickName: 'home_reward_idiom_quiz' },
    { title: '단어 찾기', desc: '숨은 단어를 찾아요', badge: '두뇌', meta: '이용권 1장 · 최대 10점', Icon: Search, onClick: onGoCrossword, clickName: 'home_reward_crossword' },
  ].filter((item) => Boolean(item.onClick));

  const handleGameClick = (item: GameItem) => {
    logClick(item.clickName);
    item.onClick?.();
  };

  return (
    <div className="flex flex-col gap-4 pb-6 text-left">
      {/* ── Z1~Z3: 첫 뷰포트 (stagger 0.04) ─────────────── */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-4">
        {/* Z1 헤더 — 인사 + 지갑 칩 + 프로필 */}
        <motion.header variants={fadeUp} className="flex items-start justify-between gap-3">
          <h1 className="t-title min-w-0 flex-1 text-toss-gray-900 break-keep">{greeting}</h1>
          {isLoggedIn ? (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onOpenTicketSheet}
                aria-label={`이용권 ${drawCount}장, 포인트 ${userPoints}점, 이용권 받기`}
                className="flex min-h-11 items-center gap-2 rounded-md border-2 border-ink bg-cream px-3 py-2 shadow-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                <Ticket size={15} className="text-toss-blue" strokeWidth={2.6} />
                <span className="t-caption font-bold text-toss-gray-900 tabular-nums">{drawCount}</span>
                <span className="h-3 w-px bg-toss-gray-200" aria-hidden="true" />
                <Wallet size={14} className="text-warning" strokeWidth={2.6} />
                <span className="t-caption font-bold text-toss-gray-900 tabular-nums">{userPoints.toLocaleString()}</span>
                <Plus size={14} className="text-toss-blue" strokeWidth={3} />
              </button>
              {onOpenProfile && (
                <button
                  type="button"
                  onClick={onOpenProfile}
                  aria-label="내 프로필"
                  className="flex h-11 w-11 items-center justify-center rounded-md border-2 border-ink bg-cream shadow-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  <User size={18} className="text-toss-gray-700" strokeWidth={2.4} />
                </button>
              )}
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={onLogin} className="w-auto shrink-0">
              로그인하고 시작하기
            </Button>
          )}
        </motion.header>

        {/* Z2 히어로 — 단일 CTA (TicketCostButton) */}
        <motion.div variants={fadeUp}>
          <Card surface="play" className="p-4">
            <div className="flex items-center gap-3">
              <div className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-md border-2 border-ink bg-cream">
                <AppImage
                  src="/images/home/today-fortune-hero.png"
                  alt=""
                  width={88}
                  eager
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="t-display text-toss-gray-900 break-keep">오늘의 운세</h2>
                <p className="t-body mt-1 text-toss-gray-600 break-keep">
                  연애·재물·건강·학업을 한 번에 확인해요
                </p>
              </div>
            </div>
            <TicketCostButton
              className="mt-4"
              cost={IS_PUBLIC_BROWSER ? 0 : 1}
              balance={drawCount}
              onConfirm={onGoFortune}
              onRecharge={onOpenTicketSheet}
            >
              오늘 운세 보기
            </TicketCostButton>
          </Card>
        </motion.div>
      </motion.div>

      {/* ── Z4 콘텐츠 & 게임 (즉시 렌더) ───────────────── */}
      <section className="flex flex-col gap-3">
        {/* 고민 물어보기 */}
        {onQuickAsk && (
          <Card surface="play" className="p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-cream">
                <AppImage src="/images/personas/socrates.png" alt="" width={36} className="h-9 w-9 object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="t-section text-toss-gray-900">고민 물어보기</p>
                <p className="t-caption mt-0.5 text-toss-gray-500">가차 캐릭터가 차분히 답해요</p>
              </div>
              <MessageCircle size={20} className="shrink-0 text-toss-blue" strokeWidth={2.4} />
            </div>
            <QuickAskInput onAsk={onQuickAsk} />
            {onOpenAsk && (
              <Button variant="secondary" size="sm" className="mt-3" onClick={onOpenAsk}>
                <MessageCircle size={16} strokeWidth={2.4} />
                캐릭터 고르고 이야기하기
                <ChevronRight size={16} strokeWidth={2.6} />
              </Button>
            )}
          </Card>
        )}

        {/* 로또 번호 뽑기 */}
        <Card surface="play" interactive className="flex items-center gap-3 p-4" onClick={onGoLotto}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-cream text-warning">
            <CircleDollarSign size={20} strokeWidth={2.4} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-section block text-toss-gray-900">로또 번호 뽑기</span>
            <span className="t-caption mt-0.5 block text-toss-gray-500">
              {drawCount > 0 ? '행운의 번호를 자동으로 뽑아요' : '이용권을 받으면 바로 뽑을 수 있어요'}
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-toss-gray-500" strokeWidth={2.4} />
        </Card>

        {/* 게임 6종 그리드 (결정 A — 홈 Z4 통합) */}
        {games.length > 0 && (
          <div>
            <div className="mb-2 flex items-end justify-between gap-3">
              <p className="t-section text-toss-gray-900">포인트 놀이</p>
              <span className="t-caption text-toss-gray-500">홈에서 바로 참여해요</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {games.map((item) => (
                <GameCard
                  key={item.title}
                  title={item.title}
                  description={item.desc}
                  meta={item.meta}
                  badge={item.badge}
                  icon={<item.Icon size={18} strokeWidth={2.4} />}
                  testId={item.testId}
                  onClick={() => handleGameClick(item)}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Z5 포인트 지갑 허브 (리워드 탭 통합) ─────────── */}
      {showRewardHub && (
        <section>
          <Card surface="play" className="p-4">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-cream text-warning">
                <Wallet size={20} strokeWidth={2.4} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="t-section text-toss-gray-900">내 포인트 지갑</p>
                <p className="t-caption mt-0.5 text-toss-gray-500">모은 포인트로 이용권을 받아요</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-3">
              <p className="min-w-0">
                <span className="t-display text-toss-gray-900 tabular-nums">{userPoints.toLocaleString()}</span>
                <span className="t-title text-toss-gray-900"> 점</span>
              </p>
              <Button
                variant="primary"
                size="sm"
                className="w-auto shrink-0"
                onClick={handleConvertPoints}
              >
                포인트 사용하기
                <ArrowRight size={16} strokeWidth={2.6} />
              </Button>
            </div>
            <p className="t-caption mt-3 text-toss-gray-500">
              포인트는 {POINT_CONVERT_COST}점부터 사용할 수 있어요
            </p>
          </Card>
        </section>
      )}

      <PromotedBanner label="광고" variant="expanded" className="px-0" />

      {/* ── Z6 푸터 — 날씨 + AI 고지 ─────────────────────── */}
      <Card surface="play" className="p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-cream text-toss-blue">
            <CloudSun size={18} strokeWidth={2.4} />
          </div>
          <div>
            <p className="t-section text-toss-gray-900">오늘의 날씨</p>
            <p className="t-caption mt-0.5 text-toss-gray-500">내 위치 기준</p>
          </div>
        </div>
        <WeatherCard compact />
      </Card>

      <p className={cn('t-caption pt-2 pb-2 text-center text-toss-gray-400')}>
        자동으로 만든 이야기예요 · 참고만 해주세요
      </p>
    </div>
  );
};
