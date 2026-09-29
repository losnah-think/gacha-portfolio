import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '../../utils/cn';

interface PageHeaderProps {
  title: string;
  onBack?: () => void;
  accessory?: ReactNode;
  className?: string;
}

export const PageHeader = ({ accessory, className, onBack, title }: PageHeaderProps) => (
  <header className={cn('flex min-h-14 items-center gap-3 bg-paper px-4 pt-safe', className)}>
    {onBack && (
      <button
        type="button"
        aria-label="이전 화면으로"
        onClick={onBack}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-toss-gray-700 active:bg-toss-gray-50"
      >
        <ChevronLeft size={24} aria-hidden="true" />
      </button>
    )}
    <h1 className="t-title min-w-0 flex-1 truncate text-toss-gray-900">{title}</h1>
    {accessory && <div className="shrink-0">{accessory}</div>}
  </header>
);
