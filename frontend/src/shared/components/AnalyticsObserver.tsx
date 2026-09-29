import React, { useEffect, useRef } from 'react';
import { logImpression } from '../../utils/analytics';

export const AnalyticsObserver = ({ 
  itemId, 
  children,
  className,
  params
}: { 
  itemId: string; 
  children: React.ReactNode;
  className?: string;
  params?: Record<string, unknown>;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const paramsRef = useRef(params);
  
  // Keep params ref up to date without triggering re-observation
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    
    // Server-side rendering or non-DOM environment check
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          logImpression(itemId, paramsRef.current);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [itemId]);

  return (
    <div ref={ref} className={className} data-item-id={itemId}>
      {children}
    </div>
  );
};
