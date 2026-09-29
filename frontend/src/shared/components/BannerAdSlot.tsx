import { useRef, useEffect, memo, useState } from 'react';
import { useTossBanner } from '../../hooks/useTossBanner';
import { BANNER_AD_GROUP_ID } from '../constants/app';
import { Skeleton } from './ui';

interface BannerAdSlotProps {
  /** 추가 className (마진/패딩 조절용) */
  className?: string;
  /** 광고 그룹 ID 오버라이드 */
  adGroupId?: string;
  /** TossAds 스타일 옵션 (theme, tone, variant) */
  adOptions?: { theme?: string; tone?: string; variant?: string };
}

/**
 * 재사용 가능한 배너 광고 슬롯
 * 각 페이지 하단/중간에 자연스럽게 삽입할 수 있습니다.
 */
export const BannerAdSlot = memo(({ className = '', adGroupId, adOptions }: BannerAdSlotProps) => {
  const bannerRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const { isInitialized, attachBanner } = useTossBanner();
  const isTextVariant = adOptions?.variant === 'text';
  const theme = adOptions?.theme;
  const tone = adOptions?.tone;
  const variant = adOptions?.variant;

  useEffect(() => {
    if (!isInitialized || !bannerRef.current) return;
    const element = bannerRef.current;

    const attached = attachBanner(adGroupId || BANNER_AD_GROUP_ID, element, {
      theme,
      tone,
      variant,
      callbacks: {
        onAdRendered: () => setCollapsed(false),
        onNoFill: () => setCollapsed(true),
        onAdFailedToRender: () => setCollapsed(true),
      },
    });

    return () => {
      (attached as any)?.destroy?.();
      element.replaceChildren();
    };
  }, [isInitialized, attachBanner, adGroupId, theme, tone, variant]);

  return (
    <section className={`w-full px-5 transition-all duration-200 ${collapsed ? 'my-0 max-h-0 overflow-hidden opacity-0' : `my-2 ${className}`}`}>
      <div
        ref={bannerRef}
        className={isTextVariant
          ? 'w-full min-h-[52px] rounded-2xl bg-transparent border-0 flex items-center justify-center overflow-hidden'
          : 'w-full min-h-[80px] rounded-[20px] bg-toss-gray-50/60 border border-toss-gray-100/50 flex items-center justify-center overflow-hidden'}
      >
        {!isInitialized && import.meta.env.DEV && (
          <p className={isTextVariant ? 'text-[12px] text-toss-gray-400 font-semibold py-3' : 'text-[12px] text-toss-gray-300 font-medium py-4'}>광고 영역</p>
        )}
        {!isInitialized && !import.meta.env.DEV && <Skeleton className="w-full px-4" lines={1} />}
      </div>
    </section>
  );
});
