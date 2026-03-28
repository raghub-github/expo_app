"use client";

import { supabase } from "@/lib/supabase/client";
import { safeParseJson } from "@/lib/utils";

export type SetCookieResult = { ok: true } | { ok: false; error: string };

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
  if (res.ok) return { ok: true };

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
      return r.ok;
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
