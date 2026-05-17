/**
 * PATCH /api/merchant/stores/[id]/orders/[orderId]
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolvePartnerPipeline } from "@/lib/partner-orders-unify";
import { normalizeActionSource } from "@/lib/merchantOrderFoodActions";
import { ensureMerchantStoreDashboardAccess } from "@/lib/merchant-food-orders/store-access";
import { loadMerchantStoreFoodOrders } from "@/lib/merchant-food-orders/load-store-food-orders";

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
  ACCEPTED: ["PREPARING", "CANCELLED"],
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

    if (!newStatus) {
      return NextResponse.json({ error: "status required" }, { status: 400 });
    }

    const db = getDb();

    const { data: existing, error: fetchErr } = await db
      .from("orders_food")
      .select("id, order_id, order_status, merchant_store_id, food_items_total_value")
      .eq("id", orderIdNum)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    if (existing.merchant_store_id !== storeInternalId) {
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

    if (newStatus === "ACCEPTED") updates.accepted_at = now;
    else if (newStatus === "PREPARING") {
      updates.preparing_at = now;
      updates.prepared_at = null;
    } else if (newStatus === "READY_FOR_PICKUP") updates.prepared_at = now;
    else if (newStatus === "OUT_FOR_DELIVERY") updates.dispatched_at = now;
    else if (newStatus === "DELIVERED") updates.delivered_at = now;
    else if (newStatus === "CANCELLED") {
      updates.cancelled_at = now;
      if (rejectedReason) updates.rejected_reason = rejectedReason;
    } else if (newStatus === "RTO") {
      updates.is_rto = true;
      updates.rto_at = now;
      try {
        await db.rpc("convert_food_order_otp_to_rto", { p_order_id: existing.order_id });
      } catch (e) {
        console.error("[orders PATCH RTO convert]", e);
      }
    }

    const { error } = await db
      .from("orders_food")
      .update(updates)
      .eq("id", orderIdNum)
      .eq("merchant_store_id", storeInternalId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    try {
      await db
        .from("orders_core")
        .update({ current_status: newStatus, updated_at: now })
        .eq("id", existing.order_id as number);
    } catch (coreErr) {
      console.warn("[orders PATCH] orders_core sync failed:", coreErr);
    }

    try {
      await db.from("merchant_order_food_actions").insert({
        orders_food_id: orderIdNum,
        orders_core_id: existing.order_id as number,
        merchant_store_id: storeInternalId,
        from_status: currentStatus,
        to_status: newStatus,
        action_source: actionSource,
        actor_type: "merchant",
        metadata: rejectedReason ? { rejected_reason: rejectedReason } : {},
      });
    } catch (logErr) {
      console.warn("[orders PATCH] action log failed:", logErr);
    }

    const didJustDeliver = newStatus === "DELIVERED" && currentStatus !== "DELIVERED";
    if (didJustDeliver) {
      const amount = Number(existing.food_items_total_value ?? 0);
      if (amount > 0) {
        try {
          const { data: walletId, error: rpcWalletErr } = await db.rpc("get_or_create_merchant_wallet", {
            p_merchant_store_id: existing.merchant_store_id,
          });
          if (!rpcWalletErr && walletId != null) {
            await db.rpc("merchant_wallet_credit", {
              p_wallet_id: walletId,
              p_amount: amount,
              p_category: "ORDER_EARNING",
              p_balance_type: "AVAILABLE",
              p_reference_type: "ORDER",
              p_reference_id: orderIdNum,
              p_idempotency_key: `order_earning_${orderIdNum}`,
              p_description: `Order #${existing.order_id} delivered`,
              p_metadata: {},
            });
          }
        } catch (e) {
          console.error("[orders PATCH] wallet credit failed:", e);
        }
      }
    }

    const merged = await loadMerchantStoreFoodOrders(storeInternalId, {
      ordersFoodId: orderIdNum,
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
