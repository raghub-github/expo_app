import { getPartnerSiteBaseUrl } from "@/lib/legal/partner-site-url";
import { normalizeAuthRedirect } from "@/lib/auth/normalize-auth-redirect";

const PRODUCTION_PARTNER_HOST = "partner.gatimitra.com";
const PRODUCTION_PARTNER_ORIGIN = "https://partner.gatimitra.com";
const APEX_GATIMITRA_HOSTS = new Set(["gatimitra.com", "www.gatimitra.com"]);

function isLocalDevHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "[::]"
  );
}

function mapToPartnerOrigin(hostname: string, origin: string): string {
  if (hostname === PRODUCTION_PARTNER_HOST || hostname.endsWith(".gatimitra.com")) {
    return sanitizeAuthOrigin(origin);
  }
  if (APEX_GATIMITRA_HOSTS.has(hostname)) {
    return PRODUCTION_PARTNER_ORIGIN;
  }
  if (isLocalDevHost(hostname)) {
    return sanitizeAuthOrigin(origin);
  }
  return sanitizeAuthOrigin(origin);
}

function sanitizeAuthOrigin(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname === "0.0.0.0" || u.hostname === "::") {
      u.hostname = "localhost";
    }
    return u.origin;
  } catch {
    return getPartnerSiteBaseUrl();
  }
}

function originFromEnv(): string | null {
  const fromEnv = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_PARTNER_SITE_URL ||
    ""
  ).trim();
  return fromEnv ? sanitizeAuthOrigin(fromEnv) : null;
}

/**
 * Base URL for Supabase OAuth redirectTo.
 * Prefer the live browser origin on the partner domain; fall back to env / canonical prod URL
 * so production builds never emit localhost when Supabase Site URL is misconfigured.
 */
export function getPartnerAuthRedirectBaseUrl(): string {
  if (typeof window !== "undefined") {
    const { origin, hostname } = window.location;
    return mapToPartnerOrigin(hostname, origin);
  }

  const envOrigin = originFromEnv();
  if (envOrigin) {
    try {
      const host = new URL(envOrigin).hostname;
      if (isLocalDevHost(host)) return envOrigin;
    } catch {
      /* fall through */
    }
  }

  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_PARTNER_ORIGIN;
  }

  if (envOrigin) return envOrigin;
  return getPartnerSiteBaseUrl();
}

/**
 * OAuth `redirectTo` for Supabase. MUST point at the `/auth/callback` PAGE, not the
 * `/api/auth/callback` route: the page (app/auth/callback/page.tsx) forwards the `code`
 * to the API route for the server-side PKCE exchange.
 *
 * Why the page and not the API route directly: Supabase only redirects to URLs in the
 * project's Redirect-URLs allowlist. The allowlist (shared with the dashboard) lists
 * `https://partner.gatimitra.com/auth/callback` + `/auth/**`, matching the dashboard's
 * `/auth/callback` convention — it does NOT list `/api/auth/callback`. Returning
 * `/api/auth/callback` here made Supabase reject the redirect and fall back to the project
 * Site URL (gatimitra.com), sending partners to the wrong domain after Google sign-in.
 */
export function getPartnerOAuthCallbackUrl(): string {
  return `${getPartnerAuthRedirectBaseUrl()}/auth/callback`;
}

export const DEFAULT_POST_AUTH_PATH = "/partners/all-stores";

/**
 * Reduce an untrusted post-login target to a path guaranteed to stay on `origin`.
 *
 * The obvious guard — reject if it `startsWith("http")`, otherwise require it to
 * `startsWith("/")` — does not hold. A protocol-relative target such as
 * `//evil.com` (also `////evil.com`, `/\/evil.com`) passes both tests, yet both
 * `new URL("//evil.com", origin)` and `window.location.replace("//evil.com")`
 * navigate to `https://evil.com`. Because these redirects happen immediately
 * after the session cookies are issued, that hands a freshly authenticated user
 * to an attacker page — ideal for a "session expired, sign in again" phish, with
 * our own domain in the referrer.
 *
 * Resolving against the origin and comparing the result is the only check that
 * holds, because it asks the URL parser exactly what the browser will do.
 */
export function safeSameOriginPath(
  raw: string | null | undefined,
  origin: string,
  fallback: string = DEFAULT_POST_AUTH_PATH
): string {
  if (!raw) return fallback;
  let resolved: URL;
  try {
    resolved = new URL(raw, origin);
  } catch {
    return fallback;
  }
  if (resolved.origin !== origin) return fallback;
  return normalizeAuthRedirect(`${resolved.pathname}${resolved.search}${resolved.hash}`);
}

/**
 * Resolve redirect origin on the server (API routes behind reverse proxies).
 * Prefer x-forwarded-host, then env, then request URL.
 */
export function getPartnerAuthRedirectOriginFromRequest(requestUrl: string, headers: Headers): string {
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (forwardedHost) {
    if (APEX_GATIMITRA_HOSTS.has(forwardedHost) || forwardedHost === PRODUCTION_PARTNER_HOST) {
      return PRODUCTION_PARTNER_ORIGIN;
    }
    return sanitizeAuthOrigin(`${forwardedProto}://${forwardedHost}`);
  }

  try {
    const { hostname, origin } = new URL(requestUrl);
    if (process.env.NODE_ENV === "production" && !isLocalDevHost(hostname)) {
      if (APEX_GATIMITRA_HOSTS.has(hostname) || hostname === PRODUCTION_PARTNER_HOST) {
        return PRODUCTION_PARTNER_ORIGIN;
      }
    }
    return mapToPartnerOrigin(hostname, origin);
  } catch {
    /* fall through */
  }

  const envOrigin = originFromEnv();
  if (envOrigin && process.env.NODE_ENV === "production") {
    try {
      const host = new URL(envOrigin).hostname;
      if (!isLocalDevHost(host)) return PRODUCTION_PARTNER_ORIGIN;
    } catch {
      return PRODUCTION_PARTNER_ORIGIN;
    }
  }

  return getPartnerSiteBaseUrl();
}
