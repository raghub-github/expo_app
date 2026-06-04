/**
 * BullMQ producer — opens one Queue per topic, lazily.
 *
 * Reuses the `@gatimitra/redis` connection: BullMQ accepts an ioredis instance
 * via `connection: getRedis()`. We pass through the existing client so we
 * don't open a second TCP pool.
 *
 * Default job options favor durability + observability over throughput:
 *   - 3 retries with exponential backoff (1s, 4s, 9s)
 *   - completed jobs are kept for 24h (debugging)
 *   - failed jobs are kept until manually cleared (postmortem)
 *
 * For very high volume (>10k/s) workloads we can tune `removeOnComplete`
 * down — none of our current queues hit that.
 */
import { type JobsOptions } from "bullmq";
import { QUEUE_NAMES, type QueueName, type JobShape } from "./topics.js";
/**
 * Enqueue a job.
 *
 * @param topic   - one of QUEUE_NAMES
 * @param payload - typed by topic via JobShape map
 * @param opts    - per-job overrides (jobId, delay, priority, attempts)
 *
 * Returns the BullMQ Job; callers usually don't need it. Errors are propagated
 * — let the caller decide whether to fail the request or fall back to inline.
 */
export declare function enqueue<K extends QueueName>(topic: K, payload: JobShape[K], opts?: JobsOptions & {
    jobId?: string;
}): Promise<{
    id: string | undefined;
}>;
/**
 * Schedule a repeatable job (cron-style). Used for the payment reconciler tick
 * once we move it from setInterval to BullMQ in Stage 2.
 *
 * Idempotent: calling twice with the same `name + repeat` updates the schedule
 * rather than creating duplicates.
 */
export declare function scheduleRepeating<K extends QueueName>(topic: K, payload: JobShape[K], repeat: {
    every?: number;
    pattern?: string;
}, opts?: Omit<JobsOptions, "repeat" | "jobId">): Promise<void>;
/** Useful for graceful-shutdown handlers. */
export declare function closeAllQueues(): Promise<void>;
export { QUEUE_NAMES };
//# sourceMappingURL=producer.d.ts.map