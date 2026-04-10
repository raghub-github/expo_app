"use client";

import { supabase } from "@/lib/supabase/client";

let inFlight: Promise<boolean> | null = null;

/**
 * Mirror cookie-based Supabase session into the JS client so Realtime uses the same JWT as RLS.
 */
export function hydrateBrowserSupabaseFromCookies(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session?.access_token) return true;

      const res = await fetch("/api/auth/supabase-browser-session", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return false;

      const body = (await res.json()) as {
        success?: boolean;
        access_token?: string;
        refresh_token?: string;
      };
      if (!body.success || !body.access_token || !body.refresh_token) return false;

      const { error } = await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
      return !error;
    } catch {
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
