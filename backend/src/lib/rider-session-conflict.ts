/**
 * Single-device conflict detection (spec §5, §17, §21, §23).
 *
 * A conflict exists when the rider already has an ACTIVE session on a DIFFERENT device
 * that isn't stale. "Stale" reuses the session TTL (7 days, matching the issued JWT): a
 * device untouched past that is treated as effectively expired and never blocks a new
 * login (§17). The active session is always identified server-side from the rider's own
 * user_id — the client never chooses which session to revoke (§23).
 */
import type { getSql } from "../db/client.js";

type Sql = ReturnType<typeof getSql>;

/** Matches the rider session JWT TTL; a device idle beyond this is stale, not blocking. */
export const RIDER_SESSION_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type ConflictingRiderSession = {
  sessionId: number;
  deviceId: string | null;
  deviceLabel: string;
  platform: string;
  lastActiveAt: string | null;
};

/**
 * Returns the active session on another device that blocks this login, or null when the
 * device may log in directly (no other device, only the same device, or only stale ones).
 */
export async function findConflictingRiderSession(
  sql: Sql,
  args: { userId: string; deviceId: string },
): Promise<ConflictingRiderSession | null> {
  const { userId, deviceId } = args;
  const staleSeconds = Math.floor(RIDER_SESSION_STALE_AFTER_MS / 1000);
  const rows = (await sql`
    SELECT id, device_id, device_model, os, last_active
    FROM user_device_sessions
    WHERE user_id = ${userId}
      AND is_active = TRUE
      AND device_id IS DISTINCT FROM ${deviceId}
      AND last_active > now() - (${staleSeconds} || ' seconds')::interval
    ORDER BY last_active DESC
    LIMIT 1
  `) as Array<Record<string, unknown>>;

  const row = rows[0];
  if (!row) return null;

  const model = row.device_model != null ? String(row.device_model).trim() : "";
  const os = row.os != null ? String(row.os).trim() : "";
  const platform = os || "android";
  const deviceLabel = model || `${platform.charAt(0).toUpperCase()}${platform.slice(1)} device`;
  const lastActive = row.last_active;
  return {
    sessionId: Number(row.id),
    deviceId: row.device_id != null ? String(row.device_id) : null,
    deviceLabel,
    platform,
    lastActiveAt:
      lastActive instanceof Date
        ? lastActive.toISOString()
        : lastActive != null
          ? String(lastActive)
          : null,
  };
}

/** API conflict body (§21) — exposes only safe, already-available device context. */
export function buildRiderSessionConflictBody(
  existing: ConflictingRiderSession,
  takeoverToken: string,
) {
  return {
    code: "SESSION_CONFLICT" as const,
    error: "session_conflict",
    message: "Rider account is active on another device.",
    existingSession: {
      sessionId: String(existing.sessionId),
      deviceLabel: existing.deviceLabel,
      platform: existing.platform,
      lastActiveAt: existing.lastActiveAt,
    },
    takeoverToken,
  };
}

export type RiderSessionConflictBody = ReturnType<typeof buildRiderSessionConflictBody>;
