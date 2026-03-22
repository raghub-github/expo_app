import type Redis from "ioredis";
import IORedis from "ioredis";

let redisClient: Redis | null = null;
let redisInitTried = false;

/**
 * Returns a shared Redis client instance when REDIS_URL (or UPSTASH_REDIS_URL)
 * is configured. Falls back to null when Redis is not available so callers can
 * gracefully degrade to in-memory caching.
 */
export function getRedisClient(): Redis | null {
  if (redisClient || redisInitTried) {
    return redisClient;
  }

  redisInitTried = true;

  const url =
    process.env.REDIS_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.UPSTASH_REDIS_URL;

  if (!url) {
    return null;
  }

  try {
    // Use lazy connection; IORedis connects on first command.
    redisClient = new IORedis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
  } catch {
    redisClient = null;
  }

  return redisClient;
}

