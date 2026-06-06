/**
 * eta-worker — consumes q.eta.recalc, calls the backend's existing
 * POST /v1/eta/orders/:id/recalc endpoint. Decouples ETA recalculation from
 * the request that triggered it (rider assigned, status flipped, traffic
 * spike) so backend response time stays predictable.
 *
 * The backend still owns the algorithm + persistence; this worker is just a
 * scheduler + retry envelope. Same architecture as the payment-worker.
 *
 * Failure modes:
 *   - Backend down / 5xx → BullMQ retries with exponential backoff
 *   - Backend 404 (order gone) → terminal, swallow + ack
 *   - Backend 400 (invalid recalc reason) → terminal, log + ack
 */
import "dotenv/config";
import {
  QUEUE_NAMES,
  attachLifecycleHandlers,
  runWorker,
  type EtaRecalcJob,
} from "@gatimitra/queue";
import { incrCounter } from "@gatimitra/logger";

// Startup env validation — fail loud + early.
function requireEnv(keys: string[]): void {
  const missing = keys.filter((k) => !process.env[k] || !process.env[k]!.trim());
  if (missing.length > 0) {
    console.error(`[eta] missing required env: ${missing.join(", ")}`);
    console.error("[eta] copy services/eta-worker/.env.example → .env and fill it in");
    process.exit(2);
  }
}
requireEnv(["REDIS_URL", "BACKEND_INTERNAL_URL", "INTERNAL_API_TOKEN"]);

const log = {
  info: (...args: unknown[]) => console.log("[eta]", ...args),
  warn: (...args: unknown[]) => console.warn("[eta]", ...args),
  error: (...args: unknown[]) => console.error("[eta]", ...args),
};

const BACKEND_BASE = process.env.BACKEND_INTERNAL_URL ?? "http://backend:3000";
const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN ?? "";

if (!INTERNAL_TOKEN) {
  log.warn("INTERNAL_API_TOKEN is empty — backend will reject recalc calls.");
}

log.info("eta-worker booting", { backend: BACKEND_BASE });

runWorker<typeof QUEUE_NAMES.ETA_RECALC>(
  QUEUE_NAMES.ETA_RECALC,
  async (job, jobLog) => {
    const { orderIdText, reason } = job.data as EtaRecalcJob;
    const res = await fetch(
      `${BACKEND_BASE}/v1/eta/orders/${encodeURIComponent(orderIdText)}/recalc`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Same shared secret as payment-worker — backend internal routes
          // use one token across all in-cluster callers.
          "x-internal-token": INTERNAL_TOKEN,
        },
        body: JSON.stringify({ reason }),
      },
    );

    if (res.status === 404) {
      // Order no longer exists (deleted / migrated away). Terminal.
      jobLog.warn(`order ${orderIdText} not found — ack`);
      incrCounter("eta_recalc_total", "ETA recalc outcomes", 1, { outcome: "not_found" });
      return { skipped: true };
    }
    if (res.status === 400) {
      // Bad reason / payload — won't get better on retry. Terminal.
      jobLog.warn(`bad recalc request for ${orderIdText} (400) — ack`);
      incrCounter("eta_recalc_total", "ETA recalc outcomes", 1, { outcome: "bad_request" });
      return { skipped: true };
    }
    if (!res.ok) {
      // 5xx / network — throw so BullMQ backs off + retries.
      incrCounter("eta_recalc_total", "ETA recalc outcomes", 1, { outcome: "retry" });
      throw new Error(`eta recalc http ${res.status} order=${orderIdText}`);
    }

    incrCounter("eta_recalc_total", "ETA recalc outcomes", 1, { outcome: "ok", reason });
    jobLog.info(`recalc ok order=${orderIdText} reason=${reason}`);
    return { ok: true };
  },
  { concurrency: 4, log },
);

log.info("eta-worker ready");
await attachLifecycleHandlers(log);
log.info("eta-worker stopped");
process.exit(0);
