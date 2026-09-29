import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface TicketSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export const TicketSheet = ({ isOpen, onClose, children }: TicketSheetProps) => (
  <AnimatePresence>
    {isOpen && (
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/40 z-[100]"
        />
        <motion.div
          drag="y"
          dragConstraints={{ top: 0 }}
          dragElastic={0.2}
          onDragEnd={(_, info) => {
            if (info.offset.y > 100) onClose();
          }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[32px] z-[101] px-6 pt-2 shadow-2xl max-h-[85vh] overflow-y-auto pb-safe-4"
        >
          <div className="w-12 h-1.5 bg-toss-gray-200 rounded-full mx-auto my-4 cursor-grab active:cursor-grabbing" />
          {children}
        </motion.div>
      </>
    )}
  </AnimatePresence>
);
