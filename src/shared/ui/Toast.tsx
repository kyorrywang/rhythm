import { useEffect } from 'react';
import { useToastStore, type Toast, type ToastPosition, type ToastType } from '@/shared/state/useToastStore';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, AlertCircle, X, Info, AlertTriangle } from 'lucide-react';
import { Button } from '@/shared/ui/Button';

const ICON_MAP: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={16} className="text-green-500" />,
  error: <AlertCircle size={16} className="text-red-500" />,
  warning: <AlertTriangle size={16} className="text-amber-500" />,
  info: <Info size={16} className="text-blue-500" />,
};

const BORDER_MAP: Record<ToastType, string> = {
  success: 'border-green-200',
  error: 'border-red-200',
  warning: 'border-amber-200',
  info: 'border-blue-200',
};

const TOAST_POSITIONS: ToastPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

const POSITION_CLASSES: Record<ToastPosition, string> = {
  'top-left': 'left-4 top-4 items-start',
  'top-center': 'left-1/2 top-4 -translate-x-1/2 items-center',
  'top-right': 'right-4 top-4 items-end',
  'bottom-left': 'bottom-4 left-4 items-start',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 items-center',
  'bottom-right': 'bottom-4 right-4 items-end',
};

const motionOffset = (position: ToastPosition) => {
  if (position.includes('left')) return { x: -40, y: 0 };
  if (position.includes('right')) return { x: 40, y: 0 };
  return { x: 0, y: position.startsWith('top') ? -24 : 24 };
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <>
      {TOAST_POSITIONS.map((position) => {
        const positionedToasts = toasts.filter((toast) => (toast.position ?? 'top-right') === position);
        if (positionedToasts.length === 0) return null;

        return (
          <div key={position} className={`fixed z-50 flex w-80 flex-col gap-2 ${POSITION_CLASSES[position]}`}>
            <AnimatePresence>
              {positionedToasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} position={position} onDismiss={() => removeToast(toast.id)} />
              ))}
            </AnimatePresence>
          </div>
        );
      })}
    </>
  );
}

function ToastItem({
  toast,
  position,
  onDismiss,
}: {
  toast: Toast;
  position: ToastPosition;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (toast.autoClose === false) return;
    const duration = toast.duration ?? 4000;
    if (duration <= 0) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [toast.autoClose, toast.duration, onDismiss]);

  const offset = motionOffset(position);

  return (
    <motion.div
      initial={{ opacity: 0, ...offset, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, ...offset, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`flex items-start gap-3 p-3 bg-white border ${BORDER_MAP[toast.type]} rounded-lg shadow-lg`}
    >
      <span className="mt-0.5 shrink-0">{ICON_MAP[toast.type]}</span>
      <div className="flex-1">
        <p className="text-sm text-gray-700">{toast.message}</p>
        {toast.onAction && (
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              toast.onAction?.();
              onDismiss();
            }}
            className="mt-2 text-xs"
          >
            {toast.actionLabel || '查看'}
          </Button>
        )}
      </div>
      <Button variant="ghost" size="icon" onClick={onDismiss} className="h-6 w-6 shrink-0 text-gray-400 hover:text-gray-600">
        <X size={14} />
      </Button>
    </motion.div>
  );
}
