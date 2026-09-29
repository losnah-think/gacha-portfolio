import { AnimatePresence, motion } from 'framer-motion';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DUR, SPRING } from '../../motion';
import { cn } from '../../utils/cn';
import { Button } from './Button';

type ModalActionVariant = 'primary' | 'secondary' | 'ghost';

export interface ModalAction {
  label: string;
  onClick?: () => void | Promise<void>;
  variant?: ModalActionVariant;
  destructive?: boolean;
  autoClose?: boolean;
  disabled?: boolean;
}

export interface ModalOptions {
  title: string;
  description?: string;
  children?: ReactNode;
  actions?: ModalAction[];
  dismissible?: boolean;
  onClose?: () => void;
}

interface ConfirmOptions {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  isDestructive?: boolean;
}

interface AlertOptions {
  title: string;
  description: string;
  confirmText?: string;
}

interface ActiveModal extends ModalOptions {
  id: string;
}

interface ModalContextValue {
  showModal: (options: ModalOptions) => string;
  closeModal: () => void;
  showConfirm: (options: ConfirmOptions) => string;
  showAlert: (options: AlertOptions) => string;
}

const ModalContext = createContext<ModalContextValue | null>(null);

const createModalId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `modal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const ModalProvider = ({ children }: { children: ReactNode }) => {
  const [modal, setModal] = useState<ActiveModal | null>(null);
  const modalRef = useRef<ActiveModal | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    modalRef.current = modal;
  }, [modal]);

  useEffect(() => {
    if (!modal) return;
    const focusable = panelRef.current?.querySelector<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();
  }, [modal]);

  const closeModal = useCallback(() => {
    const closing = modalRef.current;
    setModal(null);
    closing?.onClose?.();
  }, []);

  const showModal = useCallback((options: ModalOptions) => {
    const id = createModalId();
    setModal({ ...options, id });
    return id;
  }, []);

  const showAlert = useCallback((options: AlertOptions) => showModal({
    title: options.title,
    description: options.description,
    actions: [{ label: options.confirmText ?? '확인', variant: 'primary' }],
  }), [showModal]);

  const showConfirm = useCallback((options: ConfirmOptions) => showModal({
    title: options.title,
    description: options.description,
    actions: [
      {
        label: options.confirmText ?? '확인',
        variant: 'primary',
        destructive: options.isDestructive,
        onClick: options.onConfirm,
      },
      { label: options.cancelText ?? '취소', variant: 'ghost' },
    ],
  }), [showModal]);

  const value = useMemo<ModalContextValue>(() => ({
    closeModal,
    showAlert,
    showConfirm,
    showModal,
  }), [closeModal, showAlert, showConfirm, showModal]);

  const handleAction = async (action: ModalAction) => {
    try {
      await action.onClick?.();
    } finally {
      if (action.autoClose !== false) closeModal();
    }
  };

  return (
    <ModalContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {modal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.fast }}
              onClick={() => {
                if (modal.dismissible !== false) closeModal();
              }}
              className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-[2px]"
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${modal.id}-title`}
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={SPRING.snappy}
              className="fixed inset-0 z-[210] m-auto h-fit w-[320px] max-w-[calc(100vw-32px)] rounded-lg border border-toss-gray-100 bg-paper p-6 text-center shadow-soft"
            >
              <h2 id={`${modal.id}-title`} className="t-title text-toss-gray-900">
                {modal.title}
              </h2>
              {modal.description && (
                <p className="t-body mt-3 whitespace-pre-wrap text-toss-gray-500">
                  {modal.description}
                </p>
              )}
              {modal.children && <div className="mt-5">{modal.children}</div>}
              {(modal.actions === undefined || modal.actions.length > 0) && (
                <div className="mt-6 flex flex-col gap-2">
                  {(modal.actions ?? [{ label: '확인', variant: 'primary' as const }]).map((action) => (
                    <Button
                      key={action.label}
                      variant={action.variant ?? 'primary'}
                      disabled={action.disabled}
                      onClick={() => void handleAction(action)}
                      className={cn(
                        action.destructive && 'border-danger bg-danger text-white shadow-hard active:shadow-none',
                        action.variant === 'ghost' && 'shadow-none',
                      )}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </ModalContext.Provider>
  );
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within ModalProvider');
  }
  return context;
};
