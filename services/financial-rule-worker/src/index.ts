/**
 * financial-rule-worker — processes financial_rule.* outbox events and
 * sends approval reminders for APPROVAL_REQUIRED executions.
 */
import "dotenv/config";
import postgres from "postgres";
import { scheduleRepeating, QUEUE_NAMES, attachLifecycleHandlers, runWorker } from "@gatimitra/queue";

const log = {
  info: (...args: unknown[]) => console.log("[fin-rule]", ...args),
  warn: (...args: unknown[]) => console.warn("[fin-rule]", ...args),
  error: (...args: unknown[]) => console.error("[fin-rule]", ...args),
};

const DATABASE_URL = process.env.DATABASE_URL;
const BACKEND_BASE = process.env.BACKEND_INTERNAL_URL ?? "http://backend:3000";
const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN ?? "";
const POLL_INTERVAL_MS = Number(process.env.FIN_RULE_POLL_INTERVAL_MS ?? 3000);
const BATCH_SIZE = Number(process.env.FIN_RULE_BATCH_SIZE ?? 25);
const APPROVAL_NOTIFY_EVERY_SEC = Number(process.env.FIN_RULE_APPROVAL_NOTIFY_SEC ?? 300);

if (!DATABASE_URL) {
  log.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 4, idle_timeout: 20 });

async function postInternal(path: string, body: unknown): Promise<boolean> {
  const res = await fetch(`${BACKEND_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": INTERNAL_TOKEN,
    },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    log.warn(`internal ${path} failed status=${res.status} body=${text.slice(0, 200)}`);
    return false;
  }
  return true;
}

async function processOutboxBatch(): Promise<number> {
  const rows = await sql<
    Array<{ id: number; topic: string; payload: Record<string, unknown> }>
  >`
    SELECT id, topic, payload
    FROM event_outbox
    WHERE published_at IS NULL
      AND topic LIKE 'financial_rule.%'
    ORDER BY created_at ASC
    LIMIT ${BATCH_SIZE}
    FOR UPDATE SKIP LOCKED
  `;

  let processed = 0;
  for (const row of rows) {
    const ok = await postInternal("/v1/internal/financial-rules/process-event", {
      topic: row.topic,
      payload: row.payload,
      outboxId: row.id,
    });
    if (ok) {
      await sql`UPDATE event_outbox SET published_at = NOW() WHERE id = ${row.id}`;
      processed++;
    } else {
      await sql`
        UPDATE event_outbox
        SET attempts = attempts + 1, last_error = 'financial-rule-worker process failed'
        WHERE id = ${row.id}
      `;
    }
  }
  return processed;
}

let stopping = false;

async function pollLoop() {
  while (!stopping) {
    try {
      const n = await processOutboxBatch();
      if (n > 0) log.info({ processed: n }, "outbox batch processed");
    } catch (err) {
      log.error({ err: (err as Error).message }, "poll error");
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

runWorker(
  QUEUE_NAMES.FINANCIAL_RULE_APPROVAL_NOTIFY,
  async (_job, jobLog) => {
    const ok = await postInternal("/v1/internal/financial-rules/notify-pending-approvals", {
      limit: 25,
    });
    if (!ok) throw new Error("notify-pending-approvals failed");
    jobLog.info("approval reminders sent");
  },
  { concurrency: 1, log },
);

await scheduleRepeating(
  QUEUE_NAMES.FINANCIAL_RULE_APPROVAL_NOTIFY,
  { scheduled: true },
  { every: APPROVAL_NOTIFY_EVERY_SEC * 1000 },
).catch((err) => log.warn("scheduleRepeating failed:", (err as Error).message));

log.info(
  { backend: BACKEND_BASE, pollMs: POLL_INTERVAL_MS, approvalSec: APPROVAL_NOTIFY_EVERY_SEC },
  "financial-rule-worker ready",
);

void pollLoop();

await attachLifecycleHandlers(log);
