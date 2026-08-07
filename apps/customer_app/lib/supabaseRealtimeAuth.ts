import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Authorize Supabase Realtime postgres_changes under RLS using the backend session JWT.
 * Required because auth.persistSession is false — without this, subscriptions are anonymous.
 */
export function applySupabaseRealtimeAuth(
  supabase: SupabaseClient,
  accessToken: string | null | undefined
): void {
  const token = String(accessToken ?? "").trim();
  if (!token) return;
  try {
    supabase.realtime.setAuth(token);
  } catch {
    /* non-fatal */
  }
}
