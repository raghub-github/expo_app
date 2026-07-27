/**
 * Cashfree DigiLocker rejects redirect_url unless it starts with https://.
 * Local partnersite often runs on http://localhost — rewrite / fall back so
 * create-DigiLocker never fails validation. Post-consent status is polled via
 * webhook + /api/onboarding/verify-document/status, so the redirect host only
 * needs to be a valid https URL Cashfree will accept.
 */
export function resolveCashfreeDigilockerRedirectUrl(
  requested?: string | null,
): string {
  const envBase = [
    process.env.CASHFREE_DIGILOCKER_REDIRECT_URL,
    process.env.VERIFICATION_PUBLIC_REDIRECT_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXTAUTH_URL,
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

  // Last-resort valid https URL (polling still drives UX on the origin tab).
  // Client should pass ?return=<origin page> so users land back on docs.
  return "https://partner.gatimitra.com/auth/digilocker-return";
}
