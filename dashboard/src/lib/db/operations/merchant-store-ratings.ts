/**
 * Merchant Store Ratings — ratings and reviews for merchant_stores (User Insights).
 * Table: merchant_store_ratings
 */

import { getSql } from "../client";

export interface MerchantStoreRatingRow {
  id: number;
  store_id: number;
  order_id: number | null;
  customer_id: number | null;
  rating: number;
  food_rating: number | null;
  service_rating: number | null;
  packaging_rating: number | null;
  review_text: string | null;
  review_title: string | null;
  review_images: string[] | null;
  helpful_count: number | null;
  not_helpful_count: number | null;
  merchant_response: string | null;
  merchant_responded_at: string | null;
  is_verified: boolean | null;
  is_flagged: boolean | null;
  flag_reason: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch all ratings/reviews for a store, latest first.
 */
export async function getRatingsByStoreId(
  storeId: number,
  limit = 200
): Promise<MerchantStoreRatingRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, store_id, order_id, customer_id, rating,
           food_rating, service_rating, packaging_rating,
           review_text, review_title, review_images,
           helpful_count, not_helpful_count,
           merchant_response, merchant_responded_at,
           is_verified, is_flagged, flag_reason,
           created_at, updated_at
    FROM merchant_store_ratings
    WHERE store_id = ${storeId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  const list = Array.isArray(rows) ? rows : [rows];
  return list.map((r: Record<string, unknown>) => ({
    id: Number(r.id),
    store_id: Number(r.store_id),
    order_id: r.order_id != null ? Number(r.order_id) : null,
    customer_id: r.customer_id != null ? Number(r.customer_id) : null,
    rating: Number(r.rating),
    food_rating: r.food_rating != null ? Number(r.food_rating) : null,
    service_rating: r.service_rating != null ? Number(r.service_rating) : null,
    packaging_rating: r.packaging_rating != null ? Number(r.packaging_rating) : null,
    review_text: r.review_text != null ? String(r.review_text) : null,
    review_title: r.review_title != null ? String(r.review_title) : null,
    review_images: Array.isArray(r.review_images) ? (r.review_images as string[]) : null,
    helpful_count: r.helpful_count != null ? Number(r.helpful_count) : null,
    not_helpful_count: r.not_helpful_count != null ? Number(r.not_helpful_count) : null,
    merchant_response: r.merchant_response != null ? String(r.merchant_response) : null,
    merchant_responded_at: r.merchant_responded_at != null ? String(r.merchant_responded_at) : null,
    is_verified: r.is_verified != null ? Boolean(r.is_verified) : null,
    is_flagged: r.is_flagged != null ? Boolean(r.is_flagged) : null,
    flag_reason: r.flag_reason != null ? String(r.flag_reason) : null,
    created_at: r.created_at != null ? String(r.created_at) : "",
    updated_at: r.updated_at != null ? String(r.updated_at) : "",
  }));
}
