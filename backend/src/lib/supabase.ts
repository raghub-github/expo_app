import { createClient, SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import { getEnv } from "../config/env.js";

let _supabase: SupabaseClient | null = null;

/**
 * Supabase client with service role for server-side access to merchant data
 * (merchant_stores, merchant_menu_items). Used by /v1/merchants and /v1/search.
 */
export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const env = getEnv();
  _supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    // Node.js < 22 has no native WebSocket; required for Supabase client init.
    realtime: { transport: ws as unknown as typeof WebSocket },
  });
  return _supabase;
}
