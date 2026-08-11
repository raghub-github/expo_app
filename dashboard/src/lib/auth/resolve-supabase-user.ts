/**
 * Resolve the current Supabase user for Node (Server Components / Route Handlers).
 *
 * Production strategy (cookie-first):
 * 1. Prefer the cookie JWT via getSession() when the access token is still usable.
 *    Order Details fires 10+ parallel APIs — calling Auth getUser() on each causes
 *    AbortError (8s timeout), refresh_token races, and logout loops.
 * 2. Only call Auth getUser() when the cookie is missing or the access token is
 *    expired / near expiry. Concurrent refreshes share one in-flight promise.
 * 3. Never signOut from this path. Parallel losers must not wipe the winner's cookies.
 * 4. On Auth unreachable / abort / refresh race: keep serving the cookie user.
 */
import type { Session, User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  isInvalidRefreshToken,
  isNetworkOrTransientError,
  isRefreshTokenAlreadyUsed,
  isRefreshTokenNotFound,
  isTimeoutOrAbortError,
} from "@/lib/auth/session-errors";

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

/** Refresh skew: treat token as expired this many ms before real expiry. */
const ACCESS_TOKEN_SKEW_MS = 60_000;

/** Single-flight refresh so parallel API routes don't rotate the same refresh token. */
let refreshInFlight: Promise<ResolvedSupabaseAuth> | null = null;

function markAuthNetworkDown(): void {
  authNetworkDownUntil = Date.now() + AUTH_NETWORK_COOLDOWN_MS;
}

function isAuthNetworkCoolingDown(): boolean {
  return Date.now() < authNetworkDownUntil;
}

async function readCookieSession(supabase: ServerSupabase): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session ?? null;
  } catch {
    return null;
  }
}

function isAccessTokenUsable(session: Session | null | undefined): boolean {
  if (!session?.user?.email) return false;
  const expiresAtSec = session.expires_at;
  if (expiresAtSec == null || !Number.isFinite(expiresAtSec)) {
    // No expiry metadata — still usable for dashboard API gating.
    return true;
  }
  return expiresAtSec * 1000 > Date.now() + ACCESS_TOKEN_SKEW_MS;
}

async function getUserSafe(
  supabase: ServerSupabase
): Promise<{ user: User | null; error: unknown }> {
  try {
    const result = await supabase.auth.getUser();
    return { user: result.data?.user ?? null, error: result.error ?? null };
  } catch (err) {
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
      // Another request won the rotation — re-read cookies and retry briefly.
      await new Promise((r) => setTimeout(r, 350));
      const session = await readCookieSession(supabase);
      if (session?.user?.email && isAccessTokenUsable(session)) {
        return ok(session.user, supabase, true);
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

  // Prefer cookie JWT over killing the session on Auth races / outages.
  const session = await readCookieSession(supabase);
  if (session?.user?.email) {
    if (
      lastError &&
      (isTimeoutOrAbortError(lastError) ||
        isNetworkOrTransientError(lastError) ||
        isRefreshTokenAlreadyUsed(lastError) ||
        isRefreshTokenNotFound(lastError))
    ) {
      if (isTimeoutOrAbortError(lastError) || isNetworkOrTransientError(lastError)) {
        markAuthNetworkDown();
      }
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[auth] Auth API failed; using cookie session for",
          session.user.email,
          lastError instanceof Error ? lastError.message : lastError
        );
      }
      return ok(session.user, supabase, true);
    }
    // Access may be expired but cookie still has identity — allow soft use.
    if (isAccessTokenUsable(session) || session.user.email) {
      return ok(session.user, supabase, true);
    }
  }

  // Do NOT signOut here. Parallel losers must not wipe the winner's cookies.
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

  const cookieSession = await readCookieSession(supabase);

  // Fast path: usable cookie access token — no Auth network call.
  if (!forceRemote && cookieSession && isAccessTokenUsable(cookieSession)) {
    return ok(cookieSession.user, supabase, true);
  }

  // Auth recently timed out — stay on cookie to avoid AbortError storms.
  if (!forceRemote && isAuthNetworkCoolingDown() && cookieSession?.user?.email) {
    return ok(cookieSession.user, supabase, true);
  }

  // Soft-trust the signed cookie identity even when the access token is expired.
  // The BROWSER's supabase client owns token refresh. Refreshing server-side across a
  // page's ~10 parallel API calls rotates the refresh token concurrently, races, can
  // overwrite the cookie with a stale token, and wedges auth into sustained 504s.
  // Serve the identity and let the client refresh out-of-band — same trust model as the
  // usable-token fast path above. getUser() below now runs only for requests with NO
  // cookie identity (login / truly unauthenticated), which return fast.
  if (!forceRemote && cookieSession?.user?.email) {
    return ok(cookieSession.user, supabase, true);
  }

  // Need remote validation / refresh — single-flight across concurrent route handlers.
  if (refreshInFlight) {
    try {
      const shared = await refreshInFlight;
      // Re-bind supabase for this request's cookie store.
      if (shared.user?.email) {
        const latest = await readCookieSession(supabase);
        if (latest?.user?.email) {
          return ok(latest.user, supabase, true);
        }
        return ok(shared.user, supabase, shared.usedSessionFallback);
      }
    } catch {
      /* fall through to own attempt */
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
