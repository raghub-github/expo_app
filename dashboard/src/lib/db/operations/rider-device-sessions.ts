import "server-only";

import { getSql } from "../client";

export type DashboardRiderDeviceSession = {
  id: number;
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

function riderUserId(riderId: number): string {
  return `usr_${riderId}`;
}

function mapRow(row: Record<string, unknown>): DashboardRiderDeviceSession {
  const loginTime = row.login_time;
  const lastActive = row.last_active;
  const loggedOutAt = row.logged_out_at;
  return {
    id: Number(row.id),
    deviceId: row.device_id != null ? String(row.device_id) : null,
    deviceType: row.device_type != null ? String(row.device_type) : null,
    deviceName: row.device_name != null ? String(row.device_name) : null,
    deviceModel: row.device_model != null ? String(row.device_model) : null,
    os: row.os != null ? String(row.os) : null,
    osVersion: row.os_version != null ? String(row.os_version) : null,
    appVersion: row.app_version != null ? String(row.app_version) : null,
    ipAddress: row.ip_address != null ? String(row.ip_address) : null,
    location: row.location != null ? String(row.location) : null,
    loginState: row.login_state != null ? String(row.login_state) : null,
    loginDistrict: row.login_district != null ? String(row.login_district) : null,
    loginTown: row.login_town != null ? String(row.login_town) : null,
    loginVillage: row.login_village != null ? String(row.login_village) : null,
    loginMethod: row.login_method != null ? String(row.login_method) : null,
    loginTime:
      loginTime instanceof Date ? loginTime.toISOString() : String(loginTime ?? ""),
    lastActive:
      lastActive instanceof Date ? lastActive.toISOString() : String(lastActive ?? ""),
    isActive: row.is_active === true,
    loggedOutAt:
      loggedOutAt == null
        ? null
        : loggedOutAt instanceof Date
          ? loggedOutAt.toISOString()
          : String(loggedOutAt),
    revokedBy: row.revoked_by != null ? String(row.revoked_by) : null,
    revokeReason: row.revoke_reason != null ? String(row.revoke_reason) : null,
  };
}

export async function getRiderDeviceSessionsForDashboard(
  riderId: number,
  opts?: { activeOnly?: boolean; limit?: number },
): Promise<{ activeCount: number; sessions: DashboardRiderDeviceSession[] }> {
  const sql = getSql();
  const userId = riderUserId(riderId);
  const activeOnly = opts?.activeOnly ?? true;
  const limit = opts?.limit ?? 30;

  try {
    const rows = activeOnly
      ? await sql`
          SELECT *
          FROM user_device_sessions
          WHERE (user_id = ${userId} OR rider_id = ${riderId}) AND is_active = TRUE
          ORDER BY last_active DESC, login_time DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT *
          FROM user_device_sessions
          WHERE user_id = ${userId} OR rider_id = ${riderId}
          ORDER BY last_active DESC, login_time DESC
          LIMIT ${limit}
        `;

    const sessions = (rows as Record<string, unknown>[]).map(mapRow);

    const countRows = await sql`
      SELECT COUNT(*)::int AS c
      FROM user_device_sessions
      WHERE (user_id = ${userId} OR rider_id = ${riderId}) AND is_active = TRUE
    `;
    const activeCount = Number((countRows[0] as { c?: number })?.c ?? 0);

    return { activeCount, sessions };
  } catch {
    return { activeCount: 0, sessions: [] };
  }
}

export async function revokeRiderDeviceSessionsFromDashboard(args: {
  riderId: number;
  sessionIds?: number[];
  revokeAll?: boolean;
  adminSystemUserId: number;
  reason?: string | null;
}): Promise<number> {
  const sql = getSql();
  const userId = riderUserId(args.riderId);
  const revokedBy = `admin:${args.adminSystemUserId}`;
  const revokeReason = args.reason?.trim() || "admin_force_logout";

  if (args.revokeAll) {
    const rows = await sql`
      UPDATE user_device_sessions
      SET
        is_active = FALSE,
        last_active = now(),
        logged_out_at = now(),
        revoked_by = ${revokedBy},
        revoke_reason = ${revokeReason}
      WHERE (user_id = ${userId} OR rider_id = ${args.riderId}) AND is_active = TRUE
      RETURNING id
    `;
    return Array.isArray(rows) ? rows.length : 0;
  }

  const sessionIds = (args.sessionIds ?? []).filter((id) => Number.isFinite(id) && id > 0);
  if (sessionIds.length === 0) return 0;

  const rows = await sql`
    UPDATE user_device_sessions
    SET
      is_active = FALSE,
      last_active = now(),
      logged_out_at = now(),
      revoked_by = ${revokedBy},
      revoke_reason = ${revokeReason}
    WHERE (user_id = ${userId} OR rider_id = ${args.riderId})
      AND id IN ${sql(sessionIds)}
      AND is_active = TRUE
    RETURNING id
  `;
  return Array.isArray(rows) ? rows.length : 0;
}

export async function countActiveRiderDeviceSessionsForDashboard(riderId: number): Promise<number> {
  const sql = getSql();
  const userId = riderUserId(riderId);
  try {
    const rows = await sql`
      SELECT COUNT(*)::int AS c
      FROM user_device_sessions
      WHERE (user_id = ${userId} OR rider_id = ${riderId}) AND is_active = TRUE
    `;
    return Number((rows[0] as { c?: number })?.c ?? 0);
  } catch {
    return 0;
  }
}
