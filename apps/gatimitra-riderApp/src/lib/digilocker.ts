/** DigiLocker deep-link + return-URL helpers for rider Aadhaar verification. */

import { getRiderAppConfig } from "@/src/config/env";

/** Must match backend `RIDER_DIGILOCKER_DEEP_LINK` / app scheme `gatimitra-rider`. */
export const RIDER_DIGILOCKER_DEEP_LINK = "gatimitra-rider://digilocker-return";

/**
 * HTTPS return URL Cashfree redirects to after DigiLocker consent.
 * Prefer API base when it is already https (dev tunnels / production).
 */
export function riderDigilockerHttpsReturn(): string {
  const base = String(getRiderAppConfig().apiBaseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  if (base.startsWith("https://")) {
    return `${base}/v1/onboarding/digilocker-return`;
  }
  return "https://api.gatimitra.com/v1/onboarding/digilocker-return";
}

/** True when Cashfree / return page navigates back into the Rider DigiLocker flow. */
export function isDigilockerReturnUrl(url: string): boolean {
  const raw = String(url || "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();

  if (lower.startsWith(RIDER_DIGILOCKER_DEEP_LINK.toLowerCase())) return true;
  if (lower.startsWith("gatimitra-rider://")) {
    return lower.includes("digilocker");
  }

  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, "");
    if (path.endsWith("/v1/onboarding/digilocker-return")) return true;
    if (path.endsWith("/auth/digilocker-return") && u.searchParams.get("app") === "rider") {
      return true;
    }
    if (path.endsWith("/auth/rider-digilocker-return")) return true;
  } catch {
    if (lower.includes("/v1/onboarding/digilocker-return")) return true;
  }

  return false;
}
