import { getSql } from "../client";

export interface OrderRiderAssignmentRecord {
  id: number;
  orderId: number;
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  deliveryProvider: string | null;
  assignmentStatus: string;
  assignedAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  reachedMerchantAt: Date | null;
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

/**
 * List all rider assignments for an order from order_rider_assignments.
 * Assumes orders_core.id == orders.id for the given order.
 */
export async function listOrderRiderAssignmentsForOrder(
  orderId: number
): Promise<OrderRiderAssignmentRecord[]> {
  const sql = getSql();

  const rows = await sql`
    SELECT
      id,
      order_id              AS "orderId",
      rider_id              AS "riderId",
      rider_name            AS "riderName",
      rider_mobile          AS "riderMobile",
      delivery_provider     AS "deliveryProvider",
      assignment_status     AS "assignmentStatus",
      assigned_at           AS "assignedAt",
      accepted_at           AS "acceptedAt",
      rejected_at           AS "rejectedAt",
      reached_merchant_at   AS "reachedMerchantAt",
      picked_up_at          AS "pickedUpAt",
      delivered_at          AS "deliveredAt",
      cancelled_at          AS "cancelledAt",
      cancellation_reason   AS "cancellationReason"
    FROM order_rider_assignments
    WHERE order_id = ${orderId}
    ORDER BY assigned_at NULLS FIRST, created_at DESC
  `;

  return (rows as any[]).map((r) => ({
    ...r,
    assignedAt:
      r.assignedAt instanceof Date ? r.assignedAt : r.assignedAt ? new Date(r.assignedAt) : null,
    acceptedAt:
      r.acceptedAt instanceof Date ? r.acceptedAt : r.acceptedAt ? new Date(r.acceptedAt) : null,
    rejectedAt:
      r.rejectedAt instanceof Date ? r.rejectedAt : r.rejectedAt ? new Date(r.rejectedAt) : null,
    reachedMerchantAt:
      r.reachedMerchantAt instanceof Date
        ? r.reachedMerchantAt
        : r.reachedMerchantAt
          ? new Date(r.reachedMerchantAt)
          : null,
    pickedUpAt:
      r.pickedUpAt instanceof Date ? r.pickedUpAt : r.pickedUpAt ? new Date(r.pickedUpAt) : null,
    deliveredAt:
      r.deliveredAt instanceof Date ? r.deliveredAt : r.deliveredAt ? new Date(r.deliveredAt) : null,
    cancelledAt:
      r.cancelledAt instanceof Date ? r.cancelledAt : r.cancelledAt ? new Date(r.cancelledAt) : null,
  })) as OrderRiderAssignmentRecord[];
}

