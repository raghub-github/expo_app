/**
 * Resolve the current Supabase user for Node (Server Components / Route Handlers).
 *
 * Production strategy (cookie-first):
 * 1. Prefer the cookie JWT via local cookie parse (NOT getSession — that warns and may refresh).
 *    Order Details fires 10+ parallel APIs — calling Auth getUser() on each causes
 *    AbortError (8s timeout), refresh_token races, and logout loops.
 * 2. Only call Auth getUser() when the cookie is missing or the access token is
 *    expired / near expiry. Concurrent refreshes share one in-flight promise.
 * 3. Never signOut from this path. Parallel losers must not wipe the winner's cookies.
 * 4. On Auth unreachable / abort / refresh race: keep serving the cookie user.
 */
import type { Session, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  isInvalidRefreshToken,
  isNetworkOrTransientError,
  isRefreshTokenAlreadyUsed,
  isRefreshTokenNotFound,
  isTimeoutOrAbortError,
} from "@/lib/auth/session-errors";
import {
  isCookieAccessTokenUsable,
  readCookieAccessSession,
  type CookieAccessSession,
} from "@/lib/auth/read-cookie-access-session";

export type ResolvedSupabaseAuth = {
  user: User | null;
  error: unknown;
  /** True when user came from cookie session without a fresh Auth API validation. */
  usedSessionFallback: boolean;
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
};

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/** Skip remote getUser() briefly after ConnectTimeout / fetch failed. */
let authNetworkDownUntil = 0;
const AUTH_NETWORK_COOLDOWN_MS = 60_000;

/** Single-flight refresh so parallel API routes don't rotate the same refresh token. */
let refreshInFlight: Promise<ResolvedSupabaseAuth> | null = null;

function markAuthNetworkDown(): void {
  authNetworkDownUntil = Date.now() + AUTH_NETWORK_COOLDOWN_MS;
}

function isAuthNetworkCoolingDown(): boolean {
  return Date.now() < authNetworkDownUntil;
}

async function readLocalCookieSession(): Promise<CookieAccessSession | null> {
  try {
    const store = await cookies();
    return readCookieAccessSession({
      get: (name) => store.get(name),
      getAll: () => store.getAll(),
    });
  } catch {
    return null;
  }
}

/** Fallback when local parse fails — still avoid trusting session.user for remote auth. */
async function readCookieSessionViaSupabase(supabase: ServerSupabase): Promise<Session | null> {
  try {
    // getSession is only a last-resort cookie decode when local parse fails.
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session ?? null;
  } catch {
    return null;
  }
}

async function getUserSafe(
  supabase: ServerSupabase
): Promise<{ user: User | null; error: unknown }> {
  try {
    type AuthResult = Awaited<ReturnType<ServerSupabase["auth"]["getUser"]>>;
    const getUserPromise = supabase.auth.getUser().then(
      (r) => r,
      (err: unknown) => {
        // Convert AbortError → plain sentinel so nothing AbortError-shaped escapes.
        if (isTimeoutOrAbortError(err)) {
          return {
            data: { user: null },
            error: { name: "TimeoutError", message: "Auth probe aborted", code: "TIMEOUT" },
          } as AuthResult;
        }
        if (isNetworkOrTransientError(err)) {
          const msg = err instanceof Error ? err.message : "Auth network error";
          return {
            data: { user: null },
            error: { name: "NetworkError", message: msg, code: "FETCH_FAILED" },
          } as AuthResult;
        }
        throw err;
      }
    );
    // Race timeout may win first — keep orphan quiet forever.
    void getUserPromise.catch(() => undefined);

    const result = (await Promise.race([
      getUserPromise,
      new Promise<AuthResult>((resolve) => {
        setTimeout(() => {
          resolve({
            data: { user: null },
            error: { name: "TimeoutError", message: "Auth probe timeout", code: "TIMEOUT" },
          } as AuthResult);
        }, 2500);
      }),
    ])) as AuthResult;
    return { user: result.data?.user ?? null, error: result.error ?? null };
  } catch (err) {
    if (isTimeoutOrAbortError(err)) {
      return {
        user: null,
        error: { name: "TimeoutError", message: "Auth probe aborted", code: "TIMEOUT" },
      };
    }
    if (isNetworkOrTransientError(err)) {
      const msg = err instanceof Error ? err.message : "Auth network error";
      return {
        user: null,
        error: { name: "NetworkError", message: msg, code: "FETCH_FAILED" },
      };
    }
    return { user: null, error: err };
  }
}

function ok(
  user: User,
  supabase: ServerSupabase,
  usedSessionFallback: boolean
): ResolvedSupabaseAuth {
  return { user, error: null, usedSessionFallback, supabase };
}

async function resolveWithRemoteValidation(
  supabase: ServerSupabase,
  options: { maxAttempts: number; retryDelayMs: number }
): Promise<ResolvedSupabaseAuth> {
  const { maxAttempts, retryDelayMs } = options;
  let user: User | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await getUserSafe(supabase);
    user = result.user;
    lastError = result.error;

    if (!lastError && user?.email) {
      authNetworkDownUntil = 0;
      return ok(user, supabase, false);
    }

    if (lastError && isRefreshTokenAlreadyUsed(lastError) && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 350));
      const local = await readLocalCookieSession();
      if (local && isCookieAccessTokenUsable(local)) {
        return ok(local.user, supabase, true);
      }
      continue;
    }

    if (lastError && isInvalidRefreshToken(lastError)) break;

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

  if (lastError && isRefreshTokenNotFound(lastError)) {
    return { user: null, error: lastError, usedSessionFallback: false, supabase };
  }

  const local = await readLocalCookieSession();
  // Prefer id — some JWTs omit email in claims but still identify the user.
  if (local?.user?.id) {
    if (
      lastError &&
      (isTimeoutOrAbortError(lastError) ||
        isNetworkOrTransientError(lastError) ||
        isRefreshTokenAlreadyUsed(lastError))
    ) {
      if (isTimeoutOrAbortError(lastError) || isNetworkOrTransientError(lastError)) {
        markAuthNetworkDown();
      }
      return ok(local.user, supabase, true);
    }
    if (isCookieAccessTokenUsable(local)) {
      return ok(local.user, supabase, true);
    }
  }

  // Last resort: supabase cookie decode (may warn once) when local parse failed.
  // Skip on abort/timeout — getSession() would abort again and spam the terminal.
  if (!(lastError && (isTimeoutOrAbortError(lastError) || isNetworkOrTransientError(lastError)))) {
    const session = await readCookieSessionViaSupabase(supabase);
    if (session?.user?.id) {
      return ok(session.user, supabase, true);
    }
  }

  return {
    user: null,
    error: lastError,
    usedSessionFallback: false,
    supabase,
  };
}

export async function resolveSupabaseUser(options?: {
  maxAttempts?: number;
  /** Extra delay between attempts (ms). Timeouts skip further retries. */
  retryDelayMs?: number;
  /** Force Auth API validation even when cookie access token is usable. */
  forceRemote?: boolean;
}): Promise<ResolvedSupabaseAuth> {
  const maxAttempts = options?.maxAttempts ?? 2;
  const retryDelayMs = options?.retryDelayMs ?? 300;
  const forceRemote = options?.forceRemote === true;
  const supabase = await createServerSupabaseClient();

  const cookieSession = await readLocalCookieSession();

  // Fast path: usable cookie access token — no Auth network call, no getSession warning.
  if (!forceRemote && cookieSession && isCookieAccessTokenUsable(cookieSession)) {
    return ok(cookieSession.user, supabase, true);
  }

  // Auth recently timed out / aborted — stay on cookie (even if access JWT expired)
  // so list↔detail navigations after idle do not AbortError-loop.
  if (!forceRemote && isAuthNetworkCoolingDown() && cookieSession?.user?.id) {
    return ok(cookieSession.user, supabase, true);
  }

  if (refreshInFlight) {
    try {
      const shared = await refreshInFlight;
      if (shared.user?.id) {
        const latest = await readLocalCookieSession();
        if (latest?.user?.id) {
          return ok(latest.user, supabase, true);
        }
        return ok(shared.user, supabase, shared.usedSessionFallback);
      }
    } catch {
      /* fall through */
    }
  }

  const run = resolveWithRemoteValidation(supabase, { maxAttempts, retryDelayMs });
  refreshInFlight = run.finally(() => {
    refreshInFlight = null;
  });
  return run;
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
