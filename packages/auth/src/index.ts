/**
 * @gatimitra/auth — JWT verification helpers shared by every service that
 * needs to validate a session token.
 *
 * Why a package vs duplicating in each service:
 *   - Rotation logic (current + previous secret) lives in ONE file
 *   - When we add JWKS or asymmetric keys later, the swap happens here
 *   - ws-gateway and backend currently re-implement the same verify; this
 *     becomes the source of truth (existing code can migrate incrementally)
 *
 * Symmetric HS256 only for now (matches the Supabase JWT secret). Asymmetric
 * RS256 / EdDSA support can plug in via the verify() options pass-through.
 */
import { jwtVerify, SignJWT, type JWTPayload, type JWTVerifyOptions } from "jose";

export type VerifyKeys = {
  /** Current signing secret. Required. */
  current: string;
  /** Optional secondary secret accepted during a rotation window. */
  previous?: string | null;
};

/**
 * Verify a JWT against current OR previous secret. Returns the decoded
 * payload, or null on any failure (invalid signature, expired, malformed).
 * Never throws — callers branch on the null.
 */
export async function verifyJwtRotated(
  token: string,
  keys: VerifyKeys,
  options?: JWTVerifyOptions,
): Promise<JWTPayload | null> {
  if (!token || !keys.current) return null;
  const enc = new TextEncoder();
  try {
    const { payload } = await jwtVerify(token, enc.encode(keys.current), options);
    return payload;
  } catch {
    if (!keys.previous) return null;
    try {
      const { payload } = await jwtVerify(token, enc.encode(keys.previous), options);
      return payload;
    } catch {
      return null;
    }
  }
}

/**
 * Convenience signer for service-internal tokens (ws tickets, internal RPC,
 * preview links). Always signs with the CURRENT secret — rotation only
 * affects verification.
 */
export async function signServiceJwt(opts: {
  secret: string;
  subject: string;
  audience: string;
  expiresInSec: number;
  jti?: string;
  extraClaims?: Record<string, unknown>;
}): Promise<string> {
  const enc = new TextEncoder();
  const builder = new SignJWT({ ...(opts.extraClaims ?? {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(opts.subject)
    .setAudience(opts.audience)
    .setIssuedAt()
    .setExpirationTime(`${opts.expiresInSec}s`);
  if (opts.jti) builder.setJti(opts.jti);
  return builder.sign(enc.encode(opts.secret));
}
