import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import type { Persona, ResultHistoryItem } from '../../../shared/types';
import { Button, ErrorState, Skeleton } from '../../../shared/components/ui';
import { HistoryContentCard } from './HistoryContentCard';

interface SharedResultViewProps {
  item: ResultHistoryItem | null;
  personas: Persona[];
  isLoading?: boolean;
  error?: boolean;
  onStart: () => void;
  onExplore: () => void;
}

export const SharedResultView = ({
  item,
  personas,
  isLoading = false,
  error = false,
  onStart,
  onExplore,
}: SharedResultViewProps) => {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton card lines={3} />
        <Skeleton card lines={6} />
      </div>
    );
  }

  if (error || !item) {
    return (
      <ErrorState
        message="결과를 불러오지 못했어요"
        onRetry={onStart}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className="space-y-5 pb-24"
    >
      <header className="space-y-2">
        <p className="t-caption flex items-center gap-1.5 font-bold text-toss-blue">
          <Sparkles size={14} />
          공유받은 행운
        </p>
        <h1 className="t-display text-toss-gray-900 break-keep">{item.title}</h1>
        <p className="t-body text-toss-gray-500">친구가 뽑은 결과를 읽어보세요.</p>
      </header>

      <HistoryContentCard item={item} personas={personas} fontSize={15} />

      {item.moral && (
        <div className="rounded-lg border border-toss-gray-100 bg-paper p-5 text-center shadow-soft">
          <p className="t-caption font-bold text-toss-blue">교훈</p>
          <p className="t-body mt-2 font-bold text-toss-gray-900">{item.moral}</p>
        </div>
      )}

      <div className="space-y-3">
        <Button onClick={onStart}>나도 행운 뽑기</Button>
        <Button variant="ghost" onClick={onExplore}>가차 구경하기</Button>
      </div>
    </motion.div>
  );
};
