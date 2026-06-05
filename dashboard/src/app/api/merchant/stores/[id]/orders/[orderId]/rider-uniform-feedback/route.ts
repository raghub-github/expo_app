import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ensureMerchantStoreDashboardAccess } from "@/lib/merchant-food-orders/store-access";
import { resolveMerchantFoodOrder } from "@/lib/merchant-food-orders/resolve-order-food-row";
import { saveMerchantRiderUniformFeedback } from "@/lib/merchant-food-orders/rider-uniform-feedback";

export const runtime = "nodejs";

export async function POST(
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

    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const resolved = await resolveMerchantFoodOrder(supabaseAdmin, access.store.id, orderIdNum);
    if (!resolved) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const body = (await request.json()) as { in_uniform?: boolean; rider_id?: number | null };
    if (typeof body.in_uniform !== "boolean") {
      return NextResponse.json({ error: "in_uniform (boolean) is required" }, { status: 400 });
    }

    const coreId = Number(resolved.coreOrderId);
    let riderId =
      body.rider_id != null && Number.isFinite(Number(body.rider_id))
        ? Number(body.rider_id)
        : null;

    if (riderId == null) {
      const { data: coreRow } = await supabaseAdmin
        .from("orders_core")
        .select("rider_id")
        .eq("id", coreId)
        .maybeSingle();
      riderId =
        coreRow?.rider_id != null && Number.isFinite(Number(coreRow.rider_id))
          ? Number(coreRow.rider_id)
          : null;
    }

    const result = await saveMerchantRiderUniformFeedback(
      supabaseAdmin,
      coreId,
      riderId,
      body.in_uniform
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      merchant_rider_in_uniform: body.in_uniform,
    });
  } catch (err) {
    console.error("[rider-uniform-feedback] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
