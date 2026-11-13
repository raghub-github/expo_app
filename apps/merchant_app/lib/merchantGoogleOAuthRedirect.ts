import { getConfig } from "@/config/env";

/** Production partnersite OAuth bridge — must be in Supabase Redirect URLs. */
export const MERCHANT_GOOGLE_OAUTH_CALLBACK_PATH = "/auth/merchant-app-callback";
export const MERCHANT_GOOGLE_OAUTH_CALLBACK_PROD =
  `https://partner.gatimitra.com${MERCHANT_GOOGLE_OAUTH_CALLBACK_PATH}`;

/**
 * Stable HTTPS redirect for Google → Supabase → merchant app.
 * Avoids Expo Go `exp://LAN:port/...` URLs (change with Wi‑Fi IP → Supabase
 * falls back to Site URL gatimitra.com → "Sign-in was cancelled").
 */
export function getMerchantGoogleOAuthRedirectTo(): string {
  const override = String(process.env.EXPO_PUBLIC_GOOGLE_OAUTH_REDIRECT_URL || "").trim();
  if (override) return override.replace(/\/+$/, "");

  // Always prefer the production partnersite callback so Supabase allowlist stays fixed.
  // Local partnersite is only used when explicitly pointed via EXPO_PUBLIC_PARTNER_SITE_URL
  // that is already a non-localhost public/LAN host.
  try {
    const partnerBase = getConfig().partnerSiteBaseUrl.replace(/\/+$/, "");
    const host = new URL(partnerBase).hostname;
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      return `${partnerBase}${MERCHANT_GOOGLE_OAUTH_CALLBACK_PATH}`;
    }
  } catch {
    /* fall through */
  }
  return MERCHANT_GOOGLE_OAUTH_CALLBACK_PROD;
}
