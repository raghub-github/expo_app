import type { SupabaseClient } from "@supabase/supabase-js";

/** Set Realtime JWT from rider session so ticket RLS policies apply. */
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
