/**
 * Staff invite sessions share the owner parent_merchant_id as JWT `sub`.
 * Tag device rows as `staff:<id>` so removing a staff member can revoke their devices,
 * and auth can reject JWTs whose store_staff row was deleted.
 */

import { writeDeviceSessionCache } from "./device-session-cache.js";

type StaffActiveCacheEntry = { active: boolean; checkedAt: number };

const staffActiveCache = new Map<number, StaffActiveCacheEntry>();
const STAFF_ACTIVE_CACHE_MS = 30_000;

export function staffLoginMethodTag(staffId: number): string {
  return `staff:${staffId}`;
}

export function invalidateMerchantStaffActiveCache(staffId?: number | null): void {
  if (staffId != null && Number.isFinite(staffId) && staffId > 0) {
    staffActiveCache.delete(staffId);
    return;
  }
  staffActiveCache.clear();
}

export function readMerchantStaffActiveCache(
  staffId: number,
  maxAgeMs = STAFF_ACTIVE_CACHE_MS
): boolean | null {
  const cached = staffActiveCache.get(staffId);
  if (!cached || Date.now() - cached.checkedAt > maxAgeMs) return null;
  return cached.active;
}

export function writeMerchantStaffActiveCache(staffId: number, active: boolean): void {
  staffActiveCache.set(staffId, { active, checkedAt: Date.now() });
}

type SqlTag = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
};

/**
 * Hard-delete device sessions tagged for this staff invite and clear caches so
 * the removed user is kicked on the next authenticated request.
 */
export async function revokeMerchantStaffDeviceSessions(
  sql: SqlTag,
  args: { parentMerchantId: string; staffId: number }
): Promise<number> {
  const { parentMerchantId, staffId } = args;
  const tag = staffLoginMethodTag(staffId);
  invalidateMerchantStaffActiveCache(staffId);
  writeMerchantStaffActiveCache(staffId, false);

  const revoked = (await sql`
    DELETE FROM user_device_sessions
    WHERE user_id = ${parentMerchantId}
      AND login_method = ${tag}
    RETURNING device_id
  `) as { device_id?: string | null }[];

  const rows = Array.isArray(revoked) ? revoked : [];
  for (const row of rows) {
    const deviceId = row.device_id != null ? String(row.device_id).trim() : "";
    if (!deviceId) continue;
    writeDeviceSessionCache(parentMerchantId, deviceId, false);
    try {
      await sql`
        UPDATE merchant_sessions
        SET is_active = FALSE, logged_out_at = now(), updated_at = now()
        WHERE device_id = ${deviceId} AND is_active = TRUE
      `;
    } catch {
      /* merchant_sessions may not exist in this env */
    }
  }
  return rows.length;
}
