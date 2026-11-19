/**
 * Guards for background reconcilers (the money safety nets).
 *
 * 1. A run never blocks the next one forever. Each poller keeps a `running`
 *    flag; if one run hangs (the pooler drops statement_timeout / lock_timeout,
 *    so a stuck query has no server-side deadline) the flag never clears and
 *    every later tick silently skips. withRunDeadline() releases the poller
 *    after a deadline — the hung promise is abandoned, the next tick runs.
 *    Every reconciler step is idempotent, so a late finish is harmless.
 *
 * 2. A failure is visible in the database, not only in container logs. A
 *    settlement that keeps failing is recorded in payment_events (deduplicated:
 *    the same order + same error at most once an hour), so ops can see why a
 *    rider has not been settled without shell access to the VPS.
 */
import { getSql } from "../db/client.js";

export class ReconcilerDeadlineError extends Error {
  constructor(name: string, ms: number) {
    super(`${name}: run exceeded ${ms} ms — released so the next tick can run`);
  }
}

export async function withRunDeadline<T>(name: string, ms: number, run: () => Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ReconcilerDeadlineError(name, ms)), ms);
    if (timer.unref) timer.unref();
  });
  try {
    return await Promise.race([run(), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const lastRecorded = new Map<string, number>();
const RECORD_EVERY_MS = 60 * 60_000;

/** Durable, deduplicated record of a reconciler failure (payment_events). */
export async function recordReconcilerFailure(args: {
  eventType: string;
  orderId: string | null;
  message: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const message = String(args.message ?? "").slice(0, 500);
  const key = `${args.eventType}|${args.orderId ?? ""}|${message}`;
  const now = Date.now();
  const prev = lastRecorded.get(key);
  if (prev != null && now - prev < RECORD_EVERY_MS) return;
  lastRecorded.set(key, now);
  if (lastRecorded.size > 5000) {
    for (const [k, at] of lastRecorded) if (now - at > RECORD_EVERY_MS) lastRecorded.delete(k);
  }
  try {
    const sql = getSql();
    await sql`
      INSERT INTO payment_events (event_type, source, order_id, failure_message, payload)
      VALUES (${args.eventType}, 'reconciler', ${args.orderId}, ${message},
              ${JSON.stringify(args.payload ?? {})}::text::jsonb)
    `;
  } catch (err) {
    console.warn("[reconciler-guard] could not record failure", (err as Error)?.message ?? err);
  }
}
