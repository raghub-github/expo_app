import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/onboarding/verify-payment
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Verifies signature and updates merchant_onboarding_payments to captured.
 */
export async function POST(request: NextRequest) {
  try {
    if (!razorpayKeySecret) {
      return NextResponse.json(
        { success: false, error: "Payment not configured" },
        { status: 503 }
      );
    }
    const body = await request.json().catch(() => ({}));
    const orderId = body.razorpay_order_id ?? body.orderId;
    const paymentId = body.razorpay_payment_id ?? body.paymentId;
    const signature = body.razorpay_signature ?? body.signature;
    if (!orderId || !paymentId || !signature) {
      return NextResponse.json(
        { success: false, error: "Missing order_id, payment_id or signature" },
        { status: 400 }
      );
    }

    const expectedSignature = crypto
      .createHmac("sha256", razorpayKeySecret)
      .update(orderId + "|" + paymentId)
      .digest("hex");
    if (expectedSignature !== signature) {
      const db = getSupabaseAdmin();
      await db
        .from("merchant_onboarding_payments")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: "Invalid signature",
          updated_at: new Date().toISOString(),
        })
        .eq("razorpay_order_id", orderId);
      return NextResponse.json(
        { success: false, error: "Invalid payment signature" },
        { status: 400 }
      );
    }

    const db = getSupabaseAdmin();
    // Get the payment record first to check if store_id needs to be updated
    const { data: existingPayment } = await db
      .from("merchant_onboarding_payments")
      .select("id, merchant_parent_id, merchant_store_id")
      .eq("razorpay_order_id", orderId)
      .maybeSingle();
    
    if (!existingPayment) {
      return NextResponse.json(
        { success: false, error: "Payment order not found" },
        { status: 404 }
      );
    }

    // If store_id is not set, try to get it from the most recent store for this parent
    let storeIdToUpdate = existingPayment.merchant_store_id;
    if (!storeIdToUpdate) {
      const { data: latestStore } = await db
        .from("merchant_stores")
        .select("id")
        .eq("parent_id", existingPayment.merchant_parent_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestStore?.id) {
        storeIdToUpdate = latestStore.id;
      }
    }

    const { data: row, error: updateErr } = await db
      .from("merchant_onboarding_payments")
      .update({
        merchant_store_id: storeIdToUpdate, // Ensure store_id is saved when payment is captured
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
        status: "captured",
        razorpay_status: "captured",
        captured_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("razorpay_order_id", orderId)
      .select("id, merchant_parent_id, merchant_store_id")
      .single();

    if (updateErr || !row) {
      console.error("[onboarding/verify-payment] Update error:", updateErr);
      return NextResponse.json(
        { success: false, error: "Failed to record payment" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      paymentRecordId: row.id,
      merchantParentId: row.merchant_parent_id,
    });
  } catch (e) {
    console.error("[onboarding/verify-payment] Error:", e);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
