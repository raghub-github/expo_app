import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveSupabaseUser } from "@/lib/auth/resolve-supabase-user";
import {
  isRefreshTokenAlreadyUsed,
  isRefreshTokenNotFound,
  isTransientAuthError,
} from "@/lib/auth/session-errors";

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

/** Optional request handle for abort + cookie-first auth. `cookies` preferred when present. */
export type ApiAuthRequest = Pick<NextRequest, "signal"> &
  Partial<Pick<NextRequest, "cookies">>;

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

  const cookieReader = request?.cookies
    ? {
        get: (name: string) => request.cookies!.get(name),
        getAll: () => request.cookies!.getAll(),
      }
    : null;

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

  // Cookie/JWT may omit email while still identifying the user — prefer id.
  // Requiring email alone caused intermittent 401s under parallel store loads.
  if (user?.id) {
    return { ok: true, user, supabase };
  }

  if (userError && isRefreshTokenNotFound(userError)) {
    return {
      ok: false,
      status: 401,
      body: { success: false, error: "Session invalid", code: "SESSION_INVALID" },
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
