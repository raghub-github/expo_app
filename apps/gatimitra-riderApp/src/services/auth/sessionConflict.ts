/**
 * Pure parsing of the backend's 409 SESSION_CONFLICT response (spec §5, §21).
 * Kept free of React Native / config imports so it is unit-testable in isolation.
 */
import type { Session } from "@gatimitra/contracts";

/** Safe device context for the "Another Device Is Logged In" sheet (§6, §21). */
export type RiderConflictExistingSession = {
  sessionId: string;
  deviceLabel: string;
  platform: string;
  lastActiveAt: string | null;
};

/** Returned by verifyOtp when the rider is already active on another device (§5). */
export type RiderSessionConflict = {
  conflict: true;
  existingSession: RiderConflictExistingSession;
  takeoverToken: string;
};

export type VerifyOtpResult = Session | RiderSessionConflict;

export function isRiderSessionConflict(r: VerifyOtpResult): r is RiderSessionConflict {
  return (r as RiderSessionConflict).conflict === true;
}

/** Parse a 409 SESSION_CONFLICT body into a typed conflict, or null when it isn't one. */
export function parseSessionConflict(
  status: number,
  dataJson: Record<string, unknown>,
): RiderSessionConflict | null {
  if (status !== 409 || dataJson.code !== "SESSION_CONFLICT") return null;
  const token = typeof dataJson.takeoverToken === "string" ? dataJson.takeoverToken : "";
  if (!token) return null;
  const es = (dataJson.existingSession ?? {}) as Record<string, unknown>;
  return {
    conflict: true,
    takeoverToken: token,
    existingSession: {
      sessionId: String(es.sessionId ?? ""),
      deviceLabel:
        typeof es.deviceLabel === "string" && es.deviceLabel ? es.deviceLabel : "another device",
      platform: typeof es.platform === "string" ? es.platform : "",
      lastActiveAt: typeof es.lastActiveAt === "string" ? es.lastActiveAt : null,
    },
  };
}
