/**
 * Cold-start auth decision (pure, unit-tested).
 *
 * The old flow left auth in `loading` until a blocking network call
 * (GET /v1/merchant-partner/me, 12s timeout) resolved on EVERY app open — so the branded splash sat
 * on "Checking your session..." every time and a slow/edge network could bounce a valid session to
 * login. This decides the INITIAL state from fast local SecureStore reads only:
 *
 *   • valid, non-expired token + a cached partner  → authenticate optimistically now, verify in the
 *                                                     background (sign out only on a confirmed 401).
 *   • token present but no cached partner, or the token is locally expired → do the network validate
 *                                                     (rare: first run after update / true expiry).
 *   • no token → unauthenticated.
 *
 * Security is unchanged: a trusted local token still gets server-verified right after paint, and a
 * confirmed revocation/expiry clears it. Local presence alone never *keeps* a revoked session.
 */

export type InitialAuthDecision =
  | { kind: "authenticated"; token: string }
  | { kind: "unauthenticated" }
  | { kind: "validate" };

export function decideInitialAuth(input: {
  token: string | null | undefined;
  expiresAtSec: number | null;
  hasCachedPartner: boolean;
  nowSec: number;
  /** Grace for clock skew so a near-boundary token isn't treated as expired. */
  clockSkewSec?: number;
}): InitialAuthDecision {
  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (!token) return { kind: "unauthenticated" };

  // A token with no cached profile can't render the app offline → must fetch /me once.
  if (!input.hasCachedPartner) return { kind: "validate" };

  const exp = input.expiresAtSec;
  const skew = input.clockSkewSec ?? 60;
  const locallyExpired = exp != null && exp > 0 && exp <= input.nowSec - skew;
  // Expired locally → let the validate path try a forced refresh before deciding.
  if (locallyExpired) return { kind: "validate" };

  return { kind: "authenticated", token };
}
