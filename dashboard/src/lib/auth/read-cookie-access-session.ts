/**
 * Read Supabase access token + user claims from request cookies WITHOUT calling
 * supabase.auth.getSession() (which logs the insecure-session warning and can refresh).
 *
 * Cookie shapes supported:
 * - sb-access-token (legacy plain JWT)
 * - sb-<ref>-auth-token / chunked .0/.1 (JSON session payload)
 */
import type { User } from "@supabase/supabase-js";

const ACCESS_TOKEN_SKEW_MS = 60_000;

export type CookieAccessSession = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  user: User;
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function userFromJwtClaims(claims: Record<string, unknown>, accessToken: string): User | null {
  const sub = typeof claims.sub === "string" ? claims.sub : null;
  if (!sub) return null;
  const email = typeof claims.email === "string" ? claims.email : undefined;
  const exp = typeof claims.exp === "number" ? claims.exp : undefined;
  const userMeta =
    claims.user_metadata && typeof claims.user_metadata === "object"
      ? (claims.user_metadata as Record<string, unknown>)
      : {};
  const appMeta =
    claims.app_metadata && typeof claims.app_metadata === "object"
      ? (claims.app_metadata as Record<string, unknown>)
      : {};

  return {
    id: sub,
    email,
    aud: typeof claims.aud === "string" ? claims.aud : "authenticated",
    role: typeof claims.role === "string" ? claims.role : "authenticated",
    app_metadata: appMeta,
    user_metadata: userMeta,
    created_at: "",
    updated_at: undefined,
    // Keep exp available for usability checks via a synthetic field path if needed
    factors: undefined,
  } as User;
}

function parseSessionJson(raw: string): {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  user?: User;
} | null {
  try {
    let text = raw;
    // URL-encoded JSON cookies
    if (text.startsWith("%")) {
      try {
        text = decodeURIComponent(text);
      } catch {
        /* keep */
      }
    }
    // base64-encoded JSON (some SSR cookie layouts)
    if (!text.startsWith("{") && !text.startsWith("[")) {
      try {
        const decoded = Buffer.from(text, "base64").toString("utf8");
        if (decoded.startsWith("{") || decoded.startsWith("[")) text = decoded;
      } catch {
        /* keep */
      }
    }
    const parsed = JSON.parse(text) as
      | { access_token?: string; refresh_token?: string; expires_at?: number; user?: User }
      | Array<{ access_token?: string; refresh_token?: string; expires_at?: number; user?: User }>;
    return Array.isArray(parsed) ? parsed[0] ?? null : parsed;
  } catch {
    return null;
  }
}

function collectAuthCookieValue(
  getCookie: (name: string) => string | undefined,
  allNames: string[]
): string | null {
  // Prefer chunked base cookie assembly: name, name.0, name.1, ...
  const baseNames = new Set<string>();
  for (const name of allNames) {
    if (!name.startsWith("sb-")) continue;
    if (name.includes("auth-token")) {
      baseNames.add(name.replace(/\.\d+$/, ""));
    }
  }

  for (const base of baseNames) {
    const direct = getCookie(base);
    if (direct && direct.length > 20) return direct;
    const chunks: string[] = [];
    for (let i = 0; i < 10; i++) {
      const part = getCookie(`${base}.${i}`);
      if (!part) break;
      chunks.push(part);
    }
    if (chunks.length > 0) return chunks.join("");
  }

  const legacy = getCookie("sb-access-token");
  return legacy && legacy.length > 20 ? legacy : null;
}

export function isCookieAccessTokenUsable(session: CookieAccessSession | null | undefined): boolean {
  if (!session?.accessToken || !session.user?.id) return false;
  if (session.expiresAt == null || !Number.isFinite(session.expiresAt)) {
    const claims = decodeJwtPayload(session.accessToken);
    const exp = typeof claims?.exp === "number" ? claims.exp : null;
    if (exp == null) return true;
    return exp * 1000 > Date.now() + ACCESS_TOKEN_SKEW_MS;
  }
  return session.expiresAt * 1000 > Date.now() + ACCESS_TOKEN_SKEW_MS;
}

/**
 * Local cookie session read — no Auth network, no getSession() warning.
 */
export function readCookieAccessSession(cookieStore: {
  get: (name: string) => { value: string } | undefined;
  getAll?: () => Array<{ name: string; value: string }>;
}): CookieAccessSession | null {
  const getCookie = (name: string) => cookieStore.get(name)?.value;
  const allNames =
    typeof cookieStore.getAll === "function"
      ? cookieStore.getAll().map((c) => c.name)
      : [];

  const raw = collectAuthCookieValue(getCookie, allNames);
  if (!raw) return null;

  // Plain JWT
  if (raw.split(".").length === 3 && !raw.includes("{")) {
    const claims = decodeJwtPayload(raw);
    if (!claims) return null;
    const user = userFromJwtClaims(claims, raw);
    if (!user) return null;
    return {
      accessToken: raw,
      expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
      user,
    };
  }

  const payload = parseSessionJson(raw);
  if (!payload?.access_token) return null;

  const user =
    payload.user && typeof payload.user === "object" && payload.user.id
      ? payload.user
      : (() => {
          const claims = decodeJwtPayload(payload.access_token!);
          return claims ? userFromJwtClaims(claims, payload.access_token!) : null;
        })();
  if (!user) return null;

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: payload.expires_at,
    user,
  };
}
