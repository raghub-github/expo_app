/**
 * Cookie-first partner identity. Do not call Auth getUser() when the JWT cookie
 * already identifies the user — parallel getUser()/refresh races were logging
 * merchants out during Next compile (401 → /auth).
 *
 * Also: never call getUser() merely because cookie JSON failed to parse while
 * sb-* session cookies are present. getUser()/setAll can clear those cookies and
 * turn a transient miss into a hard logout (pending-count / notifications 401).
 */
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  hasSupabaseAuthCookies,
  isSupabaseSessionCookieName,
  parseCookieHeaderPairs,
  readCookieAccessSession,
  type CookieReader,
} from "@/lib/auth/read-cookie-access-session";
import {
  isFatalRefreshTokenError,
  isNetworkOrTransientError,
  isRefreshTokenAlreadyUsed,
} from "@/lib/auth/session-errors";

export type PartnerAuthUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
};

export type ResolvePartnerUserResult = {
  user: PartnerAuthUser | null;
  error: unknown;
  fromCookie: boolean;
};

function fromUserLike(u: {
  id?: string | null;
  email?: string | null;
  phone?: string | null;
} | null | undefined): PartnerAuthUser | null {
  const id = String(u?.id || "").trim();
  if (!id) return null;
  return {
    id,
    email: u?.email ?? null,
    phone: u?.phone ?? null,
  };
}

async function readCookieUser(reader?: CookieReader | null): Promise<PartnerAuthUser | null> {
  if (reader) {
    const fromRequest = fromUserLike(readCookieAccessSession(reader)?.user);
    if (fromRequest) return fromRequest;
  }
  try {
    const store = await cookies();
    return fromUserLike(
      readCookieAccessSession({
        get: (name) => store.get(name),
        getAll: () => store.getAll(),
      })?.user
    );
  } catch {
    return null;
  }
}

function cookieReaderFromHeader(header: string): CookieReader | null {
  const pairs = parseCookieHeaderPairs(header);
  if (!pairs.some((c) => isSupabaseSessionCookieName(c.name) && c.value)) return null;
  return {
    get: (name: string) => pairs.find((c) => c.name === name),
    getAll: () => pairs,
  };
}

export function requestHasPartnerAuthCookies(req?: {
  cookies?: CookieReader;
  headers?: { get: (name: string) => string | null };
}): boolean {
  try {
    if (req?.cookies && hasSupabaseAuthCookies(req.cookies)) return true;
  } catch {
    /* ignore */
  }
  const header = req?.headers?.get?.("cookie") ?? "";
  return parseCookieHeaderPairs(header).some(
    (c) => isSupabaseSessionCookieName(c.name) && Boolean(c.value)
  );
}

function readerHasSessionCookies(reader: CookieReader | null | undefined): boolean {
  if (!reader) return false;
  try {
    return hasSupabaseAuthCookies(reader);
  } catch {
    return false;
  }
}

export async function resolvePartnerUser(options?: {
  cookieReader?: CookieReader | null;
  cookieHeader?: string | null;
}): Promise<ResolvePartnerUserResult> {
  let reader = options?.cookieReader ?? null;
  if (!reader || !hasSupabaseAuthCookies(reader)) {
    const fromHeader = cookieReaderFromHeader(options?.cookieHeader ?? "");
    if (fromHeader) reader = fromHeader;
  }

  const cookieUser = await readCookieUser(reader);
  if (cookieUser?.id) {
    return { user: cookieUser, error: null, fromCookie: true };
  }

  // Session cookies present but unreadable (chunk race / compile) — do NOT call
  // getUser(). That path refreshes/clears cookies and logs the merchant out.
  if (readerHasSessionCookies(reader)) {
    return { user: null, error: null, fromCookie: false };
  }
  try {
    const store = await cookies();
    if (
      hasSupabaseAuthCookies({
        get: (name) => store.get(name),
        getAll: () => store.getAll(),
      })
    ) {
      return { user: null, error: null, fromCookie: false };
    }
  } catch {
    /* ignore — fall through to getUser only when we truly have no cookies */
  }

  try {
    const supabase = await createServerSupabaseClient();
    const result = await supabase.auth.getUser();
    const remote = fromUserLike(result.data?.user);
    if (remote?.id) {
      return { user: remote, error: null, fromCookie: false };
    }
    return { user: null, error: result.error ?? null, fromCookie: false };
  } catch (err) {
    if (isRefreshTokenAlreadyUsed(err) || isNetworkOrTransientError(err)) {
      const retryCookie = await readCookieUser(reader);
      if (retryCookie?.id) {
        return { user: retryCookie, error: null, fromCookie: true };
      }
    }
    return { user: null, error: err, fromCookie: false };
  }
}

export function partnerUserErrorStatus(error: unknown): {
  status: 401 | 503;
  code: string;
  error: string;
} | null {
  if (!error) return null;
  if (isRefreshTokenAlreadyUsed(error) || isNetworkOrTransientError(error)) {
    return {
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      error: "Service temporarily unavailable",
    };
  }
  if (isFatalRefreshTokenError(error)) {
    return { status: 401, code: "SESSION_INVALID", error: "Session invalid" };
  }
  return null;
}

/** Cookies present but user unresolved (compile / cookie-jar miss) must not 401 — clients treat 401 as logout. */
export function partnerMissingUserStatus(
  hasAuthCookies: boolean,
  error: unknown
): { status: 401 | 503; code: string; error: string } {
  const mapped = partnerUserErrorStatus(error);
  if (mapped) return mapped;
  if (hasAuthCookies) {
    return {
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      error: "Service temporarily unavailable",
    };
  }
  return { status: 401, code: "SESSION_REQUIRED", error: "Not authenticated" };
}
