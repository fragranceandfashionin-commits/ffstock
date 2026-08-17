import { useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, Loader2, Search, X, Camera, Maximize2 } from 'lucide-react';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-12 text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin text-slate-700" />
      {label && <span className="text-sm font-medium text-slate-600">{label}</span>}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-rose-700 shadow-sm">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
      <div className="text-sm font-medium leading-relaxed">{message}</div>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center backdrop-blur-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-3">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <p className="text-base font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500 leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-slate-200/60 pb-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm font-normal text-slate-500 leading-relaxed">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-150 hover:shadow-md ${className ?? ''}`}>
      {children}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-600">
        <span>
          {label}
          {required && <span className="ml-1 text-rose-500 font-bold">*</span>}
        </span>
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const baseStyle =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2';

  const variantStyles = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm shadow-slate-900/10',
    secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
    outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-sm',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm shadow-rose-600/10',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/10',
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };

  return (
    <button
      className={`${baseStyle} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : null}
      {children}
    </button>
  );
}

export function Badge({
  label,
  variant = 'default',
  size = 'md',
}: {
  label: string;
  variant?: 'default' | 'emerald' | 'sky' | 'amber' | 'indigo' | 'rose' | 'violet' | 'slate';
  size?: 'sm' | 'md';
}) {
  const variants = {
    default: 'bg-slate-100 text-slate-700 border-slate-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-[11px]',
    md: 'px-2.5 py-1 text-xs',
  };

  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${variants[variant]} ${sizes[size]}`}>
      {label}
    </span>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative flex-1 max-w-sm">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        type="text"
        className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-8 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function Dropzone({
  previewUrl,
  onFileSelect,
  onClear,
}: {
  previewUrl: string;
  onFileSelect: (file: File | null) => void;
  onClear: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);


  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0] ?? null;
          onFileSelect(selected);
        }}
      />

      {previewUrl ? (
        <div className="relative inline-block group rounded-2xl border border-slate-200 p-1.5 bg-slate-50">
          <img
            src={previewUrl}
            alt="Batch preview"
            className="h-28 w-28 rounded-xl object-cover border border-slate-200 shadow-sm"
          />
          <div className="absolute inset-0 bg-slate-900/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-lg bg-white/90 p-1.5 text-slate-800 hover:bg-white transition"
              title="Expand photo"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg bg-rose-600 p-1.5 text-white hover:bg-rose-700 transition"
              title="Remove photo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center w-full rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-4 text-center hover:bg-slate-100/80 transition cursor-pointer group"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm group-hover:text-slate-800 transition">
            <Camera className="h-5 w-5" />
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-700">Click to upload bottle photo</p>
          <p className="mt-0.5 text-[11px] text-slate-500">JPG, PNG up to 10 MB (optional)</p>
        </button>
      )}

      {modalOpen && previewUrl && (
        <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Bottle Photo Preview">
          <div className="flex justify-center p-2">
            <img src={previewUrl} alt="Bottle enlarged preview" className="max-h-[70vh] rounded-xl object-contain" />
          </div>
        </Modal>
      )}
    </div>
  );
}

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className={`relative w-full ${maxWidthClass} rounded-2xl bg-white p-6 shadow-xl border border-slate-200 max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4 shrink-0">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
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

export const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 shadow-xs';

export const buttonPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

export const buttonGhost =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] shadow-xs';

