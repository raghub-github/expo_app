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

/**
 * Canonical dashboard API auth.
 * Cookie-first via resolveSupabaseUser — safe under parallel Order Details loads.
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

  const resolved = await resolveSupabaseUser({ maxAttempts: 2, retryDelayMs: 400 });

  if (request?.signal.aborted) {
    return {
      ok: false,
      status: 499,
      body: { success: false, error: "Request aborted", code: "REQUEST_ABORTED" },
    };
  }

  const { user, error: userError, supabase } = resolved;

  if (user?.email) {
    return { ok: true, user, supabase };
  }

  if (userError && (isRefreshTokenAlreadyUsed(userError) || isRefreshTokenNotFound(userError))) {
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
