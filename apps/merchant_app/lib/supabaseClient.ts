/**
 * Supabase client for merchant app – used for phone OTP auth (Send SMS hook → MSG91).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

let _client: SupabaseClient | null = null;

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function getSupabaseConfig(): { supabaseUrl: string | null; supabaseAnonKey: string | null } {
  const supabaseUrl =
    asNonEmptyString(process.env.EXPO_PUBLIC_SUPABASE_URL) ??
    asNonEmptyString(
      (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
        ?.EXPO_PUBLIC_SUPABASE_URL as string,
    ) ??
    null;
  const supabaseAnonKey =
    asNonEmptyString(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ??
    asNonEmptyString(
      (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
        ?.EXPO_PUBLIC_SUPABASE_ANON_KEY as string,
    ) ??
    null;
  return { supabaseUrl, supabaseAnonKey };
}

export function getSupabaseAuth(): SupabaseClient | null {
  if (_client) return _client;
  const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();
  if (!supabaseUrl || !supabaseAnonKey) return null;
  _client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  return _client;
}

