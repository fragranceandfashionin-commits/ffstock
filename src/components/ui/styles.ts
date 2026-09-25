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
