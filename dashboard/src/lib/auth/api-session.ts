import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveSupabaseUser } from "@/lib/auth/resolve-supabase-user";
import {
  isInvalidRefreshToken,
  isNetworkOrTransientError,
  isRefreshTokenAlreadyUsed,
  isTimeoutOrAbortError,
} from "@/lib/auth/session-errors";

export type ApiAuthFailure =
  | { ok: false; status: 401; body: { success: false; error: string; code: string } }
  | { ok: false; status: 503; body: { success: false; error: string; code: string } }
  | { ok: false; status: 499; body: { success: false; error: string; code: string } };

export type ApiAuthSuccess = {
  ok: true;
  user: User;
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
};

export function isTransientAuthError(err: unknown): boolean {
  return isTimeoutOrAbortError(err) || isNetworkOrTransientError(err);
}

/**
 * Resolve the current dashboard user for API routes.
 * Retries transient Supabase/network failures; falls back to cookie session
 * when Auth API connect times out (Windows → Cloudflare is a common case).
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

  const resolved = await resolveSupabaseUser({ maxAttempts: 3, retryDelayMs: 800 });

  if (request?.signal.aborted) {
    return {
      ok: false,
      status: 499,
      body: { success: false, error: "Request aborted", code: "REQUEST_ABORTED" },
    };
  }

  const { user, error: userError, supabase } = resolved;

  if (userError || !user) {
    if (userError && isInvalidRefreshToken(userError)) {
      if (isRefreshTokenAlreadyUsed(userError)) {
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
        body: { success: false, error: "Session invalid", code: "SESSION_INVALID" },
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

  return { ok: true, user, supabase };
}
