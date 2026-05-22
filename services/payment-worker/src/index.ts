/**
 * payment-worker — owns:
 *   1. PAYMENT_RECONCILE  : scheduled tick that scans pending Razorpay payments
 *                           and calls the backend's reconcile endpoint
 *   2. PAYMENT_WEBHOOK_RETRY : retries webhook deliveries that failed at the
 *                              gateway-verification stage (exponential backoff
 *                              up to 8 attempts → DLQ)
 *
 * Why the worker hits a backend endpoint instead of doing the SQL directly:
 *   - keeps the Drizzle schema in one place (backend)
 *   - reuses existing audit/idempotency logic
 *   - lets us scale the worker horizontally without coordinating DB schema
 */
import "dotenv/config";
import {
  QUEUE_NAMES,
  attachLifecycleHandlers,
  runWorker,
  scheduleRepeating,
  type PaymentReconcileJob,
  type PaymentWebhookRetryJob,
} from "@gatimitra/queue";

const log = {
  info: (...args: unknown[]) => console.log("[pay]", ...args),
  warn: (...args: unknown[]) => console.warn("[pay]", ...args),
  error: (...args: unknown[]) => console.error("[pay]", ...args),
};

const BACKEND_BASE = process.env.BACKEND_INTERNAL_URL ?? "http://backend:3000";
const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN ?? "";
const RECONCILE_INTERVAL_SEC = Number(process.env.PAYMENT_RECONCILER_INTERVAL_SEC ?? 60);

if (!INTERNAL_TOKEN) {
  log.warn("INTERNAL_API_TOKEN is empty — backend will reject reconcile calls.");
}

async function postInternal<T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data?: T }> {
  const res = await fetch(`${BACKEND_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": INTERNAL_TOKEN,
    },
    body: JSON.stringify(body ?? {}),
  });
  let data: T | undefined;
  try {
    data = (await res.json()) as T;
  } catch {
    /* non-JSON response */
  }
  return { ok: res.ok, status: res.status, data };
}

log.info("payment-worker booting", { backend: BACKEND_BASE, intervalSec: RECONCILE_INTERVAL_SEC });

/* ─── PAYMENT_RECONCILE consumer ─── */
runWorker<typeof QUEUE_NAMES.PAYMENT_RECONCILE>(
  QUEUE_NAMES.PAYMENT_RECONCILE,
  async (job, jobLog) => {
    const res = await postInternal<{ checked: number; finalized: number }>(
      "/v1/internal/payments/reconcile",
      { scheduled: (job.data as PaymentReconcileJob).scheduled },
    );
    if (!res.ok) {
      jobLog.warn(`reconcile call failed status=${res.status}`);
      throw new Error(`reconcile http ${res.status}`);
    }
    jobLog.info(`reconcile checked=${res.data?.checked ?? 0} finalized=${res.data?.finalized ?? 0}`);
  },
  { concurrency: 1, log },
);

/* ─── PAYMENT_WEBHOOK_RETRY consumer ─── */
runWorker<typeof QUEUE_NAMES.PAYMENT_WEBHOOK_RETRY>(
  QUEUE_NAMES.PAYMENT_WEBHOOK_RETRY,
  async (job, jobLog) => {
    const { eventId, payload, reason } = job.data as PaymentWebhookRetryJob;
    jobLog.info(`retry webhook event=${eventId} prevReason=${reason}`);
    const res = await postInternal<{ ok: boolean }>(
      "/v1/internal/payments/webhook-replay",
      { eventId, payload },
    );
    if (!res.ok) {
      // Throw so BullMQ backs off + counts the attempt. After max attempts
      // it lands in the failed jobs list (acts as DLQ).
      throw new Error(`webhook-replay http ${res.status} event=${eventId}`);
    }
    jobLog.info(`webhook replayed event=${eventId}`);
  },
  { concurrency: 2, log },
);

/* ─── Bootstrap the scheduled reconcile tick ─── */
await scheduleRepeating(
  QUEUE_NAMES.PAYMENT_RECONCILE,
  { scheduled: true },
  { every: RECONCILE_INTERVAL_SEC * 1000 },
).catch((err) => log.warn("scheduleRepeating failed:", (err as Error).message));

log.info("payment-worker ready");
await attachLifecycleHandlers(log);
log.info("payment-worker stopped");
process.exit(0);
