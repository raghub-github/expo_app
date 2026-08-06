/**
 * Durable order_refund_items rows + helpers to allocate partial cancel refunds.
 */
import { getSql } from "../client";

export type OrderRefundItemInput = {
  orderItemId: number;
  itemName: string;
  refundAmount: number;
  refundPercentage?: number | null;
  originalTotal?: number | null;
  selectedQuantity?: number | null;
};

export type OrderRefundItemRow = {
  orderRefundId: number;
  orderItemId: number;
  itemName: string;
  refundAmount: number;
  refundPercentage: number | null;
  originalTotal: number | null;
  selectedQuantity: number | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function insertOrderRefundItems(
  orderRefundId: number,
  orderId: number,
  items: OrderRefundItemInput[]
): Promise<void> {
  if (!items.length) return;
  const sql = getSql();
  for (const item of items) {
    const amount = round2(item.refundAmount);
    if (!(amount > 0) || !(item.orderItemId > 0)) continue;
    await sql`
      INSERT INTO order_refund_items (
        order_refund_id, order_id, order_item_id, item_name,
        refund_amount, refund_percentage, original_total, selected_quantity
      ) VALUES (
        ${orderRefundId},
        ${orderId},
        ${item.orderItemId},
        ${item.itemName?.trim() || `Item #${item.orderItemId}`},
        ${amount},
        ${item.refundPercentage ?? null},
        ${item.originalTotal ?? null},
        ${item.selectedQuantity ?? null}
      )
    `;
  }
}

export async function listRefundItemsByRefundIds(
  refundIds: number[]
): Promise<Map<number, OrderRefundItemRow[]>> {
  const out = new Map<number, OrderRefundItemRow[]>();
  if (refundIds.length === 0) return out;
  const sql = getSql();
  try {
    const rows = await sql<
      Array<{
        order_refund_id: number;
        order_item_id: number;
        item_name: string;
        refund_amount: string | number;
        refund_percentage: string | number | null;
        original_total: string | number | null;
        selected_quantity: string | number | null;
      }>
    >`
      SELECT
        order_refund_id,
        order_item_id,
        item_name,
        refund_amount,
        refund_percentage,
        original_total,
        selected_quantity
      FROM order_refund_items
      WHERE order_refund_id = ANY(${refundIds})
      ORDER BY id ASC
    `;
    for (const r of rows) {
      const refundId = Number(r.order_refund_id);
      const list = out.get(refundId) ?? [];
      list.push({
        orderRefundId: refundId,
        orderItemId: Number(r.order_item_id),
        itemName: String(r.item_name ?? ""),
        refundAmount: Number(r.refund_amount),
        refundPercentage:
          r.refund_percentage != null && Number.isFinite(Number(r.refund_percentage))
            ? Number(r.refund_percentage)
            : null,
        originalTotal:
          r.original_total != null && Number.isFinite(Number(r.original_total))
            ? Number(r.original_total)
            : null,
        selectedQuantity:
          r.selected_quantity != null && Number.isFinite(Number(r.selected_quantity))
            ? Number(r.selected_quantity)
            : null,
      });
      out.set(refundId, list);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/order_refund_items|42P01|42703/i.test(msg)) throw e;
  }
  return out;
}

/**
 * Load food lines for proportional attribution of order-level partial cancel refunds.
 */
export async function loadOrderItemWeightsForRefund(orderId: number): Promise<
  Array<{ orderItemId: number; itemName: string; lineWeight: number }>
> {
  const sql = getSql();
  const rows = await sql<
    Array<{ item_id: string | number; item_name: string; line_weight: string | number }>
  >`
    SELECT
      oci.id AS item_id,
      COALESCE(NULLIF(BTRIM(oci.item_name), ''), 'Item') AS item_name,
      GREATEST(
        COALESCE(oci.effective_line_total, oci.total_price, 0)::numeric,
        0.01
      ) AS line_weight
    FROM orders_core oc
    JOIN orders_core_items oci ON oci.order_id = oc.order_id
    WHERE oc.id = ${orderId}
    ORDER BY oci.id ASC
  `;
  return rows.map((r) => ({
    orderItemId: Number(r.item_id),
    itemName: String(r.item_name ?? "Item"),
    lineWeight: Number(r.line_weight),
  }));
}

/** Allocate a partial cancel refund across items by CTC/line weight. */
export function allocatePartialCancelAcrossItems(args: {
  refundAmount: number;
  refundPercentage: number | null;
  ctcTotal: number | null;
  lines: Array<{ orderItemId: number; itemName: string; lineWeight: number }>;
}): OrderRefundItemInput[] {
  const { lines } = args;
  if (!lines.length) return [];
  const pct =
    args.refundPercentage != null &&
    Number.isFinite(args.refundPercentage) &&
    args.refundPercentage > 0 &&
    args.refundPercentage < 100
      ? args.refundPercentage
      : null;
  const weightSum = lines.reduce((s, l) => s + Math.max(0, l.lineWeight), 0);
  const out: OrderRefundItemInput[] = [];
  for (const line of lines) {
    let amount = 0;
    if (pct != null) {
      amount = line.lineWeight * (pct / 100);
    } else if (args.ctcTotal != null && args.ctcTotal > 0) {
      amount = args.refundAmount * (line.lineWeight / args.ctcTotal);
    } else if (weightSum > 0) {
      amount = args.refundAmount * (line.lineWeight / weightSum);
    } else {
      amount = args.refundAmount / lines.length;
    }
    amount = round2(amount);
    if (amount <= 0) continue;
    out.push({
      orderItemId: line.orderItemId,
      itemName: line.itemName,
      refundAmount: amount,
      refundPercentage: pct,
      originalTotal: round2(line.lineWeight),
    });
  }
  return out;
}

export function parseRefundItemsFromMetadata(
  meta: Record<string, unknown> | null | undefined
): OrderRefundItemInput[] {
  const raw = meta && Array.isArray(meta.refundItems) ? meta.refundItems : [];
  const out: OrderRefundItemInput[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const orderItemId = Number(row.id);
    const refundAmount = Number(row.amount);
    if (!Number.isFinite(orderItemId) || orderItemId <= 0) continue;
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) continue;
    out.push({
      orderItemId,
      itemName: String(row.name ?? row.itemName ?? "").trim() || `Item #${orderItemId}`,
      refundAmount: round2(refundAmount),
      refundPercentage:
        row.refundPercentage != null && Number.isFinite(Number(row.refundPercentage))
          ? Number(row.refundPercentage)
          : null,
      originalTotal:
        row.originalTotal != null && Number.isFinite(Number(row.originalTotal))
          ? Number(row.originalTotal)
          : null,
      selectedQuantity:
        row.selectedQuantity != null && Number.isFinite(Number(row.selectedQuantity))
          ? Number(row.selectedQuantity)
          : null,
    });
  }
  return out;
}
