/**
 * Supabase client for rider app — phone OTP only (same pattern as customer/merchant apps).
 * Supabase sends OTP via the Send SMS hook (MSG91) configured in Supabase Dashboard.
 * Supabase session is NOT persisted; backend JWT is the durable session.
 */

import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRiderAppConfig } from "@/src/config/env";

let _client: SupabaseClient | null = null;

export function getSupabaseAuth(): SupabaseClient | null {
  if (_client) return _client;
  const { supabaseUrl, supabaseAnonKey } = getRiderAppConfig();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
      autoRefreshToken: false,
    },
  });
  return _client;
}

export function getSupabaseOtpEnvDebugInfo(): { urlSet: boolean; anonKeySet: boolean } {
  const { supabaseUrl, supabaseAnonKey } = getRiderAppConfig();
  return {
    urlSet: Boolean(supabaseUrl),
    anonKeySet: Boolean(supabaseAnonKey),
  };
}
