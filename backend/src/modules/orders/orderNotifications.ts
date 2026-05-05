/**
 * order_notifications outbox helpers.
 *
 * Why an outbox? After a food order is placed we must notify:
 *   - the merchant (so the kitchen can accept and start preparing),
 *   - the rider pool (so dispatch can start),
 *   - the customer (confirmation + tracking entry point).
 *
 * Push / realtime / email are best-effort and can fail. If we fired them
 * inline with the placement transaction any transient failure would roll the
 * whole order back. Instead we INSERT rows into `order_notifications` in the
 * same transaction as the order, so:
 *   - the order is durable irrespective of delivery success,
 *   - a worker / realtime listener picks up `status = 'pending'` rows and
 *     delivers them with retries,
 *   - we keep a full audit trail of what was attempted, when, and why.
 *
 * This file only knows how to INSERT intents. Actual delivery adapters live
 * elsewhere and flip rows to `delivered` / `failed`.
 */
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { orderNotifications } from "../../db/schema.js";

export type PlacementNotificationContext = {
  orderId: string;
  customerId: number | null;
  merchantStoreId: number | null;
  merchantParentId: number | null;
  grandTotal: number;
  itemCount: number;
  /** Public-facing order code (usually equal to orderId, kept explicit for payload clarity). */
  orderCode?: string;
  /** Short merchant-facing summary, e.g. "3 items • ₹342". Optional. */
  summary?: string | null;
};

/**
 * Insert one row per audience (merchant, customer, rider_dispatch) inside the
 * ongoing transaction. Safe to call multiple times — if the caller wants dedup
 * they can read back by order_id.
 *
 * Uses the same DB/tx object the caller is in so these writes commit atomically
 * with the order row. If the order rolls back, the notifications roll back too.
 */
export async function enqueuePlacementNotifications(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  ctx: PlacementNotificationContext
): Promise<void> {
  const basePayload = {
    orderId: ctx.orderId,
    orderCode: ctx.orderCode ?? ctx.orderId,
    grandTotal: ctx.grandTotal,
    itemCount: ctx.itemCount,
    merchantStoreId: ctx.merchantStoreId,
    merchantParentId: ctx.merchantParentId,
    customerId: ctx.customerId,
    summary: ctx.summary ?? null,
  } as Record<string, unknown>;

  const rows = [
    {
      orderId: ctx.orderId,
      audience: "merchant",
      channel: "realtime",
      eventType: "ORDER_PLACED",
      recipientType: "merchant_store",
      recipientId: ctx.merchantStoreId != null ? String(ctx.merchantStoreId) : null,
      payload: basePayload,
      status: "pending" as const,
      nextAttemptAt: sql`NOW()`,
    },
    {
      orderId: ctx.orderId,
      audience: "rider_dispatch",
      channel: "internal",
      eventType: "ORDER_READY_FOR_DISPATCH",
      recipientType: "rider_pool",
      recipientId: ctx.merchantStoreId != null ? `store:${ctx.merchantStoreId}` : null,
      payload: basePayload,
      status: "pending" as const,
      nextAttemptAt: sql`NOW()`,
    },
    {
      orderId: ctx.orderId,
      audience: "customer",
      channel: "realtime",
      eventType: "ORDER_PLACED",
      recipientType: "customer",
      recipientId: ctx.customerId != null ? String(ctx.customerId) : null,
      payload: basePayload,
      status: "pending" as const,
      nextAttemptAt: sql`NOW()`,
    },
  ];

  // One batch insert is cheaper than three round-trips.
  await tx.insert(orderNotifications).values(
    rows.map((r) => ({
      orderId: r.orderId,
      audience: r.audience,
      channel: r.channel,
      eventType: r.eventType,
      recipientType: r.recipientType ?? undefined,
      recipientId: r.recipientId ?? undefined,
      payload: r.payload,
      status: r.status,
      nextAttemptAt: r.nextAttemptAt as unknown as Date, // sql`NOW()` is valid for timestamptz
    }))
  );
}
