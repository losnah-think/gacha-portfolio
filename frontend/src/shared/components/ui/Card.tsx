import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../utils/cn';
import { pressable } from '../../motion';
import { IS_PUBLIC_BROWSER } from '../../../public-browser/config';

interface CardProps extends HTMLMotionProps<'div'> {
  surface?: 'play' | 'reading';
  interactive?: boolean;
}

const surfaceClass = {
  play: 'border-2 border-ink bg-cream shadow-hard',
  reading: 'border border-toss-gray-100 bg-paper shadow-soft',
} as const;

export const Card = ({
  children,
  className,
  interactive = false,
  surface = 'play',
  onKeyDown,
  ...props
}: CardProps) => (
  <motion.div
    whileTap={interactive ? pressable.whileTap : undefined}
    role={IS_PUBLIC_BROWSER && interactive ? 'button' : undefined}
    tabIndex={IS_PUBLIC_BROWSER && interactive ? 0 : undefined}
    onKeyDown={IS_PUBLIC_BROWSER && interactive ? (event) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.currentTarget.click();
      }
    } : onKeyDown}
    className={cn('rounded-lg', surfaceClass[surface], interactive && 'cursor-pointer', IS_PUBLIC_BROWSER && interactive && 'focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-2', className)}
    {...props}
  >
    {children}
  </motion.div>
);
