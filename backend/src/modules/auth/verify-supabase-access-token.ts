/**
 * Validate a Supabase Auth access token for OTP exchange endpoints.
 *
 * Prefer local JWT verification (SUPABASE_JWT_SECRET) so exchange still works
 * when Auth API is unreachable (UND_ERR_CONNECT_TIMEOUT / fetch failed).
 * Fall back to `auth.getUser(jwt)` when local verify fails (e.g. asymmetric keys).
 */
import { jwtVerify } from "jose";
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

async function verifyLocally(accessToken: string): Promise<VerifiedSupabaseAccessUser | null> {
  const env = getEnv();
  const keys = [
    createSecretKey(Buffer.from(env.SUPABASE_JWT_SECRET, "utf-8")),
    ...(env.SUPABASE_JWT_SECRET_PREVIOUS
      ? [createSecretKey(Buffer.from(env.SUPABASE_JWT_SECRET_PREVIOUS, "utf-8"))]
      : []),
  ];

  let payload: Record<string, unknown> | null = null;
  let lastErr: unknown = null;
  for (const key of keys) {
    try {
      const verified = await jwtVerify(accessToken, key, {
        // Small clock skew for mobile device clocks.
        clockTolerance: 30,
      });
      payload = verified.payload as Record<string, unknown>;
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!payload) {
    if (lastErr && isNetworkish(lastErr)) return null;
    return null;
  }

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
          message: "Supabase Auth temporarily unreachable. Please retry.",
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
        message: "Supabase Auth temporarily unreachable. Please retry.",
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
  const local = await verifyLocally(accessToken);
  if (local) return { ok: true, user: local };
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
