/**
 * Supabase client for rider app — phone OTP only (same pattern as customer/merchant apps).
 * Supabase sends OTP via the Send SMS hook (MSG91) configured in Supabase Dashboard.
 * Supabase session is NOT persisted; backend JWT is the durable session.
 */

import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRiderAppConfig } from "@/src/config/env";

let _client: SupabaseClient | null = null;

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
  if (_client) return _client;
  const { supabaseUrl, supabaseAnonKey } = getRiderAppConfig();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  return _client;
}
