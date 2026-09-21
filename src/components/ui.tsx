import { useRef, useState, useEffect, type ButtonHTMLAttributes, type ReactNode, type ElementType } from 'react';
import { AlertTriangle, Loader2, Search, X, Camera, Maximize2, Sparkles, AlertCircle, HelpCircle } from 'lucide-react';
import { COMMON_COLORS, COMMON_PRINTING_DESIGNS } from '@/lib/supabase';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-12 text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin text-slate-700" />
      {label && <span className="text-sm font-medium text-slate-600">{label}</span>}
    </div>
  );
}

export function Skeleton({
  className = '',
  variant = 'rect',
}: {
  className?: string;
  variant?: 'text' | 'rect' | 'circle';
}) {
  const variantStyles = {
    text: 'h-4 w-full rounded-md',
    rect: 'rounded-xl',
    circle: 'rounded-full',
  };

  return (
    <div
      className={`animate-pulse bg-slate-200/80 dark:bg-slate-700/40 ${variantStyles[variant]} ${className}`}
    />
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full space-y-3 p-4">
      <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-100">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-24" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center justify-between gap-4 py-2">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-4 ${c === 0 ? 'w-32' : 'w-20'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-5 space-y-3">
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-12 rounded-full" />
          </div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
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

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = HelpCircle,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ElementType;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center backdrop-blur-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 mb-3 shadow-2xs">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-base font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500 leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function TableScrollContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-x-auto rounded-xl border border-slate-200/80 shadow-2xs ${className}`}>
      {children}
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
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 cursor-pointer';

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
  debounceMs = 150,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  debounceMs?: number;
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    if (localValue === value) return;
    const timer = setTimeout(() => {
      onChange(localValue);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [localValue, value, onChange, debounceMs]);

  return (
    <div className="relative flex-1 max-w-sm">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        type="text"
        className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-8 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
      />
      {localValue && (
        <button
          type="button"
          onClick={() => {
            setLocalValue('');
            onChange('');
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
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
          <div className="absolute inset-0 bg-slate-900/40 rounded-xl opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-xl bg-white/95 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-800 hover:bg-white shadow-xs transition cursor-pointer"
              title="Expand photo"
              aria-label="Expand photo"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded-xl bg-rose-600 min-w-[36px] min-h-[36px] flex items-center justify-center text-white hover:bg-rose-700 shadow-xs transition cursor-pointer"
              title="Remove photo"
              aria-label="Remove photo"
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
          <p className="mt-2 text-xs font-semibold text-slate-700">Click to upload shipment / item photo</p>
          <p className="mt-0.5 text-[11px] text-slate-500">JPG, PNG up to 10 MB (optional)</p>
        </button>
      )}

      {modalOpen && previewUrl && (
        <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Shipment Photo Preview">
          <div className="flex justify-center p-2">
            <img src={previewUrl} alt="Shipment photo enlarged preview" className="max-h-[70vh] rounded-xl object-contain" />
          </div>
        </Modal>
      )}
    </div>
  );
}

export function ItemCategoryBadge({ category }: { category?: string | null }) {
  const cat = (category || 'Bottle').trim().toLowerCase();
  
  if (cat.includes('cap') || cat.includes('closure')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 border border-violet-200">
        🧴 Cap
      </span>
    );
  }
  if (cat.includes('atomizer') || cat.includes('pump') || cat.includes('spray')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
        💨 Atomizer
      </span>
    );
  }
  if (cat.includes('pack') || cat.includes('box') || cat.includes('carton')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
        📦 Packaging
      </span>
    );
  }
  if (cat.includes('label') || cat.includes('sticker')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-fuchsia-50 px-2 py-0.5 text-[10px] font-bold text-fuchsia-700 border border-fuchsia-200">
        🏷️ Label
      </span>
    );
  }
  if (cat.includes('fragrance') || cat.includes('oil') || cat.includes('raw') || cat.includes('chemical')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 border border-teal-200">
        🧪 Fragrance
      </span>
    );
  }
  if (cat.includes('bottle') || cat.includes('glass') || cat.includes('pet')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 border border-sky-200">
        🍾 Bottle
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-200">
      ⚙️ {category || 'General'}
    </span>
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

export const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 shadow-xs';

export const buttonPrimary =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

export const buttonGhost =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] shadow-xs';

/** Maps a color name to a CSS background for the dot indicator. */
export function colorToCss(color: string): string {
  const c = color.toLowerCase().trim();
  if (c.includes('clear') || c.includes('transparent')) return 'bg-white border border-slate-300';
  if (c.includes('frosted blue') || c.includes('cobalt blue')) return 'bg-blue-400';
  if (c.includes('frosted')) return 'bg-sky-200';
  if (c.includes('amber')) return 'bg-amber-500';
  if (c.includes('gloss black') || c.includes('matte black')) return 'bg-slate-900';
  if (c.includes('matte white')) return 'bg-slate-100 border border-slate-300';
  if (c.includes('emerald') || c.includes('green')) return 'bg-emerald-500';
  if (c.includes('rose gold')) return 'bg-rose-300';
  if (c.includes('gold') || c.includes('electroplated gold')) return 'bg-amber-400';
  if (c.includes('silver') || c.includes('electroplated silver')) return 'bg-slate-300';
  if (c.includes('smoke') || c.includes('grey') || c.includes('gray')) return 'bg-slate-400';
  if (c.includes('ruby') || c.includes('red')) return 'bg-red-500';
  if (c.includes('blue')) return 'bg-blue-500';
  if (c.includes('pink')) return 'bg-pink-400';
  if (c.includes('purple') || c.includes('violet')) return 'bg-purple-500';
  if (c.includes('orange')) return 'bg-orange-500';
  if (c.includes('yellow')) return 'bg-yellow-400';
  if (c.includes('teal')) return 'bg-teal-500';
  if (c.includes('brown')) return 'bg-amber-700';
  if (c.includes('white')) return 'bg-white border border-slate-300';
  if (c.includes('black')) return 'bg-slate-900';
  return 'bg-slate-400';
}

/** Displays a color name with a colored dot indicator. */
export function ColorBadge({ color }: { color?: string | null }) {
  if (!color || !color.trim()) return null;
  const dotCss = colorToCss(color);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-200 shadow-2xs">
      <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${dotCss}`} />
      {color.trim()}
    </span>
  );
}

/** Select dropdown with predefined suggestions + customizable "Custom" option */
export function ColorSelect({
  value,
  onChange,
  colors = COMMON_COLORS,
  placeholder = 'Select Color / Finish…',
  customPlaceholder = 'Type custom color (e.g. Metallic Rose, Gradient Blue)…',
  className = '',
  size = 'md',
  disabled = false,
}: {
  value: string;
  onChange: (val: string) => void;
  colors?: readonly string[];
  placeholder?: string;
  customPlaceholder?: string;
  className?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}) {
  const [isCustomMode, setIsCustomMode] = useState(false);
  const isPredefined = colors.some((c) => c.toLowerCase().trim() === value.toLowerCase().trim());
  const showCustomInput = isCustomMode || (!isPredefined && Boolean(value && value.trim()));

  const matchedColor = colors.find((c) => c.toLowerCase().trim() === value.toLowerCase().trim()) || '';
  const selectValue = showCustomInput ? '__custom__' : matchedColor;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <select
        className={`${inputClass} ${size === 'sm' ? 'text-xs py-1.5 px-2.5 font-bold' : 'text-sm font-semibold'} ${
          showCustomInput ? 'border-sky-400 bg-sky-50/20' : ''
        }`}
        value={selectValue}
        disabled={disabled}
        onChange={(e) => {
          const val = e.target.value;
          if (val === '__custom__') {
            setIsCustomMode(true);
            if (isPredefined) {
              onChange('');
            }
          } else {
            setIsCustomMode(false);
            onChange(val);
          }
        }}
      >
        <option value="">{placeholder}</option>
        <optgroup label="Standard Bottle Coating & Glass Finishes">
          {colors.map((c) => (
            <option key={c} value={c}>
              🎨 {c}
            </option>
          ))}
        </optgroup>
        <option value="__custom__">⚙️ Other / Custom Color…</option>
      </select>

      {showCustomInput && (
        <div className="relative animate-in fade-in duration-150">
          <input
            type="text"
            className={`${inputClass} ${size === 'sm' ? 'text-xs py-1 px-2.5 font-bold border-sky-300 bg-sky-50/30' : 'text-sm font-medium border-sky-300 bg-sky-50/20'} focus:bg-white pr-8`}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder={customPlaceholder}
            autoFocus={isCustomMode && !value}
          />
          {value && !disabled && (
            <button
              type="button"
              onClick={() => {
                setIsCustomMode(false);
                onChange('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Clear custom color"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Clean, modern Color Selection with 1-click preset chips + seamless custom color toggle.
 * Eliminates triple-redundancy and vertical clutter.
 */
export function ColorChipsInput({
  value,
  onChange,
  colors = COMMON_COLORS,
  placeholder = 'Type custom color…',
}: {
  value: string;
  onChange: (val: string) => void;
  colors?: readonly string[];
  placeholder?: string;
}) {
  const isPredefined = colors.some((c) => c.toLowerCase().trim() === value.toLowerCase().trim());
  const [isCustomMode, setIsCustomMode] = useState(false);
  const showCustom = isCustomMode || (!isPredefined && Boolean(value && value.trim()));

  return (
    <div className="space-y-2">
      {/* 1-Click Color Chips */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {colors.map((c) => {
          const isSelected = value.toLowerCase().trim() === c.toLowerCase().trim();
          const dotCss = colorToCss(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => {
                setIsCustomMode(false);
                onChange(isSelected ? '' : c);
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition border cursor-pointer ${
                isSelected
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100'
              }`}
            >
              <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${isSelected ? 'ring-1 ring-white' : ''} ${dotCss}`} />
              {c}
            </button>
          );
        })}

        {/* Custom Toggle Button */}
        <button
          type="button"
          onClick={() => {
            setIsCustomMode((prev) => !prev);
            if (isPredefined) onChange('');
          }}
          className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition border cursor-pointer ${
            showCustom
              ? 'bg-sky-50 text-sky-700 border-sky-300 shadow-2xs ring-1 ring-sky-200'
              : 'bg-white text-slate-600 border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50'
          }`}
        >
          <span>⚙️</span>
          <span>{showCustom ? 'Custom:' : 'Other…'}</span>
        </button>
      </div>

      {/* Expandable Custom Color Input - only shown when selected */}
      {showCustom && (
        <div className="relative max-w-sm animate-in fade-in slide-in-from-top-1 duration-150">
          <input
            type="text"
            className={`${inputClass} text-xs font-semibold border-sky-300 bg-sky-50/20 focus:bg-white pr-8`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                setIsCustomMode(false);
                onChange('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Clear custom color"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Displays a print / artwork specification with a decorative printer badge. */
export function PrintingBadge({ design }: { design?: string | null }) {
  if (!design || !design.trim()) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50/90 px-2 py-0.5 text-[10px] font-bold text-indigo-800 border border-indigo-200 shadow-2xs">
      <span className="text-[11px]">🖨️</span>
      <span>{design.trim()}</span>
    </span>
  );
}

/** Select dropdown for artwork/printing with suggestions + custom typing option */
export function PrintingSelect({
  value,
  onChange,
  designs = COMMON_PRINTING_DESIGNS,
  placeholder = 'Select Artwork / Print…',
  customPlaceholder = 'Type custom artwork specification…',
  className = '',
  size = 'md',
  disabled = false,
}: {
  value: string;
  onChange: (val: string) => void;
  designs?: readonly string[];
  placeholder?: string;
  customPlaceholder?: string;
  className?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}) {
  const isPredefined = designs.some((d) => d.toLowerCase().trim() === value.toLowerCase().trim());
  const [isCustomMode, setIsCustomMode] = useState(false);
  const showCustomInput = isCustomMode || (!isPredefined && Boolean(value && value.trim()));

  const matchedDesign = designs.find((d) => d.toLowerCase().trim() === value.toLowerCase().trim()) || '';
  const selectValue = showCustomInput ? '__custom__' : matchedDesign;

  return (
    <div className={`space-y-1.5 ${className}`}>
      <select
        className={`${inputClass} ${size === 'sm' ? 'text-xs py-1.5 px-2.5 font-bold border-indigo-200 bg-indigo-50/20' : 'text-sm font-semibold border-indigo-300'} ${
          showCustomInput ? 'border-indigo-400 bg-indigo-50/30' : ''
        }`}
        value={selectValue}
        disabled={disabled}
        onChange={(e) => {
          const val = e.target.value;
          if (val === '__custom__') {
            setIsCustomMode(true);
            if (isPredefined) {
              onChange('');
            }
          } else {
            setIsCustomMode(false);
            onChange(val);
          }
        }}
      >
        <option value="">{placeholder}</option>
        <optgroup label="Standard Artwork & Screen Print Finishes">
          {designs.map((d) => (
            <option key={d} value={d}>
              🖨️ {d}
            </option>
          ))}
        </optgroup>
        <option value="__custom__">⚙️ Other / Custom Artwork…</option>
      </select>

      {showCustomInput && (
        <div className="relative animate-in fade-in duration-150">
          <input
            type="text"
            className={`${inputClass} ${size === 'sm' ? 'text-xs py-1 px-2.5 font-bold border-indigo-300 bg-indigo-50/30' : 'text-sm font-medium border-indigo-300 bg-indigo-50/20'} focus:bg-white pr-8`}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder={customPlaceholder}
            autoFocus={isCustomMode && !value}
          />
          {value && !disabled && (
            <button
              type="button"
              onClick={() => {
                setIsCustomMode(false);
                onChange('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700"
              title="Clear custom artwork"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Clean, modern Printing / Artwork finish selection chips + expandable custom specification input.
 * Replaces triple-redundancy with space-efficient design.
 */
export function PrintingChipsInput({
  value,
  onChange,
  designs = COMMON_PRINTING_DESIGNS,
  placeholder = 'e.g. Gold Foil Stamping, Matte Black Screen Print…',
}: {
  value: string;
  onChange: (val: string) => void;
  designs?: readonly string[];
  placeholder?: string;
}) {
  const isPredefined = designs.some((d) => d.toLowerCase().trim() === value.toLowerCase().trim());
  const [isCustomMode, setIsCustomMode] = useState(false);
  const showCustom = isCustomMode || (!isPredefined && Boolean(value && value.trim()));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {designs.map((d) => {
          const isSelected = value.toLowerCase().trim() === d.toLowerCase().trim();
          return (
            <button
              key={d}
              type="button"
              onClick={() => {
                setIsCustomMode(false);
                onChange(isSelected ? '' : d);
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition border cursor-pointer ${
                isSelected
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs ring-2 ring-indigo-200'
                  : 'bg-white text-indigo-900 border-indigo-200/80 hover:border-indigo-400 hover:bg-indigo-50/50 active:bg-indigo-100'
              }`}
            >
              <span className="text-[11px]">✨</span>
              {d}
            </button>
          );
        })}

        {/* Custom Toggle Button */}
        <button
          type="button"
          onClick={() => {
            setIsCustomMode((prev) => !prev);
            if (isPredefined) onChange('');
          }}
          className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold transition border cursor-pointer ${
            showCustom
              ? 'bg-indigo-100 text-indigo-800 border-indigo-300 shadow-2xs ring-1 ring-indigo-200'
              : 'bg-white text-indigo-700 border-dashed border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/50'
          }`}
        >
          <span>⚙️</span>
          <span>{showCustom ? 'Custom Artwork:' : 'Other Print…'}</span>
        </button>
      </div>

      {showCustom && (
        <div className="relative max-w-sm animate-in fade-in slide-in-from-top-1 duration-150">
          <input
            type="text"
            className={`${inputClass} text-xs font-semibold border-indigo-300 bg-indigo-50/20 focus:bg-white pr-8`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                setIsCustomMode(false);
                onChange('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Clear custom artwork"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export { ItemSearchSelect } from './ItemSearchSelect';
export { SupplierSearchSelect } from './SupplierSearchSelect';
