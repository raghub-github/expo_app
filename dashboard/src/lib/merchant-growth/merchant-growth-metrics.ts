import type { Sql } from "postgres";

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/** Sum ORDER_EARNING wallet credits (IST calendar days, inclusive). Matches DB rule: only credited on DELIVERED. */
export async function sumMerchantLedgerEarningsIst(
  sql: Sql,
  storeId: number,
  startYmd: string,
  endYmd: string
): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(SUM(l.amount), 0)::numeric AS total
    FROM merchant_wallet_ledger l
    INNER JOIN merchant_wallet w ON w.id = l.wallet_id
    WHERE w.merchant_store_id = ${storeId}
      AND l.direction = 'CREDIT'
      AND l.category = 'ORDER_EARNING'
      AND (l.created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${startYmd}::date
      AND (l.created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${endYmd}::date
  `;
  return num((rows[0] as { total?: unknown } | undefined)?.total);
}

/** Count orders with a real "Delivered" timeline event today (IST), not merely created/placed today. */
export async function countMerchantDeliveredOrdersIst(
  sql: Sql,
  storeId: number,
  startYmd: string,
  endYmd: string
): Promise<number> {
  try {
    const rows = await sql`
      SELECT COUNT(DISTINCT f.id)::int AS total_orders
      FROM orders_food f
      INNER JOIN orders_core c ON c.id = f.order_id
      INNER JOIN order_timelines t ON t.order_id = c.id
      WHERE f.merchant_store_id = ${storeId}
        AND upper(COALESCE(f.order_status::text, '')) = 'DELIVERED'
        AND f.delivered_at IS NOT NULL
        AND f.accepted_at IS NOT NULL
        AND lower(trim(t.status)) = 'delivered'
        AND (t.occurred_at AT TIME ZONE 'Asia/Kolkata')::date >= ${startYmd}::date
        AND (t.occurred_at AT TIME ZONE 'Asia/Kolkata')::date <= ${endYmd}::date
    `;
    return Number((rows[0] as { total_orders?: number } | undefined)?.total_orders) || 0;
  } catch {
    const rows = await sql`
      SELECT COUNT(*)::int AS total_orders
      FROM orders_food
      WHERE merchant_store_id = ${storeId}
        AND upper(COALESCE(order_status::text, '')) = 'DELIVERED'
        AND delivered_at IS NOT NULL
        AND accepted_at IS NOT NULL
        AND (delivered_at AT TIME ZONE 'Asia/Kolkata')::date >= ${startYmd}::date
        AND (delivered_at AT TIME ZONE 'Asia/Kolkata')::date <= ${endYmd}::date
    `;
    return Number((rows[0] as { total_orders?: number } | undefined)?.total_orders) || 0;
  }
}
