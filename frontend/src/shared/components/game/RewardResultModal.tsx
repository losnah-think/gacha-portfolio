import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Share2, X } from 'lucide-react';
import { Button, Sheet, TicketCostButton } from '../ui';
import { fadeUp, SPRING, staggerList } from '../../motion';
import { cn } from '../../utils/cn';
import { REWARD_RARITY_CONFIG, type RewardRarity } from '../../constants/rarity';

interface RewardResultModalProps {
  open: boolean;
  points: number;
  rarity?: RewardRarity;
  title?: string;
  children?: ReactNode;
  retry?: { cost: number; balance: number; onRetry: () => void; onRecharge: () => void } | { freeLabel: string; onRetry: () => void };
  exhausted?: { label: string };
  nextGame?: { label: string; onGo: () => void };
  onShare?: () => void;
  onClose: () => void;
}

export function RewardResultModal({
  open,
  points,
  rarity,
  title = '포인트를 받았어요',
  children,
  retry,
  exhausted,
  nextGame,
  onShare,
  onClose,
}: RewardResultModalProps) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }} ariaLabel={title}>
      <motion.div variants={staggerList(0.06)} initial="hidden" animate="show" className="space-y-4 text-center">
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-md text-toss-gray-500"
        >
          <X size={18} />
        </button>
        {rarity && (
          <motion.span
            variants={fadeUp}
            transition={SPRING.bouncy}
            className={cn(
              't-micro inline-flex rounded-sm border px-3 py-1',
              REWARD_RARITY_CONFIG[rarity].borderColor,
              REWARD_RARITY_CONFIG[rarity].bgColor,
              REWARD_RARITY_CONFIG[rarity].color,
            )}
          >
            {REWARD_RARITY_CONFIG[rarity].label}
          </motion.span>
        )}
        <motion.div variants={fadeUp}>
          {points > 0 ? (
            <p className="t-display text-toss-gray-900 tabular-nums">+{points.toLocaleString()}점</p>
          ) : (
            <p className="t-display text-toss-gray-900">결과가 나왔어요</p>
          )}
          <p className="t-body mt-1 text-toss-gray-600">{title}</p>
        </motion.div>
        {children && <motion.div variants={fadeUp}>{children}</motion.div>}
        <motion.div variants={fadeUp} className="flex gap-2">
          {retry && 'cost' in retry && (
            <TicketCostButton
              cost={retry.cost}
              balance={retry.balance}
              onConfirm={retry.onRetry}
              onRecharge={retry.onRecharge}
              className="flex-1"
            >
              다시 하기
            </TicketCostButton>
          )}
          {retry && 'freeLabel' in retry && (
            <Button variant="primary" onClick={retry.onRetry} className="flex-1">
              {retry.freeLabel}
            </Button>
          )}
          {exhausted && (
            <Button variant="secondary" disabled className="flex-1">
              {exhausted.label}
            </Button>
          )}
          {onShare && (
            <Button variant="secondary" onClick={onShare} className="w-auto shrink-0 px-4">
              <Share2 size={16} />
            </Button>
          )}
        </motion.div>
        {nextGame && (
          <button type="button" onClick={nextGame.onGo} className="t-caption min-h-11 text-toss-blue">
            다른 게임도 해봐요 → {nextGame.label}
          </button>
        )}
      </motion.div>
    </Sheet>
  );
}
