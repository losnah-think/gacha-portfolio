export const DUR = { fast: 0.12, base: 0.24, slow: 0.4 } as const;

export const SPRING = {
  snappy: { type: 'spring', stiffness: 400, damping: 30 },
  bouncy: { type: 'spring', stiffness: 300, damping: 18 },
} as const;

export const REVEAL = {
  drawMinMs: 1200,
  dropMs: 1200,
  messageMs: 2000,
  flip: { duration: 0.72, ease: [0.16, 1, 0.3, 1] },
  countUpMs: 800,
  particleMs: 1200,
} as const;

export const GAME = {
  rouletteSettle: 3.5,
  rouletteAbort: 0.6,
  ballGap: 0.7,
  coatingFade: 0.4,
  feedbackWrong: 2.0,
} as const;

// ESSENTIAL_MOTION: 결과 이해에 필요한 게임 모션은 유지하고, 반복 장식 모션은
// MotionConfig/CSS reduced-motion 규칙에서 멈추는 것을 기본으로 해요.
export const ESSENTIAL_MOTION = {
  rouletteSpin: true,
  cardReveal: true,
  scratchReveal: true,
} as const;

export const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: 'easeOut' } },
} as const;

export const staggerList = (stagger = 0.04) => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger } },
});

export const pressable = { whileTap: { scale: 0.96 } } as const;
