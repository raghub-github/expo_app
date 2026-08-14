/**
 * Single-device login enforcement for riders (v1).
 *
 * A rider may only have ONE active device session at a time. Logging in on a new device
 * immediately revokes every other active session for that rider (enforced near-instantly on
 * the old device via the existing per-request check in plugins/auth.ts, which already
 * rejects any request from a device whose user_device_sessions row is inactive).
 *
 * To prevent abuse (e.g. credential sharing across many devices/people), a rider may only
 * SWITCH devices a limited number of times: 3 per rolling 24 hours, 10 per rolling 30 days.
 * Re-logging in on the SAME device never counts against this limit and never revokes
 * anything — only a genuine change to a different device_id does.
 *
 * Reuses existing infrastructure rather than duplicating it:
 *  - persistRiderDeviceSession (rider-app-session.ts) — the actual session upsert.
 *  - revokeAllRiderDeviceSessions (rider-device-sessions.ts) — the actual "kick out other
 *    devices" update.
 * This module only decides WHEN those should run, and enforces the rate limit via a new
 * append-only table (rider_device_change_events, migration 0535) that user_device_sessions
 * cannot answer on its own (it's upserted per user_id+device_id, not append-only).
 */
import type { getSql } from "../db/client.js";
import type { RiderDeviceSessionMeta } from "./rider-device-sessions.js";
import { revokeAllRiderDeviceSessions } from "./rider-device-sessions.js";
import type { RiderLoginGeo } from "./login-geo.js";
import { persistRiderDeviceSession } from "./rider-app-session.js";

type Sql = ReturnType<typeof getSql>;

export const RIDER_DEVICE_CHANGE_LIMIT_24H = 3;
export const RIDER_DEVICE_CHANGE_LIMIT_30D = 10;
const WINDOW_24H_MS = 24 * 60 * 60 * 1000;
const WINDOW_30D_MS = 30 * 24 * 60 * 60 * 1000;

export class RiderDeviceChangeLimitError extends Error {
  limitType: "24h" | "30d";
  currentCount: number;
  limit: number;
  retryAt: Date;

  constructor(args: { limitType: "24h" | "30d"; currentCount: number; limit: number; retryAt: Date }) {
    super(`Rider device-change limit reached (${args.limitType})`);
    this.name = "RiderDeviceChangeLimitError";
    this.limitType = args.limitType;
    this.currentCount = args.currentCount;
    this.limit = args.limit;
    this.retryAt = args.retryAt;
  }
}

export type RiderDeviceLoginDecision =
  | { outcome: "ok"; kind: "bypassed" | "first_login" | "same_device" }
  | { outcome: "ok"; kind: "device_changed"; revokedCount: number };

type ClassifyResult =
  | { kind: "first_login" | "same_device" | "device_change_allowed" }
  | { kind: "device_change_rejected"; limitType: "24h" | "30d"; retryAt: Date };

/**
 * Pure decision logic — no DB I/O, unit-testable in isolation.
 *
 * `count24h`/`count30d` and the `oldestInWindow*` values only need to be populated when
 * `lastDeviceId` is non-null and differs from `incomingDeviceId` (i.e. only when it's
 * actually a device change) — same-device and first-login callers can pass zeros/nulls.
 */
export function classifyRiderDeviceLogin(args: {
  lastDeviceId: string | null;
  incomingDeviceId: string;
  count24h: number;
  count30d: number;
  oldestInWindow24h: Date | null;
  oldestInWindow30d: Date | null;
}): ClassifyResult {
  if (args.lastDeviceId == null) {
    return { kind: "first_login" };
  }
  if (args.lastDeviceId === args.incomingDeviceId) {
    return { kind: "same_device" };
  }

  // Device change — check 24h before 30d: it's the more immediate, more specific limit.
  if (args.count24h >= RIDER_DEVICE_CHANGE_LIMIT_24H) {
    const oldest = args.oldestInWindow24h;
    const retryAt = oldest ? new Date(oldest.getTime() + WINDOW_24H_MS) : new Date();
    return { kind: "device_change_rejected", limitType: "24h", retryAt };
  }
  if (args.count30d >= RIDER_DEVICE_CHANGE_LIMIT_30D) {
    const oldest = args.oldestInWindow30d;
    const retryAt = oldest ? new Date(oldest.getTime() + WINDOW_30D_MS) : new Date();
    return { kind: "device_change_rejected", limitType: "30d", retryAt };
  }
  return { kind: "device_change_allowed" };
}

/**
 * Atomically: detects whether this login is a device change, enforces the rate limit,
 * records the change event, revokes every other active session, and upserts the new
 * session — all inside one transaction, so a rider is never observably in a "both devices
 * active" state and a mid-transaction failure rolls back cleanly (no partial state, no
 * wrongly-consumed rate-limit quota on retry).
 *
 * Skips all of the above when `bypassPolicy` is true (the app-store review-bypass phone) —
 * just persists the session exactly as before this feature existed.
 *
 * Throws RiderDeviceChangeLimitError when the rate limit is exceeded (nothing is written).
 */
export async function applyRiderDeviceLoginPolicy(
  sql: Sql,
  args: {
    userId: string;
    riderId: number;
    deviceId: string;
    loginMethod: "phone";
    ip?: string | null;
    location?: string | null;
    loginGeo?: RiderLoginGeo | null;
    device?: RiderDeviceSessionMeta;
    bypassPolicy: boolean;
  },
): Promise<RiderDeviceLoginDecision> {
  const { userId, riderId, deviceId, loginMethod, ip = null, location = null, loginGeo, device, bypassPolicy } = args;

  if (bypassPolicy) {
    await persistRiderDeviceSession(sql, { userId, deviceId, loginMethod, ip, location, loginGeo, device });
    return { outcome: "ok", kind: "bypassed" };
  }

  return sql.begin(async (tx) => {
    // Lock the rider's own (already-committed) row to serialize concurrent login/device-
    // change attempts for this rider — mirrors the rider_wallet FOR UPDATE pattern in
    // rider-withdrawal.service.ts. Plain READ COMMITTED is sufficient; the row lock alone
    // provides the serialization this policy needs.
    await tx`SELECT id FROM riders WHERE id = ${riderId} FOR UPDATE`;

    const [lastRow] = await tx`
      SELECT device_id
      FROM user_device_sessions
      WHERE user_id = ${userId}
      ORDER BY login_time DESC
      LIMIT 1
    `;
    const lastDeviceId = (lastRow as { device_id?: string | null } | undefined)?.device_id ?? null;

    let count24h = 0;
    let count30d = 0;
    let oldestInWindow24h: Date | null = null;
    let oldestInWindow30d: Date | null = null;

    if (lastDeviceId != null && lastDeviceId !== deviceId) {
      const rows24h = await tx`
        SELECT changed_at
        FROM rider_device_change_events
        WHERE rider_id = ${riderId} AND changed_at > now() - interval '24 hours'
        ORDER BY changed_at ASC
      `;
      count24h = rows24h.length;
      oldestInWindow24h = rows24h[0] ? new Date((rows24h[0] as { changed_at: string | Date }).changed_at) : null;

      const rows30d = await tx`
        SELECT changed_at
        FROM rider_device_change_events
        WHERE rider_id = ${riderId} AND changed_at > now() - interval '30 days'
        ORDER BY changed_at ASC
      `;
      count30d = rows30d.length;
      oldestInWindow30d = rows30d[0] ? new Date((rows30d[0] as { changed_at: string | Date }).changed_at) : null;
    }

    const decision = classifyRiderDeviceLogin({
      lastDeviceId,
      incomingDeviceId: deviceId,
      count24h,
      count30d,
      oldestInWindow24h,
      oldestInWindow30d,
    });

    if (decision.kind === "device_change_rejected") {
      const currentCount = decision.limitType === "24h" ? count24h : count30d;
      const limit = decision.limitType === "24h" ? RIDER_DEVICE_CHANGE_LIMIT_24H : RIDER_DEVICE_CHANGE_LIMIT_30D;
      throw new RiderDeviceChangeLimitError({
        limitType: decision.limitType,
        currentCount,
        limit,
        retryAt: decision.retryAt,
      });
    }

    let revokedCount = 0;
    if (decision.kind === "device_change_allowed") {
      await tx`
        INSERT INTO rider_device_change_events (rider_id, user_id, from_device_id, to_device_id, ip_address, login_method)
        VALUES (${riderId}, ${userId}, ${lastDeviceId}, ${deviceId}, ${ip}, ${loginMethod})
      `;
      // postgres.js's TransactionSql doesn't structurally satisfy Sql (it's missing
      // connection-lifecycle members like CLOSE/END that don't apply inside a
      // transaction) even though it supports the same tagged-template query calls these
      // functions actually use — narrow cast, scoped to this file only.
      revokedCount = await revokeAllRiderDeviceSessions(tx as unknown as Sql, {
        userId,
        exceptDeviceId: deviceId,
        revokedBy: "device_change",
        revokeReason: "single_device_policy",
      });
    }

    await persistRiderDeviceSession(tx as unknown as Sql, { userId, deviceId, loginMethod, ip, location, loginGeo, device });

    if (decision.kind === "device_change_allowed") {
      return { outcome: "ok", kind: "device_changed", revokedCount };
    }
    return { outcome: "ok", kind: decision.kind };
  });
}
