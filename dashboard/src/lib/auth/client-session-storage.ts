"use client";

import type { Session } from "@supabase/supabase-js";
import { isRefreshTokenNotFound, isRefreshTokenAlreadyUsed } from "@/lib/auth/session-errors";

/** Must match `storageKey` in `@/lib/supabase/client`. */
export const DASHBOARD_AUTH_STORAGE_KEY = "sb-gm-dashboard-auth-token";

const ACCESS_TOKEN_SKEW_MS = 60_000;

type StoredAuthPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  token_type?: string;
  user?: Session["user"];
};

/** Parse Supabase session from localStorage without calling Auth API (no refresh). */
export function readClientSessionFromStorage(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DASHBOARD_AUTH_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredAuthPayload | StoredAuthPayload[];
    const payload = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!payload?.access_token || !payload?.refresh_token || !payload?.user) return null;

    return {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_at: payload.expires_at,
      expires_in: payload.expires_at
        ? Math.max(0, payload.expires_at - Math.floor(Date.now() / 1000))
        : 3600,
      token_type: "bearer",
      user: payload.user,
    };
  } catch {
    return null;
  }
}

export function isClientAccessTokenUsable(session: Session | null | undefined): boolean {
  if (!session?.access_token) return false;
  const expiresAtSec = session.expires_at;
  if (expiresAtSec == null || !Number.isFinite(expiresAtSec)) return true;
  return expiresAtSec * 1000 > Date.now() + ACCESS_TOKEN_SKEW_MS;
}

/** Drop stale browser auth storage without revoking the server cookie session. */
export function clearStaleClientAuthStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DASHBOARD_AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** True for refresh races / dead local tokens — safe to clear browser storage only. */
export function isStaleLocalRefreshError(err: unknown): boolean {
  return isRefreshTokenNotFound(err) || isRefreshTokenAlreadyUsed(err);
}

/**
 * Prefer localStorage read (no network). Returns null when missing or access token expired.
 * Does NOT call `supabase.auth.getSession()` — that can refresh with a dead refresh token.
 */
export function readUsableClientSessionFromStorage(): Session | null {
  const session = readClientSessionFromStorage();
  if (!session || !isClientAccessTokenUsable(session)) return null;
  return session;
}
