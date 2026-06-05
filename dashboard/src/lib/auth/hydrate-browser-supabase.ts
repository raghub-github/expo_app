"use client";

import { supabase } from "@/lib/supabase/client";

let inFlight: Promise<boolean> | null = null;

const HYDRATE_LOCK_KEY = "gm_supabase_hydrate_lock_v1";
const HYDRATE_LOCK_MS = 8_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readPersistedSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/**
 * Mirror cookie-based Supabase session into the JS client so Realtime uses the same JWT as RLS.
 * Coordinates across tabs so opening order/ticket in a new tab does not rotate refresh tokens
 * and invalidate the dashboard tab.
 */
export function hydrateBrowserSupabaseFromCookies(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      let session = await readPersistedSession();
      if (session?.access_token) return true;

      // New tab: Supabase may still be reading shared localStorage session from the first tab.
      await sleep(80);
      session = await readPersistedSession();
      if (session?.access_token) return true;

      const lockRaw = window.localStorage.getItem(HYDRATE_LOCK_KEY);
      const lockTs = lockRaw ? Number(lockRaw) : NaN;
      if (Number.isFinite(lockTs) && Date.now() - lockTs < HYDRATE_LOCK_MS) {
        await sleep(250);
        session = await readPersistedSession();
        if (session?.access_token) return true;
      }

      window.localStorage.setItem(HYDRATE_LOCK_KEY, String(Date.now()));
      try {
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

        session = await readPersistedSession();
        if (session?.access_token) return true;

        const { error } = await supabase.auth.setSession({
          access_token: body.access_token,
          refresh_token: body.refresh_token,
        });
        return !error;
      } finally {
        try {
          window.localStorage.removeItem(HYDRATE_LOCK_KEY);
        } catch {
          /* ignore */
        }
      }
    } catch {
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
