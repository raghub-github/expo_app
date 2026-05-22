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
import { Worker, type Job, type WorkerOptions } from "bullmq";
import { getRedis, closeRedis } from "@gatimitra/redis";
import type { QueueName, JobShape } from "./topics.js";

type Logger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type WorkerHandler<K extends QueueName> = (
  job: Job<JobShape[K]>,
  log: Logger,
) => Promise<void> | Promise<unknown>;

export type RunWorkerOptions = {
  /** Override BullMQ default concurrency (1). */
  concurrency?: number;
  /** Override the default 30 s graceful drain timeout. */
  drainTimeoutMs?: number;
  /** Logger to use; falls back to console.* */
  log?: Logger;
};

const DEFAULT_DRAIN_MS = 30_000;
const workersStarted: Worker[] = [];

export function runWorker<K extends QueueName>(
  queueName: K,
  handler: WorkerHandler<K>,
  opts: RunWorkerOptions = {},
): Worker {
  const log: Logger = opts.log ?? console;

  const workerOpts: WorkerOptions = {
    connection: getRedis(),
    concurrency: opts.concurrency ?? 1,
  };

  const worker = new Worker<JobShape[K]>(
    queueName,
    async (job) => {
      log.info(`[${queueName}] start id=${job.id} attempt=${job.attemptsMade + 1}`);
      try {
        const result = await handler(job, log);
        log.info(`[${queueName}] done id=${job.id}`);
        return result;
      } catch (err) {
        log.warn(
          `[${queueName}] fail id=${job.id} attempt=${job.attemptsMade + 1}: ${(err as Error).message}`,
        );
        throw err;
      }
    },
    workerOpts,
  );

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
export async function gracefulShutdownAllWorkers(
  drainTimeoutMs: number = DEFAULT_DRAIN_MS,
  log: Logger = console,
): Promise<void> {
  log.info(`[worker] draining ${workersStarted.length} worker(s)…`);
  const start = Date.now();
  const closes = workersStarted.map((w) =>
    w.close().catch((err) => log.warn(`[worker] close error: ${err.message}`)),
  );
  const timeout = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), drainTimeoutMs),
  );
  const result = await Promise.race([Promise.all(closes).then(() => "done" as const), timeout]);
  if (result === "timeout") {
    log.warn(`[worker] drain timeout after ${Date.now() - start}ms`);
  } else {
    log.info(`[worker] all workers drained in ${Date.now() - start}ms`);
  }
  await closeRedis();
}

/**
 * Convenience entrypoint for tiny worker services that want a one-liner
 * lifecycle wrapper. Sets up signal handlers and resolves on shutdown.
 */
export function attachLifecycleHandlers(
  log: Logger = console,
  drainTimeoutMs: number = DEFAULT_DRAIN_MS,
): Promise<void> {
  return new Promise((resolve) => {
    const shutdown = async (signal: string) => {
      log.info(`[worker] received ${signal}`);
      await gracefulShutdownAllWorkers(drainTimeoutMs, log);
      resolve();
    };
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));
  });
}
