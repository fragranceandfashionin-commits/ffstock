import type { ElementType, ReactNode } from 'react';
import { AlertTriangle, Loader2, HelpCircle } from 'lucide-react';

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
