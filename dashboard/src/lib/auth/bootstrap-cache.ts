import { getRedisClient } from "@/lib/redis";

const BOOTSTRAP_CACHE_TTL_MS = 10_000;
const BOOTSTRAP_CACHE_TTL_SECONDS = 15;

/** Shared in-memory bootstrap bodies keyed by Supabase auth user id. */
export const bootstrapMemoryCache = new Map<string, { body: unknown; ts: number }>();

export function getBootstrapMemoryTtlMs() {
  return BOOTSTRAP_CACHE_TTL_MS;
}

export function getBootstrapRedisTtlSeconds() {
  return BOOTSTRAP_CACHE_TTL_SECONDS;
}

/** Drop bootstrap cache for a Supabase auth user id so access changes apply quickly. */
export async function invalidateBootstrapCache(userId: string | null | undefined): Promise<void> {
  const id = String(userId || "").trim();
  if (!id) return;
  bootstrapMemoryCache.delete(id);
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.del(`bootstrap_${id}`);
  } catch {
    // ignore
  }
}
