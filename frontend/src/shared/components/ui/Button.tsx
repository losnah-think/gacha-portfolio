import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'border-ink-deep bg-toss-blue text-white shadow-hard active:translate-x-1 active:translate-y-1 active:shadow-none disabled:bg-toss-gray-200 disabled:text-toss-gray-400 disabled:shadow-none',
  secondary: 'border-ink bg-cream text-toss-gray-900 shadow-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:border-toss-gray-200 disabled:bg-toss-gray-50 disabled:text-toss-gray-400 disabled:shadow-none',
  ghost: 'border-transparent bg-transparent text-toss-gray-600 shadow-none active:bg-toss-gray-50 disabled:text-toss-gray-300',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3 py-2 t-caption',
  md: 'min-h-11 px-4 py-3 t-body',
  lg: 'min-h-14 px-5 py-4 t-body',
};

export const Button = ({
  children,
  className,
  disabled,
  loading = false,
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) => {
  const isDisabled = disabled || loading;

  return (
    <motion.button
      type={type}
      disabled={isDisabled}
      whileTap={isDisabled ? undefined : { scale: 0.96 }}
      className={cn(
        'inline-flex w-full items-center justify-center gap-2 rounded-md border-2 font-bold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-70',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      <span className={cn('inline-flex min-w-0 items-center justify-center gap-2', loading && 'opacity-80')}>
        {children}
      </span>
    </motion.button>
  );
};
