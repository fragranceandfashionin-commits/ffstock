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
