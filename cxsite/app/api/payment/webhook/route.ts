import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

function verifyWebhookSignature(
  body: string,
  signature: string
): boolean {
  const hash = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET || "")
    .update(body)
    .digest("base64");

  return hash === signature;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-razorpay-signature");

    // Verify webhook signature
    if (!signature || !verifyWebhookSignature(body, signature)) {
      console.warn("Invalid webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const event = JSON.parse(body);

    // Handle different webhook events
    switch (event.event) {
      case "payment.authorized":
        await handlePaymentAuthorized(event.payload);
        break;

      case "payment.failed":
        await handlePaymentFailed(event.payload);
        break;

      case "payment.captured":
        await handlePaymentCaptured(event.payload);
        break;

      case "order.paid":
        await handleOrderPaid(event.payload);
        break;

      default:
        console.log(`Unhandled event: ${event.event}`);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: error.message || "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handlePaymentAuthorized(payload: any) {
  const { payment } = payload;
  console.log(`Payment authorized: ${payment.id}`);
  // Additional handling if needed
}

async function handlePaymentFailed(payload: any) {
  const { payment } = payload;
  console.log(`Payment failed: ${payment.id}`);

  // Update order status to payment failed
  const notes = payment.notes || {};
  const orderId = notes.order_id;
  const serviceType = notes.service_type;

  if (orderId && serviceType) {
    const tableName =
      serviceType === "food"
        ? "food_orders"
        : serviceType === "person"
          ? "person_orders"
          : "parcel_orders";

    await supabase
      .from(tableName)
      .update({
        payment_status: "failed",
        razorpay_payment_id: payment.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);
  }
}

async function handlePaymentCaptured(payload: any) {
  const { payment } = payload;
  console.log(`Payment captured: ${payment.id}`);

  // Update order status to paid
  const notes = payment.notes || {};
  const orderId = notes.order_id;
  const serviceType = notes.service_type;

  if (orderId && serviceType) {
    const tableName =
      serviceType === "food"
        ? "food_orders"
        : serviceType === "person"
          ? "person_orders"
          : "parcel_orders";

    await supabase
      .from(tableName)
      .update({
        payment_status: "paid",
        razorpay_payment_id: payment.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);
  }
}

async function handleOrderPaid(payload: any) {
  const { order } = payload;
  console.log(`Order paid: ${order.id}`);
  // Update order status if needed
}
