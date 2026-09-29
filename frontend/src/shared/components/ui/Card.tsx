import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../utils/cn';
import { pressable } from '../../motion';

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
  ...props
}: CardProps) => (
  <motion.div
    whileTap={interactive ? pressable.whileTap : undefined}
    className={cn('rounded-lg', surfaceClass[surface], interactive && 'cursor-pointer', className)}
    {...props}
  >
    {children}
  </motion.div>
);
