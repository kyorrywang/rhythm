import { useCallback } from 'react';
import { useToastStore, type ToastType } from '@/shared/state/useToastStore';

export function useToast() {
  const addToast = useToastStore((s) => s.addToast);

  const toast = useCallback(
    (message: string, type: ToastType = 'info', duration?: number) => {
      addToast({ message, type, duration });
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
