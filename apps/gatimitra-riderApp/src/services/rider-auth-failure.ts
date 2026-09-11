/**
 * Pure classifiers for rider auth failures (unit-tested).
 *
 * The rider was being logged out on every app open because a single transient or racy 401 during
 * the noisy cold-start request storm was treated as a definitive revocation and wiped the session.
 * These helpers separate a DEFINITIVE auth rejection (token/device truly invalid → sign out) from a
 * transient/network failure (keep the session).
 */

/**
 * True only when a caught error message indicates the server DEFINITIVELY rejected the credential
 * (so the session should be dropped). A network/timeout/5xx message returns false → keep session.
 */
export function isAuthRejectionMessage(message: string | null | undefined): boolean {
  const m = String(message ?? "").toLowerCase();
  if (!m) return false;
  // Network / transient signatures → NOT an auth rejection.
  if (/timeout|network request failed|failed to fetch|aborted|econn|socket|dns|offline/.test(m)) {
    return false;
  }
  return /\b401\b|invalid|expired|revoked|unauthor|not\s*found|no longer/.test(m);
}

/**
 * Whether a non-OK HTTP response is a DEFINITE rider session revocation (vs a recoverable/other
 * error). Mirrors the server's auth error codes. Only these should ever force a sign-out.
 */
export function isDefiniteRiderSessionRevocation(
  status: number,
  code: string | null | undefined,
  message: string | null | undefined
): boolean {
  if (status !== 401) return false;
  const c = String(code ?? "").trim();
  if (c === "invalid_token") return true;
  if (c === "session_revoked") {
    const msg = String(message ?? "");
    return (
      msg.includes("Signed out from all devices") || msg.includes("Signed out from this device")
    );
  }
  return false;
}
