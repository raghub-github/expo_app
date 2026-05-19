/**
 * POST /api/merchant/stores/[id]/orders/[orderId]/validate-otp
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ensureMerchantStoreDashboardAccess } from "@/lib/merchant-food-orders/store-access";
import { resolveMerchantFoodOrder } from "@/lib/merchant-food-orders/resolve-order-food-row";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id, orderId } = await params;
    const storeId = parseInt(id, 10);
    const orderIdParam = parseInt(orderId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(orderIdParam)) {
      return NextResponse.json({ valid: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await ensureMerchantStoreDashboardAccess(storeId);
    if ("error" in access) {
      return NextResponse.json({ valid: false, error: access.error }, { status: access.status });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ valid: false, error: "Server misconfigured" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const inputOtp = String(body?.otp || "").trim();
    const otpType = String(body?.otp_type || body?.otpType || "PICKUP").toUpperCase();
    if (!inputOtp) {
      return NextResponse.json({ valid: false, error: "otp required" }, { status: 400 });
    }
    if (otpType !== "PICKUP" && otpType !== "RTO") {
      return NextResponse.json({ valid: false, error: "otp_type must be PICKUP or RTO" }, { status: 400 });
    }

    const db = supabaseAdmin;
    const storeInternalId = access.store.id;

    const resolved = await resolveMerchantFoodOrder(db, storeInternalId, orderIdParam);
    if (!resolved) {
      return NextResponse.json({ valid: false, error: "Order not found" }, { status: 404 });
    }

    const { data: otpRow, error: oe } = await db
      .from("order_food_otps")
      .select("id, otp_code, otp_type, verified_at, attempt_count, locked_until")
      .eq("order_id", resolved.coreOrderId)
      .eq("otp_type", otpType)
      .maybeSingle();
    if (oe || !otpRow) {
      return NextResponse.json({ valid: false, error: "OTP not found" }, { status: 404 });
    }

    const now = new Date();
    if (otpRow.verified_at) {
      return NextResponse.json({ valid: false, error: "OTP already used" }, { status: 400 });
    }
    if (otpRow.locked_until && new Date(otpRow.locked_until) > now) {
      return NextResponse.json({ valid: false, error: "Too many attempts. Try again later." }, { status: 429 });
    }

    if (otpRow.otp_code === inputOtp) {
      await db
        .from("order_food_otps")
        .update({
          verified_at: now.toISOString(),
          verified_by: "merchant",
          attempt_count: 0,
          locked_until: null,
          updated_at: now.toISOString(),
        })
        .eq("id", otpRow.id);
      return NextResponse.json({ valid: true });
    }

    const newAttempts = (otpRow.attempt_count || 0) + 1;
    const lockUntil =
      newAttempts >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCK_MINUTES * 60 * 1000) : null;
    await db
      .from("order_food_otps")
      .update({
        attempt_count: newAttempts,
        locked_until: lockUntil?.toISOString() ?? null,
        updated_at: now.toISOString(),
      })
      .eq("id", otpRow.id);

    return NextResponse.json(
      {
        valid: false,
        error: "Invalid OTP",
        attempts_remaining: Math.max(0, MAX_ATTEMPTS - newAttempts),
      },
      { status: 400 }
    );
  } catch (e) {
    console.error("[POST validate-otp]", e);
    return NextResponse.json({ valid: false, error: "Internal error" }, { status: 500 });
  }
}
