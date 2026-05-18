import type { Sql } from "postgres";
import {
  buildAcceptedByLabel,
  type MerchantOrderActionMode,
  type MerchantOrderActionSource,
} from "./merchant-order-food-action-labels.js";

const DEFAULT_ETA_MINUTES = 45;

export type AcceptanceTimelineInput = {
  orderCorePk: number;
  previousStatus?: string | null;
  actionSource?: MerchantOrderActionSource;
  acceptMode?: MerchantOrderActionMode;
  acceptedByLabel?: string | null;
  statusMessage?: string | null;
};

/**
 * Append a single "Accepted" row to order_timelines (idempotent per order).
 * Records accept_mode and action_source in metadata.
 */
export async function recordAcceptanceTimeline(
  dbSql: Sql,
  input: AcceptanceTimelineInput
): Promise<void> {
  const actionSource = input.actionSource ?? "website";
  const acceptMode = input.acceptMode ?? "manual";
  const label =
    input.acceptedByLabel?.trim() ||
    buildAcceptedByLabel(actionSource, acceptMode);
  const message = input.statusMessage?.trim() || label;
  const actorType =
    actionSource === "admin"
      ? "admin"
      : actionSource === "system"
        ? "system"
        : "store";
  const metadata = {
    accept_mode: acceptMode,
    action_source: actionSource,
    accepted_by_label: label,
  };

  const etaAt = new Date(Date.now() + DEFAULT_ETA_MINUTES * 60 * 1000).toISOString();

  await dbSql`
    INSERT INTO order_timelines (
      order_id,
      status,
      previous_status,
      actor_type,
      status_message,
      metadata,
      occurred_at,
      expected_by_at
    )
    SELECT
      ${input.orderCorePk},
      'Accepted',
      COALESCE(
        (
          SELECT ot.status
          FROM order_timelines ot
          WHERE ot.order_id = ${input.orderCorePk}
          ORDER BY ot.occurred_at DESC, ot.id DESC
          LIMIT 1
        ),
        ${input.previousStatus ?? null}
      ),
      ${actorType},
      ${message},
      ${JSON.stringify(metadata)}::jsonb,
      NOW(),
      ${etaAt}::timestamptz
    WHERE NOT EXISTS (
      SELECT 1
      FROM order_timelines ot
      WHERE ot.order_id = ${input.orderCorePk}
        AND ot.status = 'Accepted'
    )
  `;

  await dbSql`
    UPDATE orders_core
    SET
      current_status = 'ACCEPTED',
      updated_at = NOW(),
      estimated_delivery_time = COALESCE(estimated_delivery_time, ${etaAt}::timestamptz),
      first_eta_at = COALESCE(first_eta_at, ${etaAt}::timestamptz)
    WHERE id = ${input.orderCorePk}
      AND upper(COALESCE(current_status, '')) NOT IN ('CANCELLED', 'DELIVERED', 'RTO')
  `;
}
