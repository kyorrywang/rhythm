import { AlertTriangle, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/shared/ui/Button';
import { themeRecipes } from '@/shared/theme/recipes';

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
      className={`${themeRecipes.errorState()} flex items-center gap-[var(--theme-toolbar-gap)] px-[var(--theme-control-padding-x-md)] py-[calc(var(--theme-row-padding-y)*0.9)] text-[length:var(--theme-body-size)] text-[var(--theme-danger-text)]`}
    >
      <AlertTriangle size={16} className="shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <Button variant="ghost" size="icon" onClick={onDismiss} className="shrink-0 text-[color:color-mix(in_srgb,var(--theme-danger-text)_70%,transparent)] hover:text-[var(--theme-danger-text)]">
          <X size={14} />
        </Button>
      )}
    </motion.div>
  );
};

