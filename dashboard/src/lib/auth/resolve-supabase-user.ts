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
import { cookies, headers } from "next/headers";
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
  parseCookieHeaderPairs,
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

/**
 * Short-lived cache of the last successfully resolved user.
 * Parallel API handlers under Next compile load can miss `cookies()` briefly;
 * losers of a refresh race can still authenticate from this process-local cache.
 */
let lastResolvedUser: { user: User; until: number } | null = null;
const LAST_RESOLVED_USER_TTL_MS = 15_000;

export type ResolveCookieReader = {
  get: (name: string) => { value: string } | undefined;
  getAll?: () => Array<{ name: string; value: string }>;
};

function markAuthNetworkDown(): void {
  authNetworkDownUntil = Date.now() + AUTH_NETWORK_COOLDOWN_MS;
}

function isAuthNetworkCoolingDown(): boolean {
  return Date.now() < authNetworkDownUntil;
}

function rememberResolvedUser(user: User): void {
  if (!user?.id) return;
  lastResolvedUser = { user, until: Date.now() + LAST_RESOLVED_USER_TTL_MS };
}

function readCachedResolvedUser(): User | null {
  if (!lastResolvedUser) return null;
  if (Date.now() > lastResolvedUser.until) {
    lastResolvedUser = null;
    return null;
  }
  return lastResolvedUser.user;
}

/** Process-local identity from a recent successful resolve (compile-race fallback). */
export function peekCachedResolvedUser(): User | null {
  return readCachedResolvedUser();
}

function readSessionFromCookieReader(reader: ResolveCookieReader | null | undefined): CookieAccessSession | null {
  if (!reader) return null;
  try {
    return readCookieAccessSession(reader);
  } catch {
    return null;
  }
}

async function readLocalCookieSession(
  cookieReader?: ResolveCookieReader | null
): Promise<CookieAccessSession | null> {
  // Prefer the incoming request cookie jar — more reliable than next/headers
  // `cookies()` when many routes compile/render in parallel.
  const fromRequest = readSessionFromCookieReader(cookieReader);
  if (fromRequest?.user?.id) return fromRequest;

  try {
    const store = await cookies();
    return readCookieAccessSession({
      get: (name) => store.get(name),
      getAll: () => store.getAll(),
    });
  } catch {
    return fromRequest;
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
  rememberResolvedUser(user);
  return { user, error: null, usedSessionFallback, supabase };
}

async function resolveWithRemoteValidation(
  supabase: ServerSupabase,
  options: {
    maxAttempts: number;
    retryDelayMs: number;
    cookieReader?: ResolveCookieReader | null;
  }
): Promise<ResolvedSupabaseAuth> {
  const { maxAttempts, retryDelayMs, cookieReader } = options;
  let user: User | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await getUserSafe(supabase);
    user = result.user;
    lastError = result.error;

    // Prefer id — JWT/email claims can be omitted while the session is still valid.
    if (!lastError && user?.id) {
      authNetworkDownUntil = 0;
      return ok(user, supabase, false);
    }

    if (lastError && isRefreshTokenAlreadyUsed(lastError) && attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 350));
      const local = await readLocalCookieSession(cookieReader);
      if (local?.user?.id) {
        return ok(local.user, supabase, true);
      }
      const cached = readCachedResolvedUser();
      if (cached?.id) {
        return ok(cached, supabase, true);
      }
      continue;
    }

    if (lastError && isInvalidRefreshToken(lastError) && !isRefreshTokenAlreadyUsed(lastError)) {
      break;
    }

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

  const local = await readLocalCookieSession(cookieReader);
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
    // Expired access JWT + remote probe failed: still serve the cookie user so
    // parallel compile-time API storms return 200 instead of cascading 503s.
    if (lastError) {
      return ok(local.user, supabase, true);
    }
  }

  const cached = readCachedResolvedUser();
  if (
    cached?.id &&
    lastError &&
    (isTimeoutOrAbortError(lastError) ||
      isNetworkOrTransientError(lastError) ||
      isRefreshTokenAlreadyUsed(lastError))
  ) {
    return ok(cached, supabase, true);
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
  /** Prefer request.cookies when provided (avoids next/headers races). */
  cookieReader?: ResolveCookieReader | null;
}): Promise<ResolvedSupabaseAuth> {
  const maxAttempts = options?.maxAttempts ?? 2;
  const retryDelayMs = options?.retryDelayMs ?? 300;
  const forceRemote = options?.forceRemote === true;
  const cookieReader = options?.cookieReader ?? null;
  const supabase = await createServerSupabaseClient();

  const cookieSession = await readLocalCookieSession(cookieReader);

  // Fast path: any identifiable cookie user — never block API routes on Auth refresh.
  // Parallel getUser()/refresh under ticket list load was the main 503 storm source.
  // Soft-refresh in the background when the access JWT is expired/near-expiry.
  if (!forceRemote && cookieSession?.user?.id) {
    if (
      !isCookieAccessTokenUsable(cookieSession) &&
      !refreshInFlight &&
      !isAuthNetworkCoolingDown()
    ) {
      const softRefresh = resolveWithRemoteValidation(supabase, {
        maxAttempts: 1,
        retryDelayMs,
        cookieReader,
      });
      refreshInFlight = softRefresh.finally(() => {
        refreshInFlight = null;
      });
      // Background only — never surface AbortError/timeout to this request.
      void softRefresh.catch(() => undefined);
    }
    return ok(cookieSession.user, supabase, true);
  }

  if (!forceRemote && isAuthNetworkCoolingDown()) {
    const cached = readCachedResolvedUser();
    if (cached?.id) {
      return ok(cached, supabase, true);
    }
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
      if (shared.user?.id) {
        const latest = await readLocalCookieSession(cookieReader);
        if (latest?.user?.id) {
          return ok(latest.user, supabase, true);
        }
        return ok(shared.user, supabase, shared.usedSessionFallback);
      }
    } catch {
      /* fall through */
    }
  }

  const run = resolveWithRemoteValidation(supabase, {
    maxAttempts,
    retryDelayMs,
    cookieReader,
  });
  refreshInFlight = run.finally(() => {
    refreshInFlight = null;
  });
  return run;
}

/**
 * Safe auth user for API `requireAreaManagerApiAuth` getters.
 * Never throws — network failures fall back to cookie session.
 * Reads the raw Cookie header when next/headers `cookies()` is empty (compile races).
 */
export async function getAuthUserSafe(): Promise<{
  id: string;
  email?: string;
} | null> {
  let cookieReader: ResolveCookieReader | null = null;
  try {
    const store = await cookies();
    const hdrs = await headers();
    const header = hdrs.get("cookie") ?? "";
    const fromStore = store.getAll();
    const pairs =
      fromStore.some((c) => c.name.startsWith("sb-") && c.value)
        ? fromStore
        : parseCookieHeaderPairs(header);
    if (pairs.length > 0) {
      cookieReader = {
        get: (name: string) => pairs.find((c) => c.name === name),
        getAll: () => pairs,
      };
    }
  } catch {
    cookieReader = null;
  }

  const { user } = await resolveSupabaseUser({
    maxAttempts: 2,
    retryDelayMs: 200,
    cookieReader,
  });
  if (!user?.id) return null;
  const jwtEmail = user.email?.trim();
  if (jwtEmail?.includes("@")) {
    return { id: user.id, email: jwtEmail };
  }
  try {
    const { peekDashboardIdentity, DASHBOARD_IDENTITY_EMAIL_COOKIE } = await import(
      "@/lib/auth/auth-identity-cache"
    );
    const cached = peekDashboardIdentity(user.id)?.email?.trim();
    if (cached?.includes("@")) {
      return { id: user.id, email: cached };
    }
    const cookieEmail =
      cookieReader?.get(DASHBOARD_IDENTITY_EMAIL_COOKIE)?.value?.trim().toLowerCase() ?? "";
    if (cookieEmail.includes("@")) {
      return { id: user.id, email: cookieEmail };
    }
  } catch {
    /* identity cookie is optional */
  }
  return { id: user.id, email: jwtEmail || undefined };
}
