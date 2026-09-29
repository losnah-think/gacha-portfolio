import { useId } from 'react';
import { cn } from '../../utils/cn';
import {
  READING_FONT_SIZE_MAX,
  READING_FONT_SIZE_MIN,
  clampReadingFontSize,
  persistReadingFontSize,
} from '../../utils/readingFontSize';

interface FontSizeControlProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

export const FontSizeControl = ({ value, onChange, className }: FontSizeControlProps) => {
  const id = useId();
  const progress =
    ((clampReadingFontSize(value) - READING_FONT_SIZE_MIN) /
      (READING_FONT_SIZE_MAX - READING_FONT_SIZE_MIN)) *
    100;

  const handleChange = (next: number) => {
    const clamped = clampReadingFontSize(next);
    persistReadingFontSize(clamped);
    onChange(clamped);
  };

  return (
    <div className={cn('w-full space-y-2', className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="t-caption font-bold text-toss-gray-500">
          글자 크기
        </label>
        <span className="t-micro text-toss-gray-400">{clampReadingFontSize(value)}px</span>
      </div>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="t-caption font-bold text-toss-gray-300">
          가
        </span>
        <div className="relative flex h-11 flex-1 items-center">
          <div className="absolute inset-x-0 h-1 rounded-full bg-toss-gray-100" />
          <div
            className="absolute left-0 h-1 rounded-full bg-toss-blue"
            style={{ width: `${progress}%` }}
          />
          <input
            id={id}
            type="range"
            min={READING_FONT_SIZE_MIN}
            max={READING_FONT_SIZE_MAX}
            step={1}
            value={clampReadingFontSize(value)}
            aria-label="글자 크기"
            aria-valuetext={`${clampReadingFontSize(value)}px`}
            onChange={(event) => handleChange(Number(event.target.value))}
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          />
          <span
            aria-hidden="true"
            className="absolute h-5 w-5 rounded-full border-2 border-toss-blue bg-paper shadow-soft"
            style={{ left: `calc(${progress}% - 10px)` }}
          />
        </div>
        <span aria-hidden="true" className="t-section font-bold text-toss-gray-300">
          가
        </span>
      </div>
    </div>
  );
};
