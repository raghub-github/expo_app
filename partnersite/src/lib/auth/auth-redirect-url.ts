import { getPartnerSiteBaseUrl } from "@/lib/legal/partner-site-url";

const PRODUCTION_PARTNER_HOST = "partner.gatimitra.com";

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
    if (hostname === PRODUCTION_PARTNER_HOST || hostname.endsWith(".gatimitra.com")) {
      return sanitizeAuthOrigin(origin);
    }
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return sanitizeAuthOrigin(origin);
    }
    const envOrigin = originFromEnv();
    if (envOrigin) return envOrigin;
    return sanitizeAuthOrigin(origin);
  }

  const envOrigin = originFromEnv();
  if (envOrigin) return envOrigin;
  return getPartnerSiteBaseUrl();
}

/** OAuth callback path — server-side code exchange (reliable PKCE + cookies). */
export function getPartnerOAuthCallbackUrl(): string {
  return `${getPartnerAuthRedirectBaseUrl()}/api/auth/callback`;
}

/**
 * Resolve redirect origin on the server (API routes behind reverse proxies).
 * Prefer x-forwarded-host, then env, then request URL.
 */
export function getPartnerAuthRedirectOriginFromRequest(requestUrl: string, headers: Headers): string {
  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (forwardedHost) {
    return sanitizeAuthOrigin(`${forwardedProto}://${forwardedHost}`);
  }

  const envOrigin = originFromEnv();
  if (envOrigin && process.env.NODE_ENV === "production") {
    return envOrigin;
  }

  return sanitizeAuthOrigin(new URL(requestUrl).origin);
}
