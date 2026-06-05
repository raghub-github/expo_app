/**
 * outbox-relay — polls event_outbox for unpublished rows and pushes them onto
 * a message bus (Kafka or, in development, a Redis stream fallback). Marks
 * the row published once the broker acks.
 *
 * Algorithm (single replica safe; distributed lock if you scale to >1):
 *   loop every POLL_INTERVAL_MS:
 *     SELECT id, topic, payload FROM event_outbox
 *       WHERE published_at IS NULL
 *       ORDER BY created_at ASC
 *       LIMIT BATCH_SIZE
 *       FOR UPDATE SKIP LOCKED      -- per-row lock, lets parallel relays cooperate
 *     for each row:
 *       publish to bus
 *       UPDATE event_outbox SET published_at = NOW() WHERE id = ...
 *
 * Failure modes:
 *   - bus unreachable → row stays unpublished, attempts++, last_error logged,
 *     retried next tick
 *   - schema drift → eventSchema.parse throws, row is moved to a poison-queue
 *     (we just bump attempts; manual cleanup if it persists)
 *
 * Bus selection (decided at boot from env):
 *   - KAFKA_BROKERS set    → use kafkajs Producer
 *   - otherwise             → use Redis stream `gm.events` (good enough for
 *                            local dev; consumers read via XREAD)
 */
import "dotenv/config";
import postgres from "postgres";
import { Kafka, type Producer } from "kafkajs";
import { getRedis, closeRedis } from "@gatimitra/redis";
import { createLogger, incrCounter } from "@gatimitra/logger";
import { eventSchema } from "@gatimitra/event-contracts";

const log = createLogger({ service: "outbox-relay" });
const DATABASE_URL = process.env.DATABASE_URL;
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? "").trim();
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 2000);
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 50);

if (!DATABASE_URL) {
  log.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 4, idle_timeout: 20 });

/* ─── Bus adapters ───────────────────────────────────────────────── */

type Bus = {
  publish(topic: string, payload: unknown): Promise<void>;
  close(): Promise<void>;
  name: string;
};

async function makeKafkaBus(brokers: string[]): Promise<Bus> {
  const kafka = new Kafka({ clientId: "outbox-relay", brokers });
  const producer: Producer = kafka.producer({ allowAutoTopicCreation: true });
  await producer.connect();
  log.info({ brokers }, "kafka producer connected");
  return {
    name: "kafka",
    publish: async (topic, payload) => {
      await producer.send({
        topic,
        messages: [{ value: JSON.stringify(payload) }],
      });
    },
    close: async () => {
      await producer.disconnect().catch(() => undefined);
    },
  };
}

async function makeRedisStreamBus(): Promise<Bus> {
  const redis = getRedis();
  log.info("kafka not configured — using Redis stream fallback (gm.events)");
  return {
    name: "redis-stream",
    publish: async (topic, payload) => {
      // XADD gm.events * topic <topic> data <json>
      await redis.xadd(
        "gm.events",
        "MAXLEN",
        "~",
        "100000", // ring buffer cap to prevent unbounded growth
        "*",
        "topic",
        topic,
        "data",
        JSON.stringify(payload),
      );
    },
    close: async () => undefined,
  };
}

const bus: Bus = KAFKA_BROKERS.length > 0
  ? await makeKafkaBus(KAFKA_BROKERS.split(",").map((s) => s.trim()))
  : await makeRedisStreamBus();

/* ─── Relay loop ──────────────────────────────────────────────────── */

let stopping = false;

async function relayBatch(): Promise<number> {
  const rows = await sql<
    Array<{ id: number; topic: string; payload: Record<string, unknown> }>
  >`
    SELECT id, topic, payload
    FROM event_outbox
    WHERE published_at IS NULL
      AND topic NOT LIKE 'financial_rule.%'
    ORDER BY created_at ASC
    LIMIT ${BATCH_SIZE}
    FOR UPDATE SKIP LOCKED
  `;
  if (rows.length === 0) return 0;

  let published = 0;
  for (const row of rows) {
    try {
      // Financial rule events use a separate worker; domain events stay schema-validated.
      const evt =
        row.topic.startsWith("financial_rule.")
          ? row.payload
          : eventSchema.parse(row.payload);
      await bus.publish(row.topic, evt);
      await sql`UPDATE event_outbox SET published_at = NOW() WHERE id = ${row.id}`;
      published++;
      incrCounter("outbox_published_total", "Events relayed from outbox", 1, {
        topic: row.topic,
        bus: bus.name,
      });
    } catch (err) {
      const msg = (err as Error).message;
      await sql`UPDATE event_outbox SET attempts = attempts + 1, last_error = ${msg} WHERE id = ${row.id}`;
      incrCounter("outbox_publish_failed_total", "Outbox publish failures", 1, {
        topic: row.topic,
      });
      log.warn({ id: row.id, topic: row.topic, err: msg }, "publish failed; will retry");
    }
  }
  return published;
}

async function loop() {
  while (!stopping) {
    try {
      const n = await relayBatch();
      if (n > 0) log.info({ published: n }, "batch relayed");
    } catch (err) {
      log.error({ err: (err as Error).message }, "relay batch error");
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

/* ─── Shutdown ───────────────────────────────────────────────────── */

const shutdown = async (signal: string) => {
  log.info({ signal }, "shutting down");
  stopping = true;
  await bus.close().catch(() => undefined);
  await sql.end({ timeout: 5 }).catch(() => undefined);
  await closeRedis();
  process.exit(0);
};
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

log.info({ bus: bus.name, intervalMs: POLL_INTERVAL_MS, batchSize: BATCH_SIZE }, "outbox-relay ready");
await loop();
