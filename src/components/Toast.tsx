'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  id?: string;
  title?: string;
  description?: string;
  duration?: number;
  type?: ToastType;
}

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
  duration: number;
  createdAt: number;
}

const TOAST_EVENT = 'ocd-toast-event';
const TOAST_DISMISS_EVENT = 'ocd-toast-dismiss-event';

function dispatchToast(toast: ToastItem) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: toast }));
  }
}

function dispatchDismiss(id?: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TOAST_DISMISS_EVENT, { detail: { id } }));
  }
}

function createToastFunction(type: ToastType) {
  return (
    titleOrMessage: string,
    descriptionOrOptions?: string | Omit<ToastOptions, 'title' | 'type'>
  ) => {
    let description: string | undefined;
    let options: Omit<ToastOptions, 'title' | 'type'> = {};

    if (typeof descriptionOrOptions === 'string') {
      description = descriptionOrOptions;
    } else if (descriptionOrOptions && typeof descriptionOrOptions === 'object') {
      options = descriptionOrOptions;
      description = options.description;
    }

    const defaultDuration = type === 'error' ? 6500 : 4500;
    const toastItem: ToastItem = {
      id: options.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title: titleOrMessage,
      description,
      type,
      duration: options.duration || defaultDuration,
      createdAt: Date.now(),
    };

    dispatchToast(toastItem);
    return toastItem.id;
  };
}

export const toast = Object.assign(
  (title: string, options?: Omit<ToastOptions, 'title'>) => {
    const type = options?.type || 'info';
    return toast[type](title, options);
  },
  {
    success: createToastFunction('success'),
    error: createToastFunction('error'),
    warning: createToastFunction('warning'),
    info: createToastFunction('info'),
    dismiss: (id?: string) => dispatchDismiss(id),
  }
);

export function ToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pausedId, setPausedId] = useState<string | null>(null);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const handleNewToast = (e: Event) => {
      const customEvent = e as CustomEvent<ToastItem>;
      if (customEvent.detail) {
        setToasts((prev) => {
          const updated = [...prev, customEvent.detail];
          return updated.slice(-4);
        });
      }
    };

    const handleDismiss = (e: Event) => {
      const customEvent = e as CustomEvent<{ id?: string }>;
      if (customEvent.detail?.id) {
        removeToast(customEvent.detail.id);
      } else {
        setToasts([]);
      }
    };

    window.addEventListener(TOAST_EVENT, handleNewToast);
    window.addEventListener(TOAST_DISMISS_EVENT, handleDismiss);

    return () => {
      window.removeEventListener(TOAST_EVENT, handleNewToast);
      window.removeEventListener(TOAST_DISMISS_EVENT, handleDismiss);
    };
  }, [removeToast]);

  useEffect(() => {
    if (toasts.length === 0) return;

    const timers = toasts.map((t) => {
      if (pausedId === t.id) return null;
      return setTimeout(() => {
        removeToast(t.id);
      }, t.duration);
    });

    return () => {
      timers.forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, [toasts, pausedId, removeToast]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 sm:top-6 sm:right-6 z-[9999] flex flex-col gap-2.5 max-w-sm sm:max-w-md w-[calc(100%-2rem)] sm:w-full pointer-events-none"
    >
      {toasts.map((item) => {
        const isSuccess = item.type === 'success';
        const isError = item.type === 'error';
        const isWarning = item.type === 'warning';

        return (
          <div
            key={item.id}
            onMouseEnter={() => setPausedId(item.id)}
            onMouseLeave={() => setPausedId(null)}
            className={`pointer-events-auto rounded-xl border bg-white/95 backdrop-blur-md shadow-lg shadow-surface-900/10 p-3.5 sm:p-4 transition-all duration-300 animate-slide-up flex items-start gap-3 relative overflow-hidden ${
              isSuccess
                ? 'border-emerald-200/80'
                : isError
                ? 'border-rose-200/80'
                : isWarning
                ? 'border-amber-200/80'
                : 'border-blue-200/80'
            }`}
          >
            {/* Left accent strip */}
            <div
              className={`absolute left-0 top-0 bottom-0 w-1 ${
                isSuccess
                  ? 'bg-emerald-500'
                  : isError
                  ? 'bg-rose-500'
                  : isWarning
                  ? 'bg-amber-500'
                  : 'bg-blue-500'
              }`}
            />

            {/* Icon */}
            <div
              className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                isSuccess
                  ? 'text-emerald-700 bg-emerald-50'
                  : isError
                  ? 'text-rose-700 bg-rose-50'
                  : isWarning
                  ? 'text-amber-700 bg-amber-50'
                  : 'text-blue-700 bg-blue-50'
              }`}
            >
              {isSuccess && <CheckCircle2 className="w-4 h-4" />}
              {isError && <AlertCircle className="w-4 h-4" />}
              {isWarning && <AlertTriangle className="w-4 h-4" />}
              {!isSuccess && !isError && !isWarning && <Info className="w-4 h-4" />}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pr-4">
              <h5 className="text-sm font-semibold text-surface-900 leading-snug">
                {item.title}
              </h5>
              {item.description && (
                <p className="text-xs text-surface-600 mt-1 leading-relaxed whitespace-pre-line break-words">
                  {item.description}
                </p>
              )}
            </div>

            {/* Close Button */}
            <button
              onClick={() => removeToast(item.id)}
              className="text-surface-400 hover:text-surface-700 hover:bg-surface-100 p-1 rounded-md transition-colors shrink-0 -mr-1 -mt-1 focus:outline-none"
              title="Close notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default toast;
