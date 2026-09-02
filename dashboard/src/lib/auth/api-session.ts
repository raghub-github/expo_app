import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveSupabaseUser } from "@/lib/auth/resolve-supabase-user";
import {
  isRefreshTokenAlreadyUsed,
  isRefreshTokenNotFound,
  isTransientAuthError,
} from "@/lib/auth/session-errors";
import {
  hasSupabaseAuthCookies,
  parseCookieHeaderPairs,
  readCookieAccessSession,
} from "@/lib/auth/read-cookie-access-session";
import {
  peekDashboardIdentity,
  rememberDashboardIdentity,
  DASHBOARD_IDENTITY_EMAIL_COOKIE,
} from "@/lib/auth/auth-identity-cache";

export type ApiAuthFailure =
  | { ok: false; status: 401; body: { success: false; error: string; code: string } }
  | { ok: false; status: 403; body: { success: false; error: string; code: string } }
  | { ok: false; status: 503; body: { success: false; error: string; code: string } }
  | { ok: false; status: 499; body: { success: false; error: string; code: string } };

export type ApiAuthSuccess = {
  ok: true;
  user: User;
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
};

function identityEmailFromCookies(
  reader: { get: (name: string) => { value: string } | undefined } | null | undefined
): string | undefined {
  const raw = reader?.get(DASHBOARD_IDENTITY_EMAIL_COOKIE)?.value?.trim().toLowerCase();
  return raw?.includes("@") ? raw : undefined;
}

function withDashboardEmail(user: User, cookieEmail?: string): User {
  if (typeof user.email === "string" && user.email.includes("@")) {
    return user;
  }
  const cached = peekDashboardIdentity(user.id);
  const email = cached?.email || cookieEmail;
  if (!email) return user;
  if (!cached?.email) {
    rememberDashboardIdentity(user.id, {
      email,
      systemUserNumericId: 0,
      primaryRole: "",
    });
  }
  return { ...user, email };
}
export type ApiAuthRequest = Pick<NextRequest, "signal"> &
  Partial<Pick<NextRequest, "cookies" | "headers">>;

function cookiePairsFromHeader(header: string): Array<{ name: string; value: string }> {
  return parseCookieHeaderPairs(header);
}

function cookieReaderFromPairs(pairs: Array<{ name: string; value: string }>) {
  if (pairs.length === 0) return null;
  const byName = new Map<string, string>();
  for (const c of pairs) {
    if (c.value) byName.set(c.name, c.value);
  }
  if (byName.size === 0) return null;
  const normalized = Array.from(byName, ([name, value]) => ({ name, value }));
  return {
    get: (name: string) => {
      const value = byName.get(name);
      return value != null ? { value } : undefined;
    },
    getAll: () => normalized,
  };
}

function cookieReaderFromRequest(request?: ApiAuthRequest) {
  try {
    const byName = new Map<string, string>();
    const header = request?.headers?.get?.("cookie") ?? "";
    if (header) {
      for (const c of cookiePairsFromHeader(header)) {
        if (c.value) byName.set(c.name, c.value);
      }
    }
    try {
      for (const c of request?.cookies?.getAll() ?? []) {
        if (c.value) byName.set(c.name, c.value);
      }
    } catch {
      /* Next cookie jar can throw/miss during compile */
    }
    return cookieReaderFromPairs(Array.from(byName, ([name, value]) => ({ name, value })));
  } catch {
    return null;
  }
}

function userFromCookieReader(
  cookieReader: ReturnType<typeof cookieReaderFromRequest>
): User | null {
  if (!cookieReader) return null;
  // Identity comes ONLY from this request's own cookie — never a shared cache.
  const session = readCookieAccessSession(cookieReader);
  return session?.user?.id ? session.user : null;
}

function serviceUnavailableFailure(): ApiAuthFailure {
  return {
    ok: false,
    status: 503,
    body: {
      success: false,
      error: "Service temporarily unavailable",
      code: "SERVICE_UNAVAILABLE",
    },
  };
}

/** Next compile / parallel refresh races can miss cookies briefly — retry before 503. */
async function recoverUserFromCookieRace(
  request?: ApiAuthRequest
): Promise<ApiAuthSuccess | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 100 * attempt));
    }
    if (request?.signal.aborted) return null;

    let reader = cookieReaderFromRequest(request);
    if (!reader || !hasSupabaseAuthCookies(reader)) {
      reader = (await cookieReaderFromNextHeaders()) ?? reader;
    }
    const cookieEmail = identityEmailFromCookies(reader);
    const fromCookie = userFromCookieReader(reader);
    if (fromCookie?.id) {
      const supabase = await createServerSupabaseClient();
      return {
        ok: true,
        user: withDashboardEmail(fromCookie, cookieEmail),
        supabase,
      };
    }
  }
  return null;
}

async function serviceUnavailableAfterRetry(
  request?: ApiAuthRequest
): Promise<ApiAuthSuccess | ApiAuthFailure> {
  const recovered = await recoverUserFromCookieRace(request);
  if (recovered) {
    return recovered;
  }
  return serviceUnavailableFailure();
}

async function cookieReaderFromNextHeaders() {
  try {
    const store = await cookies();
    const hdrs = await headers();
    const header = hdrs.get("cookie") ?? "";
    const fromStore = store.getAll();
    const pairs =
      fromStore.some((c) => c.name.startsWith("sb-") && c.value)
        ? fromStore
        : parseCookieHeaderPairs(header);
    return cookieReaderFromPairs(pairs);
  } catch {
    return null;
  }
}

/**
 * Canonical dashboard API auth.
 * Cookie-first via resolveSupabaseUser — safe under parallel Order Details loads.
 * Pass the full NextRequest when available so we can read request.cookies
 * (avoids next/headers `cookies()` misses during heavy compile/load).
 */
export async function getAuthenticatedApiUser(
  request?: ApiAuthRequest
): Promise<ApiAuthSuccess | ApiAuthFailure> {
  if (request?.signal.aborted) {
    return {
      ok: false,
      status: 499,
      body: { success: false, error: "Request aborted", code: "REQUEST_ABORTED" },
    };
  }

  let cookieReader = cookieReaderFromRequest(request);
  if (!cookieReader || !hasSupabaseAuthCookies(cookieReader)) {
    cookieReader = (await cookieReaderFromNextHeaders()) ?? cookieReader;
  }

  const cookieEmailEarly = identityEmailFromCookies(cookieReader);
  const earlyCookieUser = userFromCookieReader(cookieReader);
  if (earlyCookieUser?.id) {
    const supabase = await createServerSupabaseClient();
    return {
      ok: true,
      user: withDashboardEmail(earlyCookieUser, cookieEmailEarly),
      supabase,
    };
  }

  const resolved = await resolveSupabaseUser({
    maxAttempts: 3,
    retryDelayMs: 300,
    cookieReader,
  });

  if (request?.signal.aborted) {
    return {
      ok: false,
      status: 499,
      body: { success: false, error: "Request aborted", code: "REQUEST_ABORTED" },
    };
  }

  const { user, error: userError, supabase } = resolved;
  const cookieEmail = identityEmailFromCookies(cookieReader);

  // Cookie/JWT may omit email while still identifying the user — prefer id.
  // Requiring email alone caused intermittent 401s under parallel store loads.
  if (user?.id) {
    return { ok: true, user: withDashboardEmail(user, cookieEmail), supabase };
  }

  const hasSbCookies = cookieReader ? hasSupabaseAuthCookies(cookieReader) : false;
  // ONLY this request's own cookie identity is a valid fallback — never a
  // process-global "last resolved user" (that leaked identity across admins).
  const cookieFallbackUser = userFromCookieReader(cookieReader);

  const succeedWithFallback = (fallbackUser: User) =>
    ({
      ok: true as const,
      user: withDashboardEmail(fallbackUser, cookieEmail),
      supabase,
    });

  // Loser of a parallel refresh often sees refresh_token_not_found while the
  // winner already wrote new cookies. Never treat that as a dead session — but
  // recover only from THIS request's own cookie.
  if (userError && isRefreshTokenNotFound(userError)) {
    if (cookieFallbackUser?.id) {
      return succeedWithFallback(cookieFallbackUser);
    }
    if (hasSbCookies) {
      return serviceUnavailableAfterRetry(request);
    }
    return {
      ok: false,
      status: 401,
      body: { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
    };
  }

  if (userError && isRefreshTokenAlreadyUsed(userError)) {
    if (cookieFallbackUser?.id) {
      return succeedWithFallback(cookieFallbackUser);
    }
    // Parallel refresh races — do not force logout; client should retry.
    return serviceUnavailableAfterRetry(request);
  }

  if (userError && isTransientAuthError(userError)) {
    if (cookieFallbackUser?.id) {
      return succeedWithFallback(cookieFallbackUser);
    }
    // Quiet 503 — do not console.error AbortError/timeout objects here.
    return serviceUnavailableAfterRetry(request);
  }

  if (hasSbCookies) {
    if (cookieFallbackUser?.id) {
      return succeedWithFallback(cookieFallbackUser);
    }
    // Cookie jar is present but parse/getUser missed during Next compile load.
    // Never 401 here — the client treats 401 as logout and wipes a live session.
    return serviceUnavailableAfterRetry(request);
  }

  return {
    ok: false,
    status: 401,
    body: { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
  };
}

/** Map {@link getAuthenticatedApiUser} failure to a JSON route response. */
export function authFailureResponse(failure: ApiAuthFailure): NextResponse {
  return NextResponse.json(failure.body, { status: failure.status });
}
