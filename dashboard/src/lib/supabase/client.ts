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

const ACCESS_TOKEN_SKEW_MS = 60_000;

/**
 * Hide expired local sessions from GoTrue so recover/getSession/getUser do not
 * hit Auth with a rotated refresh token (AuthApiError: refresh_token_not_found).
 * httpOnly cookies remain the source of truth for API auth.
 */
const browserAuthStorage = {
  getItem: (key: string): string | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as
        | { expires_at?: number }
        | Array<{ expires_at?: number }>;
      const payload = Array.isArray(parsed) ? parsed[0] : parsed;
      const exp = payload?.expires_at;
      if (typeof exp === "number" && exp * 1000 <= Date.now() + ACCESS_TOKEN_SKEW_MS) {
        return null;
      }
      return raw;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  },
};

// Client-side Supabase client
// Disable autoRefreshToken to prevent race conditions when multiple tabs/components refresh simultaneously
export const supabase = createClient(safeSupabaseUrl, safeSupabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: true,
    storage: browserAuthStorage,
    // Explicit storageKey prevents "Multiple GoTrueClient instances detected"
    // if another module (a lazy-loaded chunk, e.g.) initialises another client
    // for the same URL — they'll share the storage via the same explicit key.
    storageKey: "sb-gm-dashboard-auth-token",
  },
});
