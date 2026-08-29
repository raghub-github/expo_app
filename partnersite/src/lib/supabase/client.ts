import { createBrowserClient } from '@supabase/ssr';
import { createSafeFetchWithTimeout } from '@/lib/auth/fetch-with-timeout';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

const browserFetch = createSafeFetchWithTimeout(8_000);

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: browserFetch },
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      // Local http://localhost must not set Secure or PKCE verifier cookies are dropped.
      secure: typeof window !== "undefined" ? window.location.protocol === "https:" : false,
    },
    auth: {
      // Callback page exchanges `?code=` explicitly. Auto-detect consumes the PKCE
      // verifier before /api/auth/callback can, which surfaces as
      // "invalid flow state, no valid flow state found" on the first Google sign-in.
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}