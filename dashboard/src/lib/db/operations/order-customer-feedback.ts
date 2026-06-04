import { sql } from "drizzle-orm";
import { getDb } from "../client";
import type { OrderCustomerFeedback } from "@/lib/orders/order-customer-feedback";

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Latest customer rating for this orders_core.id (merchant + delivery). */
export async function getOrderCustomerFeedback(
  orderCoreId: number
): Promise<OrderCustomerFeedback | null> {
  const db = getDb();
  try {
    const rows = await db.execute(sql`
      SELECT
        r.rating,
        r.food_rating,
        r.service_rating,
        r.packaging_rating,
        r.review_text,
        r.review_title,
        r.created_at,
        c.full_name AS customer_name
      FROM merchant_store_ratings r
      LEFT JOIN customers c ON c.id = r.customer_id
      WHERE r.order_id = ${orderCoreId}
      ORDER BY r.created_at DESC
      LIMIT 1
    `);
    const row = (rows as unknown as Record<string, unknown>[])[0];
    if (!row) return null;

    const storeRating = asNum(row.rating);
    if (storeRating == null || storeRating < 1) return null;

    const created = row.created_at;
    const ratedAtIso =
      created instanceof Date
        ? created.toISOString()
        : created != null
          ? String(created)
          : null;

    return {
      storeRating,
      foodRating: asNum(row.food_rating),
      deliveryRating: asNum(row.service_rating),
      packagingRating: asNum(row.packaging_rating),
      storeReviewText:
        row.review_text != null && String(row.review_text).trim()
          ? String(row.review_text).trim()
          : null,
      riderReviewText:
        row.review_title != null && String(row.review_title).trim()
          ? String(row.review_title).trim()
          : null,
      ratedAtIso,
      customerName:
        row.customer_name != null && String(row.customer_name).trim()
          ? String(row.customer_name).trim()
          : null,
    };
  } catch (err) {
    console.error("[getOrderCustomerFeedback] failed", orderCoreId, err);
    return null;
  }
}
