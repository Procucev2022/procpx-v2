'use client';
// src/components/ui/Toast.tsx - Enterprise Toast Notifications Provider & Components
import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  X,
  ArrowRight,
} from 'lucide-react';
import type { ToastType, ToastOptions, ToastInput, ToastItem, ToastContextType } from "@app-types/components/ui/Toast.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";

export type { ToastType, ToastOptions, ToastInput };


const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({
      id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type = 'info',
      title,
      message = '',
      recordNumber,
      vendorName,
      nextStage,
      link,
      duration,
      durationMs = duration || 5000,
      actionText,
      onAction,
    }: ToastOptions) => {
      const newToast: ToastItem = {
        id,
        type,
        title,
        message,
        recordNumber,
        vendorName,
        nextStage,
        link,
        durationMs,
        actionText,
        onAction,
        createdAt: Date.now(),
      };

      setToasts((prev) => [newToast, ...prev.slice(0, 4)]); // Keep at most 5 toasts visible

      if (durationMs > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, durationMs);
      }
    },
    [dismissToast]
  );

  const success = useCallback(
    (input: ToastInput, recordNumber?: string, nextStage?: string) => {
      if (typeof input === 'object') {
        showToast({
          type: UI_STRINGS.common.success,
          ...input,
          durationMs: input.durationMs || input.duration || 5000,
        });
      } else {
        showToast({
          type: UI_STRINGS.common.success,
          title: recordNumber ? interpolateUiString(UI_STRINGS.componentsUiToast.confirmedRecordNumber, { "recordNumber": recordNumber }) : UI_STRINGS.componentsUiToast.actionSuccessful,
          message: input,
          recordNumber,
          nextStage,
        });
      }
    },
    [showToast]
  );

  const error = useCallback(
    (input: ToastInput, title: string = UI_STRINGS.componentsUiToast.actionFailed) => {
      if (typeof input === 'object') {
        showToast({
          ...input,
          type: UI_STRINGS.common.error2,
          title: interpolateUiString(UI_STRINGS.common.value1, { "value1": input.title || title }),
          durationMs: input.durationMs || input.duration || 7000,
        });
      } else {
        showToast({
          type: UI_STRINGS.common.error2,
          title,
          message: input,
          durationMs: 7000,
        });
      }
    },
    [showToast]
  );

  const warning = useCallback(
    (input: ToastInput, title: string = UI_STRINGS.componentsUiToast.notice) => {
      if (typeof input === 'object') {
        showToast({
          ...input,
          type: UI_STRINGS.componentsUiToast.warning,
          title: interpolateUiString(UI_STRINGS.common.value1, { "value1": input.title || title }),
          durationMs: input.durationMs || input.duration || 6000,
        });
      } else {
        showToast({
          type: UI_STRINGS.componentsUiToast.warning,
          title,
          message: input,
          durationMs: 6000,
        });
      }
    },
    [showToast]
  );

  const info = useCallback(
    (input: ToastInput, title: string = UI_STRINGS.componentsUiToast.information) => {
      if (typeof input === 'object') {
        showToast({
          ...input,
          type: UI_STRINGS.componentsUiToast.info,
          title: interpolateUiString(UI_STRINGS.common.value1, { "value1": input.title || title }),
          durationMs: input.durationMs || input.duration || 5000,
        });
      } else {
        showToast({
          type: UI_STRINGS.componentsUiToast.info,
          title,
          message: input,
        });
      }
    },
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info, dismissToast }}>
      {children}
      {/* Toast Notification Container */}
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          top: 20,
          right: 24,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          maxWidth: 420,
          width: 'calc(100% - 48px)',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';

          const accentColor = isSuccess
            ? '#059669'
            : isError
            ? '#dc2626'
            : isWarning
            ? '#d97706'
            : '#2563eb';

          const bgLight = isSuccess
            ? '#f0fdf4'
            : isError
            ? '#fef2f2'
            : isWarning
            ? '#fffbeb'
            : '#eff6ff';

          return (
            <div
              key={toast.id}
              role="alert"
              style={{
                pointerEvents: 'auto',
                background: '#ffffff',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                borderLeft: `5px solid ${accentColor}`,
                boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.08)',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ flexShrink: 0, marginTop: 1 }}>
                {isSuccess && <CheckCircle2 size={18} color={accentColor} />}
                {isError && <AlertCircle size={18} color={accentColor} />}
                {isWarning && <AlertTriangle size={18} color={accentColor} />}
                {!isSuccess && !isError && !isWarning && <Info size={18} color={accentColor} />}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {toast.title && (
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#0f172a',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>{toast.title}</span>
                    {toast.recordNumber && (
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '1px 6px',
                          background: bgLight,
                          color: accentColor,
                          borderRadius: 4,
                          border: `1px solid ${accentColor}33`,
                        }}
                      >
                        {toast.recordNumber}
                      </span>
                    )}
                  </div>
                )}

                <div
                  style={{
                    fontSize: 12,
                    color: '#475569',
                    marginTop: toast.title ? 3 : 0,
                    lineHeight: 1.45,
                    wordBreak: 'break-word',
                  }}
                >
                  {toast.message}
                </div>

                {toast.nextStage && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#1e293b',
                      background: '#f8fafc',
                      padding: '3px 8px',
                      borderRadius: 4,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <span>{UI_STRINGS.componentsUiToast.nextStage}</span>
                    <span style={{ color: accentColor }}>{toast.nextStage}</span>
                  </div>
                )}

                {toast.vendorName && (
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 11,
                      color: '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>{UI_STRINGS.common.vendor2}</span>
                    <span>{toast.vendorName}</span>
                  </div>
                )}

                {toast.link && (
                  <div style={{ marginTop: 6 }}>
                    <a
                      href={toast.link}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: accentColor,
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >{UI_STRINGS.componentsUiToast.viewRecord}<ArrowRight size={11} />
                    </a>
                  </div>
                )}

                {toast.actionText && toast.onAction && (
                  <button
                    type="button"
                    onClick={toast.onAction}
                    style={{
                      marginTop: 8,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: accentColor,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {toast.actionText} <ArrowRight size={12} />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label={UI_STRINGS.componentsUiToast.dismissNotification}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 2,
                  marginTop: -2,
                  marginRight: -4,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error(UI_STRINGS.componentsUiToast.useToastMustBeUsedWithinAToastProvider);
  }
  return context;
}
