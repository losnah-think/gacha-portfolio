export const READING_FONT_SIZE_STORAGE_KEY = 'reading_font_size';
export const READING_FONT_SIZE_MIN = 15;
export const READING_FONT_SIZE_MAX = 28;
export const READING_FONT_SIZE_DEFAULT = 15;

export const clampReadingFontSize = (value: number) =>
  Math.min(READING_FONT_SIZE_MAX, Math.max(READING_FONT_SIZE_MIN, Math.round(value)));

export const readStoredReadingFontSize = () => {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(READING_FONT_SIZE_STORAGE_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? clampReadingFontSize(value) : null;
};

export const persistReadingFontSize = (value: number) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(READING_FONT_SIZE_STORAGE_KEY, String(clampReadingFontSize(value)));
};

export const recommendedReadingFontSize = (recommended?: 'SMALL' | 'MEDIUM' | 'LARGE', ageGroup?: number) => {
  const stored = readStoredReadingFontSize();
  if (stored) return stored;
  if (recommended === 'LARGE') return 22;
  if (recommended === 'SMALL') return READING_FONT_SIZE_MIN;
  if (ageGroup !== undefined && ageGroup >= 40) return 18;
  return READING_FONT_SIZE_DEFAULT;
};
