"use client";

import { supabase } from "@/lib/supabase/client";
import { safeParseJson } from "@/lib/utils";

export type SetCookieResult = { ok: true } | { ok: false; error: string };
const SERVER_COOKIE_SYNCED_KEY = "gm_server_cookie_synced";

function markServerCookieSynced(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SERVER_COOKIE_SYNCED_KEY, "1");
  } catch {
    // ignore storage failures
  }
}

function isServerCookieAlreadySynced(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(SERVER_COOKIE_SYNCED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * POST access + refresh tokens to /api/auth/set-cookie so Next.js middleware and
 * server routes receive httpOnly Supabase cookies.
 */
export async function postSetCookieWithTokens(
  accessToken: string,
  refreshToken: string
): Promise<SetCookieResult> {
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
    return { ok: true };
  }

  let errorMessage = "Authentication failed";
  if (text.trim()) {
    try {
      const parsed = safeParseJson<{ error?: string }>(text, "");
      if (parsed?.error) errorMessage = parsed.error;
      else if (text.length < 300) errorMessage = text.trim();
    } catch {
      // keep default
    }
  }
  return { ok: false, error: errorMessage };
}

let inFlightSync: Promise<boolean> | null = null;

/**
 * If the browser already has a Supabase session (e.g. OAuth stored in localStorage)
 * but server cookies were never set (skipped /auth/callback, wrong redirect URL, etc.),
 * mirror the session to cookies before calling /api/auth/bootstrap.
 */
export async function syncServerSessionCookies(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (isServerCookieAlreadySynced()) return true;

  if (inFlightSync) return inFlightSync;

  inFlightSync = (async () => {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error || !session?.access_token || !session?.refresh_token) {
        return false;
      }

      const r = await postSetCookieWithTokens(session.access_token, session.refresh_token);
      if (r.ok) return true;

      // Supabase refresh tokens are single-use and can rotate across tabs/processes.
      // If another request already consumed this token, treat sync as completed
      // to avoid noisy retry loops and repeated "Already Used" errors.
      if (/invalid refresh token:\s*already used/i.test(r.error)) {
        markServerCookieSynced();
        return true;
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
