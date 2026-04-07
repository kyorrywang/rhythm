import { AlertTriangle, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/shared/ui/Button';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export const ErrorBanner = ({ message, onDismiss }: ErrorBannerProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700"
    >
      <AlertTriangle size={16} className="shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <Button variant="unstyled" size="none" onClick={onDismiss} className="text-red-400 hover:text-red-600 shrink-0">
          <X size={14} />
        </Button>
      )}
    </motion.div>
  );
};
