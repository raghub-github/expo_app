/**
 * Resolve the current Supabase user for Node (Server Components / Route Handlers).
 *
 * Prefers `getUser()` (Auth API validation). When Supabase is unreachable
 * (ConnectTimeout / fetch failed — common on Windows → Cloudflare), falls back
 * to `getSession()` cookie JWT so the dashboard stays usable instead of
 * erroring every page load.
 *
 * After a network timeout, skips Auth API for a short cooldown and uses the
 * cookie session only — avoids Next overlay spam of `TypeError: fetch failed`.
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

/** Skip remote getUser() briefly after ConnectTimeout / fetch failed. */
let authNetworkDownUntil = 0;
const AUTH_NETWORK_COOLDOWN_MS = 45_000;

function markAuthNetworkDown(): void {
  authNetworkDownUntil = Date.now() + AUTH_NETWORK_COOLDOWN_MS;
}

function isAuthNetworkCoolingDown(): boolean {
  return Date.now() < authNetworkDownUntil;
}

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

  // Auth API recently timed out — use cookie JWT only (no more fetch failed spam).
  if (isAuthNetworkCoolingDown()) {
    const sessionUser = await readCookieSessionUser(supabase);
    if (sessionUser?.email) {
      return {
        user: sessionUser,
        error: null,
        usedSessionFallback: true,
        supabase,
      };
    }
  }

  let user: User | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await getUserSafe(supabase);
    user = result.user;
    lastError = result.error;

    if (!lastError && user?.email) {
      authNetworkDownUntil = 0;
      return { user, error: null, usedSessionFallback: false, supabase };
    }

    if (lastError && isRefreshTokenAlreadyUsed(lastError) && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }

    if (lastError && isInvalidRefreshToken(lastError)) break;

    // Connect/socket timeouts: Auth is unreachable — don't burn more attempts.
    if (lastError && isTimeoutOrAbortError(lastError)) {
      markAuthNetworkDown();
      break;
    }

    if (lastError && isNetworkOrTransientError(lastError) && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
      continue;
    }

    if (lastError && isNetworkOrTransientError(lastError)) {
      markAuthNetworkDown();
      break;
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }

  // Cookie fallback when Auth API cannot be reached (same rationale as middleware).
  if (lastError && (isTimeoutOrAbortError(lastError) || isNetworkOrTransientError(lastError))) {
    markAuthNetworkDown();
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

/**
 * Safe auth user for API `requireAreaManagerApiAuth` getters.
 * Never throws — network failures fall back to cookie session.
 */
export async function getAuthUserSafe(): Promise<{
  id: string;
  email?: string;
} | null> {
  const { user } = await resolveSupabaseUser({ maxAttempts: 2, retryDelayMs: 200 });
  if (!user?.id) return null;
  return { id: user.id, email: user.email ?? undefined };
}
