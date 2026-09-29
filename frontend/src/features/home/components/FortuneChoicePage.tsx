import { motion } from 'framer-motion';
import {
    Heart,
    Briefcase,
    Coins,
    ShieldPlus,
    GraduationCap,
    Sparkles,
} from 'lucide-react';
import { memo } from 'react';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { BannerAdSlot } from '../../../shared/components/BannerAdSlot';
import { BANNER_AD_PERSONA_ID } from '../../../shared/constants/app';
import { TicketIcon } from '../../../shared/components/TicketIcon';

interface FortuneOption {
  id: string;
  name: string;
  arcana: string;
  counselor: string;
  description: string;
  tickets: number;
  icon: any;
  color: string;
  bg: string;
  glow: string;
}

const FORTUNE_OPTIONS: FortuneOption[] = [
  {
    id: 'total',
    name: '전체운',
    arcana: 'XXI · THE WORLD',
    counselor: '세계 아르카나',
    description: '오늘 하루 전반적인 운의 흐름을 살펴봐요',
    tickets: 1,
    icon: Sparkles,
    color: 'text-amber-500',
    bg: 'bg-amber-50',
    glow: '',
  },
  {
    id: 'love',
    name: '연애운',
    arcana: 'VI · THE LOVERS',
    counselor: '연인 아르카나',
    description: '사랑과 인연에 대한 오늘의 운을 확인해요',
    tickets: 1,
    icon: Heart,
    color: 'text-rose-500',
    bg: 'bg-rose-50',
    glow: '',
  },
  {
    id: 'business',
    name: '사업운',
    arcana: 'IV · THE EMPEROR',
    counselor: '황제 아르카나',
    description: '일과 커리어의 오늘 흐름을 살펴봐요',
    tickets: 1,
    icon: Briefcase,
    color: 'text-blue-500',
    bg: 'bg-blue-50',
    glow: '',
  },
  {
    id: 'wealth',
    name: '재물운',
    arcana: 'X · WHEEL OF FORTUNE',
    counselor: '운명의 수레바퀴',
    description: '돈과 재물의 오늘 흐름을 확인해요',
    tickets: 1,
    icon: Coins,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    glow: '',
  },
  {
    id: 'health',
    name: '건강운',
    arcana: 'XIV · TEMPERANCE',
    counselor: '절제 아르카나',
    description: '몸과 마음의 컨디션 운을 살펴봐요',
    tickets: 1,
    icon: ShieldPlus,
    color: 'text-emerald-500',
    bg: 'bg-emerald-50',
    glow: '',
  },
  {
    id: 'exam',
    name: '학업/시험',
    arcana: 'XX · JUDGEMENT',
    counselor: '심판 아르카나',
    description: '공부와 시험에 관한 오늘의 운을 확인해요',
    tickets: 1,
    icon: GraduationCap,
    color: 'text-violet-500',
    bg: 'bg-violet-50',
    glow: '',
  },
];

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function getTodayLabel() {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일`;
}

interface FortuneChoicePageProps {
  onBack: () => void;
  drawCount: number;
  onSelectOption: (option: FortuneOption) => void;
  hasViewedFortuneToday?: boolean;
}

export const FortuneChoicePage = memo(({ onBack, drawCount, onSelectOption, hasViewedFortuneToday }: FortuneChoicePageProps) => {
  useAppNavigationBar({
    title: '오늘의 운세',
    showBack: true,
    onBackPress: onBack,
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="-mx-5 -mt-10 flex flex-col min-h-[100dvh] bg-[#FFFDF7] pt-14 px-5 pb-16"
    >
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-7 pt-2">
        <div>
          <p className="text-[11px] font-black text-amber-400 tracking-[0.08em] mb-1">{getTodayLabel()}</p>
          <h1 className="text-[22px] font-black text-slate-900 tracking-tight leading-tight">
            오늘의 운세
          </h1>
          <p className="mt-1 text-[13px] font-bold text-slate-400">
            어떤 운이 궁금한가요?
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 px-3.5 py-2 rounded-2xl mt-1">
          <TicketIcon size={15} className="text-amber-500" />
          <span className="text-[14px] font-black text-amber-600 tabular-nums">{drawCount}장</span>
        </div>
      </div>

      {/* 오늘의 한줄 운세 배너 */}
      <div className="mb-5 rounded-[18px] bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-3.5 flex items-center gap-3">
        <span className="text-2xl">☀️</span>
        <div>
          <p className="text-[11px] font-black text-white/70 uppercase tracking-[0.1em]">Today's Energy</p>
          <p className="text-[13px] font-black text-white">오늘 하루 당신의 기운이 궁금하다면!</p>
        </div>
      </div>

      {/* 운세 목록 / 오늘 완료 상태 */}
      {hasViewedFortuneToday ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center justify-center py-10 gap-4"
        >
          <div className="w-16 h-16 rounded-[22px] bg-amber-50 flex items-center justify-center text-3xl shadow-sm">
            ✅
          </div>
          <div className="text-center">
            <p className="text-[17px] font-black text-slate-800 mb-1">오늘 운세를 이미 확인했어요</p>
            <p className="text-[13px] font-medium text-slate-400 leading-relaxed">
              내일 자정에 새 운세가 열려요
            </p>
          </div>
          <div className="w-full mt-2 rounded-[18px] bg-slate-50 border border-slate-100 p-4 space-y-3">
            {FORTUNE_OPTIONS.map(option => (
              <div key={option.id} className="flex items-center gap-3 opacity-35">
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${option.bg}`}>
                  <option.icon size={17} className={option.color} strokeWidth={2} />
                </div>
                <span className="text-[14px] font-black text-slate-700">{option.name}</span>
              </div>
            ))}
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5">
          {FORTUNE_OPTIONS.map((option, idx) => {
            const canAfford = drawCount >= option.tickets;
            return (
              <motion.button
                key={option.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelectOption(option)}
                disabled={!canAfford}
                className={`flex items-center gap-4 p-4 rounded-[20px] border text-left transition-all ${
                  canAfford
                    ? 'bg-white border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] active:bg-slate-50'
                    : 'bg-slate-50 border-slate-100 opacity-40'
                }`}
              >
                <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ${option.bg}`}>
                  <option.icon size={21} className={option.color} strokeWidth={2} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-black text-slate-900">{option.name}</span>
                    {option.id === 'total' && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 t-micro font-black text-amber-600">추천</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] font-medium text-slate-400 leading-snug">
                    {option.description}
                  </p>
                </div>

                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <TicketIcon size={11} className="text-amber-400" />
                  <span className="text-[12px] font-black text-amber-500">{option.tickets}</span>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      <BannerAdSlot adGroupId={BANNER_AD_PERSONA_ID} adOptions={{ variant: 'text' }} className="mt-5 opacity-60" />

      <div className="mt-5 text-center">
        <p className="text-[11px] font-medium text-slate-300 leading-relaxed">
          운세는 매일 오전 6시에 새로 갱신돼요
        </p>
      </div>
    </motion.div>
  );
});

FortuneChoicePage.displayName = 'FortuneChoicePage';
