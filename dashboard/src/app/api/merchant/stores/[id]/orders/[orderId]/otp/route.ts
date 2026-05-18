/**
 * GET /api/merchant/stores/[id]/orders/[orderId]/otp
 * Partnersite parity: pickup + RTO from order_food_otps, orders_food, orders_core.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ensureMerchantStoreDashboardAccess } from "@/lib/merchant-food-orders/store-access";
import { resolveMerchantFoodOrder } from "@/lib/merchant-food-orders/resolve-order-food-row";

export const runtime = "nodejs";

type OtpRow = { otp_code: string; otp_type: string; verified_at: string | null };

async function readOtpsForCore(
  db: NonNullable<typeof supabaseAdmin>,
  corePk: number,
  foodPickup: string | null,
  foodRto: string | null
) {
  const { data: core } = await db
    .from("orders_core")
    .select("pickup_otp, rto_otp")
    .eq("id", corePk)
    .maybeSingle();

  const { data: otpRows } = await db
    .from("order_food_otps")
    .select("otp_code, otp_type, verified_at")
    .eq("order_id", corePk);

  const byType = new Map<string, OtpRow>();
  for (const row of (otpRows || []) as OtpRow[]) {
    const t = String(row.otp_type || "").toUpperCase();
    if (t) byType.set(t, row);
  }

  const pickup_otp =
    byType.get("PICKUP")?.otp_code ??
    foodPickup ??
    ((core as { pickup_otp?: string } | null)?.pickup_otp ?? null);
  const rto_otp =
    byType.get("RTO")?.otp_code ??
    foodRto ??
    ((core as { rto_otp?: string } | null)?.rto_otp ?? null);

  return { pickup_otp, rto_otp };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id, orderId } = await params;
    const storeId = parseInt(id, 10);
    const orderIdParam = parseInt(orderId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(orderIdParam)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const access = await ensureMerchantStoreDashboardAccess(storeId);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const db = supabaseAdmin;
    const resolved = await resolveMerchantFoodOrder(db, access.store.id, orderIdParam);
    if (!resolved) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const foodRowId = resolved.foodRowId;
    let foodPickup: string | null = null;
    let foodRto: string | null = null;
    if (foodRowId != null) {
      const { data: food } = await db
        .from("orders_food")
        .select("pickup_otp, rto_otp")
        .eq("id", foodRowId)
        .maybeSingle();
      foodPickup = (food?.pickup_otp as string | null) ?? null;
      foodRto = (food?.rto_otp as string | null) ?? null;
    }

    let { pickup_otp, rto_otp } = await readOtpsForCore(
      db,
      resolved.coreOrderId,
      foodPickup,
      foodRto
    );

    if (!pickup_otp && !rto_otp) {
      try {
        await db.rpc("generate_unique_order_otps", { p_order_id: resolved.coreOrderId });
        if (foodRowId != null) {
          const { data: food2 } = await db
            .from("orders_food")
            .select("pickup_otp, rto_otp")
            .eq("id", foodRowId)
            .maybeSingle();
          foodPickup = (food2?.pickup_otp as string | null) ?? foodPickup;
          foodRto = (food2?.rto_otp as string | null) ?? foodRto;
        }
        ({ pickup_otp, rto_otp } = await readOtpsForCore(
          db,
          resolved.coreOrderId,
          foodPickup,
          foodRto
        ));
      } catch (e) {
        console.warn("[GET otp] generate_unique_order_otps:", e);
      }
    }

    return NextResponse.json({
      pickup_otp: pickup_otp ?? null,
      rto_otp: rto_otp ?? null,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/orders/[orderId]/otp]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
