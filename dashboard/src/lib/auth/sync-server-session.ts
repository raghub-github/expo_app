"use client";

import {
  clearStaleClientAuthStorage,
  readUsableClientSessionFromStorage,
} from "@/lib/auth/client-session-storage";
import { safeParseJson } from "@/lib/utils";
import { hydrateBrowserSupabaseFromCookies, syncClientStorageFromServerSession } from "@/lib/auth/hydrate-browser-supabase";

export type SetCookieResult = { ok: true } | { ok: false; error: string };
const SERVER_COOKIE_SYNCED_KEY = "gm_server_cookie_synced_v1";
const SERVER_COOKIE_SYNC_TTL_MS = 30 * 60 * 1000;

/** Mark httpOnly cookie sync complete (e.g. right after login set-cookie). */
export function markServerCookieSynced(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SERVER_COOKIE_SYNCED_KEY, String(Date.now()));
  } catch {
    // ignore storage failures
  }
}

function isServerCookieAlreadySynced(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(SERVER_COOKIE_SYNCED_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < SERVER_COOKIE_SYNC_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * POST access + refresh tokens to /api/auth/set-cookie so Next.js proxy and
 * server routes receive httpOnly Supabase cookies.
 */
export async function postSetCookieWithTokens(
  accessToken: string,
  refreshToken: string
): Promise<SetCookieResult> {
  const maxAttempts = 3;
  const retryDelaysMs = [600, 1200];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch("/api/auth/set-cookie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
    });
    const text = await res.text();
    if (res.ok) {
      markServerCookieSynced();
      void syncClientStorageFromServerSession();
      return { ok: true };
    }

    let errorMessage = "Authentication failed";
    if (text.trim()) {
      try {
        const parsed = safeParseJson<{ error?: string; code?: string }>(text, "");
        if (parsed?.error) errorMessage = parsed.error;
        else if (text.length < 300) errorMessage = text.trim();
        if (parsed?.code === "SERVICE_UNAVAILABLE" && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, retryDelaysMs[attempt - 1] ?? 1000));
          continue;
        }
      } catch {
        // keep default
      }
    }
    if (res.status === 503 && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, retryDelaysMs[attempt - 1] ?? 1000));
      continue;
    }
    return { ok: false, error: errorMessage };
  }

  return { ok: false, error: "Authentication failed" };
}

let inFlightSync: Promise<boolean> | null = null;

async function probeServerSessionAuthenticated(): Promise<boolean> {
  try {
    const probe = await fetch("/api/auth/session-status", {
      credentials: "include",
      cache: "no-store",
    });
    if (!probe.ok) return false;
    const body = (await probe.json().catch(() => null)) as {
      success?: boolean;
      authenticated?: boolean;
    } | null;
    return Boolean(body?.success && body?.authenticated);
  } catch {
    return false;
  }
}

/**
 * Ensure httpOnly server cookies exist before bootstrap/API calls.
 * Never replays stale localStorage refresh tokens when server cookies already work.
 */
export async function syncServerSessionCookies(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (isServerCookieAlreadySynced()) return true;

  if (inFlightSync) return inFlightSync;

  inFlightSync = (async () => {
    try {
      if (await probeServerSessionAuthenticated()) {
        markServerCookieSynced();
        void hydrateBrowserSupabaseFromCookies();
        return true;
      }

      // Server session missing — only mirror a still-usable local session (no getSession refresh).
      const localSession = readUsableClientSessionFromStorage();
      if (!localSession?.access_token || !localSession.refresh_token) {
        clearStaleClientAuthStorage();
        return false;
      }

      const r = await postSetCookieWithTokens(
        localSession.access_token,
        localSession.refresh_token
      );
      if (r.ok) return true;

      if (/invalid refresh token|already used|not found/i.test(r.error)) {
        clearStaleClientAuthStorage();
        if (await probeServerSessionAuthenticated()) {
          markServerCookieSynced();
          void hydrateBrowserSupabaseFromCookies();
          return true;
        }
      }
      return false;
    } catch {
      return false;
    } finally {
      queueMicrotask(() => {
        inFlightSync = null;
      });
    }
  })();

  return inFlightSync;
}

/** @deprecated Use clearStaleClientAuthStorage from client-session-storage */
export function clearDeadClientRefreshStorage(): void {
  clearStaleClientAuthStorage();
}
