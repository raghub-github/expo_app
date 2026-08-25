import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Memory-only storage so GoTrue never reads or writes dashboard `sb-*` cookies.
 * Cookie-bound `createServerSupabaseClient().auth.getUser()` / `signInWithOtp`
 * in the same process can share a GoTrue instance and wipe the AM session.
 */
const isolatedStorage = {
  getItem: (_key: string) => null,
  setItem: (_key: string, _value: string) => {},
  removeItem: (_key: string) => {},
};

/**
 * Anon Auth client for parent-merchant email/SMS OTP.
 * Must not share storageKey with the dashboard SSR cookie client.
 */
export function createIsolatedOtpClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `gm-parent-otp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      storage: isolatedStorage,
    },
  });
}
