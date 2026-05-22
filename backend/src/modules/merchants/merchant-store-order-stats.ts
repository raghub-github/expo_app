/**
 * Completed food order counts per merchant store (for "Loved by Customers" home section).
 */
import { and, inArray, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { ordersFood } from "../../db/schema.js";

/** Count delivered/completed food orders per store internal id. */
export async function getCompletedOrderCountsForStores(
  storeInternalIds: number[]
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const ids = [...new Set(storeInternalIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return map;

  const db = getDb();
  const rows = await db
    .select({
      storeId: ordersFood.merchantStoreId,
      cnt: sql<number>`count(*)::int`,
    })
    .from(ordersFood)
    .where(
      and(
        inArray(ordersFood.merchantStoreId, ids),
        or(
          inArray(ordersFood.orderStatus, ["DELIVERED", "delivered", "COMPLETED", "completed"]),
          isNotNull(ordersFood.deliveredAt)
        )
      )
    )
    .groupBy(ordersFood.merchantStoreId);

  for (const r of rows) {
    const sid = r.storeId;
    if (sid == null) continue;
    map.set(sid, Number(r.cnt ?? 0));
  }
  return map;
}
