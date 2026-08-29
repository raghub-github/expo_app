import { createBrowserClient } from '@supabase/ssr';
import { createSafeFetchWithTimeout } from '@/lib/auth/fetch-with-timeout';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const hasEnv = Boolean(supabaseUrl && supabaseAnonKey);
const browserFetch = createSafeFetchWithTimeout(8_000);

if (!hasEnv && typeof window !== 'undefined') {
	// Browser-only warning — silence build/SSG which loads this module before
	// env values are guaranteed (Docker build pass with empty NEXT_PUBLIC_*).
	// eslint-disable-next-line no-console
	console.error(
		'Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY before running the app.',
	);
}

// Placeholders keep `createBrowserClient` from throwing during `next build`
// when this module is evaluated under empty env. Real runtime calls still
// fail until the deployment env is wired up.
const safeUrl = supabaseUrl || 'https://placeholder.supabase.co';
const safeAnonKey = supabaseAnonKey || 'placeholder-anon-key';

// Client-side Supabase client using @supabase/ssr for proper cookie handling.
export const supabase = createBrowserClient(safeUrl, safeAnonKey, {
  global: { fetch: browserFetch },
  auth: {
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Service-key usage is intentionally not exposed from the frontend bundle;
// this alias is kept for compatibility with older imports.
export const supabaseAdmin = supabase;
