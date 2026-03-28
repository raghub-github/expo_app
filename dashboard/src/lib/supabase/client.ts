"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

if (!hasSupabaseEnv && typeof window !== "undefined") {
  console.error(
    "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

// Keep module import/build safe when env is missing at build-time (Docker/CI).
// Runtime calls fail until real env is configured.
const safeSupabaseUrl = supabaseUrl ?? "https://placeholder.supabase.co";
const safeSupabaseAnonKey = supabaseAnonKey ?? "placeholder-anon-key";

// Client-side Supabase client
// Disable autoRefreshToken to prevent race conditions when multiple tabs/components refresh simultaneously
export const supabase = createClient(safeSupabaseUrl, safeSupabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
