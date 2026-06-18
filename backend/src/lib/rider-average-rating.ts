import { getSql } from "../db/client.js";

/**
 * Lifetime average rider rating from customer feedback.
 *
 * Primary source (customer app POST /orders/:id/store-rating):
 *   `merchant_store_ratings.service_rating` — delivery/rider stars, joined via `orders_core.rider_id`.
 *
 * Secondary source:
 *   `ratings` where `from_type = 'customer'` and `rider_id` matches.
 */
export async function getRiderAverageRating(
  riderId: number,
): Promise<number | null> {
  const sql = getSql();
  const rows = await sql`
    WITH scores AS (
      SELECT msr.service_rating::numeric AS rating
      FROM merchant_store_ratings msr
      INNER JOIN orders_core oc ON oc.id = msr.order_id
      WHERE oc.rider_id = ${riderId}
        AND msr.service_rating IS NOT NULL
        AND msr.service_rating BETWEEN 1 AND 5
      UNION ALL
      SELECT r.rating::numeric AS rating
      FROM ratings r
      WHERE r.rider_id = ${riderId}
        AND r.from_type = 'customer'
        AND r.rating BETWEEN 1 AND 5
    )
    SELECT
      round(avg(rating)::numeric, 1) AS avg_rating,
      count(*)::int AS rating_count
    FROM scores
  `;

  const row = (rows as unknown as { avg_rating: string | null; rating_count: number }[])[0];
  const count = Number(row?.rating_count ?? 0);
  if (!count) return null;

  const avg = parseFloat(String(row?.avg_rating ?? ""));
  if (!Number.isFinite(avg)) return null;
  return avg;
}
