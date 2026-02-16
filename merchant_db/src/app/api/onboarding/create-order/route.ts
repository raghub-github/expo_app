import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

/** Promo amount in paise (₹1 = 100 paise). */
const PROMO_AMOUNT_PAISE = 100;
const STANDARD_AMOUNT_PAISE = 9900;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/onboarding/create-order
 * Body: { merchantParentId: number, planId?: string }
 * Creates Razorpay order and a row in merchant_onboarding_payments. Returns orderId and keyId for checkout.
 */
export async function POST(request: NextRequest) {
  try {
    if (!razorpayKeyId || !razorpayKeySecret) {
      return NextResponse.json(
        { success: false, error: "Payment not configured. Proceed without payment." },
        { status: 503 }
      );
    }
    const body = await request.json().catch(() => ({}));
    const merchantParentId = body.merchantParentId ?? body.merchant_parent_id;
    if (!merchantParentId) {
      return NextResponse.json(
        { success: false, error: "merchantParentId is required" },
        { status: 400 }
      );
    }

    const amountPaise = Number(body.amountPaise) || PROMO_AMOUNT_PAISE;
    const planId = body.planId ?? "FREE";
    const planName = body.planName ?? "Starter Plan";
    const receipt = `onboard_${merchantParentId}_${Date.now()}`;

    const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(razorpayKeyId + ":" + razorpayKeySecret).toString("base64"),
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt,
      }),
    });
    if (!orderRes.ok) {
      const errText = await orderRes.text();
      console.error("[onboarding/create-order] Razorpay error:", orderRes.status, errText);
      return NextResponse.json(
        { success: false, error: "Could not create payment order" },
        { status: 502 }
      );
    }
    const order = await orderRes.json();
    const razorpayOrderId = order.id;

    const db = getSupabaseAdmin();
    const { error: insertErr } = await db.from("merchant_onboarding_payments").insert({
      merchant_parent_id: merchantParentId,
      amount_paise: amountPaise,
      currency: "INR",
      plan_id: planId,
      plan_name: planName,
      standard_amount_paise: STANDARD_AMOUNT_PAISE,
      promo_amount_paise: PROMO_AMOUNT_PAISE,
      promo_label: "₹1 today",
      razorpay_order_id: razorpayOrderId,
      status: "created",
      razorpay_status: order.status,
    });
    if (insertErr) {
      console.error("[onboarding/create-order] DB insert error:", insertErr);
      return NextResponse.json(
        { success: false, error: "Failed to record order" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      orderId: razorpayOrderId,
      keyId: razorpayKeyId,
      amount: amountPaise,
      currency: "INR",
    });
  } catch (e) {
    console.error("[onboarding/create-order] Error:", e);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
