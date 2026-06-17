/**
 * Canonical cancellation write for dashboard Supabase routes (merchant portal PATCH).
 * Keep in sync with partnersite/src/lib/record-order-cancellation.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOrderCancellationRefund } from "@/lib/order-cancellation-refund";
import { applyMerchantOrderCancellationLedger } from "@/lib/orders/apply-merchant-cancellation-debit";

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
  metadata?: Record<string, unknown>;
  cancellationDetails?: Record<string, unknown>;
};

function slugReasonCode(text: string): string {
  const slug = text
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (slug || "CANCELLED").slice(0, 200);
}

export function actorTypeFromSource(
  actionSource: string | null | undefined
): OrderCancellationActorType {
  const s = String(actionSource ?? "website").toLowerCase();
  if (s === "admin" || s === "dashboard") return "admin";
  if (s === "system" || s === "auto") return "system";
  if (s === "customer") return "customer";
  if (s === "rider") return "rider";
  return "store";
}

export async function recordOrderCancellation(
  db: SupabaseClient,
  input: RecordOrderCancellationInput
): Promise<number | null> {
  const { data: foodLink } = await db
    .from("orders_food")
    .select("cancellation_reason_id, accepted_at, order_status")
    .eq("order_id", input.orderCorePk)
    .maybeSingle();
  const { data: coreRow } = await db
    .from("orders_core")
    .select("grand_total")
    .eq("id", input.orderCorePk)
    .maybeSingle();

  const refund =
    input.refundStatus != null
      ? { refundStatus: input.refundStatus, refundAmount: input.refundAmount ?? null }
      : resolveOrderCancellationRefund({
          engineResult: (input.metadata?.financial_rule_engine as Record<string, unknown>) ?? undefined,
        });

  const linked = Number(foodLink?.cancellation_reason_id);
  const { data: latest } = await db
    .from("order_cancellation_reasons")
    .select("id")
    .eq("order_id", input.orderCorePk)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestId = Number(latest?.id);
  const existingReasonId =
    Number.isFinite(linked) && linked > 0 ? linked : Number.isFinite(latestId) && latestId > 0 ? latestId : null;

  if (existingReasonId != null) {
    await db
      .from("order_cancellation_reasons")
      .update({
        action_source: input.actionSource ?? undefined,
        cancel_mode: input.cancelMode ?? undefined,
        cancelled_by_type: input.cancelledByType,
        cancelled_by_label: input.cancelledByLabel,
        display_reason: input.displayReason,
        refund_status: refund.refundStatus,
        refund_amount: refund.refundAmount,
      })
      .eq("id", existingReasonId);
    const details = input.cancellationDetails ?? {
      version: 1,
      source: input.cancelledByType,
      cancelled_by_label: input.cancelledByLabel,
      rejected_reason: input.displayReason,
      action_source: input.actionSource,
      cancel_mode: input.cancelMode,
    };
    await db.from("orders_core").update({ cancellation_reason_id: existingReasonId, cancellation_details: details }).eq("id", input.orderCorePk);
    await db
      .from("orders_food")
      .update({
        cancellation_reason_id: existingReasonId,
        cancelled_by_type: input.cancelledByType,
        cancellation_details: details,
      })
      .eq("order_id", input.orderCorePk);
    await syncMerchantCancellationLedger(input);
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
  };
  const details = input.cancellationDetails ?? {
    version: 1,
    source: input.cancelledByType,
    cancelled_by_label: input.cancelledByLabel,
    rejected_reason: displayReason || null,
    action_source: input.actionSource ?? null,
    cancel_mode: input.cancelMode ?? null,
  };

  const row: Record<string, unknown> = {
    order_id: input.orderCorePk,
    cancelled_by: input.cancelledBy,
    cancelled_by_id: input.cancelledById ?? null,
    reason_code: reasonCode,
    reason_text: displayReason || input.reasonText || null,
    refund_status: refund.refundStatus,
    refund_amount: refund.refundAmount,
    metadata: meta,
    cancelled_by_type: input.cancelledByType,
    cancelled_by_label: input.cancelledByLabel,
    display_reason: displayReason || null,
    action_source: input.actionSource ?? null,
    cancel_mode: input.cancelMode ?? null,
  };

  let cancellationReasonId: number | null = null;
  const { data: inserted, error } = await db
    .from("order_cancellation_reasons")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    const { data: legacy, error: legacyErr } = await db
      .from("order_cancellation_reasons")
      .insert({
        order_id: input.orderCorePk,
        cancelled_by: input.cancelledBy,
        cancelled_by_id: input.cancelledById ?? null,
        reason_code: reasonCode,
        reason_text: displayReason || input.reasonText || null,
        refund_status: refund.refundStatus,
    refund_amount: refund.refundAmount,
        metadata: meta,
      })
      .select("id")
      .single();
    if (legacyErr) {
      console.error("[recordOrderCancellation] insert failed", legacyErr);
      return null;
    }
    cancellationReasonId = Number(legacy?.id) || null;
  } else {
    cancellationReasonId = Number(inserted?.id) || null;
  }

  if (cancellationReasonId != null) {
    await db
      .from("orders_core")
      .update({
        cancellation_reason_id: cancellationReasonId,
        cancelled_by_type: input.cancelledByType,
        cancellation_details: details,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.orderCorePk);

    await db
      .from("orders_food")
      .update({
        cancellation_reason_id: cancellationReasonId,
        rejected_reason: displayReason || null,
        cancelled_by_label: input.cancelledByLabel,
        cancelled_by_type: input.cancelledByType,
        cancellation_details: details,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", input.orderCorePk);
  }

  await syncMerchantCancellationLedger(input);
  return cancellationReasonId;
}

async function syncMerchantCancellationLedger(input: RecordOrderCancellationInput): Promise<void> {
  try {
    const merchantDebit =
      typeof input.metadata?.merchantDebit === "string"
        ? input.metadata.merchantDebit
        : typeof (input.metadata as { merchant_debit?: string } | undefined)?.merchant_debit === "string"
          ? (input.metadata as { merchant_debit: string }).merchant_debit
          : null;
    await applyMerchantOrderCancellationLedger({
      orderCoreId: input.orderCorePk,
      merchantDebit,
      actorSystemUserId: input.cancelledById ?? null,
      source: "merchant_portal_cancel",
    });
  } catch (ledgerErr) {
    console.warn("[recordOrderCancellation] merchant ledger failed:", ledgerErr);
  }
}
