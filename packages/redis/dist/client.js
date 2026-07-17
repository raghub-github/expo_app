/**
 * Single ioredis client + lazy bootstrap.
 *
 * Why "lazy":
 *   Lots of consumer code imports this package at module-load time (route
 *   files, services, workers). Constructing a Redis client at import time
 *   means the test runner / CLI scripts that don't actually touch Redis would
 *   still open a TCP connection to a server that may not be running. The
 *   getter pattern means the connection only opens on first use.
 *
 * REDIS_URL semantics:
 *   redis://[:password@]host[:port][/db]
 *   rediss://...                         TLS
 *
 * Missing env behaviour:
 *   Throws on first call rather than at import time. Callers that want a
 *   soft-degrade can wrap in try/catch or use isRedisOptional().
 */
// Use namespace import + .default — ioredis ships its class as default
// export but NodeNext-resolved consumers see only the namespace under the
// default name unless we dereference explicitly. ESM-friendly + CJS-safe.
import * as IORedisNs from "ioredis";
const RedisCtor = IORedisNs.default;
let _client = null;
let _subscriber = null;
let _redisMarkedUnavailable = false;
let _lastConnectAttemptMs = 0;
let _lastErrorLogMs = 0;
let _suppressedErrorCount = 0;
const UNAVAILABLE_RETRY_MS = 30_000;
const ERROR_LOG_INTERVAL_MS = 60_000;
/** True when REDIS_URL is set. */
export function isRedisConfigured() {
    const url = process.env.REDIS_URL?.trim();
    return Boolean(url && url.length >= 10);
}
/**
 * When true, cache/lock/pubsub degrade instead of crashing or spamming logs.
 * Defaults to true in non-production unless REDIS_OPTIONAL=false.
 */
export function isRedisOptional() {
    const raw = (process.env.REDIS_OPTIONAL ?? "").trim().toLowerCase();
    if (raw === "false" || raw === "0")
        return false;
    if (raw === "true" || raw === "1")
        return true;
    return process.env.NODE_ENV !== "production";
}
function logRedisError(message) {
    const now = Date.now();
    if (now - _lastErrorLogMs < ERROR_LOG_INTERVAL_MS) {
        _suppressedErrorCount += 1;
        return;
    }
    const suffix = _suppressedErrorCount > 0 ? ` (+${_suppressedErrorCount} similar)` : "";
    _suppressedErrorCount = 0;
    _lastErrorLogMs = now;
    // eslint-disable-next-line no-console
    console.warn(`[redis] ${message}${suffix}`);
}
function markUnavailable() {
    _redisMarkedUnavailable = true;
    _lastConnectAttemptMs = Date.now();
}
function shouldAttemptConnect() {
    if (!_redisMarkedUnavailable)
        return true;
    return Date.now() - _lastConnectAttemptMs >= UNAVAILABLE_RETRY_MS;
}
function buildOptions(extra) {
    const optional = isRedisOptional();
    return {
        lazyConnect: true,
        enableOfflineQueue: false,
        enableReadyCheck: true,
        maxRetriesPerRequest: optional ? null : null,
        retryStrategy: (times) => {
            if (optional && times >= 5) {
                markUnavailable();
                return null;
            }
            return Math.min(times * 200, 2000);
        },
        reconnectOnError: (err) => {
            const msg = (err.message || "").toUpperCase();
            // Reconnect on READONLY failover AND transient socket drops (same class as DB ECONNRESET).
            return (msg.includes("READONLY") ||
                msg.includes("ECONNRESET") ||
                msg.includes("EPIPE") ||
                msg.includes("ETIMEDOUT") ||
                msg.includes("CONNECTION"));
        },
        ...extra,
    };
}
function attachErrorHandler(instance, label) {
    instance.on("error", (err) => {
        if (isRedisOptional()) {
            markUnavailable();
        }
        logRedisError(`${label} error ${err.message}`);
    });
    instance.on("connect", () => {
        _redisMarkedUnavailable = false;
    });
    instance.on("ready", () => {
        _redisMarkedUnavailable = false;
    });
}
export function getRedis() {
    if (_client)
        return _client;
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
        throw new Error("@gatimitra/redis: REDIS_URL is not set. Required for cache + locks + queue.");
    }
    if (_redisMarkedUnavailable && !shouldAttemptConnect()) {
        throw new Error("@gatimitra/redis: Redis unavailable (optional mode backoff).");
    }
    const instance = new RedisCtor(url, buildOptions());
    attachErrorHandler(instance, "client");
    _client = instance;
    return instance;
}
/**
 * A dedicated subscriber connection. Redis pub/sub requires a separate
 * connection from the command client because a subscribed client cannot run
 * normal commands. Used by Stage 3's ws-gateway.
 */
export function getRedisSubscriber() {
    if (_subscriber)
        return _subscriber;
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
        throw new Error("@gatimitra/redis: REDIS_URL is not set (subscriber).");
    }
    if (_redisMarkedUnavailable && !shouldAttemptConnect()) {
        throw new Error("@gatimitra/redis: Redis subscriber unavailable (optional mode backoff).");
    }
    const instance = new RedisCtor(url, buildOptions());
    attachErrorHandler(instance, "subscriber");
    _subscriber = instance;
    return instance;
}
/** Close all open clients. Wire into your service's graceful-shutdown handler. */
export async function closeRedis() {
    const tasks = [];
    if (_client) {
        tasks.push(_client.quit().catch(() => undefined));
        _client = null;
    }
    if (_subscriber) {
        tasks.push(_subscriber.quit().catch(() => undefined));
        _subscriber = null;
    }
    _redisMarkedUnavailable = false;
    await Promise.all(tasks);
}
//# sourceMappingURL=client.js.map