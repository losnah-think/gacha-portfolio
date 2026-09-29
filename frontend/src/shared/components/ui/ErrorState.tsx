import { AlertTriangle } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { cn } from '../../utils/cn';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState = ({ className, message = '잠깐 문제가 생겼어요', onRetry }: ErrorStateProps) => (
  <Card surface="reading" className={cn('px-5 py-8 text-center', className)}>
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-toss-red/10 text-danger">
      <AlertTriangle size={24} aria-hidden="true" />
    </div>
    <h3 className="t-section text-toss-gray-900">{message}</h3>
    <p className="t-body mt-2 text-toss-gray-500">다시 시도하면 대부분 해결돼요.</p>
    {onRetry && (
      <Button className="mt-5" onClick={onRetry}>
        다시 시도
      </Button>
    )}
  </Card>
);
