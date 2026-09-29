import { Skeleton } from './Skeleton';

export const PageLoader = () => (
  <div className="-mx-5 -mt-10 min-h-[100dvh] bg-cream px-5 pt-16 surface-play">
    <div className="mx-auto max-w-[520px] space-y-4">
      <Skeleton card lines={3} />
      <Skeleton card lines={2} />
      <Skeleton card lines={2} />
    </div>
  </div>
);
