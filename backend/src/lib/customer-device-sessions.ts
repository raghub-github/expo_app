/**
 * Customer device sessions — persist login device + location so the app can
 * show "where am I logged in" and revoke sessions on logout-all.
 */

import type { getSql } from "../db/client.js";
import { markDeviceSessionActive, writeDeviceSessionCache } from "./device-session-cache.js";

type Sql = ReturnType<typeof getSql>;

export type CustomerDeviceCapture = {
  deviceType?: string | null;
  deviceName?: string | null;
  deviceModel?: string | null;
  os?: string | null;
  osVersion?: string | null;
  appVersion?: string | null;
  userAgent?: string | null;
};

export type CustomerLoginGeo = {
  location?: string | null;
  loginState?: string | null;
  loginDistrict?: string | null;
  loginTown?: string | null;
  loginVillage?: string | null;
};

export type CustomerDeviceSessionRow = {
  id: number;
  userId: string;
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
};

function mapRow(row: Record<string, unknown>): CustomerDeviceSessionRow {
  const loginTime = row.login_time ?? row.loginTime;
  const lastActive = row.last_active ?? row.lastActive;
  return {
    id: Number(row.id),
    userId: String(row.user_id ?? row.userId ?? ""),
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
    loginTime: loginTime instanceof Date ? loginTime.toISOString() : String(loginTime ?? ""),
    lastActive: lastActive instanceof Date ? lastActive.toISOString() : String(lastActive ?? ""),
    isActive: row.is_active === true || row.isActive === true,
  };
}

function sanitizeCapture(device?: CustomerDeviceCapture | null) {
  const deviceType = (device?.deviceType ?? "mobile").toString().trim().slice(0, 40) || "mobile";
  const deviceName =
    (device?.deviceName ?? device?.deviceModel ?? "Mobile device").toString().trim().slice(0, 120) ||
    "Mobile device";
  const deviceModel = device?.deviceModel?.toString().trim().slice(0, 120) || null;
  const os = (device?.os ?? "Android").toString().trim().slice(0, 40) || "Android";
  const osVersion = device?.osVersion?.toString().trim().slice(0, 40) || null;
  const appVersion = device?.appVersion?.toString().trim().slice(0, 40) || null;
  const userAgent = device?.userAgent?.toString().trim().slice(0, 240) || null;
  return { deviceType, deviceName, deviceModel, os, osVersion, appVersion, userAgent };
}

/** Upsert an active customer_app device session (OTP / exchange login). */
export async function persistCustomerDeviceSession(
  sql: Sql,
  args: {
    userId: string;
    deviceId: string;
    loginMethod: string;
    ip: string | null;
    geo?: CustomerLoginGeo | null;
    device?: CustomerDeviceCapture | null;
  }
): Promise<void> {
  const deviceId = args.deviceId.trim();
  if (!deviceId) return;
  const cap = sanitizeCapture(args.device);
  const location = args.geo?.location?.trim() || null;
  const loginState = args.geo?.loginState?.trim() || null;
  const loginDistrict = args.geo?.loginDistrict?.trim() || null;
  const loginTown = args.geo?.loginTown?.trim() || null;
  const loginVillage = args.geo?.loginVillage?.trim() || null;

  const updated = await sql`
    UPDATE user_device_sessions
    SET
      is_active = TRUE,
      last_active = now(),
      logged_out_at = NULL,
      revoked_by = NULL,
      revoke_reason = NULL,
      device_type = ${cap.deviceType},
      device_name = ${cap.deviceName},
      device_model = ${cap.deviceModel},
      os = ${cap.os},
      os_version = ${cap.osVersion},
      app_version = ${cap.appVersion},
      ip_address = ${args.ip},
      location = COALESCE(${location}, location),
      login_state = COALESCE(${loginState}, login_state),
      login_district = COALESCE(${loginDistrict}, login_district),
      login_town = COALESCE(${loginTown}, login_town),
      login_village = COALESCE(${loginVillage}, login_village),
      login_method = ${args.loginMethod},
      app_source = 'customer_app',
      user_agent = ${cap.userAgent}
    WHERE user_id = ${args.userId} AND device_id = ${deviceId}
    RETURNING id
  `;
  if (Array.isArray(updated) && updated.length > 0) {
    markDeviceSessionActive(args.userId, deviceId);
    return;
  }

  await sql`
    INSERT INTO user_device_sessions (
      user_id,
      device_id,
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
      app_source,
      user_agent,
      is_active
    )
    VALUES (
      ${args.userId},
      ${deviceId},
      ${cap.deviceType},
      ${cap.deviceName},
      ${cap.deviceModel},
      ${cap.os},
      ${cap.osVersion},
      ${cap.appVersion},
      ${args.ip},
      ${location},
      ${loginState},
      ${loginDistrict},
      ${loginTown},
      ${loginVillage},
      ${args.loginMethod},
      'customer_app',
      ${cap.userAgent},
      TRUE
    )
  `;
  markDeviceSessionActive(args.userId, deviceId);
}

export async function listCustomerDeviceSessions(
  sql: Sql,
  args: { userId: string; activeOnly?: boolean; limit?: number }
): Promise<CustomerDeviceSessionRow[]> {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
  const rows = args.activeOnly === false
    ? await sql`
        SELECT *
        FROM user_device_sessions
        WHERE user_id = ${args.userId}
          AND (app_source = 'customer_app' OR app_source IS NULL)
        ORDER BY last_active DESC NULLS LAST, id DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT *
        FROM user_device_sessions
        WHERE user_id = ${args.userId}
          AND is_active = TRUE
          AND (app_source = 'customer_app' OR app_source IS NULL)
        ORDER BY last_active DESC NULLS LAST, id DESC
        LIMIT ${limit}
      `;
  return (rows as Record<string, unknown>[]).map(mapRow);
}

export async function revokeAllCustomerDeviceSessions(
  sql: Sql,
  args: {
    userId: string;
    exceptDeviceId?: string | null;
    revokedBy: string;
    revokeReason: string;
  }
): Promise<number> {
  const except = args.exceptDeviceId?.trim() || null;
  const rows = except
    ? await sql`
        UPDATE user_device_sessions
        SET
          is_active = FALSE,
          logged_out_at = now(),
          revoked_by = ${args.revokedBy},
          revoke_reason = ${args.revokeReason}
        WHERE user_id = ${args.userId}
          AND is_active = TRUE
          AND device_id IS DISTINCT FROM ${except}
        RETURNING device_id
      `
    : await sql`
        UPDATE user_device_sessions
        SET
          is_active = FALSE,
          logged_out_at = now(),
          revoked_by = ${args.revokedBy},
          revoke_reason = ${args.revokeReason}
        WHERE user_id = ${args.userId}
          AND is_active = TRUE
        RETURNING device_id
      `;
  for (const row of rows as { device_id?: string | null }[]) {
    if (row.device_id) writeDeviceSessionCache(args.userId, row.device_id, false);
  }
  return Array.isArray(rows) ? rows.length : 0;
}

export async function revokeCustomerDeviceSession(
  sql: Sql,
  args: {
    userId: string;
    deviceId: string;
    revokedBy: string;
    revokeReason: string;
  }
): Promise<boolean> {
  const deviceId = args.deviceId.trim();
  if (!deviceId) return false;
  const rows = await sql`
    UPDATE user_device_sessions
    SET
      is_active = FALSE,
      logged_out_at = now(),
      revoked_by = ${args.revokedBy},
      revoke_reason = ${args.revokeReason}
    WHERE user_id = ${args.userId}
      AND device_id = ${deviceId}
      AND is_active = TRUE
    RETURNING id
  `;
  if (Array.isArray(rows) && rows.length > 0) {
    writeDeviceSessionCache(args.userId, deviceId, false);
    return true;
  }
  return false;
}
