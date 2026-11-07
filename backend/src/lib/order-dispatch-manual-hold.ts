/**
 * Admin "Cancel rider only" — block dispatch offers/pool/accept until manual assign.
 */

import { getSql } from "../db/client.js";

export async function isOrderDispatchManualHold(orderCoreId: number): Promise<boolean> {
  const held = await fetchManualHoldCoreIds([orderCoreId]);
  return held.has(orderCoreId);
}

/**
 * Batch variant for dispatch pool polls — one query instead of N round-trips.
 * Returns the subset of ids that are currently on a manual dispatch hold.
 */
export async function fetchManualHoldCoreIds(orderCoreIds: number[]): Promise<Set<number>> {
  const out = new Set<number>();
  const ids = [...new Set(orderCoreIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return out;
  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT id
      FROM orders_core
      WHERE id = ANY(${ids}::bigint[])
        AND dispatch_manual_hold IS TRUE
        AND rider_id IS NULL
        AND cancelled_at IS NULL
    `) as Array<{ id: number | string }>;
    for (const row of rows) {
      const id = Number(row.id);
      if (Number.isFinite(id) && id > 0) out.add(id);
    }
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "42703") return out;
    throw err;
  }
  return out;
}

export async function setOrderDispatchManualHold(
  orderCoreId: number,
  held: boolean
): Promise<void> {
  const sql = getSql();
  try {
    await sql`
      UPDATE orders_core
      SET dispatch_manual_hold = ${held}, updated_at = NOW()
      WHERE id = ${orderCoreId}
    `;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "42703") {
      console.warn(
        "[setOrderDispatchManualHold] dispatch_manual_hold column missing — run migration 0326"
      );
      return;
    }
    throw err;
  }
}
