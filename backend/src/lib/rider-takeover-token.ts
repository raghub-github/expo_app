/**
 * Short-lived "pending device takeover" token (spec §1, §22, §30).
 *
 * Issued ONLY after successful OTP verification when a single-device conflict is
 * detected. It proves "this rider completed OTP on this device" without being a real
 * session — the takeover endpoint exchanges it for a session after the rider explicitly
 * taps "Mark Logout". It cannot be used for authenticated API access: no
 * user_device_sessions row exists for it, so plugins/auth.ts rejects it, and its role
 * claim is not a session role.
 *
 * Signed with SUPABASE_JWT_SECRET (same key infra as sessions) but scoped by an explicit
 * `purpose` claim the takeover route verifies; ~5 min TTL keeps the takeover window tight.
 */
import { SignJWT, jwtVerify } from "jose";
import { createSecretKey } from "node:crypto";
import { getEnv } from "../config/env.js";

const PURPOSE = "rider_device_takeover";
const TTL_SEC = 5 * 60;

export type RiderTakeoverClaims = {
  userId: string;
  riderId: number;
  deviceId: string;
  phoneE164: string;
};

function secret() {
  return createSecretKey(Buffer.from(getEnv().SUPABASE_JWT_SECRET, "utf-8"));
}

/** Sign a pending-takeover token bound to the exact rider + device that passed OTP. */
export async function issueRiderTakeoverToken(claims: RiderTakeoverClaims): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    purpose: PURPOSE,
    role: "rider_pending_takeover",
    riderId: claims.riderId,
    device_id: claims.deviceId,
    phone: claims.phoneE164,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.userId)
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SEC)
    .sign(secret());
}

/** Verify + decode a pending-takeover token. Throws if invalid/expired/wrong purpose. */
export async function verifyRiderTakeoverToken(token: string): Promise<RiderTakeoverClaims> {
  const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
  if (payload.purpose !== PURPOSE) {
    throw new Error("not_a_takeover_token");
  }
  const userId = typeof payload.sub === "string" ? payload.sub : "";
  const riderId = typeof payload.riderId === "number" ? payload.riderId : Number(payload.riderId);
  const deviceId = typeof payload.device_id === "string" ? payload.device_id : "";
  const phoneE164 = typeof payload.phone === "string" ? payload.phone : "";
  if (!userId || !Number.isInteger(riderId) || riderId < 1 || !deviceId) {
    throw new Error("malformed_takeover_token");
  }
  return { userId, riderId, deviceId, phoneE164 };
}
