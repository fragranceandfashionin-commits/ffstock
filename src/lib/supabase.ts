import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL_PATTERN = /^https:\/\/[a-z0-9]+\.supabase\.co$/;

function readEnv(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Returns a human-readable, actionable error message when Supabase is not
 * configured, or null when the configuration looks valid.
 */
export function getSupabaseConfigError(): string | null {
  const url = readEnv('VITE_SUPABASE_URL');
  const anonKey = readEnv('VITE_SUPABASE_ANON_KEY');

  if (!url) {
    return 'VITE_SUPABASE_URL is missing. Copy .env.example to .env and add your Supabase project URL.';
  }
  if (!SUPABASE_URL_PATTERN.test(url)) {
    return `VITE_SUPABASE_URL looks invalid ("${url}"). It must look like https://<project-ref>.supabase.co`;
  }
  if (!anonKey) {
    return 'VITE_SUPABASE_ANON_KEY is missing. Add your project\'s anon (public) key to .env — see README.md.';
  }
  if (
    anonKey.includes('PASTE_YOUR') ||
    anonKey.length < 20 ||
    (!anonKey.startsWith('eyJ') && !anonKey.startsWith('sb_') && !anonKey.startsWith('sbp_'))
  ) {
    return 'VITE_SUPABASE_ANON_KEY appears invalid or is still set to placeholder. Paste your project\'s anon (public) key into .env or Vercel Environment Variables — see README.md.';
  }
  return null;
}

const configError = getSupabaseConfigError();

if (configError) {
  // Fail loudly and early so misconfiguration is impossible to miss. The
  // ErrorBoundary in main.tsx renders this message in a readable screen.
  throw new Error(configError);
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

// Re-export constants & types for backwards compatibility
export * from './constants';
export * from './types/auth';
export * from './types/database';
