import { inArray, sql } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { merchantStoreRatings } from "../../db/schema.js";

export type StoreRatingSummary = {
  avgRating: number;
  totalReviews: number;
};

/** Aggregate customer ratings per store for list cards. */
export async function getStoreRatingsForStores(
  storeInternalIds: number[]
): Promise<Map<number, StoreRatingSummary>> {
  const map = new Map<number, StoreRatingSummary>();
  const ids = [...new Set(storeInternalIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return map;

  const db = getDb();
  const rows = await db
    .select({
      storeId: merchantStoreRatings.storeId,
      avgRating: sql<string>`round(avg(${merchantStoreRatings.foodRating})::numeric, 1)`,
      totalReviews: sql<number>`count(${merchantStoreRatings.foodRating})::int`,
    })
    .from(merchantStoreRatings)
    .where(inArray(merchantStoreRatings.storeId, ids))
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
