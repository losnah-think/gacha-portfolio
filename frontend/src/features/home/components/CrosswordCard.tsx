import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { AppImage } from '../../../shared/components/ui';

interface CrosswordCardProps {
  onClick: () => void;
}

export const CrosswordCard = ({ onClick }: CrosswordCardProps) => {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-[28px] text-left group"
    >
      {/* 배경 — 에메랄드 그라데이션 */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600" />
      {/* 빛 효과 */}
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-teal-300/40 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-emerald-400/30 blur-2xl pointer-events-none" />
      {/* 캐릭터 장식 */}
      <AppImage src="/images/personas/einstein.png" alt="" width={56} className="absolute top-0 right-2 w-14 h-14 opacity-[0.18] pointer-events-none select-none -rotate-6 object-contain" />
      <AppImage src="/images/personas/smartphone.png" alt="" width={36} className="absolute bottom-0 left-2 w-9 h-9 opacity-[0.12] pointer-events-none select-none rotate-12 object-contain" />
      {/* 격자 패턴 */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(255,255,255,0.5) 20px, rgba(255,255,255,0.5) 21px), repeating-linear-gradient(90deg, transparent, transparent 20px, rgba(255,255,255,0.5) 20px, rgba(255,255,255,0.5) 21px)',
      }} />

      <div className="relative px-5 py-5 flex items-center gap-4">
        {/* 아이콘 */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm shadow-lg shadow-emerald-700/20 group-hover:scale-105 transition-transform overflow-hidden">
          <AppImage src="/images/personas/writer.png" alt="" width={44} className="w-11 h-11 object-contain" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/25 backdrop-blur-sm px-2.5 py-0.5 t-micro font-black text-white">두뇌 게임</span>
          </div>
          <p className="mt-1.5 text-[18px] font-black text-white leading-tight tracking-tight drop-shadow-sm">
            단어를 이어보세요
          </p>
          <p className="mt-1 text-[12px] font-bold text-white/70">
            숨겨진 단어 찾고 15점 받아보세요
          </p>
        </div>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm text-white shadow-sm transition-transform group-hover:translate-x-0.5">
          <ChevronRight size={16} />
        </div>
      </div>
    </motion.button>
  );
};
