import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { AppImage } from '../../../shared/components/ui';

interface FortuneCardProps {
  onClick: () => void;
}

export const FortuneCard = ({ onClick }: FortuneCardProps) => {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-[28px] text-left group"
    >
      {/* 배경 — 진한 금빛 그라데이션 */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-500 via-yellow-500 to-orange-500" />
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-yellow-300/40 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-orange-400/30 blur-2xl pointer-events-none" />
      <AppImage src="/images/personas/yi_sun_shin.png" alt="" width={64} className="absolute top-0 right-2 w-16 h-16 opacity-[0.2] pointer-events-none select-none rotate-12 object-contain" />
      <AppImage src="/images/personas/writer.png" alt="" width={40} className="absolute bottom-0 left-3 w-10 h-10 opacity-[0.15] pointer-events-none select-none -rotate-6 object-contain" />
      <AppImage src="/images/personas/socrates.png" alt="" width={32} className="absolute top-3 left-4 w-8 h-8 opacity-[0.1] pointer-events-none select-none -rotate-8 object-contain" />
      <AppImage src="/images/personas/einstein.png" alt="" width={28} className="absolute bottom-2 right-14 w-7 h-7 opacity-[0.08] pointer-events-none select-none rotate-15 object-contain" />

      <div className="relative px-5 py-5 flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shadow-lg shadow-amber-700/20 group-hover:scale-105 transition-transform overflow-hidden">
          <AppImage src="/images/personas/king_sejong.png" alt="" width={44} className="w-11 h-11 object-contain" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded-full bg-white/25 backdrop-blur-sm px-2.5 py-0.5 t-micro font-black text-white">타로 · 사주</span>
            <span className="rounded-full bg-black/15 backdrop-blur-sm px-2 py-0.5 t-micro font-bold text-white/90">🎟️ −1</span>
          </div>
          <p className="mt-1.5 text-[18px] font-black text-white leading-tight tracking-tight drop-shadow-sm">
            오늘의 운세
          </p>
          <p className="mt-1 text-[12px] font-bold text-white/70">
            연애 · 재물 · 건강 · 학업 한눈에 확인
          </p>
        </div>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm text-white shadow-sm transition-transform group-hover:translate-x-0.5">
          <ChevronRight size={16} />
        </div>
      </div>
    </motion.button>
  );
};
