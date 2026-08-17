/**
 * Per-order rider dispatch exclusions — reject / cancel / admin unassign.
 */

import { getSql } from "../db/client.js";

export type RiderDispatchExclusionSource =
  | "rider_reject"
  | "rider_cancel_assigned"
  | "admin_unassign"
  | "admin_reject"
  | "system_removed";

export type RecordRiderDispatchExclusionInput = {
  orderCoreId: number;
  orderId: string;
  riderId: number;
  exclusionSource: RiderDispatchExclusionSource;
  reasonCode?: string | null;
  reasonText?: string | null;
  actorType?: string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordRiderDispatchExclusion(
  input: RecordRiderDispatchExclusionInput
): Promise<void> {
  const sql = getSql();
  const orderId = input.orderId.trim();
  if (!orderId || !Number.isFinite(input.orderCoreId) || !Number.isFinite(input.riderId)) return;

  await sql`
    INSERT INTO order_rider_dispatch_exclusions (
      order_core_id,
      order_id,
      rider_id,
      exclusion_source,
      reason_code,
      reason_text,
      actor_type,
      actor_id,
      metadata,
      created_at
    )
    VALUES (
      ${input.orderCoreId},
      ${orderId},
      ${input.riderId},
      ${input.exclusionSource},
      ${input.reasonCode?.trim() || null},
      ${input.reasonText?.trim() || null},
      ${input.actorType ?? null},
      ${input.actorId ?? null},
      ${JSON.stringify(input.metadata ?? {})}::text::jsonb,
      now()
    )
    ON CONFLICT (order_core_id, rider_id) DO UPDATE SET
      exclusion_source = EXCLUDED.exclusion_source,
      reason_code = COALESCE(EXCLUDED.reason_code, order_rider_dispatch_exclusions.reason_code),
      reason_text = COALESCE(EXCLUDED.reason_text, order_rider_dispatch_exclusions.reason_text),
      actor_type = COALESCE(EXCLUDED.actor_type, order_rider_dispatch_exclusions.actor_type),
      actor_id = COALESCE(EXCLUDED.actor_id, order_rider_dispatch_exclusions.actor_id),
      metadata = order_rider_dispatch_exclusions.metadata || EXCLUDED.metadata
  `;
}

export async function fetchExcludedOrderCoreIdsForRider(
  riderId: number,
  orderCoreIds: number[]
): Promise<Set<number>> {
  if (!orderCoreIds.length) return new Set();
  const sql = getSql();
  const rows = (await sql`
    SELECT order_core_id
    FROM order_rider_dispatch_exclusions
    WHERE rider_id = ${riderId}
      AND order_core_id = ANY(${orderCoreIds}::bigint[])
  `) as Array<{ order_core_id: number }>;
  return new Set(rows.map((r) => Number(r.order_core_id)));
}

export async function fetchExcludedRiderIdsForOrder(orderCoreId: number): Promise<Set<number>> {
  if (!Number.isFinite(orderCoreId)) return new Set();
  const sql = getSql();
  const rows = (await sql`
    SELECT rider_id
    FROM order_rider_dispatch_exclusions
    WHERE order_core_id = ${orderCoreId}
  `) as Array<{ rider_id: number }>;
  return new Set(rows.map((r) => Number(r.rider_id)).filter((id) => id > 0));
}

export async function isRiderExcludedFromOrderDispatch(
  riderId: number,
  orderCoreId: number
): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    SELECT 1 AS ok
    FROM order_rider_dispatch_exclusions
    WHERE rider_id = ${riderId} AND order_core_id = ${orderCoreId}
    LIMIT 1
  `) as Array<{ ok: number }>;
  return rows.length > 0;
}
