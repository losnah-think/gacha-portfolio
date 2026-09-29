import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { SPRING } from '../../motion';
import { cn } from '../../utils/cn';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  snap?: 'auto' | 'full';
  className?: string;
  ariaLabel?: string;
}

export const Sheet = ({
  ariaLabel = '하단 시트',
  children,
  className,
  onOpenChange,
  open,
  snap = 'auto',
}: SheetProps) => (
  <AnimatePresence>
    {open && (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => onOpenChange(false)}
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[2px]"
        />
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          drag="y"
          dragConstraints={{ top: 0 }}
          dragElastic={0.18}
          onDragEnd={(_, info) => {
            if (info.offset.y > 96) onOpenChange(false);
          }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={SPRING.snappy}
          className={cn(
            'fixed inset-x-0 bottom-0 z-[101] mx-auto max-w-[500px] overflow-y-auto rounded-t-lg bg-paper px-6 pt-2 shadow-soft pb-safe-4',
            snap === 'full' ? 'max-h-[96dvh]' : 'max-h-[85dvh]',
            className,
          )}
        >
          <div className="mx-auto my-4 h-1.5 w-12 cursor-grab rounded-full bg-toss-gray-200 active:cursor-grabbing" />
          {children}
        </motion.section>
      </>
    )}
  </AnimatePresence>
);
