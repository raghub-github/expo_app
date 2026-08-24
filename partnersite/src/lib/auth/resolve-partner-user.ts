/**
 * Cookie-first partner identity. Do not call Auth getUser() when the JWT cookie
 * already identifies the user — parallel getUser()/refresh races were logging
 * merchants out during Next compile (401 → /auth).
 */
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  hasSupabaseAuthCookies,
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
  if (!pairs.some((c) => c.name.startsWith("sb-") && c.value)) return null;
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
  return /(?:^|;\s*)sb-/.test(header);
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
