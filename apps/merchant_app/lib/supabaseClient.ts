/**
 * Supabase client for merchant app – Google OAuth and optional phone OTP via Send SMS hook.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "@/config/env";

let _client: SupabaseClient | null = null;

/** Dev-only diagnostics (no secrets). */
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

