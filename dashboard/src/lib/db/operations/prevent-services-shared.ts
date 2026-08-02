/** Shared Prevent Services constants for dashboard admin. */

export const PREVENT_SERVICE_CODES = [
  "food",
  "grocery",
  "parcel",
  "ride",
  "courier",
  "pharmacy",
] as const;

export type PreventServiceCode = (typeof PREVENT_SERVICE_CODES)[number];

/** Must match backend `preventServices.engine.ts` CACHE_KEY_ACTIVE. */
const CACHE_KEY_ACTIVE = "prevent-services:active-v1";

/**
 * Drop the backend's active-rules Redis cache so impact/dispatch helpers that
 * use `loadActivePreventRulesCached` see Super Admin changes immediately
 * (placement/check already hit Postgres directly and do not need this).
 */
export async function invalidatePreventServicesCache(): Promise<void> {
  try {
    const { getRedisClient } = await import("@/lib/redis");
    const redis = getRedisClient();
    if (!redis) return;
    if (redis.status !== "ready") {
      await redis.connect().catch(() => undefined);
    }
    await redis.del(CACHE_KEY_ACTIVE);
  } catch {
    /* Redis optional — 30s TTL is the safety net. */
  }
}
