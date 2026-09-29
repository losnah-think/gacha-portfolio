import { cn } from '../../utils/cn';

interface SkeletonProps {
  lines?: number;
  card?: boolean;
  className?: string;
}

export const Skeleton = ({ card = false, className, lines = 1 }: SkeletonProps) => {
  if (card) {
    return (
      <div className={cn('rounded-lg border border-toss-gray-100 bg-paper p-4 shadow-soft', className)}>
        <div className="skeleton-shimmer h-4 w-2/3 rounded-sm" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: lines }).map((_, index) => (
            <div
              key={index}
              className={cn('skeleton-shimmer h-3 rounded-sm', index === lines - 1 ? 'w-4/5' : 'w-full')}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className={cn('skeleton-shimmer h-3 rounded-sm', index === lines - 1 ? 'w-3/4' : 'w-full')}
        />
      ))}
    </div>
  );
};
