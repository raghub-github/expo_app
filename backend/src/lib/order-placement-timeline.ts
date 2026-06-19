import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { toTimestamptzParam } from "./sql-timestamps.js";

/** Canonical timeline statuses for customer checkout → order placed. */
export const PLACEMENT_TIMELINE_STATUSES = [
  "Created",
  "Bill Ready",
  "Payment Initiated At",
  "Pymt Assign RX",
] as const;

export type PlacementTimelineStatus = (typeof PLACEMENT_TIMELINE_STATUSES)[number];

function rowsFromExecute<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: T[] })?.rows;
  return rows ?? [];
}


export type AppendTimelineInput = {
  orderCorePk: number;
  status: string;
  previousStatus?: string | null;
  actorType: "customer" | "system" | "store" | "rider" | "admin" | "agent";
  actorId?: number | null;
  actorName?: string | null;
  statusMessage?: string | null;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
};

export async function appendOrderTimeline(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  input: AppendTimelineInput
): Promise<void> {
  const occurredAt = toTimestamptzParam(input.occurredAt ?? new Date());
  await tx.execute(sql`
    INSERT INTO order_timelines (
      order_id,
      status,
      previous_status,
      actor_type,
      actor_id,
      actor_name,
      status_message,
      metadata,
      occurred_at
    )
    VALUES (
      ${input.orderCorePk},
      ${input.status},
      ${input.previousStatus ?? null},
      ${input.actorType},
      ${input.actorId ?? null},
      ${input.actorName ?? null},
      ${input.statusMessage ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb,
      ${occurredAt}::timestamptz
    )
  `);
}

export type RecordPlacementTimelinesInput = {
  orderCorePk: number;
  customerId: number;
  pendingId: string;
  /** When pending row was created (checkout session). */
  pendingCreatedAt: Date;
  /** When Razorpay order was created (payment screen). */
  paymentStartedAt?: Date | null;
  /** When payment succeeded / order finalized. */
  finalizedAt: Date;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  orderIdText?: string;
};

/**
 * After orders_core INSERT, DB trigger adds "Created".
 * Append Bill Ready → Payment Initiated At → Pymt Assign RX with realistic timestamps.
 */
export async function recordPlacementTimelines(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  input: RecordPlacementTimelinesInput
): Promise<void> {
  const existing = rowsFromExecute<{ status: string }>(
    await tx.execute(
      sql`SELECT status FROM order_timelines WHERE order_id = ${input.orderCorePk} ORDER BY occurred_at ASC, id ASC`
    )
  );
  const have = new Set(existing.map((r) => r.status));

  const billAt = new Date(input.pendingCreatedAt);
  const payInitAt = input.paymentStartedAt
    ? new Date(input.paymentStartedAt)
    : new Date(billAt.getTime() + 500);
  const assignAt = new Date(input.finalizedAt);

  const meta = {
    pending_id: input.pendingId,
    order_id_text: input.orderIdText ?? null,
    razorpay_order_id: input.razorpayOrderId ?? null,
    razorpay_payment_id: input.razorpayPaymentId ?? null,
  };

  let prev: string | null = have.has("Created") ? "Created" : null;

  if (!have.has("Bill Ready")) {
    await appendOrderTimeline(tx, {
      orderCorePk: input.orderCorePk,
      status: "Bill Ready",
      previousStatus: prev,
      actorType: "system",
      actorId: input.customerId,
      occurredAt: billAt,
      statusMessage: "Checkout bill computed",
      metadata: meta,
    });
    prev = "Bill Ready";
  } else {
    prev = "Bill Ready";
  }

  if (!have.has("Payment Initiated At")) {
    await appendOrderTimeline(tx, {
      orderCorePk: input.orderCorePk,
      status: "Payment Initiated At",
      previousStatus: prev,
      actorType: "customer",
      actorId: input.customerId,
      occurredAt: payInitAt,
      statusMessage: "Customer started payment",
      metadata: meta,
    });
    prev = "Payment Initiated At";
  } else {
    prev = "Payment Initiated At";
  }

  if (!have.has("Pymt Assign RX")) {
    await appendOrderTimeline(tx, {
      orderCorePk: input.orderCorePk,
      status: "Pymt Assign RX",
      previousStatus: prev,
      actorType: "system",
      actorId: input.customerId,
      occurredAt: assignAt,
      statusMessage: "Payment captured; order assigned",
      metadata: meta,
    });
  }

  await tx.execute(sql`
    UPDATE orders_core
    SET current_status = 'Pymt Assign RX', updated_at = now()
    WHERE id = ${input.orderCorePk}
  `);
}
