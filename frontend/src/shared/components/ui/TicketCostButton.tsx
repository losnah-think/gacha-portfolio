import type { ReactNode } from 'react';
import { Button } from './Button';
import { cn } from '../../utils/cn';
import { IS_PUBLIC_BROWSER } from '../../../public-browser/config';

interface TicketCostButtonProps {
  cost: number;
  balance: number;
  onConfirm: () => void;
  onRecharge?: () => void;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
}

export const TicketCostButton = ({
  balance,
  children,
  className,
  cost,
  disabled,
  loading,
  onConfirm,
  onRecharge,
}: TicketCostButtonProps) => {
  const hasEnoughBalance = balance >= cost;
  const handleClick = hasEnoughBalance ? onConfirm : onRecharge;

  return (
    <Button
      className={className}
      disabled={disabled || !handleClick}
      loading={loading}
      onClick={handleClick}
      variant={hasEnoughBalance ? 'primary' : 'secondary'}
    >
      <span className="min-w-0 truncate">
        {children ?? (hasEnoughBalance ? '시작하기' : '이용권 받기')}
      </span>
      <span
        className={cn(
          't-micro shrink-0 rounded-sm border px-2 py-0.5',
          hasEnoughBalance ? 'border-white/40 bg-white/20 text-white' : 'border-ink-soft bg-paper text-toss-gray-700',
        )}
      >
        {IS_PUBLIC_BROWSER && cost === 0 ? '무료 웹 체험' : <>이용권 {cost}장</>}
      </span>
    </Button>
  );
};
