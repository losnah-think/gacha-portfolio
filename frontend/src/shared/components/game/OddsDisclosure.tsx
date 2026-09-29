import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Skeleton } from '../ui';
import { cn } from '../../utils/cn';

interface OddsItem {
  label: string;
  probability: string;
  tone?: 'common' | 'rare' | 'epic' | 'legendary';
}

interface OddsDisclosureProps {
  items?: OddsItem[];
}

const toneClass = {
  common: 'bg-rarity-common',
  rare: 'bg-rarity-rare',
  epic: 'bg-rarity-epic',
  legendary: 'bg-rarity-legendary',
} as const;

export function OddsDisclosure({ items }: OddsDisclosureProps) {
  const [open, setOpen] = useState(false);

  if (!items) {
    return <Skeleton className="h-9 w-full" />;
  }

  return (
    <div className="rounded-md border border-ink-soft bg-paper">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left"
      >
        <span className="t-caption font-bold text-toss-gray-700">상품과 확률 보기</span>
        <ChevronDown size={16} className={cn('text-toss-gray-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-ink-soft px-3 py-3">
          {items.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', toneClass[item.tone ?? 'common'])} />
                <span className="t-caption min-w-0 text-toss-gray-700">{item.label}</span>
              </span>
              <span className="t-caption font-bold text-toss-gray-900 tabular-nums">{item.probability}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
