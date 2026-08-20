import type { Item, ComponentStockSummary } from '@/lib/supabase';

export const COMMON_UNITS = ['pcs', 'units', 'boxes', 'sets', 'kg', 'ml', 'L'] as const;
export const NEW_OPTION = '__new__';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export type CategoryAggregate = {
  skuCount: number;
  available: number;
  inwarded: number;
  inFactory: number;
  dispatched: number;
  scrapped: number;
  used: number;
};

export type CategoryAggregates = Record<string, CategoryAggregate>;

export function getCategoryTheme(cat: string) {
  const c = cat.toLowerCase();
  if (c.includes('bottle')) return { icon: '🍾', label: 'Glass Bottles', border: 'border-blue-200', bg: 'bg-blue-50/60', text: 'text-blue-900', pillActive: 'bg-blue-600 text-white' };
  if (c.includes('cap') || c.includes('closure')) return { icon: '🧴', label: 'Caps & Closures', border: 'border-violet-200', bg: 'bg-violet-50/60', text: 'text-violet-900', pillActive: 'bg-violet-600 text-white' };
  if (c.includes('atomizer') || c.includes('pump')) return { icon: '💨', label: 'Atomizers & Pumps', border: 'border-sky-200', bg: 'bg-sky-50/60', text: 'text-sky-900', pillActive: 'bg-sky-600 text-white' };
  if (c.includes('packaging') || c.includes('box')) return { icon: '📦', label: 'Packaging Boxes', border: 'border-amber-200', bg: 'bg-amber-50/60', text: 'text-amber-900', pillActive: 'bg-amber-600 text-white' };
  if (c.includes('label')) return { icon: '🏷️', label: 'Labels & Tags', border: 'border-fuchsia-200', bg: 'bg-fuchsia-50/60', text: 'text-fuchsia-900', pillActive: 'bg-fuchsia-600 text-white' };
  if (c.includes('fragrance') || c.includes('oil')) return { icon: '🧪', label: 'Fragrance Oils', border: 'border-teal-200', bg: 'bg-teal-50/60', text: 'text-teal-900', pillActive: 'bg-teal-600 text-white' };
  return { icon: '⚙️', label: cat, border: 'border-slate-200', bg: 'bg-slate-50/60', text: 'text-slate-900', pillActive: 'bg-slate-800 text-white' };
}
