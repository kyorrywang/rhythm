import { create } from 'zustand';

export type ToastType = 'info' | 'success' | 'warning' | 'error';
export type ToastPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
export type ToastCategory = 'normal' | 'permission';

export interface Toast {
  id: string;
  type: ToastType;
  category?: ToastCategory;
  message: string;
  duration?: number;
  autoClose?: boolean;
  position?: ToastPosition;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, {
        ...toast,
        category: toast.category ?? 'normal',
        autoClose: toast.autoClose ?? true,
        position: toast.position ?? 'top-right',
        id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }],
    })),

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  clearToasts: () => set({ toasts: [] }),
}));
