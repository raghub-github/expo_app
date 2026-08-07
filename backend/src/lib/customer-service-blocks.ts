/**
 * Customer per-service blocks — read active blocks and enforce on order placement.
 */

import { getSql } from "../db/client.js";

export type CustomerServiceType =
  | "food"
  | "parcel"
  | "person_ride"
  | "ecommerce"
  | "vouchers"
  | "near_me";

export type ActiveCustomerServiceBlock = {
  serviceType: CustomerServiceType;
  reason: string;
  blockedAt: string;
};

export async function listActiveCustomerServiceBlocksForCustomer(
  customerInternalId: number
): Promise<ActiveCustomerServiceBlock[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT service_type::text AS service_type, reason, created_at::text AS blocked_at
    FROM customer_service_blocks
    WHERE customer_id = ${customerInternalId}
      AND is_active = TRUE
    ORDER BY created_at DESC
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    serviceType: String(r.service_type) as CustomerServiceType,
    reason: String(r.reason ?? ""),
    blockedAt: String(r.blocked_at ?? ""),
  }));
}

export async function assertCustomerServiceNotBlocked(
  customerInternalId: number,
  serviceType: CustomerServiceType
): Promise<{ blocked: false } | { blocked: true; reason: string }> {
  const sql = getSql();
  const rows = await sql`
    SELECT reason
    FROM customer_service_blocks
    WHERE customer_id = ${customerInternalId}
      AND service_type = ${serviceType}::customer_service_type
      AND is_active = TRUE
    LIMIT 1
  `;
  const row = (rows as { reason?: string }[])[0];
  if (!row?.reason) return { blocked: false };
  return { blocked: true, reason: String(row.reason) };
}

export const CUSTOMER_SERVICE_BLOCKED_CODE = "CUSTOMER_SERVICE_BLOCKED" as const;

export function customerServiceBlockedError(reason: string) {
  return {
    error: CUSTOMER_SERVICE_BLOCKED_CODE,
    code: CUSTOMER_SERVICE_BLOCKED_CODE,
    message: reason.trim() || "This service is temporarily unavailable for your account.",
  };
}
