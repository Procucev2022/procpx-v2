/* Shared declarations for components/ui/Toast.tsx. */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  id?: string;
  type?: ToastType;
  title?: string;
  message?: string;
  recordNumber?: string;
  vendorName?: string;
  nextStage?: string;
  link?: string;
  duration?: number;
  durationMs?: number;
  actionText?: string;
  onAction?: () => void;
}

export type ToastInput = string | ToastOptions;

export interface ToastItem extends ToastOptions {
  id: string;
  message: string;
  createdAt: number;
}

export interface ToastContextType {
  showToast: (options: ToastOptions) => void;
  success: (input: ToastInput, recordNumber?: string, nextStage?: string) => void;
  error: (input: ToastInput, title?: string) => void;
  warning: (input: ToastInput, title?: string) => void;
  info: (input: ToastInput, title?: string) => void;
  dismissToast: (id: string) => void;
}
