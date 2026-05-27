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
 *   soft-degrade can wrap in try/catch.
 */
// Use namespace import + .default — ioredis ships its class as default
// export but NodeNext-resolved consumers see only the namespace under the
// default name unless we dereference explicitly. ESM-friendly + CJS-safe.
import * as IORedisNs from "ioredis";
const RedisCtor = IORedisNs.default;
let _client = null;
let _subscriber = null;
function buildOptions(extra) {
    // Sensible defaults for a production Node service. ioredis applies
    // exponential backoff and reconnects on transient failures.
    return {
        lazyConnect: false,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => Math.min(times * 200, 2000),
        reconnectOnError: (err) => {
            const msg = err.message || "";
            // ReadOnly errors fire when a Redis Sentinel failover happens; force
            // ioredis to reconnect to the new primary instead of erroring out.
            return msg.includes("READONLY");
        },
        ...extra,
    };
}
export function getRedis() {
    if (_client)
        return _client;
    const url = process.env.REDIS_URL;
    if (!url) {
        throw new Error("@gatimitra/redis: REDIS_URL is not set. Required for cache + locks + queue.");
    }
    const instance = new RedisCtor(url, buildOptions());
    instance.on("error", (err) => {
        // Surface but never crash the process — ioredis will reconnect.
        // eslint-disable-next-line no-console
        console.warn("[redis] client error", err.message);
    });
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
    const url = process.env.REDIS_URL;
    if (!url) {
        throw new Error("@gatimitra/redis: REDIS_URL is not set (subscriber).");
    }
    const instance = new RedisCtor(url, buildOptions({ lazyConnect: false }));
    instance.on("error", (err) => {
        // eslint-disable-next-line no-console
        console.warn("[redis] subscriber error", err.message);
    });
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
    await Promise.all(tasks);
}
//# sourceMappingURL=client.js.map