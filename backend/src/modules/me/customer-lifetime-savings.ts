import { sql } from "drizzle-orm";
import type { getDb } from "../../db/client.js";

/** Sum of discounts applied across all non-cancelled orders for a customer (INR). */
export async function getCustomerLifetimeSavingsInr(
  db: ReturnType<typeof getDb>,
  customerPk: number,
): Promise<number> {
  if (!Number.isFinite(customerPk) || customerPk <= 0) return 0;

  try {
    const result = await db.execute(sql`
      SELECT COALESCE(SUM(
        GREATEST(
          COALESCE(
            NULLIF(TRIM(oc.billing_snapshot->>'discount_total'), '')::numeric,
            NULLIF(TRIM(oc.billing_snapshot->'gst_totals'->>'total_discount'), '')::numeric,
            0
          ),
          0
        )
      ), 0)::numeric AS total_savings
      FROM orders_core oc
      WHERE oc.customer_id = ${customerPk}
        AND oc.cancelled_at IS NULL
        AND oc.status IS DISTINCT FROM 'cancelled'
        AND oc.billing_snapshot IS NOT NULL
    `);

    const rows = result as unknown as Array<{ total_savings: number | string | null }>;
    const raw = rows[0]?.total_savings;
    const total = Number(raw);
    if (!Number.isFinite(total) || total <= 0) return 0;
    return Math.round(total * 100) / 100;
  } catch {
    return 0;
  }
}
