import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";

const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/merchant/subscription/order-status?orderId=order_xxx
 * Fetches Razorpay order and payments to see if payment was captured (e.g. user paid but closed tab).
 * Also checks our DB for subscription created by webhook. Returns captured + subscriptionId when applicable.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error ?? "Merchant not found" }, { status: 403 });
    }

    const orderId = request.nextUrl.searchParams.get("orderId");
    if (!orderId?.trim()) {
      return NextResponse.json({ success: false, error: "orderId is required" }, { status: 400 });
    }

    if (!razorpayKeyId || !razorpayKeySecret) {
      return NextResponse.json(
        { success: false, error: "Payment gateway not configured" },
        { status: 503 }
      );
    }

    const authHeader =
      "Basic " + Buffer.from(razorpayKeyId + ":" + razorpayKeySecret).toString("base64");

    const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${orderId.trim()}`, {
      headers: { Authorization: authHeader },
    });
    if (!orderRes.ok) {
      if (orderRes.status === 404) {
        return NextResponse.json({
          success: true,
          orderId: orderId.trim(),
          status: "unknown",
          captured: false,
          message: "Order not found",
        });
      }
      return NextResponse.json(
        { success: false, error: "Failed to fetch order status" },
        { status: 502 }
      );
    }
    const orderData = await orderRes.json();
    const orderStatus = orderData.status; // 'created' | 'attempted' | 'paid'

    if (orderStatus === "paid") {
      const paymentsRes = await fetch(
        `https://api.razorpay.com/v1/orders/${orderId.trim()}/payments`,
        { headers: { Authorization: authHeader } }
      );
      let paymentId: string | null = null;
      if (paymentsRes.ok) {
        const paymentsData = await paymentsRes.json();
        const items = paymentsData.items ?? [];
        const captured = items.find((p: { status: string }) => p.status === "captured");
        if (captured) paymentId = captured.id;
      }
      if (paymentId) {
        const { data: subPayment } = await getSupabaseAdmin()
          .from("subscription_payments")
          .select("id, subscription_id, store_id")
          .eq("payment_gateway_id", paymentId)
          .maybeSingle();
        return NextResponse.json({
          success: true,
          orderId: orderId.trim(),
          status: "paid",
          captured: true,
          paymentId,
          subscriptionId: subPayment?.subscription_id ?? null,
        });
      }
      return NextResponse.json({
        success: true,
        orderId: orderId.trim(),
        status: "paid",
        captured: true,
      });
    }

    return NextResponse.json({
      success: true,
      orderId: orderId.trim(),
      status: orderStatus || "created",
      captured: false,
    });
  } catch (e) {
    console.error("[subscription/order-status] Error:", e);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
