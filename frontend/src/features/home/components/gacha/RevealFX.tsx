import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import type { CardRarity } from '../../../../shared/types';
import { REVEAL } from '../../../../shared/motion';
import { haptic, type HapticType } from '../../../../shared/utils/haptics';
import { cn } from '../../../../shared/utils/cn';

type RevealTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

interface RevealFXProps {
  rarity?: CardRarity | null;
  score?: number;
  mode?: 'fortune' | 'quote';
  children: ReactNode;
  className?: string;
}

const rarityToTier: Record<CardRarity, RevealTier> = {
  normal: 'common',
  silver: 'uncommon',
  gold: 'rare',
  platinum: 'epic',
  diamond: 'legendary',
};

const scoreToTier = (score = 0): RevealTier => {
  if (score >= 96) return 'legendary';
  if (score >= 90) return 'epic';
  if (score >= 80) return 'rare';
  if (score >= 70) return 'uncommon';
  return 'common';
};

const tierAccent: Record<RevealTier, string> = {
  common: 'bg-rarity-common',
  uncommon: 'bg-rarity-uncommon',
  rare: 'bg-rarity-rare',
  epic: 'bg-rarity-epic',
  legendary: 'bg-rarity-legendary',
};

const tierHaptic: Record<RevealTier, HapticType[]> = {
  common: ['tap'],
  uncommon: ['tickMedium'],
  rare: ['basicMedium'],
  epic: ['softMedium', 'success'],
  legendary: ['confetti'],
};

const particleCount: Record<RevealTier, number> = {
  common: 0,
  uncommon: 6,
  rare: 12,
  epic: 20,
  legendary: 28,
};

export function RevealFX({ rarity, score, mode = 'quote', children, className }: RevealFXProps) {
  const reduceMotion = useReducedMotion();
  const tier = mode === 'fortune' ? scoreToTier(score) : rarity ? rarityToTier[rarity] : 'common';
  const particles = useMemo(() => Array.from({ length: particleCount[tier] }, (_, index) => index), [tier]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      tierHaptic[tier].forEach((type, index) => {
        window.setTimeout(() => haptic(type), index * 180);
      });
    }, reduceMotion ? 0 : 420);
    return () => window.clearTimeout(timer);
  }, [reduceMotion, tier]);

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={cn('relative', className)}
      initial={{ opacity: 0, rotateY: -90, scale: tier === 'legendary' ? 0.96 : 1 }}
      animate={{ opacity: 1, rotateY: 0, scale: 1 }}
      transition={{
        duration: REVEAL.flip.duration,
        ease: REVEAL.flip.ease,
        delay: tier === 'legendary' ? 0.24 : 0,
      }}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {(tier === 'legendary' || tier === 'epic') && (
        <motion.div
          className={cn('pointer-events-none fixed inset-0 z-40', tierAccent[tier])}
          initial={{ opacity: tier === 'legendary' ? 0.18 : 0.08 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      )}

      {tier === 'legendary' && (
        <motion.p
          className="pointer-events-none fixed inset-x-5 top-24 z-50 t-display text-center text-rarity-legendary"
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: [0, 1, 1, 0], y: [10, 0, 0, -8], scale: [0.96, 1, 1, 0.98] }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        >
          아주 특별한 이야기가 나왔어요!
        </motion.p>
      )}

      {particles.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-lg">
          {particles.map((item) => {
            const column = item % 7;
            const row = Math.floor(item / 7);
            return (
              <motion.span
                key={item}
                className={cn('absolute h-1.5 w-1.5 rounded-full', tierAccent[tier])}
                style={{
                  left: `${12 + column * 13}%`,
                  top: `${18 + row * 18}%`,
                }}
                initial={{ opacity: 0, scale: 0.4, y: 0 }}
                animate={{ opacity: [0, 1, 0], scale: [0.4, 1.4, 0.2], y: [-4, -22, -34] }}
                transition={{ duration: REVEAL.particleMs / 1000, delay: item * 0.025, ease: 'easeOut' }}
              />
            );
          })}
        </div>
      )}

      <motion.div className="relative z-10 rounded-lg">
        {children}
      </motion.div>
    </motion.div>
  );
}
