/**
 * Bust dashboard server caches that can keep stale pending-document banners
 * after manual verify/reject (in-memory + Redis summary keys).
 */

import { deleteCachedByPrefix } from "@/lib/server-cache";
import { getRedisClient } from "@/lib/redis";
import { logDocCache } from "@/lib/rider-document-verification-pipeline";

export async function invalidateRiderDocumentServerCaches(
  riderId: number,
): Promise<void> {
  const prefix = `rider_summary_v7:${riderId}`;
  deleteCachedByPrefix(prefix);
  // Also cover older key versions if any remain.
  deleteCachedByPrefix(`rider_summary:${riderId}`);
  deleteCachedByPrefix(`rider_summary_v6:${riderId}`);

  const redis = getRedisClient();
  if (redis) {
    try {
      const patterns = [
        `rider_summary_v7:${riderId}*`,
        `rider_summary_v6:${riderId}*`,
        `rider_summary:${riderId}*`,
      ];
      for (const pattern of patterns) {
        let cursor = "0";
        do {
          const [next, keys] = await redis.scan(
            cursor,
            "MATCH",
            pattern,
            "COUNT",
            100,
          );
          cursor = next;
          if (keys.length > 0) {
            await redis.del(...keys);
          }
        } while (cursor !== "0");
      }
    } catch (err) {
      console.warn(
        "[DOC_CACHE] redis summary invalidate failed",
        err instanceof Error ? err.message : err,
      );
    }
  }

  logDocCache({
    event: "invalidate_server",
    riderId,
    prefix,
  });
}
