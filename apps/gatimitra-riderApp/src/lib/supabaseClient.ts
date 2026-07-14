/**
 * Supabase client for rider app — phone OTP only (same pattern as merchant app).
 * Supabase sends OTP via the Send SMS hook (MSG91) configured in Supabase Dashboard.
 * Supabase session is NOT persisted; backend JWT is the durable session.
 */

import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRiderAppConfig } from "@/src/config/env";

let _client: SupabaseClient | null = null;
let _clientKey: string | null = null;

/** Dev-only diagnostics (no secrets). Same shape as merchant app. */
export function getSupabaseOtpEnvDebugInfo(): {
  hasUrl: boolean;
  hasAnonKey: boolean;
  urlHost: string | null;
  phoneOtpUseBackendOnly: boolean;
} {
  const { supabaseUrl, supabaseAnonKey, phoneOtpUseBackendOnly } = getRiderAppConfig();
  let urlHost: string | null = null;
  if (supabaseUrl) {
    try {
      urlHost = new URL(supabaseUrl).host;
    } catch {
      urlHost = "(invalid URL)";
    }
  }
  return {
    hasUrl: Boolean(supabaseUrl),
    hasAnonKey: Boolean(supabaseAnonKey),
    urlHost,
    phoneOtpUseBackendOnly,
  };
}

export function getSupabaseAuth(): SupabaseClient | null {
  const { supabaseUrl, supabaseAnonKey } = getRiderAppConfig();
  if (!supabaseUrl || !supabaseAnonKey) return null;

  // Recreate when URL/key change (stale Metro/env used to keep a dead host client forever).
  const key = `${supabaseUrl}|${supabaseAnonKey.slice(0, 24)}`;
  if (_client && _clientKey === key) return _client;

  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  _clientKey = key;
  return _client;
}
