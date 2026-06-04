import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { saveMerchantRiderUniformFeedback } from "@/lib/merchant-rider-uniform-feedback";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/food-orders/[id]/rider-uniform-feedback
 * Body: { store_id, in_uniform: boolean, rider_id?: number }
 * [id] = orders_food.id
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const foodOrderId = parseInt(id, 10);
    if (Number.isNaN(foodOrderId)) {
      return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
    }

    const body = (await request.json()) as {
      store_id?: string | number;
      in_uniform?: boolean;
      rider_id?: number | null;
    };

    if (body.in_uniform !== true && body.in_uniform !== false) {
      return NextResponse.json({ error: "in_uniform (boolean) is required" }, { status: 400 });
    }

    const db = getSupabase();
    const { data: foodOrder, error: foodErr } = await db
      .from("orders_food")
      .select("order_id, rider_id, merchant_store_id")
      .eq("id", foodOrderId)
      .maybeSingle();

    if (foodErr || !foodOrder?.order_id) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const coreId = Number(foodOrder.order_id);
    const riderId =
      body.rider_id != null && Number.isFinite(Number(body.rider_id))
        ? Number(body.rider_id)
        : foodOrder.rider_id != null
          ? Number(foodOrder.rider_id)
          : null;

    const result = await saveMerchantRiderUniformFeedback(db, coreId, riderId, body.in_uniform);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      merchant_rider_in_uniform: body.in_uniform,
    });
  } catch (err) {
    console.error("[food-orders/rider-uniform-feedback] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
