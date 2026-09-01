export const COREDASH_ACCESS_COOKIE = "coredash_access";
/**
 * Isolated from GatiMitra CONTROL (`sb-gm-dashboard-auth-token` in localStorage
 * and default `sb-<project-ref>-auth-token` SSR cookies). Same value is used as
 * both cookieOptions.name and GoTrue storageKey.
 */
export const COREDASH_AUTH_COOKIE_NAME = "sb-gm-coredash-auth-token";
export const COREDASH_AUTH_STORAGE_KEY = COREDASH_AUTH_COOKIE_NAME;
export const NOT_AUTHORIZED = "Not Authorized";

export const COREDASH_COOKIE_OPTIONS = {
  name: COREDASH_AUTH_COOKIE_NAME,
  path: "/",
  sameSite: "lax" as const,
};

export function isSuperAdminRole(role: string | null | undefined): boolean {
  const normalized = String(role || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  return normalized === "SUPER_ADMIN" || normalized === "SUPERADMIN";
}

export function accessCookieOptions(maxAge = 60 * 60 * 24 * 7) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}

export function isCoredashAuthCookie(name: string): boolean {
  return (
    name === COREDASH_AUTH_COOKIE_NAME ||
    name.startsWith(`${COREDASH_AUTH_COOKIE_NAME}.`) ||
    name.startsWith(`${COREDASH_AUTH_COOKIE_NAME}-`)
  );
}

export function isCoredashSessionCookie(name: string): boolean {
  return isCoredashAuthCookie(name) || name === COREDASH_ACCESS_COOKIE;
}
