"use client";

import { supabase } from "@/lib/supabase/client";
import { isInvalidRefreshToken, shouldClearAuthSession } from "@/lib/auth/session-errors";
import { safeParseJson } from "@/lib/utils";

export type SetCookieResult = { ok: true } | { ok: false; error: string };
const SERVER_COOKIE_SYNCED_KEY = "gm_server_cookie_synced_v1";
const SERVER_COOKIE_SYNC_TTL_MS = 30 * 60 * 1000;

/** Mark httpOnly cookie sync complete (e.g. right after login set-cookie). */
export function markServerCookieSynced(): void {
  if (typeof window === "undefined") return;
  try {
    // Shared across tabs — sessionStorage caused every new tab to re-post refresh tokens.
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
      // Prefer keeping an already-working cookie session over replaying stale
      // localStorage refresh tokens (which previously signed the user out).
      try {
        const probe = await fetch("/api/auth/session-status", {
          credentials: "include",
          cache: "no-store",
        });
        if (probe.ok) {
          const body = (await probe.json().catch(() => null)) as {
            success?: boolean;
            authenticated?: boolean;
          } | null;
          if (body?.success && body.authenticated) {
            markServerCookieSynced();
            return true;
          }
        }
      } catch {
        // continue to token post path
      }

      let session: { access_token: string; refresh_token: string } | null = null;
      try {
        const result = await supabase.auth.getSession();
        session = result.data?.session ?? null;
        if (result.error) {
          if (shouldClearAuthSession(result.error)) {
            await supabase.auth.signOut();
            return false;
          }
          if (isInvalidRefreshToken(result.error)) {
            // already_used race — cookies may still be fine
            markServerCookieSynced();
            return true;
          }
          return false;
        }
      } catch (err) {
        if (shouldClearAuthSession(err)) {
          await supabase.auth.signOut();
        }
        return false;
      }

      if (!session?.access_token || !session?.refresh_token) {
        return false;
      }

      const r = await postSetCookieWithTokens(session.access_token, session.refresh_token);
      if (r.ok) return true;

      // Supabase refresh tokens are single-use and can rotate across tabs/processes.
      // If another request already consumed this token, treat sync as completed
      // to avoid noisy retry loops and repeated "Already Used" errors.
      if (/invalid refresh token|already used|not found/i.test(r.error)) {
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
