import type { ReactNode } from 'react';
import { PageHeader } from '../ui';
import { Card } from '../ui/Card';
import { cn } from '../../utils/cn';

interface GameShellProps {
  title: string;
  onBack?: () => void;
  accessory?: ReactNode;
  board: ReactNode;
  odds?: ReactNode;
  status?: ReactNode;
  cta?: ReactNode;
  className?: string;
}

export function GameShell({
  title,
  onBack,
  accessory,
  board,
  odds,
  status,
  cta,
  className,
}: GameShellProps) {
  return (
    <div className={cn('-mx-5 -mt-10 flex min-h-[100dvh] flex-col bg-cream surface-play', className)}>
      <PageHeader title={title} onBack={onBack} accessory={accessory} className="shrink-0 bg-transparent" />
      <main className="flex flex-1 flex-col gap-4 px-5 pb-28">
        <Card surface="play" className="p-4">
          {board}
          {odds && <div className="mt-4">{odds}</div>}
        </Card>
        {status && <div className="t-caption text-center text-toss-gray-600">{status}</div>}
      </main>
      {cta && (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[520px] bg-cream px-5 py-4 pb-safe-4">
          {cta}
        </div>
      )}
    </div>
  );
}
