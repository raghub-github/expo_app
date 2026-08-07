/**
 * Server-only: validate Supabase JWT pair off-cookie, then persist httpOnly sb-* cookies.
 *
 * @supabase/ssr applies cookie writes asynchronously in onAuthStateChange — callers
 * must use this helper instead of raw setSession so cookies land before the response.
 */
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { fetchWithTimeout } from "@/lib/supabase/fetch-timeout";
import {
  isAuthSessionMissingError,
  isInvalidRefreshToken,
  isRefreshTokenAlreadyUsed,
  isTransientAuthError,
} from "@/lib/auth/session-errors";

export type CookieWriter = {
  getAll: () => { name: string; value: string }[];
  set: (name: string, value: string, options: Record<string, unknown>) => void;
};

export type ValidatePersistResult =
  | { ok: true; session: Session }
  | { ok: false; status: 401 | 503 | 499 | 400; code: string; error: string };

function normalizeCookieOptions(options: Record<string, unknown> | undefined) {
  const isProd = process.env.NODE_ENV === "production";
  return {
    ...options,
    secure: isProd ? options?.secure : false,
    path: (options?.path as string) ?? "/",
    sameSite:
      options?.sameSite === "lax" ||
      options?.sameSite === "strict" ||
      options?.sameSite === "none"
        ? options.sameSite
        : undefined,
  };
}

function hasSbCookies(jar: { name: string; value: string }[]): boolean {
  return jar.some((c) => c.name.startsWith("sb-") && c.value.length > 0);
}

async function validateTokensStateless(
  accessToken: string,
  refreshToken: string,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<{ session: Session | null; error: unknown }> {
  const stateless = createClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: fetchWithTimeout },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let session: Session | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await stateless.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      session = result.data.session ?? null;
      lastError = result.error ?? null;
    } catch (err) {
      lastError = err;
      session = null;
    }

    if (!lastError && session) return { session, error: null };
    if (lastError && isRefreshTokenAlreadyUsed(lastError) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }
    break;
  }

  if (!session) {
    try {
      const jwtCheck = await stateless.auth.getUser(accessToken);
      if (jwtCheck.data?.user && !jwtCheck.error) {
        return {
          session: {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: "bearer",
            user: jwtCheck.data.user,
          },
          error: null,
        };
      }
    } catch {
      // fall through
    }
  }

  return { session, error: lastError };
}

async function waitForCookieFlush(
  supabase: SupabaseClient,
  cookieJar: { name: string; value: string }[],
  timeoutMs = 4000
): Promise<boolean> {
  if (hasSbCookies(cookieJar)) return true;

  return new Promise((resolve) => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (
        hasSbCookies(cookieJar) &&
        (event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "USER_UPDATED" ||
          event === "INITIAL_SESSION")
      ) {
        clearTimeout(timer);
        subscription.unsubscribe();
        resolve(true);
      }
    });

    const timer = setTimeout(() => {
      subscription.unsubscribe();
      resolve(hasSbCookies(cookieJar));
    }, timeoutMs);

    queueMicrotask(() => {
      if (hasSbCookies(cookieJar)) {
        clearTimeout(timer);
        subscription.unsubscribe();
        resolve(true);
      }
    });
  });
}

export async function validateAndPersistSupabaseSession(params: {
  accessToken: string;
  refreshToken: string;
  cookies: CookieWriter;
  signal?: AbortSignal;
}): Promise<ValidatePersistResult> {
  if (params.signal?.aborted) {
    return { ok: false, status: 499, code: "REQUEST_ABORTED", error: "Request aborted" };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      ok: false,
      status: 400,
      code: "MISSING_SUPABASE_ENV",
      error: "Missing Supabase environment variables",
    };
  }

  const { session: validatedSession, error: validateError } = await validateTokensStateless(
    params.accessToken,
    params.refreshToken,
    supabaseUrl,
    supabaseAnonKey
  );

  if (validateError || !validatedSession) {
    if (validateError && isInvalidRefreshToken(validateError)) {
      return { ok: false, status: 401, code: "SESSION_INVALID", error: "Session invalid" };
    }
    if (validateError && isTransientAuthError(validateError)) {
      return {
        ok: false,
        status: 503,
        code: "SERVICE_UNAVAILABLE",
        error: "Service temporarily unavailable",
      };
    }
    const message =
      validateError instanceof Error ? validateError.message : "Failed to validate session";
    return { ok: false, status: 400, code: "SET_SESSION_FAILED", error: message };
  }

  const cookieJar: { name: string; value: string }[] = [...params.cookies.getAll()];

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: fetchWithTimeout },
    cookies: {
      getAll() {
        return cookieJar;
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          if (name.startsWith("sb-") && (!value || value.length === 0)) continue;
          const normalized = normalizeCookieOptions(options as Record<string, unknown>);
          params.cookies.set(name, value, normalized);
          const idx = cookieJar.findIndex((c) => c.name === name);
          if (value) {
            if (idx >= 0) cookieJar[idx] = { name, value };
            else cookieJar.push({ name, value });
          } else if (idx >= 0) {
            cookieJar.splice(idx, 1);
          }
        }
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  let persistError: unknown = null;
  let persistedSession: Session | null = null;

  try {
    const result = await supabase.auth.setSession({
      access_token: validatedSession.access_token,
      refresh_token: validatedSession.refresh_token,
    });
    persistedSession = result.data.session ?? validatedSession;
    persistError = result.error ?? null;
  } catch (err) {
    persistError = err;
  }

  // SSR writes cookies in onAuthStateChange — wait for flush even when setSession returns an error.
  const cookiesWritten = await waitForCookieFlush(supabase, cookieJar);

  if (cookiesWritten) {
    return { ok: true, session: persistedSession ?? validatedSession };
  }

  if (persistError && isInvalidRefreshToken(persistError)) {
    return { ok: false, status: 401, code: "SESSION_INVALID", error: "Session invalid" };
  }
  if (persistError && isTransientAuthError(persistError)) {
    return {
      ok: false,
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      error: "Service temporarily unavailable",
    };
  }

  // AuthSessionMissingError on SSR setSession is common when no sb-* cookies exist yet;
  // if stateless validation succeeded but cookies still missing, treat as transient.
  if (persistError && isAuthSessionMissingError(persistError)) {
    return {
      ok: false,
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      error: "Service temporarily unavailable",
    };
  }

  const message =
    persistError instanceof Error ? persistError.message : "Failed to persist session";
  return { ok: false, status: 400, code: "SET_SESSION_FAILED", error: message };
}
