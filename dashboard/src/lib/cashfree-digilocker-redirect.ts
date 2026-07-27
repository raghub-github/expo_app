/**
 * Cashfree DigiLocker rejects redirect_url unless it starts with https://.
 * Local dashboard often runs on http://localhost — rewrite / fall back so
 * create-DigiLocker never fails validation. Status is polled from the origin tab.
 */
export function resolveCashfreeDigilockerRedirectUrl(
  requested?: string | null,
): string {
  const envBase = [
    process.env.CASHFREE_DIGILOCKER_REDIRECT_URL,
    process.env.VERIFICATION_PUBLIC_REDIRECT_URL,
    process.env.DASHBOARD_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]
    .map((v) => String(v || "").trim())
    .find(Boolean);

  const candidates = [String(requested || "").trim(), envBase || ""].filter(Boolean);

  for (const raw of candidates) {
    try {
      const u = new URL(raw);
      if (u.protocol === "http:") u.protocol = "https:";
      if (u.protocol === "https:") return u.toString();
    } catch {
      /* try next */
    }
  }

  return "https://control.gatimitra.com/dashboard/digilocker-return";
}
