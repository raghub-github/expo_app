/**
 * Supabase client for customer app – used only for phone OTP auth.
 * Supabase sends OTP via the Send SMS hook (MSG91) configured in Supabase Dashboard.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "@/config/env";

let _client: SupabaseClient | null = null;

export function getSupabaseAuth(): SupabaseClient | null {
  if (_client) return _client;
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  return _client;
}

export function getSupabaseOtpEnvDebugInfo(): { urlSet: boolean; anonKeySet: boolean } {
  const { supabaseUrl, supabaseAnonKey } = getConfig();
  return {
    urlSet: Boolean(supabaseUrl),
    anonKeySet: Boolean(supabaseAnonKey),
  };
}
