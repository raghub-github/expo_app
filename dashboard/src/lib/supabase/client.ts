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
//
// We use `||` not `??`. Docker build-args resolve unset GitHub secrets to the
// EMPTY STRING "" (not undefined), and `?? ""` keeps the empty string —
// passing "" into `createClient()` throws "supabaseUrl is required" during
// the /login prerender. `||` correctly falls back on any falsy value.
const safeSupabaseUrl = supabaseUrl || "https://placeholder.supabase.co";
const safeSupabaseAnonKey = supabaseAnonKey || "placeholder-anon-key";

// Client-side Supabase client
// Disable autoRefreshToken to prevent race conditions when multiple tabs/components refresh simultaneously
export const supabase = createClient(safeSupabaseUrl, safeSupabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: true,
    // Explicit storageKey prevents "Multiple GoTrueClient instances detected"
    // if another module (a lazy-loaded chunk, e.g.) initialises another client
    // for the same URL — they'll share the storage via the same explicit key.
    storageKey: "sb-gm-dashboard-auth-token",
  },
});
