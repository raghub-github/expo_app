import type { Sql } from "postgres";
import { resolveOrderCancellationRefund } from "./order-cancellation-refund.js";

export type OrderCancellationActorType =
  | "store"
  | "customer"
  | "system"
  | "rider"
  | "admin";

export type RecordOrderCancellationInput = {
  orderCorePk: number;
  cancelledBy: string;
  cancelledById?: number | null;
  reasonCode?: string;
  reasonText?: string | null;
  refundStatus?: string;
  refundAmount?: number | null;
  previousStatus?: string;
  acceptedAt?: string | null;
  grandTotal?: unknown;
  displayReason: string;
  cancelledByType: OrderCancellationActorType;
  cancelledByLabel: string;
  actionSource?: string | null;
  cancelMode?: "auto" | "manual" | null;
  catalogReasonId?: number | null;
  attribute?: string | null;
  rejectionLabel?: string | null;
  metadata?: Record<string, unknown>;
  cancellationDetails?: Record<string, unknown>;
};

async function patchCancellationReasonRow(
  sql: Sql,
  reasonId: number,
  input: RecordOrderCancellationInput,
  refund: { refundStatus: string; refundAmount: number | null }
): Promise<void> {
  const displayReason = (input.displayReason ?? input.reasonText ?? "").trim();
  const meta = {
    ...(input.metadata ?? {}),
    source: input.cancelledByType,
    cancelled_by_label: input.cancelledByLabel,
    rejected_reason: displayReason || null,
    action_source: input.actionSource ?? null,
    cancel_mode: input.cancelMode ?? null,
  };
  try {
    await sql`
      UPDATE order_cancellation_reasons
      SET
        cancelled_by_type = COALESCE(${input.cancelledByType}, cancelled_by_type),
        cancelled_by_label = COALESCE(${input.cancelledByLabel}, cancelled_by_label),
        display_reason = COALESCE(${displayReason || null}, display_reason),
        action_source = COALESCE(${input.actionSource ?? null}, action_source),
        cancel_mode = COALESCE(${input.cancelMode ?? null}, cancel_mode),
        refund_status = CASE
          WHEN ${refund.refundStatus} = 'pending' THEN 'pending'
          ELSE COALESCE(refund_status, ${refund.refundStatus})
        END,
        refund_amount = COALESCE(${refund.refundAmount}, refund_amount),
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(meta)}::jsonb
      WHERE id = ${reasonId}
    `;
  } catch {
    /* legacy columns */
  }
}

function slugReasonCode(text: string): string {
  const slug = text
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (slug || "CANCELLED").slice(0, 200);
}

/**
 * Canonical cancellation row + orders_core link + orders_food display sync.
 */
export async function recordOrderCancellation(
  sql: Sql,
  input: RecordOrderCancellationInput
): Promise<number | null> {
  const existing = await sql<
    {
      id: number | null;
      cancellation_reason_id: number | null;
      accepted_at: string | null;
      grand_total: unknown;
      previous_status: string | null;
    }[]
  >`
    SELECT ocr.id, f.cancellation_reason_id, f.accepted_at, c.grand_total, f.order_status AS previous_status
    FROM orders_food f
    JOIN orders_core c ON c.id = f.order_id
    LEFT JOIN LATERAL (
      SELECT id FROM order_cancellation_reasons
      WHERE order_id = ${input.orderCorePk}
      ORDER BY created_at DESC
      LIMIT 1
    ) ocr ON TRUE
    WHERE f.order_id = ${input.orderCorePk}
    LIMIT 1
  `;
  const row = existing[0];
  const refund =
    input.refundStatus != null
      ? { refundStatus: input.refundStatus, refundAmount: input.refundAmount ?? null }
      : resolveOrderCancellationRefund({
          engineResult: (input.metadata?.financial_rule_engine as Record<string, unknown>) ?? undefined,
        });

  const linkedId = Number(row?.cancellation_reason_id);
  const latestId = Number(row?.id);
  const existingReasonId =
    Number.isFinite(linkedId) && linkedId > 0
      ? linkedId
      : Number.isFinite(latestId) && latestId > 0
        ? latestId
        : null;

  if (existingReasonId != null) {
    await patchCancellationReasonRow(sql, existingReasonId, input, refund);
    const detailsJson = JSON.stringify(
      input.cancellationDetails ?? {
        version: 1,
        source: input.cancelledByType,
        cancelled_by_label: input.cancelledByLabel,
        rejected_reason: input.displayReason || null,
        action_source: input.actionSource ?? null,
        cancel_mode: input.cancelMode ?? null,
      }
    );
    try {
      await sql`
        UPDATE orders_food
        SET
          cancellation_reason_id = ${existingReasonId},
          cancelled_by_type = ${input.cancelledByType},
          cancellation_details = COALESCE(cancellation_details, '{}'::jsonb) || ${detailsJson}::jsonb
        WHERE order_id = ${input.orderCorePk}
      `;
      await sql`
        UPDATE orders_core
        SET
          cancellation_reason_id = ${existingReasonId},
          cancelled_by_type = ${input.cancelledByType},
          cancellation_details = COALESCE(cancellation_details, '{}'::jsonb) || ${detailsJson}::jsonb
        WHERE id = ${input.orderCorePk}
      `;
    } catch {
      /* non-fatal */
    }
    return existingReasonId;
  }

  const reasonCode =
    (input.reasonCode ?? "").trim() ||
    slugReasonCode(input.displayReason || input.reasonText || "CANCELLED");
  const displayReason = (input.displayReason ?? input.reasonText ?? "").trim();
  const meta = {
    ...(input.metadata ?? {}),
    source: input.cancelledByType,
    cancelled_by_label: input.cancelledByLabel,
    rejected_reason: displayReason || null,
    action_source: input.actionSource ?? null,
    cancel_mode: input.cancelMode ?? null,
    attribute: input.attribute ?? null,
    rejection: input.rejectionLabel ?? null,
    catalogReasonId: input.catalogReasonId ?? null,
  };
  const detailsJson = JSON.stringify(
    input.cancellationDetails ?? {
      version: 1,
      source: input.cancelledByType,
      cancelled_by_label: input.cancelledByLabel,
      rejected_reason: displayReason || null,
      action_source: input.actionSource ?? null,
      cancel_mode: input.cancelMode ?? null,
    }
  );

  let cancellationReasonId: number | null = null;

  try {
    const inserted = await sql<{ id: number }[]>`
      INSERT INTO order_cancellation_reasons (
        order_id, cancelled_by, cancelled_by_id, reason_code, reason_text,
        refund_status, refund_amount, metadata, catalog_reason_id, cancelled_by_type,
        cancelled_by_label, display_reason, attribute, rejection_label,
        action_source, cancel_mode
      ) VALUES (
        ${input.orderCorePk},
        ${input.cancelledBy},
        ${input.cancelledById ?? null},
        ${reasonCode},
        ${input.reasonText ?? (displayReason || null)},
        ${refund.refundStatus},
        ${refund.refundAmount},
        ${JSON.stringify(meta)}::jsonb,
        ${input.catalogReasonId ?? null},
        ${input.cancelledByType},
        ${input.cancelledByLabel},
        ${displayReason || null},
        ${input.attribute ?? null},
        ${input.rejectionLabel ?? null},
        ${input.actionSource ?? null},
        ${input.cancelMode ?? null}
      )
      RETURNING id
    `;
    cancellationReasonId = Number(inserted[0]?.id) || null;
  } catch {
    const legacy = await sql<{ id: number }[]>`
      INSERT INTO order_cancellation_reasons (
        order_id, cancelled_by, cancelled_by_id, reason_code, reason_text,
        refund_status, metadata
      ) VALUES (
        ${input.orderCorePk},
        ${input.cancelledBy},
        ${input.cancelledById ?? null},
        ${reasonCode},
        ${displayReason || input.reasonText || null},
        ${refund.refundStatus},
        ${JSON.stringify(meta)}::jsonb
      )
      RETURNING id
    `;
    cancellationReasonId = Number(legacy[0]?.id) || null;
  }

  if (cancellationReasonId != null) {
    try {
      await sql`
        UPDATE orders_core
        SET
          cancellation_reason_id = ${cancellationReasonId},
          cancelled_by_type = ${input.cancelledByType},
          cancellation_details = COALESCE(cancellation_details, '{}'::jsonb)
            || ${detailsJson}::jsonb,
          cancelled_at = COALESCE(cancelled_at, NOW()),
          cancelled_by = ${input.cancelledBy},
          updated_at = NOW()
        WHERE id = ${input.orderCorePk}
      `;
    } catch {
      await sql`
        UPDATE orders_core
        SET cancellation_reason_id = ${cancellationReasonId}
        WHERE id = ${input.orderCorePk}
      `;
    }
  }

  try {
    await sql`
      UPDATE orders_food
      SET
        cancellation_reason_id = ${cancellationReasonId},
        rejected_reason = ${displayReason || null},
        cancelled_by_label = ${input.cancelledByLabel},
        cancelled_by_type = ${input.cancelledByType},
        cancellation_details = COALESCE(cancellation_details, '{}'::jsonb)
          || ${detailsJson}::jsonb,
        updated_at = NOW()
      WHERE order_id = ${input.orderCorePk}
    `;
  } catch {
    await sql`
      UPDATE orders_food
      SET
        cancellation_reason_id = ${cancellationReasonId},
        rejected_reason = ${displayReason || null},
        cancelled_by_label = ${input.cancelledByLabel},
        updated_at = NOW()
      WHERE order_id = ${input.orderCorePk}
    `;
  }

  return cancellationReasonId;
}
