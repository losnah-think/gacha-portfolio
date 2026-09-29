import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';
import { Card } from '../../../shared/components/ui';
import type { Persona, ResultHistoryItem } from '../../../shared/types';
import { cn } from '../../../shared/utils/cn';

interface HistoryContentCardProps {
  item: ResultHistoryItem;
  personas?: Persona[];
  fontSize: number;
  showAttribution?: boolean;
}

const getLottoBallClass = (num: number) => {
  if (num <= 10) return 'bg-[#FBC400]';
  if (num <= 20) return 'bg-[#69C8F2]';
  if (num <= 30) return 'bg-[#FF7272]';
  if (num <= 40) return 'bg-[#AAAAAA]';
  return 'bg-[#B0D840]';
};

export const HistoryContentCard = ({
  item,
  fontSize,
  showAttribution = true,
}: HistoryContentCardProps) => {
  return (
    <Card surface="reading" className="relative overflow-hidden p-6 pt-10">
      <Quote className="absolute -left-2 -top-2 text-toss-blue/5" size={96} />

      {item.numbers ? (
        <div className="relative z-10 flex flex-wrap justify-center gap-3 py-4">
          {item.numbers.map((num, index) => (
            <motion.div
              key={`${num}-${index}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 18, delay: index * 0.07 }}
              className={cn(
                'flex h-14 w-14 items-center justify-center rounded-full text-base font-bold text-white shadow-soft',
                getLottoBallClass(num),
              )}
            >
              {num}
            </motion.div>
          ))}
        </div>
      ) : (
        <p
          className="relative z-10 break-keep whitespace-pre-wrap font-bold leading-relaxed text-toss-gray-900"
          style={{ fontSize: `${fontSize}px` }}
        >
          "{item.content}"
        </p>
      )}

      {showAttribution && (
        <div className="relative z-10 mt-8 flex flex-col items-end gap-1">
          <div className="h-px w-8 bg-toss-blue/15" />
          <p className="t-caption font-bold text-toss-gray-400">{item.title}</p>
          <span className="t-micro rounded-sm border border-toss-gray-100 px-1.5 py-0.5 text-toss-gray-300">
            AI가 만든 참고용 글이에요
          </span>
        </div>
      )}
    </Card>
  );
};
