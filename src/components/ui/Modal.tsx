import type { ReactNode } from 'react';
import { X, AlertCircle, AlertTriangle, Sparkles } from 'lucide-react';
import { Button } from './Button';

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidthClass = 'max-w-lg',
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidthClass?: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 sm:backdrop-blur-xs animate-in fade-in duration-200">
      <div className={`relative w-full ${maxWidthClass} rounded-2xl bg-white p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] sm:max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 sm:pb-4 mb-3 sm:mb-4 shrink-0">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate pr-2">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 pr-1">
          {children}
        </div>
      </div>
    </div>
  );
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm Delete',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false,
  details,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  loading?: boolean;
  details?: ReactNode;
}) {
  if (!isOpen) return null;

  const icons = {
    danger: <AlertCircle className="h-6 w-6 text-rose-600" />,
    warning: <AlertTriangle className="h-6 w-6 text-amber-600" />,
    primary: <Sparkles className="h-6 w-6 text-slate-700" />,
  };

  const bgIcons = {
    danger: 'bg-rose-50 border-rose-200',
    warning: 'bg-amber-50 border-amber-200',
    primary: 'bg-slate-100 border-slate-200',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 sm:backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200">
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${bgIcons[variant]}`}>
            {icons[variant]}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{message}</p>
            {details && <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700">{details}</div>}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            type="button"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
