import { useCallback } from 'react';
import { useToastStore, type Toast, type ToastType } from '@/ui/state/useToastStore';

export function useToast() {
  const addToast = useToastStore((s) => s.addToast);

  const toast = useCallback(
    (message: string, type: ToastType = 'info', duration?: number, options?: Pick<Toast, 'actionLabel' | 'onAction' | 'autoClose' | 'position' | 'category'>) => {
      addToast({ message, type, duration, ...options });
    },
    [addToast],
  );

  const success = useCallback(
    (message: string, duration?: number) => toast(message, 'success', duration),
    [toast],
  );

  const error = useCallback(
    (message: string, duration?: number) => toast(message, 'error', duration),
    [toast],
  );

  const warning = useCallback(
    (message: string, duration?: number) => toast(message, 'warning', duration),
    [toast],
  );

  const info = useCallback(
    (message: string, duration?: number) => toast(message, 'info', duration),
    [toast],
  );

  return { toast, success, error, warning, info };
}
