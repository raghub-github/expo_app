import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStoreOnboardingCommissionConfig } from "@/lib/store-onboarding-commission-config";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

/** Fallback if store_onboarding_commission_config row is missing (matches legacy hardcoded promo). */
const FALLBACK_PROMO_AMOUNT_PAISE = 100;
const FALLBACK_STANDARD_AMOUNT_PAISE = 9900;
const FALLBACK_GST_PERCENT = 18;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseGstPercent(commission: Awaited<ReturnType<typeof getStoreOnboardingCommissionConfig>>): number {
  if (!commission) return FALLBACK_GST_PERCENT;
  const n = Number(commission.gstPercent);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, n);
}

/**
 * POST /api/onboarding/create-order
 * Body: { merchantParentId: number, planId?: string }
 * Creates Razorpay order and a row in merchant_onboarding_payments. Returns orderId and keyId for checkout.
 * Total charged = discounted onboarding fee + GST (GST % from store_onboarding_commission_config).
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
    const merchantStoreId = body.merchantStoreId ?? body.merchant_store_id ?? null;
    if (!merchantParentId) {
      return NextResponse.json(
        { success: false, error: "merchantParentId is required" },
        { status: 400 }
      );
    }

    let storeDbId: number | null = null;
    if (merchantStoreId) {
      const db = getSupabaseAdmin();
      if (typeof merchantStoreId === "string" && merchantStoreId.startsWith("GMMC")) {
        const { data: storeRow } = await db
          .from("merchant_stores")
          .select("id")
          .eq("store_id", merchantStoreId)
          .maybeSingle();
        if (storeRow?.id) {
          storeDbId = storeRow.id;
        }
      } else if (typeof merchantStoreId === "number") {
        storeDbId = merchantStoreId;
      }
    }

    const commission = await getStoreOnboardingCommissionConfig();
    const discountedRupee = commission
      ? Number(commission.discountedOnboardingFee)
      : FALLBACK_PROMO_AMOUNT_PAISE / 100;
    const standardRupee = commission
      ? Number(commission.standardOnboardingFee)
      : FALLBACK_STANDARD_AMOUNT_PAISE / 100;
    const subtotalPaise = Math.max(0, Math.round(discountedRupee * 100));
    const standardAmountPaise = Math.max(0, Math.round(standardRupee * 100));
    const gstPercentApplied = parseGstPercent(commission);
    const gstAmountPaise = Math.round((subtotalPaise * gstPercentApplied) / 100);
    const totalPaise = subtotalPaise + gstAmountPaise;
    const amountPaise = Number.isFinite(totalPaise) ? totalPaise : FALLBACK_PROMO_AMOUNT_PAISE;

    const planId = body.planId ?? "FREE";
    const planName = body.planName ?? commission?.planName ?? "Starter Plan";
    const receipt = `onboard_${merchantParentId}_${storeDbId ? `store_${storeDbId}_` : ""}${Date.now()}`;

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
    const promoLabel =
      gstPercentApplied > 0
        ? `₹${discountedRupee} + ${gstPercentApplied}% GST`
        : `₹${discountedRupee} today`;

    const insertPayload: Record<string, unknown> = {
      merchant_parent_id: merchantParentId,
      merchant_store_id: storeDbId,
      amount_paise: amountPaise,
      currency: "INR",
      plan_id: planId,
      plan_name: planName,
      standard_amount_paise: standardAmountPaise || FALLBACK_STANDARD_AMOUNT_PAISE,
      promo_amount_paise: subtotalPaise,
      promo_label: promoLabel,
      razorpay_order_id: razorpayOrderId,
      status: "created",
      razorpay_status: order.status,
      subtotal_paise: subtotalPaise,
      gst_percent_applied: gstPercentApplied,
      gst_amount_paise: gstAmountPaise,
    };

    const { error: insertErr } = await db.from("merchant_onboarding_payments").insert(insertPayload);
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
      subtotalPaise,
      gstAmountPaise,
      gstPercentApplied,
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
