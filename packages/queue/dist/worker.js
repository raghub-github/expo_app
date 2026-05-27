/**
 * BullMQ worker helper — wraps the boilerplate (connection, lifecycle, logs,
 * graceful shutdown) so worker services stay tiny.
 *
 * Each worker process should call `runWorker(...)` once per queue it consumes
 * and then await `process.on("SIGTERM")` to drain. The helper:
 *
 *   - Reuses the shared `@gatimitra/redis` connection
 *   - Logs every job start/finish/fail with the job id + queue
 *   - Routes errors through a single handler that workers can override
 *   - Drains in-flight jobs on SIGTERM (default 30s)
 */
import { Worker } from "bullmq";
import { getRedis, closeRedis } from "@gatimitra/redis";
const DEFAULT_DRAIN_MS = 30_000;
const workersStarted = [];
export function runWorker(queueName, handler, opts = {}) {
    const log = opts.log ?? console;
    const workerOpts = {
        connection: getRedis(),
        concurrency: opts.concurrency ?? 1,
    };
    const worker = new Worker(queueName, async (job) => {
        log.info(`[${queueName}] start id=${job.id} attempt=${job.attemptsMade + 1}`);
        try {
            const result = await handler(job, log);
            log.info(`[${queueName}] done id=${job.id}`);
            return result;
        }
        catch (err) {
            log.warn(`[${queueName}] fail id=${job.id} attempt=${job.attemptsMade + 1}: ${err.message}`);
            throw err;
        }
    }, workerOpts);
    worker.on("error", (err) => {
        log.error(`[${queueName}] worker error:`, err.message);
    });
    workersStarted.push(worker);
    log.info(`[${queueName}] worker started (concurrency=${workerOpts.concurrency ?? 1})`);
    return worker;
}
/**
 * Hook into your service's SIGTERM/SIGINT handler. Closes all workers in
 * parallel, waits up to drainTimeoutMs for in-flight jobs to finish, then
 * tears down the Redis connection.
 */
export async function gracefulShutdownAllWorkers(drainTimeoutMs = DEFAULT_DRAIN_MS, log = console) {
    log.info(`[worker] draining ${workersStarted.length} worker(s)…`);
    const start = Date.now();
    const closes = workersStarted.map((w) => w.close().catch((err) => log.warn(`[worker] close error: ${err.message}`)));
    const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), drainTimeoutMs));
    const result = await Promise.race([Promise.all(closes).then(() => "done"), timeout]);
    if (result === "timeout") {
        log.warn(`[worker] drain timeout after ${Date.now() - start}ms`);
    }
    else {
        log.info(`[worker] all workers drained in ${Date.now() - start}ms`);
    }
    await closeRedis();
}
/**
 * Convenience entrypoint for tiny worker services that want a one-liner
 * lifecycle wrapper. Sets up signal handlers and resolves on shutdown.
 */
export function attachLifecycleHandlers(log = console, drainTimeoutMs = DEFAULT_DRAIN_MS) {
    return new Promise((resolve) => {
        const shutdown = async (signal) => {
            log.info(`[worker] received ${signal}`);
            await gracefulShutdownAllWorkers(drainTimeoutMs, log);
            resolve();
        };
        process.once("SIGTERM", () => void shutdown("SIGTERM"));
        process.once("SIGINT", () => void shutdown("SIGINT"));
    });
}
//# sourceMappingURL=worker.js.map