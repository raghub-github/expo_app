/**
 * Supabase client for customer app – phone OTP auth (same pattern as merchant / rider).
 * Supabase sends OTP via the Send SMS hook (MSG91) configured in Supabase Dashboard.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "@/config/env";

let _client: SupabaseClient | null = null;

export function getSupabaseOtpEnvDebugInfo(): {
  hasUrl: boolean;
  hasAnonKey: boolean;
  urlHost: string | null;
  phoneOtpUseBackendOnly: boolean;
} {
  const { supabaseUrl, supabaseAnonKey, phoneOtpUseBackendOnly } = getConfig();
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
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  return _client;
}
