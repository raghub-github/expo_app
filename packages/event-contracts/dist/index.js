/**
 * @gatimitra/event-contracts — one source of truth for every domain event
 * the platform publishes.
 *
 *   import { TOPICS, orderCreatedV1, eventSchema } from "@gatimitra/event-contracts";
 *
 * Producers (backend route handlers) call:
 *   const evt = orderCreatedV1.parse({ type: TOPICS.ORDER_CREATED, ... });
 *   await writeOutbox(TOPICS.ORDER_CREATED, evt);
 *
 * Consumers (outbox-relay, future analytics-worker) call:
 *   const evt = eventSchema.parse(message);
 *   if (evt.type === "order.created.v1") { ... typed branch ... }
 */
export * from "./topics.js";
export * from "./schemas.js";
//# sourceMappingURL=index.js.map