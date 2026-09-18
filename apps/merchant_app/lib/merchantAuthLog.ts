/**
 * Safe auth diagnostics — never logs OTP, tokens, or credentials.
 */
type AuthEvent =
  | "AUTH_BOOT_START"
  | "AUTH_SESSION_FOUND"
  | "AUTH_SESSION_VALID"
  | "AUTH_SESSION_INVALID"
  | "AUTH_LOGIN_START"
  | "AUTH_OTP_VERIFIED"
  | "AUTH_SESSION_PERSISTED"
  | "AUTH_MERCHANT_RESOLVED"
  | "AUTH_LOGIN_SUCCESS"
  | "AUTH_LOGIN_REJECTED_NO_MERCHANT"
  | "AUTH_LOGOUT_START"
  | "AUTH_LOGOUT_COMPLETE"
  | "AUTH_SESSION_EXPIRED"
  | "AUTH_401"
  | "AUTH_REFRESH_FAILED"
  | "AUTH_BOOT_IGNORED_STALE"
  | "AUTH_VALIDATE_IGNORED_STALE";

export function authTokenFingerprint(token: string | null | undefined): string | null {
  const t = typeof token === "string" ? token.trim() : "";
  if (!t) return null;
  if (t.length <= 12) return `len:${t.length}`;
  return `${t.slice(0, 6)}…${t.slice(-4)}#${t.length}`;
}

export function logMerchantAuth(
  event: AuthEvent,
  meta?: Record<string, string | number | boolean | null | undefined>
): void {
  try {
    // Always emit structured auth events in production — no secrets in payload.
    console.info(`[merchant-auth] ${event}`, meta ?? {});
  } catch {
    /* ignore */
  }
}
