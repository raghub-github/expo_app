/**
 * Validate a Supabase Auth access token for OTP exchange endpoints.
 *
 * Prefer local JWT verification so exchange still works when Auth API is
 * unreachable (UND_ERR_CONNECT_TIMEOUT / fetch failed). Two local paths:
 *
 *  - HS256 against SUPABASE_JWT_SECRET (legacy symmetric signing key), and
 *  - the project JWKS for asymmetric keys (ES256/RS256/EdDSA).
 *
 * The JWKS path is not optional. Once a project moves to JWT signing keys,
 * Supabase issues asymmetric access tokens, the symmetric check can never
 * succeed, and *every* exchange silently degrades to a live `auth.getUser()`
 * round-trip — the exact network dependency this module exists to avoid. The
 * only visible symptom is users being told to retry whenever that call fails.
 *
 * `auth.getUser(jwt)` stays as the last resort.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { createSecretKey } from "node:crypto";
import { getEnv } from "../../config/env.js";
import { getSupabase } from "../../lib/supabase.js";

export type VerifiedSupabaseAccessUser = {
  id: string;
  phone: string | null;
  email: string | null;
  /** How the token was validated. */
  via: "jwt" | "getUser";
};

export type VerifySupabaseAccessFailure =
  | { ok: false; kind: "invalid"; message: string }
  | { ok: false; kind: "unreachable"; message: string };

export type VerifySupabaseAccessResult =
  | { ok: true; user: VerifiedSupabaseAccessUser }
  | VerifySupabaseAccessFailure;

/** Shown to end users on a login screen, so it names no vendor and asks for the
 *  one action that helps. The underlying cause goes to the logs, not the phone. */
const UNREACHABLE_MESSAGE = "Could not verify your code right now. Please try again.";

function isNetworkish(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: string; code?: string; name?: string; cause?: { code?: string; message?: string } };
  const msg = `${e.message ?? ""} ${e.cause?.message ?? ""}`.toLowerCase();
  const code = e.code ?? e.cause?.code ?? "";
  return (
    msg.includes("fetch failed") ||
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("enotfound") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_SOCKET_TIMEOUT" ||
    (typeof code === "string" && code.startsWith("UND_ERR_"))
  );
}

/**
 * Project JWKS, resolved once per process.
 *
 * `cacheMaxAge` is deliberately long: jose refetches whenever a token carries an
 * unknown `kid`, so key rotation is still picked up promptly, while a Supabase Auth
 * blip cannot invalidate keys we have already fetched. That is the whole point —
 * logins keep working through an Auth API outage.
 */
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  if (jwksCache) return jwksCache;
  const base = getEnv().SUPABASE_URL?.trim().replace(/\/+$/, "");
  if (!base) return null;
  jwksCache = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`), {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
    cacheMaxAge: 6 * 60 * 60_000,
  });
  return jwksCache;
}

/** Shared claim mapping for both local verification paths. */
function userFromPayload(payload: JWTPayload): VerifiedSupabaseAccessUser | null {
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) return null;

  // Reject our own backend-issued session JWTs (role: customer|rider|merchant).
  // Supabase Auth access tokens use role "authenticated" (or anon).
  const role = typeof payload.role === "string" ? payload.role : "";
  if (role === "customer" || role === "rider" || role === "merchant") {
    return null;
  }

  const phone =
    typeof payload.phone === "string" && payload.phone.trim()
      ? payload.phone.trim()
      : null;
  const email =
    typeof payload.email === "string" && payload.email.trim()
      ? payload.email.trim().toLowerCase()
      : null;

  return { id: sub, phone, email, via: "jwt" };
}

/** HS256 against the legacy symmetric signing secret. */
async function verifySymmetric(accessToken: string): Promise<VerifiedSupabaseAccessUser | null> {
  const env = getEnv();
  const keys = [
    createSecretKey(Buffer.from(env.SUPABASE_JWT_SECRET, "utf-8")),
    ...(env.SUPABASE_JWT_SECRET_PREVIOUS
      ? [createSecretKey(Buffer.from(env.SUPABASE_JWT_SECRET_PREVIOUS, "utf-8"))]
      : []),
  ];

  for (const key of keys) {
    try {
      // Small clock skew for mobile device clocks.
      const verified = await jwtVerify(accessToken, key, { clockTolerance: 30 });
      return userFromPayload(verified.payload);
    } catch {
      /* wrong secret or asymmetric token — try the next path */
    }
  }
  return null;
}

/** ES256 / RS256 / EdDSA against the project's published JWKS. */
async function verifyAsymmetric(accessToken: string): Promise<VerifiedSupabaseAccessUser | null> {
  const jwks = getJwks();
  if (!jwks) return null;
  try {
    const verified = await jwtVerify(accessToken, jwks, { clockTolerance: 30 });
    return userFromPayload(verified.payload);
  } catch {
    // Includes "JWKS could not be fetched" — fall through to auth.getUser().
    return null;
  }
}

async function verifyViaGetUser(accessToken: string): Promise<VerifySupabaseAccessResult> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user) {
      const msg = error?.message ?? "Invalid or expired Supabase token";
      if (isNetworkish(error)) {
        return {
          ok: false,
          kind: "unreachable",
          message: UNREACHABLE_MESSAGE,
        };
      }
      return { ok: false, kind: "invalid", message: msg };
    }
    return {
      ok: true,
      user: {
        id: data.user.id,
        phone: data.user.phone ?? null,
        email: data.user.email ?? null,
        via: "getUser",
      },
    };
  } catch (err) {
    if (isNetworkish(err)) {
      return {
        ok: false,
        kind: "unreachable",
        message: UNREACHABLE_MESSAGE,
      };
    }
    return {
      ok: false,
      kind: "invalid",
      message: err instanceof Error ? err.message : "Invalid or expired Supabase token",
    };
  }
}

export async function verifySupabaseAccessToken(
  accessToken: string
): Promise<VerifySupabaseAccessResult> {
  const symmetric = await verifySymmetric(accessToken);
  if (symmetric) return { ok: true, user: symmetric };

  const asymmetric = await verifyAsymmetric(accessToken);
  if (asymmetric) return { ok: true, user: asymmetric };

  return verifyViaGetUser(accessToken);
}

export function normalizePhoneDigits(p: string): string {
  return p.replace(/[\s+\-]/g, "");
}

/** Compare phones allowing +91 vs 91 and trailing-10 digit match. */
export function phonesMatch(a: string, b: string): boolean {
  const da = normalizePhoneDigits(a);
  const db = normalizePhoneDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 10 && db.length >= 10) return da.slice(-10) === db.slice(-10);
  return false;
}
