import { getSql } from "@/lib/db/client";

/** Rider wallet credit is only for completed deliveries — never admin/rider unassign. */
export async function isRiderEligibleForDeliveryWalletCredit(
  ordersCoreId: number,
  riderId: number
): Promise<{ eligible: true } | { eligible: false; error: string }> {
  if (!Number.isFinite(ordersCoreId) || ordersCoreId <= 0 || !Number.isFinite(riderId) || riderId <= 0) {
    return { eligible: false, error: "invalid_input" };
  }

  const sql = getSql();
  const rows = await sql`
    SELECT
      c.status,
      c.rider_id,
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
    WHERE c.id = ${ordersCoreId}
    LIMIT 1
  `;

  const row = (rows as Array<{
    status?: string | null;
    rider_id?: number | null;
    has_completed_delivery?: boolean;
    has_cancelled_without_delivery?: boolean;
  }>)[0];

  if (!row) return { eligible: false, error: "order_not_found" };
  if (String(row.status ?? "").toLowerCase() !== "delivered") {
    return { eligible: false, error: "not_delivered" };
  }

  if (row.has_completed_delivery) return { eligible: true };
  if (row.has_cancelled_without_delivery) return { eligible: false, error: "rider_unassigned" };

  const coreRiderId = row.rider_id != null ? Number(row.rider_id) : null;
  if (coreRiderId != null && coreRiderId === riderId) return { eligible: true };

  return { eligible: false, error: "assignment_not_completed" };
}

/** Resolve rider who completed delivery — excludes cancelled/unassigned assignments. */
export async function resolveDeliveredRiderIdForWalletCredit(
  ordersCoreId: number
): Promise<number | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      c.rider_id AS "coreRiderId",
      (
        SELECT ora.rider_id
        FROM order_rider_assignments ora
        WHERE (ora.order_core_id = c.id OR ora.order_id = c.id)
          AND ora.rider_id IS NOT NULL
          AND ora.assignment_status = 'completed'
          AND ora.delivered_at IS NOT NULL
        ORDER BY ora.delivered_at DESC NULLS LAST, ora.updated_at DESC NULLS LAST
        LIMIT 1
      ) AS "completedAssignmentRiderId"
    FROM orders_core c
    WHERE c.id = ${ordersCoreId}
    LIMIT 1
  `;

  const row = (rows as Array<{
    coreRiderId?: number | null;
    completedAssignmentRiderId?: number | null;
  }>)[0];

  if (!row) return null;

  const coreRiderId = Number(row.coreRiderId);
  if (Number.isFinite(coreRiderId) && coreRiderId > 0) return coreRiderId;

  const assignmentRiderId = Number(row.completedAssignmentRiderId);
  if (Number.isFinite(assignmentRiderId) && assignmentRiderId > 0) return assignmentRiderId;

  return null;
}
