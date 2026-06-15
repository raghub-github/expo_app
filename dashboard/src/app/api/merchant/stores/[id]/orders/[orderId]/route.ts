/**
 * PATCH /api/merchant/stores/[id]/orders/[orderId]
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolvePartnerPipeline } from "@/lib/partner-orders-unify";
import {
  labelsForStatusUpdate,
  normalizeActionMode,
  normalizeActionSource,
} from "@/lib/merchantOrderFoodActions";
import { ensureMerchantStoreDashboardAccess } from "@/lib/merchant-food-orders/store-access";
import { loadMerchantStoreFoodOrders } from "@/lib/merchant-food-orders/load-store-food-orders";
import { appendAcceptanceTimeline } from "@/lib/orderAcceptanceTimeline";
import { appendCancellationTimeline } from "@/lib/orderCancellationTimeline";
import {
  actorTypeFromSource,
  recordOrderCancellation,
} from "@/lib/record-order-cancellation";
import { refundFieldsFromEngineResult } from "@gatimitra/financial-rules";
import {
  executeOrderCancellationFinancials,
  executeRtoFinancials,
  lookupOrderContext,
} from "@/lib/financial-rule-executor";
import { creditMerchantOrderEarningOnDelivered } from "@/lib/credit-merchant-order-on-delivered";
import { appendReadyTimeline } from "@/lib/orderFoodStatusTimeline";
import { resolveMerchantFoodOrder } from "@/lib/merchant-food-orders/resolve-order-food-row";
import {
  PLATFORM_DEFAULT_PREP_MINUTES,
  resolveAcceptPrepCommitment,
  resolveStoreDefaultPrepMinutes,
  computePreparedLateMinutes,
} from "@/lib/order-prep-time";
import {
  persistMerchantCtmAtAccept,
  resolveMerchantWalletCreditAmount,
} from "@/lib/merchant-order-ctm";

export const runtime = "nodejs";

function getDb() {
  if (!supabaseAdmin) throw new Error("Supabase admin client not configured");
  return supabaseAdmin;
}

function normalizeOrderStatusForTransition(raw: string | null | undefined): string {
  let s = String(raw || "CREATED").toUpperCase().replace("NEW", "CREATED");
  if (s === "PLACED" || s === "ORDER_RECEIVED" || s === "ORDER_PLACED") s = "CREATED";
  return s;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  CREATED: ["ACCEPTED", "CANCELLED"],
  NEW: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "READY_FOR_PICKUP", "CANCELLED"],
  PREPARING: ["READY_FOR_PICKUP", "CANCELLED", "RTO"],
  READY_FOR_PICKUP: ["OUT_FOR_DELIVERY", "CANCELLED", "RTO"],
  OUT_FOR_DELIVERY: ["DELIVERED", "RTO"],
  DELIVERED: [],
  CANCELLED: [],
  RTO: [],
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id, orderId } = await params;
    const storeId = parseInt(id, 10);
    const orderIdNum = parseInt(orderId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(orderIdNum)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const access = await ensureMerchantStoreDashboardAccess(storeId);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    const storeInternalId = access.store.id;

    const body = await request.json().catch(() => ({}));
    const newStatus = String(body?.status || "").toUpperCase();
    const rejectedReason = body?.rejected_reason ?? null;
    const actionSource = normalizeActionSource(body?.action_source ?? "admin");
    const actionMode = normalizeActionMode(body?.accept_mode ?? body?.cancel_mode);
    const actionLabels = labelsForStatusUpdate({
      newStatus,
      actionSource,
      actionMode,
      rejectedReason,
    });

    if (!newStatus) {
      return NextResponse.json({ error: "status required" }, { status: 400 });
    }

    const db = getDb();

    const resolved = await resolveMerchantFoodOrder(db, storeInternalId, orderIdNum);
    if (!resolved) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    let foodRowId = resolved.foodRowId;
    if (foodRowId == null && Number.isFinite(resolved.coreOrderId)) {
      for (let attempt = 0; attempt < 6 && foodRowId == null; attempt += 1) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 350 * attempt));
        }
        const { data: foodForCore } = await db
          .from("orders_food")
          .select("id")
          .eq("order_id", resolved.coreOrderId)
          .maybeSingle();
        if (foodForCore?.id != null) {
          foodRowId = Number(foodForCore.id);
          break;
        }
        const retry = await resolveMerchantFoodOrder(db, storeInternalId, orderIdNum);
        if (retry?.foodRowId != null) {
          foodRowId = retry.foodRowId;
          break;
        }
      }
    }
    if (foodRowId == null) {
      return NextResponse.json({ error: "Food order row not found" }, { status: 404 });
    }

    const { data: existing, error: fetchErr } = await db
      .from("orders_food")
      .select(
        "id, order_id, order_status, merchant_store_id, food_items_total_value, preparation_time_minutes, prep_ready_by_at, preparing_at, accepted_at"
      )
      .eq("id", foodRowId)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const { data: coreRow } = await db
      .from("orders_core")
      .select("merchant_store_id")
      .eq("id", existing.order_id as number)
      .maybeSingle();
    if (!coreRow || Number(coreRow.merchant_store_id) !== storeInternalId) {
      return NextResponse.json({ error: "Order does not belong to this store" }, { status: 403 });
    }

    let currentStatus = normalizeOrderStatusForTransition(existing.order_status as string);
    try {
      const { data: core } = await db
        .from("orders_core")
        .select("status, current_status")
        .eq("id", existing.order_id as number)
        .maybeSingle();
      if (core) {
        const pipeline = resolvePartnerPipeline(
          existing.order_status as string | null,
          (core as { status?: string }).status ?? "assigned",
          (core as { current_status?: string | null }).current_status ?? null
        );
        currentStatus = normalizeOrderStatusForTransition(pipeline);
      }
    } catch {
      /* fallback */
    }

    const allowed = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        { error: `Invalid transition from ${currentStatus} to ${newStatus}` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      order_status: newStatus,
      updated_at: now,
    };

    let acceptPrepReadyByAt: string | null = null;
    let acceptPrepMinutes: number | null = null;

    if (newStatus === "ACCEPTED") {
      updates.accepted_at = now;
      if (actionLabels.accepted_by_label) updates.accepted_by_label = actionLabels.accepted_by_label;

      const { data: storeRow } = await db
        .from("merchant_stores")
        .select("avg_preparation_time_minutes")
        .eq("id", storeInternalId)
        .maybeSingle();
      const storeDefault = resolveStoreDefaultPrepMinutes(
        storeRow?.avg_preparation_time_minutes ?? PLATFORM_DEFAULT_PREP_MINUTES
      );
      const prep = resolveAcceptPrepCommitment({
        acceptedAtIso: now,
        storeDefaultMinutes: storeDefault,
        bodyPrepMinutes: body?.preparation_time_minutes,
        existingOrderPrepMinutes: existing.preparation_time_minutes,
      });
      acceptPrepReadyByAt = prep.prepReadyByAt;
      acceptPrepMinutes = prep.prepMinutes;
      updates.preparation_time_minutes = prep.prepMinutes;
      updates.prep_ready_by_at = prep.prepReadyByAt;
      updates.prep_time_source = prep.prepTimeSource;
    }
    else if (newStatus === "PREPARING") {
      updates.preparing_at = now;
      updates.prepared_at = null;
    } else if (newStatus === "READY_FOR_PICKUP") {
      updates.prepared_at = now;
      if (!existing.preparing_at) updates.preparing_at = now;
      const lateMins = computePreparedLateMinutes(
        now,
        (existing.prep_ready_by_at as string | null) ?? null
      );
      updates.prepared_late_minutes = lateMins;
    }
    else if (newStatus === "OUT_FOR_DELIVERY") updates.dispatched_at = now;
    else if (newStatus === "DELIVERED") updates.delivered_at = now;
    else if (newStatus === "CANCELLED") {
      updates.cancelled_at = now;
      if (rejectedReason) updates.rejected_reason = rejectedReason;
      if (actionLabels.cancelled_by_label) updates.cancelled_by_label = actionLabels.cancelled_by_label;
      updates.cancelled_by_type = actorTypeFromSource(actionSource);
      updates.cancellation_details = {
        version: 1,
        source: actorTypeFromSource(actionSource),
        cancelled_by_label: actionLabels.cancelled_by_label,
        rejected_reason: rejectedReason,
        action_source: actionSource,
        cancel_mode: actionMode,
      };
    } else if (newStatus === "RTO") {
      updates.is_rto = true;
      updates.rto_at = now;
      try {
        await db.rpc("convert_food_order_otp_to_rto", { p_order_id: existing.order_id });
      } catch (e) {
        console.error("[orders PATCH RTO convert]", e);
      }
    }

    const { data: updatedRow, error } = await db
      .from("orders_food")
      .update(updates)
      .eq("id", foodRowId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!updatedRow) {
      return NextResponse.json({ error: "Order not updated" }, { status: 404 });
    }

    try {
      const corePatch: Record<string, unknown> = { current_status: newStatus, updated_at: now };
      if (newStatus === "CANCELLED") {
        corePatch.status = "cancelled";
        corePatch.cancelled_at = now;
        corePatch.cancelled_by = actionSource === "system" ? "SYSTEM" : "MERCHANT";
      }
      if (newStatus === "ACCEPTED" && acceptPrepReadyByAt && acceptPrepMinutes != null) {
        corePatch.prep_ready_by_at = acceptPrepReadyByAt;
        corePatch.prep_time_minutes = acceptPrepMinutes;
      }
      if (newStatus === "READY_FOR_PICKUP" && updates.prepared_late_minutes != null) {
        corePatch.prepared_late_minutes = updates.prepared_late_minutes;
      }
      await db
        .from("orders_core")
        .update(corePatch)
        .eq("id", existing.order_id as number);
    } catch (coreErr) {
      console.warn("[orders PATCH] orders_core sync failed:", coreErr);
    }

    if (newStatus === "ACCEPTED") {
      try {
        await appendAcceptanceTimeline({
          orderCorePk: existing.order_id as number,
          previousStatus: currentStatus,
          actionSource,
          acceptMode: actionMode,
          acceptedByLabel: actionLabels.accepted_by_label,
          expectedByAt: acceptPrepReadyByAt,
        });
      } catch (tlErr) {
        console.warn("[orders PATCH] acceptance timeline failed:", tlErr);
      }
      try {
        await persistMerchantCtmAtAccept(db, {
          ordersCoreId: existing.order_id as number,
          ordersFoodId: foodRowId,
          storeId: storeInternalId,
        });
      } catch (ctmErr) {
        console.warn("[orders PATCH] merchant CTM freeze failed:", ctmErr);
      }
    }

    if (newStatus === "CANCELLED") {
      try {
        await appendCancellationTimeline({
          orderCorePk: existing.order_id as number,
          previousStatus: currentStatus,
          rejectedReason: rejectedReason ?? null,
          actorType: actionSource === "admin" ? "admin" : actionSource === "system" ? "system" : "store",
          cancelMode: actionMode,
        });
      } catch (tlErr) {
        console.warn("[orders PATCH] cancellation timeline failed:", tlErr);
      }
      const displayReason = (rejectedReason ?? "").trim() || "Order cancelled";
      const { data: coreMoney } = await db
        .from("orders_core")
        .select("grand_total, order_id")
        .eq("id", existing.order_id as number)
        .maybeSingle();
      const cancelledByType = actorTypeFromSource(actionSource);
      const orderCtx = await lookupOrderContext(existing.order_id as number);
      const engineResult = await executeOrderCancellationFinancials({
        orderCoreId: existing.order_id as number,
        ordersFoodId: foodRowId,
        coreOrderId: (coreMoney?.order_id as string | null) ?? orderCtx.coreOrderId,
        merchantStoreId: storeInternalId,
        previousStatus: currentStatus,
        cancelledByType,
        orderGross: Number(coreMoney?.grand_total ?? existing.food_items_total_value ?? orderCtx.grandTotal),
        serviceType: orderCtx.serviceType,
      });
      const refund = refundFieldsFromEngineResult(engineResult.raw);
      try {
        await recordOrderCancellation(db, {
          orderCorePk: existing.order_id as number,
          cancelledBy: "merchant",
          displayReason,
          cancelledByType,
          cancelledByLabel: actionLabels.cancelled_by_label ?? "Cancelled",
          actionSource,
          cancelMode: actionMode,
          previousStatus: currentStatus,
          acceptedAt: (existing.accepted_at as string | null) ?? null,
          grandTotal: coreMoney?.grand_total ?? 0,
          refundStatus: refund.refundStatus,
          refundAmount: refund.refundAmount,
          metadata: engineResult.raw ? { financial_rule_engine: engineResult.raw } : undefined,
        });
      } catch (cancelRowErr) {
        console.warn("[orders PATCH] order_cancellation_reasons failed:", cancelRowErr);
      }
    }

    if (newStatus === "RTO") {
      try {
        const orderCtx = await lookupOrderContext(existing.order_id as number);
        await executeRtoFinancials({
          orderCoreId: existing.order_id as number,
          ordersFoodId: foodRowId,
          coreOrderId: orderCtx.coreOrderId,
          merchantStoreId: storeInternalId,
          previousStatus: currentStatus,
          triggeredByType: actorTypeFromSource(actionSource),
          orderGross: orderCtx.grandTotal,
        });
      } catch (rtoErr) {
        console.warn("[orders PATCH] RTO financial rule:", rtoErr);
      }
    }

    if (newStatus === "READY_FOR_PICKUP") {
      try {
        await appendReadyTimeline({
          orderCorePk: existing.order_id as number,
          previousStatus: currentStatus,
          actionSource,
          preparedAt: (updates.prepared_at as string) ?? now,
        });
      } catch (tlErr) {
        console.warn("[orders PATCH] ready timeline failed:", tlErr);
      }
    }

    try {
      await db.from("merchant_order_food_actions").insert({
        orders_food_id: foodRowId,
        orders_core_id: existing.order_id as number,
        merchant_store_id: storeInternalId,
        from_status: currentStatus,
        to_status: newStatus,
        action_source: actionSource,
        actor_type: "merchant",
        actor_label: actionLabels.actor_label,
        metadata: {
          ...(rejectedReason ? { rejected_reason: rejectedReason } : {}),
          ...(newStatus === "ACCEPTED"
            ? {
                accept_mode: actionMode,
                ...(acceptPrepMinutes != null ? { preparation_time_minutes: acceptPrepMinutes } : {}),
                ...(acceptPrepReadyByAt ? { prep_ready_by_at: acceptPrepReadyByAt } : {}),
              }
            : {}),
          ...(newStatus === "CANCELLED" ? { cancel_mode: actionMode } : {}),
        },
      });
    } catch (logErr) {
      console.warn("[orders PATCH] action log failed:", logErr);
    }

    const walletAmount = await resolveMerchantWalletCreditAmount(db, {
      ordersCoreId: existing.order_id as number,
      ordersFoodId: foodRowId,
      storeId: storeInternalId,
    });

    await creditMerchantOrderEarningOnDelivered(db, {
      merchantStoreId: existing.merchant_store_id as number,
      ordersFoodId: foodRowId,
      ordersCoreId: existing.order_id as number,
      amount: walletAmount,
      newStatus,
      previousStatus: currentStatus,
    });

    const merged = await loadMerchantStoreFoodOrders(storeInternalId, {
      ordersFoodId: foodRowId,
      limit: 1,
    });
    const order = merged[0];
    if (!order) {
      return NextResponse.json({ error: "Order not found after update" }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (e) {
    console.error("[PATCH /api/merchant/stores/[id]/orders/[orderId]]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
