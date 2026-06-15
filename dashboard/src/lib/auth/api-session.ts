import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isInvalidRefreshToken, isNetworkOrTransientError } from "@/lib/auth/session-errors";

const maxGetUserAttempts = 3;
const retryDelaysMs = [800, 1600];

export type ApiAuthFailure =
  | { ok: false; status: 401; body: { success: false; error: string; code: string } }
  | { ok: false; status: 503; body: { success: false; error: string; code: string } };

export type ApiAuthSuccess = { ok: true; user: User; supabase: Awaited<ReturnType<typeof createServerSupabaseClient>> };

/**
 * Resolve the current dashboard user for API routes.
 * Retries transient Supabase/network failures so parallel tab loads do not surface false 401s.
 */
export async function getAuthenticatedApiUser(): Promise<ApiAuthSuccess | ApiAuthFailure> {
  const supabase = await createServerSupabaseClient();

  let user: User | null = null;
  let userError: unknown = null;

  for (let attempt = 1; attempt <= maxGetUserAttempts; attempt++) {
    const result = await supabase.auth.getUser();
    user = result.data?.user ?? null;
    userError = result.error ?? null;

    if (!userError && user) break;
    if (userError && isInvalidRefreshToken(userError)) break;
    if (userError && isNetworkOrTransientError(userError) && attempt < maxGetUserAttempts) {
      const delay = retryDelaysMs[attempt - 1] ?? 1000;
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    break;
  }

  if (userError || !user) {
    if (userError && isInvalidRefreshToken(userError)) {
      await supabase.auth.signOut();
      return {
        ok: false,
        status: 401,
        body: { success: false, error: "Session invalid", code: "SESSION_INVALID" },
      };
    }
    if (userError && isNetworkOrTransientError(userError)) {
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
