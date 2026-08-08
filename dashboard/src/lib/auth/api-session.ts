import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasReadableCookieSession, hasSbAuthCookies, resolveSupabaseUser } from "@/lib/auth/resolve-supabase-user";
import {
  isAuthSessionMissingError,
  isInvalidRefreshToken,
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

/**
 * Canonical dashboard API auth.
 * Uses getUser() via resolveSupabaseUser with race-safe retries.
 */
export async function getAuthenticatedApiUser(
  request?: Pick<NextRequest, "signal">
): Promise<ApiAuthSuccess | ApiAuthFailure> {
  if (request?.signal.aborted) {
    return {
      ok: false,
      status: 499,
      body: { success: false, error: "Request aborted", code: "REQUEST_ABORTED" },
    };
  }

  const maxAttempts = 3;
  const retryDelayMs = 400;
  const sbCookiesPresent = await hasSbAuthCookies();
  const readableSession = await hasReadableCookieSession();

  for (let pass = 0; pass < 2; pass++) {
    const resolved = await resolveSupabaseUser({ maxAttempts, retryDelayMs });

    if (request?.signal.aborted) {
      return {
        ok: false,
        status: 499,
        body: { success: false, error: "Request aborted", code: "REQUEST_ABORTED" },
      };
    }

    const { user, error: userError } = resolved;

    if (user?.email) {
      return { ok: true, user, supabase: resolved.supabase };
    }

    const retryableRace =
      isRefreshTokenAlreadyUsed(userError) ||
      isRefreshTokenNotFound(userError) ||
      isAuthSessionMissingError(userError) ||
      isTransientAuthError(userError) ||
      userError == null;

    if (pass === 0 && retryableRace) {
      await new Promise((r) => setTimeout(r, 350));
      continue;
    }

    if (userError && isInvalidRefreshToken(userError) && !isRefreshTokenAlreadyUsed(userError)) {
      return {
        ok: false,
        status: 401,
        body: { success: false, error: "Session invalid", code: "SESSION_INVALID" },
      };
    }

    if (userError && (isRefreshTokenAlreadyUsed(userError) || isRefreshTokenNotFound(userError))) {
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

    if (isAuthSessionMissingError(userError)) {
      return {
        ok: false,
        status: readableSession ? 503 : 401,
        body: readableSession
          ? {
              success: false,
              error: "Service temporarily unavailable",
              code: "SERVICE_UNAVAILABLE",
            }
          : { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
      };
    }

    // Readable cookie session but getUser failed transiently — retry client-side, don't logout.
    if (readableSession) {
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

    // Orphan/stale sb-* cookie names without a parseable session.
    if (sbCookiesPresent) {
      return {
        ok: false,
        status: 401,
        body: { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
      };
    }

    return {
      ok: false,
      status: 401,
      body: { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
    };
  }

  if (readableSession) {
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

  if (sbCookiesPresent) {
    return {
      ok: false,
      status: 401,
      body: { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
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
