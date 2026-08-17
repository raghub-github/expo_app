/**
 * Shared Supabase client for realtime channel subscriptions (mounted-at-startup
 * hooks: prevent-services signal, store status, and any future app-wide
 * channel). Separate from `supabaseClient.ts` (phone OTP auth, `persistSession:
 * false`) — different concern, different lifetime.
 *
 * Reusing one client lets Supabase multiplex every channel subscription over a
 * single WebSocket connection instead of each hook opening its own connection.
 * Returns null when Supabase env vars aren't configured — callers should no-op.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "@/config/env";

let _client: SupabaseClient | null = null;

export function getSupabaseRealtimeClient(): SupabaseClient | null {
  if (_client) return _client;
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  _client = createClient(supabaseUrl, supabaseAnonKey);
  return _client;
}
