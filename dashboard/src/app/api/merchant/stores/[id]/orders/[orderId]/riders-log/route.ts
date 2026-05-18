/**
 * GET /api/merchant/stores/[id]/orders/[orderId]/riders-log
 * All rider assignments for this food order (orders_food id).
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
      return NextResponse.json({ riders: [] });
    }

    const access = await ensureMerchantStoreDashboardAccess(storeId);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ riders: [] });
    }

    const db = supabaseAdmin;
    const resolved = await resolveMerchantFoodOrder(db, access.store.id, orderIdParam);
    if (!resolved) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const coreOrderId = resolved.coreOrderId;

    const { data: assignments, error: assignErr } = await db
      .from("order_rider_assignments")
      .select(
        "id, rider_id, rider_name, rider_mobile, assignment_status, assigned_at, accepted_at, rejected_at, reached_merchant_at, picked_up_at, delivered_at, cancelled_at"
      )
      .eq("order_id", coreOrderId)
      .order("assigned_at", { ascending: false });

    if (assignErr) {
      return NextResponse.json({ error: assignErr.message }, { status: 500 });
    }

    if (!assignments?.length) {
      return NextResponse.json({ riders: [] });
    }

    const riderIds = [...new Set(assignments.map((a) => a.rider_id as number))];
    const { data: riders } = await db
      .from("riders")
      .select("id, name, mobile, selfie_url")
      .in("id", riderIds);

    const riderMap = new Map(
      (riders || []).map((r) => [
        r.id as number,
        r as { id: number; name: string | null; mobile: string | null; selfie_url: string | null },
      ])
    );

    const ridersLog = assignments.map((a) => {
      const r = riderMap.get(a.rider_id as number);
      return {
        rider_id: a.rider_id,
        rider_name: (a.rider_name as string | null) ?? r?.name ?? null,
        rider_mobile: (a.rider_mobile as string | null) ?? r?.mobile ?? null,
        selfie_url: r?.selfie_url ?? null,
        assignment_status: (a.assignment_status as string) ?? "pending",
        assigned_at: a.assigned_at as string | null,
        accepted_at: a.accepted_at as string | null,
        rejected_at: a.rejected_at as string | null,
        reached_merchant_at: a.reached_merchant_at as string | null,
        picked_up_at: a.picked_up_at as string | null,
        delivered_at: a.delivered_at as string | null,
        cancelled_at: a.cancelled_at as string | null,
      };
    });

    return NextResponse.json({ riders: ridersLog });
  } catch (e) {
    console.error("[GET riders-log]", e);
    return NextResponse.json({ riders: [] });
  }
}
