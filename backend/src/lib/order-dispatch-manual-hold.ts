/**
 * Admin "Cancel rider only" — block dispatch offers/pool/accept until manual assign.
 */

import { getSql } from "../db/client.js";

export async function isOrderDispatchManualHold(orderCoreId: number): Promise<boolean> {
  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT dispatch_manual_hold, rider_id, cancelled_at
      FROM orders_core
      WHERE id = ${orderCoreId}
      LIMIT 1
    `) as Array<{
      dispatch_manual_hold: boolean | null;
      rider_id: number | null;
      cancelled_at: Date | string | null;
    }>;
    const row = rows[0];
    if (!row?.dispatch_manual_hold) return false;
    if (row.rider_id != null) return false;
    if (row.cancelled_at != null) return false;
    return true;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "42703") return false;
    throw err;
  }
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
