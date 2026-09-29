import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { AppImage } from '../../../shared/components/ui';

interface TalismanCardProps {
  onClick: () => void;
}

export const TalismanCard = ({ onClick }: TalismanCardProps) => (
  <motion.button
    whileTap={{ scale: 0.97 }}
    onClick={onClick}
    className="relative w-full flex items-center gap-3.5 overflow-hidden rounded-[22px] border border-violet-200/60 bg-[linear-gradient(135deg,rgba(15,10,40,0.97),rgba(35,20,80,0.95)_60%,rgba(25,10,65,0.97))] px-4 py-4 text-left shadow-[0_4px_14px_rgba(88,28,135,0.12)] group"
  >
    {/* 별 파티클 */}
    {[...Array(4)].map((_, i) => (
      <div key={i} className="absolute rounded-full bg-white pointer-events-none"
        style={{ width: i % 2 === 0 ? 2 : 1, height: i % 2 === 0 ? 2 : 1,
          opacity: 0.06 + (i % 3) * 0.03,
          left: `${(i * 41 + 10) % 85}%`, top: `${(i * 53 + 12) % 65}%` }} />
    ))}

    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 transition-transform group-hover:scale-110 overflow-hidden">
      <AppImage src="/images/personas/socrates.png" alt="" width={32} className="w-8 h-8 object-contain" />
    </div>

    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <p className="text-[14px] font-black text-white/90 leading-tight">부적과 좋은 말</p>
        <span className="rounded-full bg-violet-500/20 px-2 py-0.5 t-micro font-black text-violet-300">새로움</span>
      </div>
      <p className="text-[12px] font-bold text-white/40 mt-0.5">오늘의 부적과 좋은 말</p>
    </div>

    <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center">
      <ArrowRight size={16} className="text-white/30" strokeWidth={3} />
    </div>
  </motion.button>
);
