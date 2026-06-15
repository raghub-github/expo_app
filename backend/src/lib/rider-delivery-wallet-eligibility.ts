import type { Sql } from "postgres";
import { getSql } from "../db/client.js";
import { isRideFarePaymentPending } from "./ride-rider-payout-snapshot.js";

/** Rider wallet credit is only for completed deliveries — never admin/rider unassign. */
export async function isRiderEligibleForDeliveryWalletCredit(
  ordersCoreId: number,
  riderId: number,
  sql: Sql = getSql()
): Promise<{ eligible: true } | { eligible: false; error: string }> {
  if (!Number.isFinite(ordersCoreId) || ordersCoreId <= 0 || !Number.isFinite(riderId) || riderId <= 0) {
    return { eligible: false, error: "invalid_input" };
  }

  const rows = await sql`
    SELECT
      c.status,
      c.rider_id,
      c.order_type,
      c.payment_status,
      r.admin_rider_payment_cleared_at,
      EXISTS (
        SELECT 1
        FROM order_rider_assignments ora
        WHERE (ora.order_core_id = c.id OR ora.order_id = c.id)
          AND ora.rider_id = ${riderId}
          AND ora.assignment_status = 'completed'
          AND ora.delivered_at IS NOT NULL
      ) AS has_completed_delivery,
      EXISTS (
        SELECT 1
        FROM order_rider_assignments ora
        WHERE (ora.order_core_id = c.id OR ora.order_id = c.id)
          AND ora.rider_id = ${riderId}
          AND ora.assignment_status IN ('cancelled', 'unassigned', 'rejected')
          AND ora.delivered_at IS NULL
      ) AS has_cancelled_without_delivery
    FROM orders_core c
    LEFT JOIN orders_ride r ON r.order_id = c.id
    WHERE c.id = ${ordersCoreId}
    LIMIT 1
  `;

  const row = rows[0] as {
    status?: string | null;
    rider_id?: number | null;
    order_type?: string | null;
    payment_status?: string | null;
    admin_rider_payment_cleared_at?: string | Date | null;
    has_completed_delivery?: boolean;
    has_cancelled_without_delivery?: boolean;
  } | undefined;

  if (!row) return { eligible: false, error: "order_not_found" };
  if (String(row.status ?? "").toLowerCase() !== "delivered") {
    return { eligible: false, error: "not_delivered" };
  }

  if (String(row.order_type ?? "").trim() === "person_ride") {
    const adminCleared =
      row.admin_rider_payment_cleared_at != null &&
      String(row.admin_rider_payment_cleared_at).trim().length > 0;
    if (!adminCleared && isRideFarePaymentPending(row.payment_status)) {
      return { eligible: false, error: "ride_payment_pending" };
    }
  }

  if (row.has_completed_delivery) {
    return { eligible: true };
  }

  if (row.has_cancelled_without_delivery) {
    return { eligible: false, error: "rider_unassigned" };
  }

  const coreRiderId = row.rider_id != null ? Number(row.rider_id) : null;
  if (coreRiderId != null && coreRiderId === riderId) {
    return { eligible: true };
  }

  return { eligible: false, error: "assignment_not_completed" };
}

/**
 * Admin/rider unassign — no wallet credit today.
 * Penalty will run via financial rules when configured.
 */
export async function applyRiderUnassignWalletPolicy(_input: {
  orderCorePk: number;
  orderIdText: string;
  riderId: number;
  actorType?: string;
  reasonCode?: string;
}): Promise<void> {
  /* Intentionally no-op until penalty rules are configured. */
}
