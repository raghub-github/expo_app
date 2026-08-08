/**
 * Resolve the current Supabase user for Node (Server Components / Route Handlers).
 *
 * Strategy:
 * 1. Read cookie session first (local, no network).
 * 2. Usable access token → quick getUser() (3s cap); on Auth outage use cookie user.
 * 3. Expired/near-expiry token → single-flight getUser() with refresh + retries.
 * 4. Never signOut from this path.
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

export type ResolvedSupabaseAuth = {
  user: User | null;
  error: unknown;
  usedSessionFallback: boolean;
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
};

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

const VALIDATION_CACHE_MS = 45_000;
const ACCESS_TOKEN_SKEW_MS = 60_000;
const RACE_RETRY_MS = 400;
const QUICK_GET_USER_MS = 3_000;

type ValidationCacheEntry = {
  user: User;
  expiresAt: number;
};

let validatedUserCache: ValidationCacheEntry | null = null;
let validationInFlight: Promise<ResolvedSupabaseAuth> | null = null;

function looksLikeSupabaseAuthCookie(name: string): boolean {
  return (
    name.startsWith("sb-") &&
    (name.includes("auth-token") ||
      name === "sb-access-token" ||
      name === "sb-refresh-token")
  );
}

/** True when request carries Supabase auth cookie names (may still be stale). */
export async function hasSbAuthCookies(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    return cookieStore.getAll().some((c) => looksLikeSupabaseAuthCookie(c.name) && c.value.length > 0);
  } catch {
    return false;
  }
}

/** True when cookies contain a parseable Supabase session with a user. */
export async function hasReadableCookieSession(): Promise<boolean> {
  try {
    const supabase = await createServerSupabaseClient();
    const session = await readCookieSession(supabase);
    return Boolean(session?.user?.email);
  } catch {
    return false;
  }
}

function ok(user: User, supabase: ServerSupabase, usedSessionFallback: boolean): ResolvedSupabaseAuth {
  validatedUserCache = { user, expiresAt: Date.now() + VALIDATION_CACHE_MS };
  return { user, error: null, usedSessionFallback, supabase };
}

async function readCookieSession(supabase: ServerSupabase): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user?.email) return null;
    return data.session;
  } catch {
    return null;
  }
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

async function getUserWithTimeout(
  supabase: ServerSupabase,
  timeoutMs: number
): Promise<{ user: User | null; error: unknown }> {
  return Promise.race([
    getUserSafe(supabase),
    new Promise<{ user: null; error: { code: string; message: string } }>((resolve) =>
      setTimeout(
        () => resolve({ user: null, error: { code: "TIMEOUT", message: "getUser timeout" } }),
        timeoutMs
      )
    ),
  ]);
}

function isAccessTokenUsable(session: Session | null | undefined): boolean {
  if (!session?.user?.email) return false;
  const expiresAtSec = session.expires_at;
  if (expiresAtSec == null || !Number.isFinite(expiresAtSec)) return true;
  return expiresAtSec * 1000 > Date.now() + ACCESS_TOKEN_SKEW_MS;
}

async function resolveWithGetUser(
  supabase: ServerSupabase,
  cookieSession: Session | null,
  options: { maxAttempts: number; retryDelayMs: number }
): Promise<ResolvedSupabaseAuth> {
  const { maxAttempts, retryDelayMs } = options;
  let lastError: unknown = null;

  // Fast path: cookie JWT still valid — one quick getUser(), fall back to cookie on outage.
  if (cookieSession && isAccessTokenUsable(cookieSession)) {
    const quick = await getUserWithTimeout(supabase, QUICK_GET_USER_MS);
    if (!quick.error && quick.user?.email) {
      return ok(quick.user, supabase, false);
    }
    lastError = quick.error;
    if (
      lastError &&
      (isTimeoutOrAbortError(lastError) ||
        isNetworkOrTransientError(lastError) ||
        isRefreshTokenAlreadyUsed(lastError))
    ) {
      return ok(cookieSession.user, supabase, true);
    }
    if (lastError && isInvalidRefreshToken(lastError) && !isRefreshTokenAlreadyUsed(lastError)) {
      // Token in cookie rejected — try full refresh path below.
    } else if (cookieSession.user?.email) {
      return ok(cookieSession.user, supabase, true);
    }
  }

  // Slow path: missing/expired access token — validate/refresh via Auth API.
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await getUserSafe(supabase);
    lastError = result.error;

    if (!lastError && result.user?.email) {
      return ok(result.user, supabase, false);
    }

    if (lastError && isRefreshTokenAlreadyUsed(lastError)) {
      await new Promise((r) => setTimeout(r, RACE_RETRY_MS));
      const latest = await readCookieSession(supabase);
      if (latest?.user?.email && isAccessTokenUsable(latest)) {
        return ok(latest.user, supabase, true);
      }
      if (attempt < maxAttempts) continue;
    }

    if (lastError && isInvalidRefreshToken(lastError)) break;

    if (
      lastError &&
      (isTimeoutOrAbortError(lastError) || isNetworkOrTransientError(lastError)) &&
      attempt < maxAttempts
    ) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
      continue;
    }

    if (lastError && (isTimeoutOrAbortError(lastError) || isNetworkOrTransientError(lastError))) {
      break;
    }

    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }

  const latestSession = cookieSession ?? (await readCookieSession(supabase));
  if (latestSession?.user?.email) {
    if (
      lastError &&
      (isTimeoutOrAbortError(lastError) ||
        isNetworkOrTransientError(lastError) ||
        isRefreshTokenAlreadyUsed(lastError) ||
        isRefreshTokenNotFound(lastError))
    ) {
      return ok(latestSession.user, supabase, true);
    }
    if (isAccessTokenUsable(latestSession)) {
      return ok(latestSession.user, supabase, true);
    }
  }

  return { user: null, error: lastError, usedSessionFallback: false, supabase };
}

export async function resolveSupabaseUser(options?: {
  maxAttempts?: number;
  retryDelayMs?: number;
  forceRemote?: boolean;
}): Promise<ResolvedSupabaseAuth> {
  const maxAttempts = options?.maxAttempts ?? 2;
  const retryDelayMs = options?.retryDelayMs ?? 300;
  const forceRemote = options?.forceRemote === true;
  const supabase = await createServerSupabaseClient();

  if (!forceRemote && validatedUserCache && Date.now() < validatedUserCache.expiresAt) {
    return {
      user: validatedUserCache.user,
      error: null,
      usedSessionFallback: false,
      supabase,
    };
  }

  const cookieSession = await readCookieSession(supabase);
  if (!cookieSession?.user?.email) {
    return { user: null, error: null, usedSessionFallback: false, supabase };
  }

  if (validationInFlight) {
    try {
      const shared = await validationInFlight;
      if (shared.user?.email) {
        return {
          user: shared.user,
          error: null,
          usedSessionFallback: shared.usedSessionFallback,
          supabase,
        };
      }
    } catch {
      // fall through
    }
  }

  const run = resolveWithGetUser(supabase, cookieSession, { maxAttempts, retryDelayMs });
  validationInFlight = run.finally(() => {
    validationInFlight = null;
  });
  return run;
}

export async function getAuthUserSafe(): Promise<{ id: string; email?: string } | null> {
  const { user } = await resolveSupabaseUser({ maxAttempts: 2, retryDelayMs: 200 });
  if (!user?.id) return null;
  return { id: user.id, email: user.email ?? undefined };
}
