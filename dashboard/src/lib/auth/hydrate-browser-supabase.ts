"use client";

import { supabase } from "@/lib/supabase/client";
import {
  clearStaleClientAuthStorage,
  readClientSessionFromStorage,
  readUsableClientSessionFromStorage,
} from "@/lib/auth/client-session-storage";
import { isInvalidRefreshToken, isRefreshTokenNotFound } from "@/lib/auth/session-errors";

let inFlight: Promise<boolean> | null = null;

const HYDRATE_LOCK_KEY = "gm_supabase_hydrate_lock_v1";
const HYDRATE_LOCK_MS = 8_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function applyServerTokensToClient(
  accessToken: string,
  refreshToken: string
): Promise<boolean> {
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) {
    if (isRefreshTokenNotFound(error) || isInvalidRefreshToken(error)) {
      clearStaleClientAuthStorage();
    }
    return false;
  }
  return true;
}

/**
 * Mirror cookie-based Supabase session into the JS client so Realtime uses the same JWT as RLS.
 * Never calls getSession() on a stale localStorage refresh token — reads storage or server bridge.
 */
export function hydrateBrowserSupabaseFromCookies(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      let session = readUsableClientSessionFromStorage();
      if (session?.access_token) return true;

      await sleep(80);
      session = readUsableClientSessionFromStorage();
      if (session?.access_token) return true;

      const lockRaw = window.localStorage.getItem(HYDRATE_LOCK_KEY);
      const lockTs = lockRaw ? Number(lockRaw) : NaN;
      if (Number.isFinite(lockTs) && Date.now() - lockTs < HYDRATE_LOCK_MS) {
        await sleep(250);
        session = readUsableClientSessionFromStorage();
        if (session?.access_token) return true;
      }

      window.localStorage.setItem(HYDRATE_LOCK_KEY, String(Date.now()));
      try {
        const res = await fetch("/api/auth/supabase-browser-session", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          if (res.status === 401) {
            clearStaleClientAuthStorage();
          }
          return false;
        }

        const body = (await res.json()) as {
          success?: boolean;
          access_token?: string;
          refresh_token?: string;
        };
        if (!body.success || !body.access_token || !body.refresh_token) return false;

        session = readUsableClientSessionFromStorage();
        if (session?.access_token) return true;

        return applyServerTokensToClient(body.access_token, body.refresh_token);
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

/** After login set-cookie, align localStorage with the server session (best-effort). */
export async function syncClientStorageFromServerSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (readUsableClientSessionFromStorage()) return true;

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
    return applyServerTokensToClient(body.access_token, body.refresh_token);
  } catch {
    return false;
  }
}

/** Drop expired localStorage session without hitting Supabase refresh endpoint. */
export function clearExpiredClientStorageIfNeeded(): void {
  const session = readClientSessionFromStorage();
  if (!session) return;
  if (!session.access_token || !session.refresh_token) {
    clearStaleClientAuthStorage();
  }
}
