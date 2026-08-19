import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type ToastMessage = {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
};

type ToastContextValue = {
  toasts: ToastMessage[];
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', title?: string, duration = 6000) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast: ToastMessage = { id, type, title, message, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback((msg: string, title?: string) => showToast(msg, 'success', title), [showToast]);
  const error = useCallback((msg: string, title?: string) => showToast(msg, 'error', title, 8000), [showToast]);
  const info = useCallback((msg: string, title?: string) => showToast(msg, 'info', title), [showToast]);
  const warning = useCallback((msg: string, title?: string) => showToast(msg, 'warning', title, 7000), [showToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, success, error, info, warning, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback safe no-op if used outside provider
    return {
      toasts: [],
      showToast: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
      warning: () => {},
      removeToast: () => {},
    };
  }
  return ctx;
}

function ToastContainer({ toasts, onRemove }: { toasts: ToastMessage[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none sm:bottom-6 sm:right-6"
    >
      {toasts.map((t) => {
        const icons = {
          success: <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />,
          error: <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />,
          warning: <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />,
          info: <Info className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />,
        };

        const borders = {
          success: 'border-emerald-200 bg-white/95 shadow-emerald-950/5',
          error: 'border-rose-200 bg-white/95 shadow-rose-950/5',
          warning: 'border-amber-200 bg-white/95 shadow-amber-950/5',
          info: 'border-sky-200 bg-white/95 shadow-sky-950/5',
        };

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-xl backdrop-blur-md transition-all duration-200 animate-in fade-in slide-in-from-bottom-3 ${borders[t.type]}`}
          >
            {icons[t.type]}
            <div className="flex-1 min-w-0">
              {t.title && <p className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-0.5">{t.title}</p>}
              <p className="text-sm font-medium text-slate-700 leading-snug break-words">{t.message}</p>
            </div>
            <button
              type="button"
              onClick={() => onRemove(t.id)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition shrink-0"
              aria-label="Close notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
