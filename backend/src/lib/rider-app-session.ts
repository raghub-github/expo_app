import type { getSql } from "../db/client.js";

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
  },
): Promise<void> {
  const { userId, deviceId, loginMethod, ip = null, location = null } = args;

  const updated = await sql`
    UPDATE user_device_sessions
    SET
      is_active = TRUE,
      last_active = now(),
      login_time = now(),
      device_type = 'mobile',
      device_name = ${deviceId},
      os = 'android',
      ip_address = ${ip},
      location = ${location},
      login_method = ${loginMethod}
    WHERE user_id = ${userId} AND device_id = ${deviceId}
    RETURNING id
  `;
  const touched = Array.isArray(updated) ? updated.length : 0;
  if (touched > 0) return;

  await sql`
    INSERT INTO user_device_sessions (
      user_id,
      parent_store_id,
      child_store_id,
      device_type,
      device_name,
      os,
      ip_address,
      location,
      login_method,
      device_id
    )
    VALUES (
      ${userId},
      NULL,
      NULL,
      'mobile',
      ${deviceId},
      'android',
      ${ip},
      ${location},
      ${loginMethod},
      ${deviceId}
    )
  `;
}

/** Marks rider app session(s) inactive on logout. */
export async function deactivateRiderDeviceSessions(
  sql: Sql,
  args: { userId: string; deviceId?: string | null },
): Promise<void> {
  const { userId, deviceId } = args;
  if (deviceId) {
    await sql`
      UPDATE user_device_sessions
      SET is_active = FALSE, last_active = now()
      WHERE user_id = ${userId} AND device_id = ${deviceId} AND is_active = TRUE
    `;
    return;
  }
  await sql`
    UPDATE user_device_sessions
    SET is_active = FALSE, last_active = now()
    WHERE user_id = ${userId} AND is_active = TRUE
  `;
}
