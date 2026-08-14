/**
 * Server-side eligibility for referral apply / reward credit.
 * Blocked, banned, suspended, or deleted accounts cannot earn or grant rewards.
 */

import { getSql } from "../../db/client.js";
import type { ReferralUserType } from "./referral.config.service.js";

const BLOCKED_CUSTOMER = new Set(["BLOCKED", "SUSPENDED", "DEACTIVATED"]);
const BLOCKED_RIDER = new Set(["BLOCKED", "BANNED"]);

export function isBlockedCustomerStatus(status: string | null | undefined): boolean {
  return BLOCKED_CUSTOMER.has(String(status ?? "").toUpperCase());
}

export function isBlockedRiderStatus(status: string | null | undefined): boolean {
  return BLOCKED_RIDER.has(String(status ?? "").toUpperCase());
}

export async function assertReferralUserEligible(
  userType: ReferralUserType,
  userId: number,
): Promise<{ ok: true } | { ok: false; error: "user_ineligible" }> {
  const sql = getSql();
  if (userType === "customer") {
    const [row] = await sql<Array<{ account_status: string | null; deleted_at: string | null }>>`
      SELECT account_status::text, deleted_at::text
      FROM customers
      WHERE id = ${userId}
      LIMIT 1
    `.catch(() => [] as Array<{ account_status: string | null; deleted_at: string | null }>);
    if (!row) return { ok: false, error: "user_ineligible" };
    if (row.deleted_at || isBlockedCustomerStatus(row.account_status)) {
      return { ok: false, error: "user_ineligible" };
    }
    return { ok: true };
  }
  if (userType === "rider") {
    const [row] = await sql<Array<{ status: string | null }>>`
      SELECT status::text FROM riders WHERE id = ${userId} LIMIT 1
    `.catch(() => [] as Array<{ status: string | null }>);
    if (!row) return { ok: false, error: "user_ineligible" };
    if (isBlockedRiderStatus(row.status)) return { ok: false, error: "user_ineligible" };
    return { ok: true };
  }
  const [row] = await sql<Array<{ id: string }>>`
    SELECT id::text FROM merchant_parents WHERE id = ${userId} LIMIT 1
  `.catch(() => [] as Array<{ id: string }>);
  if (!row) return { ok: false, error: "user_ineligible" };
  return { ok: true };
}

export function expiresAtFromValidityDays(
  validityDays: number | null | undefined,
  expiryEnabled: boolean | undefined,
  now = new Date(),
): Date | null {
  if (expiryEnabled === false) return null;
  const days = Number(validityDays);
  const n = Number.isFinite(days) && days > 0 ? Math.min(3650, Math.floor(days)) : 365;
  return new Date(now.getTime() + n * 24 * 60 * 60 * 1000);
}

export function isReferralExpired(expiresAt: string | Date | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  const t = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(t.getTime())) return false;
  return t.getTime() < now.getTime();
}

export function resolveMerchantWalletStoreId(opts: {
  scope: "ALL_CHILD_STORES" | "SINGLE_STORE" | "SELECTED_STORES";
  triggeringStoreId: number | null;
  selectedStoreIds: number[];
  storeOrderCounts: Record<string, number>;
}): number | null {
  const trigger =
    opts.triggeringStoreId != null && Number.isFinite(opts.triggeringStoreId) && opts.triggeringStoreId > 0
      ? opts.triggeringStoreId
      : null;
  if (opts.scope === "SELECTED_STORES") {
    if (trigger != null && opts.selectedStoreIds.includes(trigger)) return trigger;
    return null;
  }
  if (opts.scope === "SINGLE_STORE") {
    if (trigger != null) return trigger;
    let bestId: number | null = null;
    let best = -1;
    for (const [k, v] of Object.entries(opts.storeOrderCounts)) {
      const id = Number(k);
      const n = Number(v);
      if (Number.isFinite(id) && n > best) {
        best = n;
        bestId = id;
      }
    }
    return bestId;
  }
  return trigger;
}
