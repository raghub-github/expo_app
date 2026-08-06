/**
 * Aggregate per-item refunded amounts.
 * Prefers durable order_refund_items; falls back to refund_metadata.refundItems.
 */

import { getSql } from "@/lib/db/client";

export type ItemRefundTotalRow = {
  itemId: number;
  alreadyRefunded: number;
};

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sum refunded amounts per order item id across non-failed refunds.
 */
export async function getOrderItemRefundTotals(
  orderId: number
): Promise<Map<number, number>> {
  const sql = getSql();
  const byId = new Map<number, number>();

  try {
    const rows = await sql<Array<{ order_item_id: number; total: string | number }>>`
      SELECT ori.order_item_id, SUM(ori.refund_amount) AS total
      FROM order_refund_items ori
      JOIN order_refunds r ON r.id = ori.order_refund_id
      WHERE ori.order_id = ${orderId}
        AND LOWER(COALESCE(r.refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
        AND UPPER(COALESCE(r.execution_status, '')) <> 'FAILED'
      GROUP BY ori.order_item_id
    `;
    for (const row of rows) {
      const id = toNum(row.order_item_id);
      const amount = toNum(row.total);
      if (id > 0 && amount > 0) byId.set(id, amount);
    }
    if (byId.size > 0) return byId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/order_refund_items|42P01|42703/i.test(msg)) throw e;
  }

  // Legacy fallback — JSON metadata only.
  const rows = await sql<
    Array<{ refund_metadata: unknown; refund_amount: string | number }>
  >`
    SELECT refund_metadata, refund_amount
    FROM order_refunds
    WHERE order_id = ${orderId}
      AND LOWER(COALESCE(refund_status, '')) NOT IN ('failed', 'cancelled', 'rejected')
      AND UPPER(COALESCE(execution_status, '')) <> 'FAILED'
  `;

  for (const row of rows) {
    const meta =
      row.refund_metadata && typeof row.refund_metadata === "object"
        ? (row.refund_metadata as Record<string, unknown>)
        : null;
    const items = meta?.refundItems;
    if (!Array.isArray(items) || items.length === 0) continue;

    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const id = toNum(item.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const amount = toNum(item.amount);
      if (amount <= 0) continue;
      byId.set(id, (byId.get(id) ?? 0) + amount);
    }
  }

  return byId;
}

export {
  itemRefundBalances,
  ITEM_REFUND_MONEY_EPS,
} from "@/lib/orders/item-refund-balances";
