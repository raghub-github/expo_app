/**
 * Resolve the current Supabase user for Node (Server Components / Route Handlers).
 *
 * Prefers `getUser()` (Auth API validation). When Supabase is unreachable
 * (ConnectTimeout / fetch failed — common on Windows → Cloudflare), falls back
 * to `getSession()` cookie JWT so the dashboard stays usable instead of
 * erroring every page load.
 */
import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  isInvalidRefreshToken,
  isNetworkOrTransientError,
  isRefreshTokenAlreadyUsed,
  isTimeoutOrAbortError,
  signOutIfSessionDead,
} from "@/lib/auth/session-errors";

export type ResolvedSupabaseAuth = {
  user: User | null;
  error: unknown;
  /** True when user came from cookie session after Auth API network failure. */
  usedSessionFallback: boolean;
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
};

async function readCookieSessionUser(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session?.user ?? null;
  } catch {
    return null;
  }
}

/**
 * Run getUser without letting undici ConnectTimeout bubble as an uncaught
 * console TypeError in Next's RSC overlay more than necessary.
 */
async function getUserSafe(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
): Promise<{ user: User | null; error: unknown }> {
  try {
    const result = await supabase.auth.getUser();
    return { user: result.data?.user ?? null, error: result.error ?? null };
  } catch (err) {
    return { user: null, error: err };
  }
}

export async function resolveSupabaseUser(options?: {
  maxAttempts?: number;
  /** Extra delay between attempts (ms). Timeouts skip further retries. */
  retryDelayMs?: number;
}): Promise<ResolvedSupabaseAuth> {
  const maxAttempts = options?.maxAttempts ?? 2;
  const retryDelayMs = options?.retryDelayMs ?? 300;
  const supabase = await createServerSupabaseClient();

  let user: User | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await getUserSafe(supabase);
    user = result.user;
    lastError = result.error;

    if (!lastError && user?.email) {
      return { user, error: null, usedSessionFallback: false, supabase };
    }

    if (lastError && isRefreshTokenAlreadyUsed(lastError) && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }

    if (lastError && isInvalidRefreshToken(lastError)) break;

    // Connect/socket timeouts: Auth is unreachable — don't burn more attempts.
    if (lastError && isTimeoutOrAbortError(lastError)) break;

    if (lastError && isNetworkOrTransientError(lastError) && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
      continue;
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }

  // Cookie fallback when Auth API cannot be reached (same rationale as middleware).
  if (lastError && (isTimeoutOrAbortError(lastError) || isNetworkOrTransientError(lastError))) {
    const sessionUser = await readCookieSessionUser(supabase);
    if (sessionUser?.email) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[auth] Supabase Auth unreachable; using cookie session for",
          sessionUser.email
        );
      }
      return {
        user: sessionUser,
        error: null,
        usedSessionFallback: true,
        supabase,
      };
    }
  }

  await signOutIfSessionDead(supabase, lastError);

  return {
    user,
    error: lastError,
    usedSessionFallback: false,
    supabase,
  };
}
