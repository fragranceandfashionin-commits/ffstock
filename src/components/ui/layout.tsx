import type { ReactNode } from 'react';

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
