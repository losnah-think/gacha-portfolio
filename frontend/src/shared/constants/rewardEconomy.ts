export const POINT_CONVERT_COST = 10;

export const REWARD_POINT_LIMITS = {
  rewardGacha: 10,
  rewardQuiz: 10,
  idiomQuiz: 10,
  roulette: 10,
  scratch: 10,
  crossword: 10,
} as const;

export const ROULETTE_ALLOWED_POINTS = [1, 2, 3, 5, 10] as const;

export const clampRewardPoints = (value: unknown, maxPoints: number): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(maxPoints, Math.floor(numeric)));
};

export const normalizeRoulettePoints = (value: unknown): number | null => {
  const points = clampRewardPoints(value, REWARD_POINT_LIMITS.roulette);
  return ROULETTE_ALLOWED_POINTS.includes(points as typeof ROULETTE_ALLOWED_POINTS[number])
    ? points
    : null;
};
