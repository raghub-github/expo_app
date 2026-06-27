import type { getSql } from "../db/client.js";

type Sql = ReturnType<typeof getSql>;

export type RiderDeviceSessionRow = {
  id: number;
  userId: string;
  riderId: number | null;
  deviceId: string | null;
  deviceType: string | null;
  deviceName: string | null;
  deviceModel: string | null;
  os: string | null;
  osVersion: string | null;
  appVersion: string | null;
  ipAddress: string | null;
  location: string | null;
  loginState: string | null;
  loginDistrict: string | null;
  loginTown: string | null;
  loginVillage: string | null;
  loginMethod: string | null;
  loginTime: string;
  lastActive: string;
  isActive: boolean;
  loggedOutAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
};

export type RiderDeviceSessionMeta = {
  deviceType?: string | null;
  deviceModel?: string | null;
  os?: string | null;
  osVersion?: string | null;
  appVersion?: string | null;
};

function mapRow(row: Record<string, unknown>): RiderDeviceSessionRow {
  const loginTime = row.login_time ?? row.loginTime;
  const lastActive = row.last_active ?? row.lastActive;
  const loggedOutAt = row.logged_out_at ?? row.loggedOutAt;
  return {
    id: Number(row.id),
    userId: String(row.user_id ?? row.userId ?? ""),
    riderId: row.rider_id != null ? Number(row.rider_id) : row.riderId != null ? Number(row.riderId) : null,
    deviceId: row.device_id != null ? String(row.device_id) : row.deviceId != null ? String(row.deviceId) : null,
    deviceType: row.device_type != null ? String(row.device_type) : row.deviceType != null ? String(row.deviceType) : null,
    deviceName: row.device_name != null ? String(row.device_name) : row.deviceName != null ? String(row.deviceName) : null,
    deviceModel: row.device_model != null ? String(row.device_model) : row.deviceModel != null ? String(row.deviceModel) : null,
    os: row.os != null ? String(row.os) : null,
    osVersion: row.os_version != null ? String(row.os_version) : row.osVersion != null ? String(row.osVersion) : null,
    appVersion: row.app_version != null ? String(row.app_version) : row.appVersion != null ? String(row.appVersion) : null,
    ipAddress: row.ip_address != null ? String(row.ip_address) : row.ipAddress != null ? String(row.ipAddress) : null,
    location: row.location != null ? String(row.location) : null,
    loginState:
      row.login_state != null ? String(row.login_state) : row.loginState != null ? String(row.loginState) : null,
    loginDistrict:
      row.login_district != null
        ? String(row.login_district)
        : row.loginDistrict != null
          ? String(row.loginDistrict)
          : null,
    loginTown:
      row.login_town != null ? String(row.login_town) : row.loginTown != null ? String(row.loginTown) : null,
    loginVillage:
      row.login_village != null
        ? String(row.login_village)
        : row.loginVillage != null
          ? String(row.loginVillage)
          : null,
    loginMethod: row.login_method != null ? String(row.login_method) : row.loginMethod != null ? String(row.loginMethod) : null,
    loginTime: loginTime instanceof Date ? loginTime.toISOString() : String(loginTime ?? ""),
    lastActive: lastActive instanceof Date ? lastActive.toISOString() : String(lastActive ?? ""),
    isActive: row.is_active === true || row.isActive === true,
    loggedOutAt:
      loggedOutAt == null
        ? null
        : loggedOutAt instanceof Date
          ? loggedOutAt.toISOString()
          : String(loggedOutAt),
    revokedBy: row.revoked_by != null ? String(row.revoked_by) : row.revokedBy != null ? String(row.revokedBy) : null,
    revokeReason:
      row.revoke_reason != null ? String(row.revoke_reason) : row.revokeReason != null ? String(row.revokeReason) : null,
  };
}

export function riderUserIdFromPk(riderId: number): string {
  return `usr_${riderId}`;
}

export function parseRiderIdFromUserId(userId: string): number | null {
  const m = /^usr_(\d+)$/.exec(userId.trim());
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}

export async function listRiderDeviceSessions(
  sql: Sql,
  args: { userId: string; activeOnly?: boolean; limit?: number },
): Promise<RiderDeviceSessionRow[]> {
  const { userId, activeOnly = true, limit = 50 } = args;
  const rows = activeOnly
    ? await sql`
        SELECT *
        FROM user_device_sessions
        WHERE user_id = ${userId} AND is_active = TRUE
        ORDER BY last_active DESC, login_time DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT *
        FROM user_device_sessions
        WHERE user_id = ${userId}
        ORDER BY last_active DESC, login_time DESC
        LIMIT ${limit}
      `;
  return (rows as Record<string, unknown>[]).map(mapRow);
}

export async function listRiderDeviceSessionsByRiderId(
  sql: Sql,
  riderId: number,
  opts?: { activeOnly?: boolean; limit?: number },
): Promise<RiderDeviceSessionRow[]> {
  return listRiderDeviceSessions(sql, {
    userId: riderUserIdFromPk(riderId),
    activeOnly: opts?.activeOnly ?? true,
    limit: opts?.limit ?? 50,
  });
}

export async function countActiveRiderDeviceSessions(sql: Sql, riderId: number): Promise<number> {
  const userId = riderUserIdFromPk(riderId);
  const rows = await sql`
    SELECT COUNT(*)::int AS c
    FROM user_device_sessions
    WHERE user_id = ${userId} AND is_active = TRUE
  `;
  return Number((rows[0] as { c?: number })?.c ?? 0);
}

export async function revokeRiderDeviceSessionsByIds(
  sql: Sql,
  args: {
    userId: string;
    sessionIds: number[];
    revokedBy: string;
    revokeReason?: string | null;
  },
): Promise<number> {
  const ids = args.sessionIds.filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return 0;

  const rows = await sql`
    UPDATE user_device_sessions
    SET
      is_active = FALSE,
      last_active = now(),
      logged_out_at = now(),
      revoked_by = ${args.revokedBy},
      revoke_reason = ${args.revokeReason ?? null}
    WHERE user_id = ${args.userId}
      AND id IN ${sql(ids)}
      AND is_active = TRUE
    RETURNING id
  `;
  return Array.isArray(rows) ? rows.length : 0;
}

export async function revokeAllRiderDeviceSessions(
  sql: Sql,
  args: {
    userId: string;
    exceptDeviceId?: string | null;
    revokedBy: string;
    revokeReason?: string | null;
  },
): Promise<number> {
  const exceptDeviceId = args.exceptDeviceId?.trim() || null;
  const rows = exceptDeviceId
    ? await sql`
        UPDATE user_device_sessions
        SET
          is_active = FALSE,
          last_active = now(),
          logged_out_at = now(),
          revoked_by = ${args.revokedBy},
          revoke_reason = ${args.revokeReason ?? null}
        WHERE user_id = ${args.userId}
          AND is_active = TRUE
          AND device_id IS DISTINCT FROM ${exceptDeviceId}
        RETURNING id
      `
    : await sql`
        UPDATE user_device_sessions
        SET
          is_active = FALSE,
          last_active = now(),
          logged_out_at = now(),
          revoked_by = ${args.revokedBy},
          revoke_reason = ${args.revokeReason ?? null}
        WHERE user_id = ${args.userId} AND is_active = TRUE
        RETURNING id
      `;
  return Array.isArray(rows) ? rows.length : 0;
}
