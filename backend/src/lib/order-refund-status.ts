import type { Sql } from "postgres";

/** Latest cancellation refund_status per orders_core.id (for customer history UI). */
export async function loadOrderRefundStatusByCorePks(
  sql: Sql,
  corePks: number[]
): Promise<Map<number, string | null>> {
  const out = new Map<number, string | null>();
  if (corePks.length === 0) return out;

  try {
    const rows = await sql<{ order_id: number; refund_status: string | null }[]>`
      SELECT DISTINCT ON (order_id) order_id, refund_status
      FROM order_cancellation_reasons
      WHERE order_id IN ${sql(corePks)}
      ORDER BY order_id, created_at DESC
    `;
    for (const row of rows) {
      const pk = Number(row.order_id);
      if (Number.isFinite(pk)) {
        out.set(pk, row.refund_status?.trim() || null);
      }
    }
  } catch {
    /* table may be absent on older DBs */
  }

  return out;
}
