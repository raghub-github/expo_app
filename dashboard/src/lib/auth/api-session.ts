import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { peekCachedResolvedUser, resolveSupabaseUser } from "@/lib/auth/resolve-supabase-user";
import {
  isRefreshTokenAlreadyUsed,
  isRefreshTokenNotFound,
  isTransientAuthError,
} from "@/lib/auth/session-errors";
import { hasSupabaseAuthCookies, parseCookieHeaderPairs } from "@/lib/auth/read-cookie-access-session";
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

function cookieReaderFromRequest(request?: ApiAuthRequest) {
  try {
    const byName = new Map<string, string>();
    try {
      for (const c of request?.cookies?.getAll() ?? []) {
        if (c.value) byName.set(c.name, c.value);
      }
    } catch {
      /* Next cookie jar can throw/miss during compile */
    }
    const header = request?.headers?.get?.("cookie") ?? "";
    if (header) {
      for (const c of cookiePairsFromHeader(header)) {
        if (c.value && !byName.has(c.name)) byName.set(c.name, c.value);
      }
    }
    if (byName.size === 0) return null;
    const pairs = Array.from(byName, ([name, value]) => ({ name, value }));
    return {
      get: (name: string) => {
        const value = byName.get(name);
        return value != null ? { value } : undefined;
      },
      getAll: () => pairs,
    };
  } catch {
    return null;
  }
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
    if (pairs.length === 0) return null;
    return {
      get: (name: string) => pairs.find((c) => c.name === name),
      getAll: () => pairs,
    };
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

  const resolved = await resolveSupabaseUser({
    maxAttempts: 2,
    retryDelayMs: 400,
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
  const cachedUser = peekCachedResolvedUser();

  // Loser of a parallel refresh often sees refresh_token_not_found while the
  // winner already wrote new cookies. Never treat that as a dead session.
  if (userError && isRefreshTokenNotFound(userError)) {
    if (cachedUser?.id) {
      return { ok: true, user: withDashboardEmail(cachedUser, cookieEmail), supabase };
    }
    if (hasSbCookies) {
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
    return {
      ok: false,
      status: 401,
      body: { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
    };
  }

  if (userError && isRefreshTokenAlreadyUsed(userError)) {
    // Parallel refresh races — do not force logout; client should retry.
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

  if (userError && isTransientAuthError(userError)) {
    // Quiet 503 — do not console.error AbortError/timeout objects here.
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

  if (hasSbCookies) {
    if (cachedUser?.id) {
      return { ok: true, user: withDashboardEmail(cachedUser, cookieEmail), supabase };
    }
    // Cookie jar is present but parse/getUser missed during Next compile load.
    // Never 401 here — the client treats 401 as logout and wipes a live session.
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
