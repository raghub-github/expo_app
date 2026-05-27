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
import { Worker, type Job } from "bullmq";
import type { QueueName, JobShape } from "./topics.js";
type Logger = {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
};
export type WorkerHandler<K extends QueueName> = (job: Job<JobShape[K]>, log: Logger) => Promise<void> | Promise<unknown>;
export type RunWorkerOptions = {
    /** Override BullMQ default concurrency (1). */
    concurrency?: number;
    /** Override the default 30 s graceful drain timeout. */
    drainTimeoutMs?: number;
    /** Logger to use; falls back to console.* */
    log?: Logger;
};
export declare function runWorker<K extends QueueName>(queueName: K, handler: WorkerHandler<K>, opts?: RunWorkerOptions): Worker;
/**
 * Hook into your service's SIGTERM/SIGINT handler. Closes all workers in
 * parallel, waits up to drainTimeoutMs for in-flight jobs to finish, then
 * tears down the Redis connection.
 */
export declare function gracefulShutdownAllWorkers(drainTimeoutMs?: number, log?: Logger): Promise<void>;
/**
 * Convenience entrypoint for tiny worker services that want a one-liner
 * lifecycle wrapper. Sets up signal handlers and resolves on shutdown.
 */
export declare function attachLifecycleHandlers(log?: Logger, drainTimeoutMs?: number): Promise<void>;
export {};
//# sourceMappingURL=worker.d.ts.map