import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Card } from '../ui';
import { cn } from '../../utils/cn';

type GameCardState = 'available' | 'cooldown' | 'exhausted';

interface GameCardProps {
  title: string;
  meta: string;
  icon: ReactNode;
  description?: string;
  badge?: string;
  state?: GameCardState;
  onClick?: () => void;
  testId?: string;
}

const stateClass: Record<GameCardState, string> = {
  available: 'border-success bg-success/10 text-success',
  cooldown: 'border-warning bg-warning/10 text-warning',
  exhausted: 'border-rarity-common bg-rarity-common/10 text-rarity-common',
};

export function GameCard({
  title,
  meta,
  icon,
  description,
  badge,
  state = 'available',
  onClick,
  testId,
}: GameCardProps) {
  return (
    <Card
      surface="play"
      interactive={Boolean(onClick)}
      onClick={onClick}
      data-testid={testId}
      className={cn('min-h-[118px] p-3', state === 'exhausted' && 'opacity-60')}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border-2 border-ink bg-paper text-toss-blue">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="t-body block font-bold text-toss-gray-900 break-keep">{title}</span>
            {badge && (
              <span className={cn('t-micro shrink-0 rounded-sm border px-2 py-0.5', stateClass[state])}>
                {badge}
              </span>
            )}
          </span>
          <span className="t-caption mt-1 block text-toss-gray-600 break-keep">{meta}</span>
          {description && (
            <span className="t-micro mt-1 block text-toss-gray-400 break-keep">{description}</span>
          )}
        </span>
        <ChevronRight size={16} className="mt-1 shrink-0 text-toss-gray-400" strokeWidth={2.4} />
      </div>
    </Card>
  );
}
