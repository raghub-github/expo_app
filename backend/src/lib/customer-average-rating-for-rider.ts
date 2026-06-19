import { getSql } from "../db/client.js";

/**
 * Lifetime average customer rating from rider delivery feedback
 * (`rider_customer_delivery_feedback.rating`, joined via orders_core.customer_id).
 */
export async function getCustomerAverageRatingByCustomerId(
  customerId: number
): Promise<number | null> {
  if (!Number.isFinite(customerId) || customerId <= 0) return null;

  const sql = getSql();
  const rows = await sql`
    SELECT round(avg(f.rating)::numeric, 1) AS avg_rating
    FROM rider_customer_delivery_feedback f
    INNER JOIN orders_core oc ON oc.id = f.order_core_id
    WHERE oc.customer_id = ${customerId}
      AND f.skipped = FALSE
      AND f.rating BETWEEN 1 AND 5
  `;

  const avg = parseFloat(String((rows[0] as { avg_rating?: unknown })?.avg_rating ?? ""));
  return Number.isFinite(avg) ? avg : null;
}

export async function loadCustomerAverageRatingsMap(
  customerIds: number[]
): Promise<Map<number, number>> {
  const unique = [...new Set(customerIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length === 0) return new Map();

  const sql = getSql();
  const rows = await sql`
    SELECT
      oc.customer_id AS customer_id,
      round(avg(f.rating)::numeric, 1) AS avg_rating
    FROM rider_customer_delivery_feedback f
    INNER JOIN orders_core oc ON oc.id = f.order_core_id
    WHERE oc.customer_id = ANY(${unique}::bigint[])
      AND f.skipped = FALSE
      AND f.rating BETWEEN 1 AND 5
    GROUP BY oc.customer_id
  `;

  const map = new Map<number, number>();
  for (const row of rows as { customer_id?: unknown; avg_rating?: unknown }[]) {
    const id = Number(row.customer_id);
    const avg = parseFloat(String(row.avg_rating ?? ""));
    if (Number.isFinite(id) && id > 0 && Number.isFinite(avg)) {
      map.set(id, avg);
    }
  }
  return map;
}
