/**
 * Append-only ride billing activity logger.
 */

import { getSql } from "../../../db/client.js";

export type RideBillingEventType =
  | "ESTIMATED_FARE_GENERATED"
  | "WAITING_STARTED"
  | "WAITING_ENDED"
  | "SURGE_APPLIED"
  | "TOLL_ADDED"
  | "NIGHT_CHARGE_APPLIED"
  | "CUSTOMER_BILL_UPDATED"
  | "SETTLEMENT_GENERATED"
  | "WALLET_DEBITED"
  | "WALLET_CREDITED"
  | "CANCELLATION_COMPENSATION"
  | "RIDE_COMPLETED"
  | "ONLINE_PAYMENT_COMPLETED"
  | "CASH_SETTLEMENT_COMPLETED";

export async function recordRideBillingActivity(input: {
  orderCoreId?: number | null;
  riderId?: number | null;
  customerId?: number | null;
  eventType: RideBillingEventType | string;
  amount?: number | null;
  summary?: string | null;
  payload?: Record<string, unknown>;
  actorType?: string | null;
  actorId?: string | null;
}): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO ride_billing_activity (
        order_core_id, rider_id, customer_id, event_type,
        amount, summary, payload, actor_type, actor_id
      ) VALUES (
        ${input.orderCoreId ?? null},
        ${input.riderId ?? null},
        ${input.customerId ?? null},
        ${input.eventType},
        ${input.amount ?? null},
        ${input.summary ?? null},
        ${JSON.stringify(input.payload ?? {})}::text::jsonb,
        ${input.actorType ?? null},
        ${input.actorId ?? null}
      )
    `;
  } catch (err) {
    // Never fail the money path because audit logging is down.
    console.warn("[rideBillingActivity] write failed:", input.eventType, err);
  }
}
