/**
 * Attach per-rider assignment status from order_rider_assignments (+ ride unassign audit).
 */

import { getSql } from "@/lib/db/client";
import type { RiderRecentOrderRow } from "@/lib/riders/rider-orders-query";

export async function enrichRiderOrdersWithAssignmentStatus(
  riderId: number,
  orders: RiderRecentOrderRow[]
): Promise<RiderRecentOrderRow[]> {
  if (orders.length === 0) return orders;

  const orderIds = orders.map((o) => o.id).filter((id) => Number.isFinite(id) && id > 0);
  if (orderIds.length === 0) return orders;

  const sql = getSql();
  const rows = (await sql`
    SELECT
      c.id AS order_core_id,
      (
        SELECT ora.assignment_status::text
        FROM order_rider_assignments ora
        WHERE ora.order_core_id = c.id
          AND ora.rider_id = ${riderId}
        ORDER BY ora.updated_at DESC NULLS LAST, ora.id DESC
        LIMIT 1
      ) AS rider_assignment_status,
      (
        SELECT ora.rider_earning::text
        FROM order_rider_assignments ora
        WHERE ora.order_core_id = c.id
          AND ora.rider_id = ${riderId}
        ORDER BY ora.updated_at DESC NULLS LAST, ora.id DESC
        LIMIT 1
      ) AS rider_assignment_earning,
      (
        SELECT ora.tip_amount::text
        FROM order_rider_assignments ora
        WHERE ora.order_core_id = c.id
          AND ora.rider_id = ${riderId}
        ORDER BY ora.updated_at DESC NULLS LAST, ora.id DESC
        LIMIT 1
      ) AS rider_assignment_tip,
      EXISTS (
        SELECT 1
        FROM order_rider_ride_unassignments uru
        WHERE uru.order_core_id = c.id
          AND uru.rider_id = ${riderId}
      ) AS rider_ride_unassigned
    FROM orders_core c
    WHERE c.id = ANY(${orderIds}::int[])
  `) as Array<{
    order_core_id: number;
    rider_assignment_status: string | null;
    rider_assignment_earning: string | null;
    rider_assignment_tip: string | null;
    rider_ride_unassigned: boolean;
  }>;

  const byOrderId = new Map(
    rows.map((row) => [
      Number(row.order_core_id),
      {
        riderAssignmentStatus: row.rider_assignment_status,
        assignmentRiderEarning: row.rider_assignment_earning,
        assignmentTipAmount: row.rider_assignment_tip,
        riderRideUnassigned: Boolean(row.rider_ride_unassigned),
      },
    ])
  );

  return orders.map((order) => {
    const extra = byOrderId.get(order.id);
    return {
      ...order,
      riderAssignmentStatus: extra?.riderAssignmentStatus ?? null,
      assignmentRiderEarning: extra?.assignmentRiderEarning ?? null,
      assignmentTipAmount: extra?.assignmentTipAmount ?? null,
      riderRideUnassigned: extra?.riderRideUnassigned ?? false,
    };
  });
}
