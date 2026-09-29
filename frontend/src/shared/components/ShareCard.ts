import type { CardRarity } from '../types';

export interface ShareCardInput {
  title: string;
  content: string;
  label?: string;
  rarity?: CardRarity;
  score?: number;
}

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const CARD_PADDING = 96;

const rarityLabel: Record<CardRarity, string> = {
  diamond: 'DIAMOND',
  platinum: 'PLATINUM',
  gold: 'GOLD',
  silver: 'SILVER',
  normal: 'NORMAL',
};

const getCssColor = (name: string) => {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';

  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });

  if (line) lines.push(line);
  return lines;
};

const drawWrappedText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) => {
  const lines = wrapText(ctx, text, maxWidth).slice(0, maxLines);
  lines.forEach((line, index) => {
    const suffix = index === maxLines - 1 && wrapText(ctx, text, maxWidth).length > maxLines ? '...' : '';
    ctx.fillText(`${line}${suffix}`, x, y + index * lineHeight);
  });
  return y + lines.length * lineHeight;
};

export const renderShareCard = async (input: ShareCardInput) => {
  if (typeof document === 'undefined') {
    throw new Error('Share card rendering requires a browser document.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create share card canvas context.');

  const paper = getCssColor('--color-paper');
  const text = getCssColor('--color-toss-gray-900');
  const muted = getCssColor('--color-toss-gray-500');
  const blue = getCssColor('--color-toss-blue');
  const border = getCssColor('--color-toss-gray-100');

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.strokeStyle = border;
  ctx.lineWidth = 4;
  ctx.strokeRect(40, 40, CARD_WIDTH - 80, CARD_HEIGHT - 80);

  ctx.fillStyle = blue;
  ctx.font = '700 34px Pretendard, sans-serif';
  ctx.fillText(input.label || '가차에서 뽑았어요', CARD_PADDING, 156);

  ctx.fillStyle = text;
  ctx.font = '800 72px Pretendard, sans-serif';
  const titleBottom = drawWrappedText(ctx, input.title, CARD_PADDING, 290, CARD_WIDTH - CARD_PADDING * 2, 88, 3);

  ctx.fillStyle = muted;
  ctx.font = '500 44px Pretendard, sans-serif';
  const excerpt = input.content.split('\n').filter(Boolean).slice(0, 2).join(' ');
  const contentBottom = drawWrappedText(ctx, excerpt, CARD_PADDING, titleBottom + 86, CARD_WIDTH - CARD_PADDING * 2, 70, 7);

  if (input.rarity || typeof input.score === 'number') {
    ctx.fillStyle = blue;
    ctx.font = '700 34px Pretendard, sans-serif';
    const meta = [
      input.rarity ? rarityLabel[input.rarity] : null,
      typeof input.score === 'number' ? `${input.score}점` : null,
    ].filter(Boolean).join(' · ');
    ctx.fillText(meta, CARD_PADDING, contentBottom + 96);
  }

  ctx.fillStyle = muted;
  ctx.font = '600 30px Pretendard, sans-serif';
  ctx.fillText('AI가 만든 참고용 글이에요', CARD_PADDING, CARD_HEIGHT - 138);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not export share card image.'));
    }, 'image/png');
  });
};
