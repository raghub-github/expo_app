import type { Redis as RedisInstance } from "ioredis";
export type RedisClient = RedisInstance;
/** True when REDIS_URL is set. */
export declare function isRedisConfigured(): boolean;
/**
 * When true, cache/lock/pubsub degrade instead of crashing or spamming logs.
 * Defaults to true in non-production unless REDIS_OPTIONAL=false.
 */
export declare function isRedisOptional(): boolean;
export declare function getRedis(): RedisInstance;
/**
 * A dedicated subscriber connection. Redis pub/sub requires a separate
 * connection from the command client because a subscribed client cannot run
 * normal commands. Used by Stage 3's ws-gateway.
 */
export declare function getRedisSubscriber(): RedisInstance;
/** Close all open clients. Wire into your service's graceful-shutdown handler. */
export declare function closeRedis(): Promise<void>;
//# sourceMappingURL=client.d.ts.map