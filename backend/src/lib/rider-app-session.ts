import type { getSql } from "../db/client.js";
import type { RiderDeviceSessionMeta } from "./rider-device-sessions.js";
import type { RiderLoginGeo } from "./login-geo.js";
import { formatRiderLoginLocation } from "./login-geo.js";
import { parseRiderIdFromUserId, revokeAllRiderDeviceSessions, revokeRiderDeviceSessionsByIds } from "./rider-device-sessions.js";

type Sql = ReturnType<typeof getSql>;

/** Reactivates or creates an active app session row for a rider device on login. */
export async function persistRiderDeviceSession(
  sql: Sql,
  args: {
    userId: string;
    deviceId: string;
    loginMethod: "phone";
    ip?: string | null;
    location?: string | null;
    loginGeo?: RiderLoginGeo | null;
    device?: RiderDeviceSessionMeta;
  },
): Promise<void> {
  const { userId, deviceId, loginMethod, ip = null, location = null, loginGeo, device } = args;
  const geo = loginGeo ?? {};
  const locationLine = location ?? formatRiderLoginLocation(geo);
  const riderId = parseRiderIdFromUserId(userId);
  const deviceType = device?.deviceType?.trim() || "mobile";
  const deviceModel = device?.deviceModel?.trim() || null;
  const os = device?.os?.trim() || "android";
  const osVersion = device?.osVersion?.trim() || null;
  const appVersion = device?.appVersion?.trim() || null;

  const updated = await sql`
    UPDATE user_device_sessions
    SET
      is_active = TRUE,
      last_active = now(),
      login_time = now(),
      logged_out_at = NULL,
      revoked_by = NULL,
      revoke_reason = NULL,
      rider_id = COALESCE(${riderId}, rider_id),
      device_type = ${deviceType},
      device_name = ${deviceId},
      device_model = COALESCE(${deviceModel}, device_model),
      os = ${os},
      os_version = COALESCE(${osVersion}, os_version),
      app_version = COALESCE(${appVersion}, app_version),
      ip_address = ${ip},
      location = ${locationLine},
      login_state = ${geo.state ?? null},
      login_district = ${geo.district ?? null},
      login_town = ${geo.town ?? null},
      login_village = ${geo.village ?? null},
      login_method = ${loginMethod}
    WHERE user_id = ${userId} AND device_id = ${deviceId}
    RETURNING id
  `;
  const touched = Array.isArray(updated) ? updated.length : 0;
  if (touched > 0) return;

  await sql`
    INSERT INTO user_device_sessions (
      user_id,
      rider_id,
      parent_store_id,
      child_store_id,
      device_type,
      device_name,
      device_model,
      os,
      os_version,
      app_version,
      ip_address,
      location,
      login_state,
      login_district,
      login_town,
      login_village,
      login_method,
      device_id
    )
    VALUES (
      ${userId},
      ${riderId},
      NULL,
      NULL,
      ${deviceType},
      ${deviceId},
      ${deviceModel},
      ${os},
      ${osVersion},
      ${appVersion},
      ${ip},
      ${locationLine},
      ${geo.state ?? null},
      ${geo.district ?? null},
      ${geo.town ?? null},
      ${geo.village ?? null},
      ${loginMethod},
      ${deviceId}
    )
  `;
}

/** Marks rider app session(s) inactive on logout. */
export async function deactivateRiderDeviceSessions(
  sql: Sql,
  args: {
    userId: string;
    deviceId?: string | null;
    revokedBy?: string;
    revokeReason?: string | null;
  },
): Promise<void> {
  const { userId, deviceId, revokedBy = "rider_self", revokeReason = null } = args;
  if (deviceId) {
    await sql`
      UPDATE user_device_sessions
      SET
        is_active = FALSE,
        last_active = now(),
        logged_out_at = now(),
        revoked_by = ${revokedBy},
        revoke_reason = ${revokeReason}
      WHERE user_id = ${userId} AND device_id = ${deviceId} AND is_active = TRUE
    `;
    return;
  }
  await revokeAllRiderDeviceSessions(sql, {
    userId,
    revokedBy,
    revokeReason,
  });
}

export { revokeAllRiderDeviceSessions, revokeRiderDeviceSessionsByIds };
