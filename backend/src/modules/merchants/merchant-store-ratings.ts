import { and, inArray, sql } from "drizzle-orm";
import { getDb, getSql } from "../../db/client.js";
import { merchantStoreRatings } from "../../db/schema.js";

export type StoreRatingSummary = {
  avgRating: number;
  totalReviews: number;
};

export type StorePersonalizedRating = {
  forYouRating: number | null;
  userHasRatedStore: boolean;
};

const RECENCY_HALF_LIFE_DAYS = 90;

function ratingScoreExpr(alias = merchantStoreRatings) {
  return sql`coalesce(${alias.foodRating}, ${alias.rating})::numeric`;
}

function recencyWeightExpr(alias = merchantStoreRatings) {
  return sql`exp(-extract(epoch from (now() - ${alias.createdAt})) / (${RECENCY_HALF_LIFE_DAYS} * 86400.0))`;
}

/** Aggregate customer ratings per store — recency-weighted average, spam filtered. */
export async function getStoreRatingsForStores(
  storeInternalIds: number[]
): Promise<Map<number, StoreRatingSummary>> {
  const map = new Map<number, StoreRatingSummary>();
  const ids = [...new Set(storeInternalIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return map;

  const db = getDb();
  const score = ratingScoreExpr();
  const weight = recencyWeightExpr();
  const rows = await db
    .select({
      storeId: merchantStoreRatings.storeId,
      avgRating: sql<string>`round(
        (sum(${score} * ${weight}) / nullif(sum(${weight}), 0))::numeric,
        1
      )`,
      totalReviews: sql<number>`count(*)::int`,
    })
    .from(merchantStoreRatings)
    .where(
      and(
        inArray(merchantStoreRatings.storeId, ids),
        sql`coalesce(${merchantStoreRatings.isFlagged}, false) = false`,
        sql`${score} between 1 and 5`
      )
    )
    .groupBy(merchantStoreRatings.storeId);

  for (const r of rows) {
    const sid = r.storeId;
    if (sid == null) continue;
    const avg = parseFloat(String(r.avgRating ?? ""));
    const count = Number(r.totalReviews ?? 0);
    if (!Number.isFinite(avg) || count <= 0) continue;
    map.set(sid, { avgRating: avg, totalReviews: count });
  }

  return map;
}

/**
 * Personalized "Rating for you" — only when the customer has rated this store before.
 * Uses ratings from customers with overlapping taste profiles on other stores.
 */
export async function getStorePersonalizedRating(
  storeInternalId: number,
  customerInternalId: number
): Promise<StorePersonalizedRating> {
  if (!Number.isFinite(storeInternalId) || storeInternalId <= 0) {
    return { forYouRating: null, userHasRatedStore: false };
  }
  if (!Number.isFinite(customerInternalId) || customerInternalId <= 0) {
    return { forYouRating: null, userHasRatedStore: false };
  }

  const sqlClient = getSql();
  const rows = await sqlClient`
    WITH my_ratings AS (
      SELECT
        msr.store_id,
        coalesce(msr.food_rating, msr.rating)::numeric AS score
      FROM merchant_store_ratings msr
      WHERE msr.customer_id = ${customerInternalId}
        AND coalesce(msr.is_flagged, false) = false
        AND coalesce(msr.food_rating, msr.rating) BETWEEN 1 AND 5
    ),
    target_rating AS (
      SELECT score
      FROM my_ratings
      WHERE store_id = ${storeInternalId}
      LIMIT 1
    ),
    similar_customers AS (
      SELECT DISTINCT peer.customer_id
      FROM merchant_store_ratings peer
      INNER JOIN my_ratings mine ON mine.store_id = peer.store_id
      WHERE peer.customer_id <> ${customerInternalId}
        AND coalesce(peer.is_flagged, false) = false
        AND coalesce(peer.food_rating, peer.rating) BETWEEN 1 AND 5
        AND abs(coalesce(peer.food_rating, peer.rating) - mine.score) <= 1
      GROUP BY peer.customer_id
      HAVING count(DISTINCT peer.store_id) >= 2
    ),
    peer_scores AS (
      SELECT coalesce(peer.food_rating, peer.rating)::numeric AS score
      FROM merchant_store_ratings peer
      INNER JOIN similar_customers sc ON sc.customer_id = peer.customer_id
      WHERE peer.store_id = ${storeInternalId}
        AND coalesce(peer.is_flagged, false) = false
        AND coalesce(peer.food_rating, peer.rating) BETWEEN 1 AND 5
    )
    SELECT
      EXISTS (SELECT 1 FROM target_rating) AS user_has_rated,
      (SELECT round(avg(score)::numeric, 1) FROM peer_scores) AS for_you_rating,
      (SELECT score FROM target_rating LIMIT 1) AS user_rating
  `;

  const row = (rows as unknown as {
    user_has_rated: boolean;
    for_you_rating: string | null;
    user_rating: string | null;
  }[])[0];

  const userHasRatedStore = row?.user_has_rated === true;
  if (!userHasRatedStore) {
    return { forYouRating: null, userHasRatedStore: false };
  }

  const peerAvg = row?.for_you_rating != null ? parseFloat(String(row.for_you_rating)) : NaN;
  const userRating = row?.user_rating != null ? parseFloat(String(row.user_rating)) : NaN;

  const forYouRating = Number.isFinite(peerAvg)
    ? peerAvg
    : Number.isFinite(userRating)
      ? userRating
      : null;

  return {
    forYouRating,
    userHasRatedStore: true,
  };
}
