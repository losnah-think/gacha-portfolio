import type { ReactNode } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  desc?: string;
  cta?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState = ({ className, cta, desc, icon, title }: EmptyStateProps) => (
  <Card surface="reading" className={cn('px-5 py-8 text-center', className)}>
    {icon && <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-toss-gray-50">{icon}</div>}
    <h3 className="t-section text-toss-gray-900">{title}</h3>
    {desc && <p className="t-body mt-2 text-toss-gray-500">{desc}</p>}
    {cta && (
      <Button variant="secondary" className="mt-5" onClick={cta.onClick}>
        {cta.label}
      </Button>
    )}
  </Card>
);
