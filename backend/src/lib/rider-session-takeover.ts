/**
 * Atomic device takeover core (spec §8, §10, §11, §20, §27, §31).
 *
 * Runs the already-existing atomic switch (applyRiderDeviceLoginPolicy: FOR UPDATE on the
 * rider row → revoke all other active sessions → upsert the new one, in one transaction),
 * then emits a realtime SESSION_REVOKED to each device it kicked so the old device logs out
 * instantly. The per-request check in plugins/auth.ts remains the guaranteed fallback for
 * offline/backgrounded devices. Idempotent: a repeat call from the now-active device is a
 * "same_device" no-op that revokes nothing and emits nothing.
 */
import type { getSql } from "../db/client.js";
import type { RiderLoginGeo } from "./login-geo.js";
import type { RiderDeviceSessionMeta } from "./rider-device-sessions.js";
import { applyRiderDeviceLoginPolicy } from "./rider-device-change-policy.js";
import { publishRiderEvent } from "../modules/realtime/publish.js";

type Sql = ReturnType<typeof getSql>;

/** Emit an instant SESSION_REVOKED for each kicked device on the rider's realtime channel. */
export async function emitRiderSessionRevoked(
  riderId: number,
  revokedDeviceIds: string[],
  reason = "DEVICE_TAKEOVER",
): Promise<void> {
  const occurredAt = new Date().toISOString();
  await Promise.all(
    revokedDeviceIds
      .filter((d) => !!d)
      .map((deviceId) =>
        publishRiderEvent(riderId, {
          type: "session.revoked",
          deviceId,
          reason,
          occurredAt,
        }),
      ),
  );
}

/**
 * Perform the confirmed takeover for `deviceId`. Captures the currently-active OTHER
 * devices first (so we know exactly whom to notify), applies the atomic policy, then emits
 * SESSION_REVOKED to those devices. Rethrows RiderDeviceChangeLimitError to the caller.
 */
export async function performRiderDeviceTakeover(
  sql: Sql,
  args: {
    userId: string;
    riderId: number;
    deviceId: string;
    ip?: string | null;
    loginGeo?: RiderLoginGeo | null;
    device?: RiderDeviceSessionMeta;
  },
): Promise<{ revokedDeviceIds: string[] }> {
  const { userId, riderId, deviceId, ip = null, loginGeo, device } = args;

  const priorRows = (await sql`
    SELECT DISTINCT device_id
    FROM user_device_sessions
    WHERE user_id = ${userId}
      AND is_active = TRUE
      AND device_id IS DISTINCT FROM ${deviceId}
      AND device_id IS NOT NULL
  `) as Array<{ device_id: string }>;
  const revokedDeviceIds = priorRows.map((r) => String(r.device_id)).filter(Boolean);

  await applyRiderDeviceLoginPolicy(sql, {
    userId,
    riderId,
    deviceId,
    loginMethod: "phone",
    ip,
    loginGeo,
    device,
    bypassPolicy: false,
  });

  if (revokedDeviceIds.length > 0) {
    await emitRiderSessionRevoked(riderId, revokedDeviceIds).catch(() => {});
  }

  return { revokedDeviceIds };
}
