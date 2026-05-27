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
import { Queue } from "bullmq";
import { getRedis } from "@gatimitra/redis";
import { QUEUE_NAMES } from "./topics.js";
const queueCache = new Map();
const DEFAULT_JOB_OPTS = {
    attempts: 3,
    backoff: { type: "exponential", delay: 1_000 },
    removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
    removeOnFail: false,
};
function getQueue(name) {
    const cached = queueCache.get(name);
    if (cached)
        return cached;
    const q = new Queue(name, { connection: getRedis(), defaultJobOptions: DEFAULT_JOB_OPTS });
    queueCache.set(name, q);
    return q;
}
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
export async function enqueue(topic, payload, opts) {
    const queue = getQueue(topic);
    const job = await queue.add(topic, payload, opts);
    return { id: job.id };
}
/**
 * Schedule a repeatable job (cron-style). Used for the payment reconciler tick
 * once we move it from setInterval to BullMQ in Stage 2.
 *
 * Idempotent: calling twice with the same `name + repeat` updates the schedule
 * rather than creating duplicates.
 */
export async function scheduleRepeating(topic, payload, repeat, opts) {
    const queue = getQueue(topic);
    await queue.add(topic, payload, {
        ...opts,
        repeat,
        // jobId omitted so BullMQ generates a stable repeatable-job id
    });
}
/** Useful for graceful-shutdown handlers. */
export async function closeAllQueues() {
    const closes = Array.from(queueCache.values()).map((q) => q.close().catch(() => undefined));
    queueCache.clear();
    await Promise.all(closes);
}
export { QUEUE_NAMES };
//# sourceMappingURL=producer.js.map