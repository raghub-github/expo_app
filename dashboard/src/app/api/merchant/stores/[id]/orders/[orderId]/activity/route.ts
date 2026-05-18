/**
 * GET /api/merchant/stores/[id]/orders/[orderId]/activity
 * Recent merchant status actions for an orders_food row.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ensureMerchantStoreDashboardAccess } from "@/lib/merchant-food-orders/store-access";
import { resolveMerchantFoodOrder } from "@/lib/merchant-food-orders/resolve-order-food-row";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id, orderId: orderIdStr } = await params;
    const storeId = parseInt(id, 10);
    const orderIdParam = parseInt(orderIdStr, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(orderIdParam)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const access = await ensureMerchantStoreDashboardAccess(storeId);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ actions: [] });
    }

    const db = supabaseAdmin;
    const resolved = await resolveMerchantFoodOrder(db, access.store.id, orderIdParam);
    if (!resolved) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const { data: actions, error: actErr } = await db
      .from("merchant_order_food_actions")
      .select("id, from_status, to_status, action_source, actor_label, metadata, created_at")
      .eq("orders_food_id", resolved.foodRowId ?? orderIdParam)
      .order("created_at", { ascending: false })
      .limit(30);

    if (actErr) {
      console.warn("[merchant order activity] query failed:", actErr.message);
      return NextResponse.json({ actions: [] });
    }

    return NextResponse.json({ actions: actions ?? [] });
  } catch (e) {
    console.error("[GET merchant order activity]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
