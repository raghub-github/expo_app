/**
 * GET /api/merchant/stores/[id]/orders/[orderId]/otp
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ensureMerchantStoreDashboardAccess } from "@/lib/merchant-food-orders/store-access";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id, orderId } = await params;
    const storeId = parseInt(id, 10);
    const foodId = parseInt(orderId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(foodId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const access = await ensureMerchantStoreDashboardAccess(storeId);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const { data: food, error: fe } = await supabaseAdmin
      .from("orders_food")
      .select("order_id, merchant_store_id")
      .eq("id", foodId)
      .single();
    if (fe || !food || food.merchant_store_id !== access.store.id) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const { data: otp, error: oe } = await supabaseAdmin
      .from("order_food_otps")
      .select("otp_code, otp_type, verified_at")
      .eq("order_id", food.order_id)
      .single();
    if (oe || !otp) {
      return NextResponse.json({ error: "OTP not found" }, { status: 404 });
    }

    return NextResponse.json({
      otp_code: otp.otp_code,
      otp_type: otp.otp_type,
      verified_at: otp.verified_at,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/orders/[orderId]/otp]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
