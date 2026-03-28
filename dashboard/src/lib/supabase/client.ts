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

// Keep module import/build safe even when env is unavailable at build-time.
// API calls will fail gracefully at runtime until proper env is provided.
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
