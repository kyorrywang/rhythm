import { useEffect } from 'react';
import { useToastStore, type ToastType } from '@/store/useToastStore';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, AlertCircle, X, Info, AlertTriangle } from 'lucide-react';

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

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: { id: string; type: ToastType; message: string; duration?: number }; onDismiss: () => void }) {
  useEffect(() => {
    const duration = toast.duration ?? 4000;
    if (duration > 0) {
      const timer = setTimeout(onDismiss, duration);
      return () => clearTimeout(timer);
    }
  }, [toast.duration, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`flex items-start gap-3 p-3 bg-white border ${BORDER_MAP[toast.type]} rounded-lg shadow-lg`}
    >
      <span className="mt-0.5 shrink-0">{ICON_MAP[toast.type]}</span>
      <p className="text-sm text-gray-700 flex-1">{toast.message}</p>
      <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 shrink-0">
        <X size={14} />
      </button>
    </motion.div>
  );
}
