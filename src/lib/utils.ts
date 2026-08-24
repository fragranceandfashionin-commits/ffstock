export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0';
  return new Intl.NumberFormat().format(value);
}

/**
 * Returns today's date formatted as YYYY-MM-DD in the user's LOCAL timezone.
 * Avoids UTC timezone conversion shifts on night shifts and early morning entries.
 */
export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Maps common Supabase/PostgREST errors to human-readable, actionable
 * messages so the UI never shows a raw API error. Falls back to the original
 * error message (or `fallback`) when the error is unknown.
 */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const errObj = typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : null;
  const code = errObj?.code;
  const rawMessage = typeof errObj?.message === 'string' ? errObj.message : (err instanceof Error ? err.message : '');
  const details = typeof errObj?.details === 'string' ? errObj.details : '';
  const hint = typeof errObj?.hint === 'string' ? errObj.hint : '';
  const message = rawMessage || details || hint;

  if (code === 'PGRST204' && (message.includes('cap_name') || message.includes('atomizer_name'))) {
    return "Database schema update required: Please run migration 'supabase/migrations/20260817100000_add_cap_and_atomizer_to_stage_movements.sql' in your Supabase SQL Editor to enable Cap & Atomizer tracking.";
  }
  if (code === 'PGRST205') {
    return 'The database tables are not set up yet. Run the SQL files in supabase/migrations/ in the Supabase SQL Editor — see README.md.';
  }
  if (code === 401 || code === 'PGRST301' || code === 'PGRST302') {
    return 'Authentication failed. Your Supabase anon key in .env (VITE_SUPABASE_ANON_KEY) may be invalid or from another project.';
  }
  if (code === 42501 || code === 'PGRST104') {
    return 'Permission denied. Make sure the RLS migrations were applied and the anon key is correct — see README.md.';
  }
  if (code === '23503') {
    return 'This record is still referenced by existing batches and cannot be deleted. Keep it, or delete the batches that use it first.';
  }
  if (/bucket not found|nosuchbucket/i.test(message)) {
    return 'Photo storage is not set up yet. Run supabase/migrations/20260813130000_add_batch_image_storage.sql in the Supabase SQL Editor, then try again — see README.md.';
  }
  if (message) return message;
  if (typeof err === 'string' && err.length > 0) return err;
  return fallback;
}

/**
 * Escapes a single cell according to RFC 4180 standards:
 * wraps in double quotes if it contains commas, quotes, or newlines, and escapes internal quotes.
 */
export function escapeCSVField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an RFC 4180 compliant CSV Blob and triggers a clean browser download.
 * Uses Blob and URL.createObjectURL with UTF-8 BOM to support large datasets (>10k rows)
 * and prevent browser URL encoding length limits.
 */
export function downloadCSV(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const headerLine = headers.map(escapeCSVField).join(',');
  const dataLines = rows.map((row) => row.map(escapeCSVField).join(','));
  const csvContent = '\uFEFF' + [headerLine, ...dataLines].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Normalizes an item name for duplicate and fuzzy matching:
 * collapses spaces around units ("20 ml" -> "20ml"), removes special characters, and lowercases.
 */
export function normalizeItemName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/(\d+)\s*(ml|mm|gm|g|kg|l|oz|cl|pcs|pc|ctn|carton)\b/gi, '$1$2')
    .replace(/[^a-z0-9]/gi, '')
    .trim();
}

/**
 * Computes Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix: number[][] = Array.from({ length: bn + 1 }, () => new Array(an + 1).fill(0));
  for (let i = 0; i <= an; i++) matrix[0][i] = i;
  for (let j = 0; j <= bn; j++) matrix[j][0] = j;

  for (let j = 1; j <= bn; j++) {
    for (let i = 1; i <= an; i++) {
      if (b[j - 1] === a[i - 1]) {
        matrix[j][i] = matrix[j - 1][i - 1];
      } else {
        matrix[j][i] = Math.min(
          matrix[j - 1][i] + 1, // insertion
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i - 1] + 1 // substitution
        );
      }
    }
  }
  return matrix[bn][an];
}

export type SimilarItemMatch = {
  item: { id: string; name: string; category?: string | null; color?: string | null };
  matchType: 'exact' | 'normalized' | 'fuzzy';
  confidence: number;
};

/**
 * Identifies existing items that closely match a given name to prevent stock fragmentation.
 * Uses category context to weight match confidence appropriately.
 */
export function findSimilarItems(
  name: string,
  category: string,
  existingItems: Array<{ id: string; name: string; category?: string | null; color?: string | null }>
): SimilarItemMatch[] {
  const clean = name.trim();
  if (!clean || clean.length < 2) return [];

  const cleanLower = clean.toLowerCase();
  const norm = normalizeItemName(clean);
  const targetCategory = (category || '').trim().toLowerCase();
  const matches: SimilarItemMatch[] = [];

  for (const itm of existingItems) {
    const itmClean = (itm.name || '').trim();
    if (!itmClean) continue;
    const itmLower = itmClean.toLowerCase();
    const itmNorm = normalizeItemName(itmClean);
    const itmCategory = (itm.category || '').trim().toLowerCase();
    const sameCategory = !targetCategory || !itmCategory || targetCategory === itmCategory;

    // 1. Exact case-insensitive match
    if (itmLower === cleanLower) {
      matches.push({
        item: itm,
        matchType: 'exact',
        confidence: sameCategory ? 1.0 : 0.9,
      });
      continue;
    }

    // 2. Normalized match (e.g. "20 ml luck" vs "20ml luck", "50-ML-Square" vs "50ml square")
    if (itmNorm === norm && norm.length > 0) {
      matches.push({
        item: itm,
        matchType: 'normalized',
        confidence: sameCategory ? 0.95 : 0.85,
      });
      continue;
    }

    // 3. Fuzzy Levenshtein match on normalized string
    if (norm.length >= 4 && itmNorm.length >= 4) {
      const dist = levenshteinDistance(norm, itmNorm);
      const maxLen = Math.max(norm.length, itmNorm.length);
      const similarity = 1 - dist / maxLen;

      if (dist <= 2 || similarity >= 0.75) {
        const adjustedConfidence = sameCategory ? similarity : similarity * 0.9;
        matches.push({
          item: itm,
          matchType: 'fuzzy',
          confidence: Math.round(adjustedConfidence * 100) / 100,
        });
      }
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}


