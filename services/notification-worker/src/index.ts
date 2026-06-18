/**
 * notification-worker — consumes q.push.send, fans out to Expo.
 *
 * Lifecycle:
 *   - boots, loads .env, opens Redis (via @gatimitra/redis)
 *   - starts a BullMQ worker on the PUSH_SEND queue with concurrency 4
 *   - on SIGTERM, drains in-flight jobs (up to 30s) then exits
 *
 * Failure modes:
 *   - Network / Expo 5xx → BullMQ retries 3× with exp backoff (defaults in producer)
 *   - Expo 4xx (bad token, expired) → considered terminal; we log and ack
 *
 * Observability:
 *   - Every job logs start / done with id + counts
 *   - Worker errors logged via worker.on("error") in @gatimitra/queue/worker
 */
import "dotenv/config";
import { QUEUE_NAMES, attachLifecycleHandlers, runWorker } from "@gatimitra/queue";
import { sendPush } from "./expoPush.js";

const log = {
  info: (...args: unknown[]) => console.log("[notif]", ...args),
  warn: (...args: unknown[]) => console.warn("[notif]", ...args),
  error: (...args: unknown[]) => console.error("[notif]", ...args),
};

// Startup env validation — fail loud + early instead of crash-looping on
// `connect ECONNREFUSED` once the worker tries to use Redis.
function requireEnv(keys: string[]): void {
  const missing = keys.filter((k) => !process.env[k] || !process.env[k]!.trim());
  if (missing.length > 0) {
    console.error(`[notif] missing required env: ${missing.join(", ")}`);
    console.error("[notif] copy services/notification-worker/.env.example → .env and fill it in");
    process.exit(2);
  }
}
requireEnv(["REDIS_URL"]);

log.info("notification-worker booting");
log.info("connecting Redis…", process.env.REDIS_URL ? "(REDIS_URL set)" : "(REDIS_URL missing — will throw)");

runWorker(
  QUEUE_NAMES.PUSH_SEND,
  async (job, jobLog) => {
    const payload = job.data;
    const result = await sendPush(payload, jobLog);
    jobLog.info(
      `[push] accepted=${result.accepted} failed=${result.failed} chunks=${result.chunks}`,
    );
    if (result.failed > 0 && result.accepted === 0) {
      // 100% failure → tell BullMQ to retry. Partial failures are accepted
      // (Expo's failed-token cleanup is handled separately by the existing
      // backend logger).
      throw new Error(`push job ${job.id}: all ${result.failed} tokens failed`);
    }
    return { accepted: result.accepted, failed: result.failed };
  },
  { concurrency: 4, log },
);

await attachLifecycleHandlers(log);
log.info("notification-worker stopped");
process.exit(0);
