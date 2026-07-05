/**
 * Canonical partner portal base URL for metadata, sitemaps, and deep links.
 * Local dev: http://localhost:3002 (partnersite default port).
 * Production: https://partner.gatimitra.com
 */
const PRODUCTION_PARTNER_SITE = "https://partner.gatimitra.com";
const LOCAL_PARTNER_SITE = "http://localhost:3002";

export function getPartnerSiteBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_PARTNER_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  if (process.env.NODE_ENV === "production") {
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL.replace(/\/+$/, "")}`;
    }
    return PRODUCTION_PARTNER_SITE;
  }

  return LOCAL_PARTNER_SITE;
}

export const PARTNER_LEGAL_URLS = {
  terms: "/terms",
  privacyPolicy: "/privacy-policy",
  codeOfConduct: "/coc",
} as const;

export function partnerLegalAbsoluteUrl(
  path: (typeof PARTNER_LEGAL_URLS)[keyof typeof PARTNER_LEGAL_URLS],
): string {
  return `${getPartnerSiteBaseUrl()}${path}`;
}
