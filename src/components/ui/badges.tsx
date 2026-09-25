import { Sparkles } from 'lucide-react';
import { colorToCss } from './styles';

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

export function PrintingBadge({ design }: { design?: string | null }) {
  if (!design || !design.trim()) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-violet-50/80 px-2 py-0.5 text-[10px] font-bold text-violet-800 border border-violet-200 shadow-2xs">
      <Sparkles className="h-2.5 w-2.5 text-violet-600 shrink-0" />
      {design.trim()}
    </span>
  );
}
