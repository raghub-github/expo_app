"use client";

import { supabase } from "@/lib/supabase/client";
import {
  clearStaleClientAuthStorage,
  readClientSessionFromStorage,
  readUsableClientSessionFromStorage,
} from "@/lib/auth/client-session-storage";
import { isInvalidRefreshToken, isRefreshTokenAlreadyUsed, isRefreshTokenNotFound } from "@/lib/auth/session-errors";

let inFlight: Promise<boolean> | null = null;

const HYDRATE_LOCK_KEY = "gm_supabase_hydrate_lock_v1";
const HYDRATE_LOCK_MS = 8_000;
/** After NO_SESSION / failed bridge, skip repeat fetches (stops 401 spam across hooks). */
const NO_SESSION_COOLDOWN_MS = 60_000;
const NO_SESSION_COOLDOWN_KEY = "gm_supabase_hydrate_no_session_until_v1";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function readNoSessionCooldownUntil(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.sessionStorage.getItem(NO_SESSION_COOLDOWN_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function markNoSessionCooldown(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      NO_SESSION_COOLDOWN_KEY,
      String(Date.now() + NO_SESSION_COOLDOWN_MS)
    );
  } catch {
    /* ignore */
  }
}

function clearNoSessionCooldown(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(NO_SESSION_COOLDOWN_KEY);
  } catch {
    /* ignore */
  }
}

async function applyServerTokensToClient(
  accessToken: string,
  refreshToken: string
): Promise<boolean> {
  if (readUsableClientSessionFromStorage()?.access_token) return true;

  // Expired access + dead refresh: setSession() calls Auth and logs
  // AuthApiError refresh_token_not_found. Skip — cookies still authenticate APIs.
  try {
    const parts = accessToken.split(".");
    if (parts.length >= 2) {
      const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
      const claims = JSON.parse(json) as { exp?: number };
      if (typeof claims.exp === "number" && claims.exp * 1000 <= Date.now() + 60_000) {
        return false;
      }
    }
  } catch {
    return false;
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (!error) return true;

  if (isRefreshTokenAlreadyUsed(error)) {
    if (readUsableClientSessionFromStorage()?.access_token) return true;
    return false;
  }

  if (isRefreshTokenNotFound(error) || isInvalidRefreshToken(error)) {
    clearStaleClientAuthStorage();
  }
  return false;
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
      if (isBrowserOffline()) return false;

      let session = readUsableClientSessionFromStorage();
      if (session?.access_token) {
        clearNoSessionCooldown();
        return true;
      }

      if (Date.now() < readNoSessionCooldownUntil()) {
        return false;
      }

      await sleep(80);
      session = readUsableClientSessionFromStorage();
      if (session?.access_token) {
        clearNoSessionCooldown();
        return true;
      }

      const lockRaw = window.localStorage.getItem(HYDRATE_LOCK_KEY);
      const lockTs = lockRaw ? Number(lockRaw) : NaN;
      if (Number.isFinite(lockTs) && Date.now() - lockTs < HYDRATE_LOCK_MS) {
        await sleep(250);
        session = readUsableClientSessionFromStorage();
        if (session?.access_token) {
          clearNoSessionCooldown();
          return true;
        }
        if (Date.now() < readNoSessionCooldownUntil()) return false;
      }

      window.localStorage.setItem(HYDRATE_LOCK_KEY, String(Date.now()));
      try {
        const res = await fetch("/api/auth/supabase-browser-session", {
          credentials: "include",
          cache: "no-store",
        });

        let body: {
          success?: boolean;
          code?: string;
          access_token?: string;
          refresh_token?: string;
        } = {};
        try {
          body = (await res.json()) as typeof body;
        } catch {
          markNoSessionCooldown();
          return false;
        }

        // Expected: no cookie session for Realtime bridge (login cookies may still auth APIs).
        if (res.status === 401 || body.code === "NO_SESSION" || body.success === false) {
          if (res.status === 401 || body.code === "NO_SESSION") {
            clearStaleClientAuthStorage();
          }
          markNoSessionCooldown();
          return false;
        }

        if (!res.ok) {
          markNoSessionCooldown();
          return false;
        }

        if (!body.access_token || !body.refresh_token) {
          markNoSessionCooldown();
          return false;
        }

        session = readUsableClientSessionFromStorage();
        if (session?.access_token) {
          clearNoSessionCooldown();
          return true;
        }

        const applied = await applyServerTokensToClient(body.access_token, body.refresh_token);
        if (applied) clearNoSessionCooldown();
        else markNoSessionCooldown();
        return applied;
      } finally {
        try {
          window.localStorage.removeItem(HYDRATE_LOCK_KEY);
        } catch {
          /* ignore */
        }
      }
    } catch {
      // Offline / aborted — cooldown lightly so visibility storms do not hammer the API.
      markNoSessionCooldown();
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
  clearNoSessionCooldown();
  if (readUsableClientSessionFromStorage()) return true;
  if (isBrowserOffline()) return false;

  try {
    const res = await fetch("/api/auth/supabase-browser-session", {
      credentials: "include",
      cache: "no-store",
    });
    let body: {
      success?: boolean;
      code?: string;
      access_token?: string;
      refresh_token?: string;
    } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      return false;
    }
    if (res.status === 401 || body.code === "NO_SESSION" || !body.success) {
      markNoSessionCooldown();
      return false;
    }
    if (!res.ok || !body.access_token || !body.refresh_token) return false;
    const applied = await applyServerTokensToClient(body.access_token, body.refresh_token);
    if (applied) clearNoSessionCooldown();
    return applied;
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

/**
 * After BFCache restore, Realtime sockets are dead. Soft-reconnect once without
 * spamming the session bridge when we already know there is no client JWT.
 */
export function reconnectRealtimeAfterBfCache(): void {
  if (typeof window === "undefined") return;
  try {
    // Disconnect closed sockets from BFCache; channels re-subscribe on next hook effect.
    supabase.realtime.disconnect();
  } catch {
    /* ignore */
  }
  if (readUsableClientSessionFromStorage()?.access_token) {
    try {
      supabase.realtime.connect();
    } catch {
      /* ignore */
    }
    return;
  }
  void hydrateBrowserSupabaseFromCookies().then((ok) => {
    if (!ok) return;
    try {
      supabase.realtime.connect();
    } catch {
      /* ignore */
    }
  });
}
