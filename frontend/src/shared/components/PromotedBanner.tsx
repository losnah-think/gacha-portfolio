import { useRef, useEffect, useState, memo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useTossBanner } from '../../hooks/useTossBanner';
import { BANNER_AD_GROUP_ID } from '../constants/app';
import { DUR } from '../motion';
import { cn } from '../utils/cn';

interface PromotedBannerProps {
  /** 문구 (배너 위에 표시 — 광고가 채워졌을 때만 노출) */
  label?: string;
  /** 보조 문구 */
  sublabel?: string;
  /** 추가 className */
  className?: string;
  /** 광고 그룹 ID 오버라이드 */
  adGroupId?: string;
  /** 배너 형태: expanded(강조형, 기본값) | card(카드형) */
  variant?: 'expanded' | 'card';
}

/**
 * 문구 강조 배너 광고 (RD2-11)
 * – 광고가 실제로 채워지기 전에는 컨테이너가 0높이로 접혀 있어요(빈 '광고 영역' 박스 없음).
 * – 광고가 attach 되어 콘텐츠가 삽입되면 그때만 라벨과 함께 펼쳐져요.
 * – 미충전·실패·무응답 시엔 끝까지 0높이를 유지해 레이아웃 시프트가 없어요.
 */
export const PromotedBanner = memo(({
  label,
  sublabel,
  className = '',
  adGroupId,
  variant = 'expanded',
}: PromotedBannerProps) => {
  const bannerRef = useRef<HTMLDivElement>(null);
  const { isInitialized, attachBanner } = useTossBanner();
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    if (!isInitialized || !bannerRef.current) return;
    const attached = attachBanner(adGroupId || BANNER_AD_GROUP_ID, bannerRef.current, { variant });
    return () => { (attached as { destroy?: () => void } | undefined)?.destroy?.(); };
  }, [isInitialized, attachBanner, adGroupId, variant]);

  // 광고 콘텐츠가 실제로 삽입됐는지 감지 → 그때만 펼침
  useEffect(() => {
    const el = bannerRef.current;
    if (!el || typeof MutationObserver === 'undefined') return;
    const check = () => {
      if (el.childElementCount > 0) setFilled(true);
    };
    const observer = new MutationObserver(check);
    observer.observe(el, { childList: true, subtree: true });
    check();
    return () => observer.disconnect();
  }, [isInitialized]);

  return (
    <section className={cn('w-full', filled ? 'my-2' : 'm-0', className)}>
      {filled && label && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DUR.fast }}
          className="mb-2 flex items-center gap-1.5 px-1"
        >
          <Sparkles size={13} className="flex-shrink-0 text-toss-blue" />
          <span className="t-caption text-toss-gray-600">{label}</span>
          {sublabel && <span className="t-micro ml-auto text-toss-gray-400">{sublabel}</span>}
        </motion.div>
      )}
      {/* 배너 광고 컨테이너 — 콘텐츠가 없으면 0높이(보더·배경·placeholder 없음) */}
      <div ref={bannerRef} className="w-full overflow-hidden rounded-lg" />
    </section>
  );
});
