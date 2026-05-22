/**
 * Transactional outbox writer.
 *
 * Producers call this INSIDE the same DB transaction as the domain change.
 * The outbox-relay (a separate service) polls unpublished rows and pushes
 * them to Kafka, guaranteeing exactly-once-from-the-DB delivery semantics
 * even if the broker is down at write time.
 *
 * Usage inside an order placement transaction:
 *
 *   await db.transaction(async (tx) => {
 *     await tx.insert(ordersCore).values({...});
 *     await writeOutbox(tx, TOPICS.ORDER_CREATED, {
 *       type: TOPICS.ORDER_CREATED,
 *       eventId: ulid(),
 *       occurredAt: new Date().toISOString(),
 *       orderIdText, customerId, merchantStoreId, finalAmountPaise, itemCount,
 *     });
 *   });
 *
 * Important: the schema is `event_outbox` (singular `topic`/`payload`), see
 * migration 0236_event_outbox.sql.
 */
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eventSchema, type DomainEvent, type Topic } from "@gatimitra/event-contracts";

type DbOrTx = PostgresJsDatabase<Record<string, unknown>>;

/**
 * Validate + persist. The schema.parse() catches drift between producer
 * code and the registered contract — failing here is louder than corrupt
 * data flowing through Kafka.
 */
export async function writeOutbox(
  db: DbOrTx,
  topic: Topic,
  event: DomainEvent,
): Promise<void> {
  const parsed = eventSchema.parse(event);
  if (parsed.type !== topic) {
    throw new Error(`writeOutbox: topic/payload mismatch — topic=${topic} payload.type=${parsed.type}`);
  }
  await db.execute(sql`
    INSERT INTO event_outbox (topic, payload)
    VALUES (${topic}, ${JSON.stringify(parsed)}::jsonb)
  `);
}
