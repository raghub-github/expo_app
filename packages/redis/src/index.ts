/**
 * @gatimitra/redis — single import surface for the rest of the monorepo.
 *
 *   import { getRedis, withLock, cacheGetOrSet, publish } from "@gatimitra/redis";
 *
 * Sub-paths are also available for tree-shaking-friendly imports:
 *
 *   import { withLock } from "@gatimitra/redis/lock";
 */
export { getRedis, getRedisSubscriber, closeRedis, type RedisClient } from "./client.js";
export { withLock, tryAcquireLock } from "./lock.js";
export { cacheGet, cacheSet, cacheDel, cacheGetOrSet } from "./cache.js";
export { publish, subscribe, type Unsubscribe } from "./pubsub.js";
