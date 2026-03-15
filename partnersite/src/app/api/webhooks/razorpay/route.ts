import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  verifyRazorpayWebhookSignature,
  getRazorpayWebhookSignature,
} from "@/lib/razorpay-webhook";

const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getRazorpayAuthHeader(): string {
  return "Basic " + Buffer.from(razorpayKeyId! + ":" + razorpayKeySecret!).toString("base64");
}

/**
 * POST /api/webhooks/razorpay
 * Razorpay sends payment.captured, payment.failed, etc.
 * Verify X-Razorpay-Signature with RAZORPAY_WEBHOOK_SECRET (raw body).
 * - payment.captured: update onboarding payment; complete subscription if order notes have store_id/plan_id.
 * - payment.failed: mark onboarding payment failed.
 */
export async function POST(request: NextRequest) {
  if (!webhookSecret) {
    console.warn("[webhooks/razorpay] RAZORPAY_WEBHOOK_SECRET not set");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (e) {
    console.error("[webhooks/razorpay] Failed to read body:", e);
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const signature = getRazorpayWebhookSignature(request);
  if (!verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret)) {
    console.warn("[webhooks/razorpay] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let payload: {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string } } };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = payload.event;
  if (!event) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  if (event === "payment.captured") {
    const payment = payload.payload?.payment?.entity;
    if (!payment?.order_id || !payment?.id) {
      return NextResponse.json({ received: true }, { status: 200 });
    }
    const orderId = payment.order_id;
    const paymentId = payment.id;
    const db = getSupabaseAdmin();

    // 1) Onboarding: update merchant_onboarding_payments
    const { data: onboardingRow } = await db
      .from("merchant_onboarding_payments")
      .select("id, merchant_parent_id, merchant_store_id")
      .eq("razorpay_order_id", orderId)
      .maybeSingle();

    if (onboardingRow) {
      let storeIdToUpdate = onboardingRow.merchant_store_id;
      if (!storeIdToUpdate) {
        const { data: latestStore } = await db
          .from("merchant_stores")
          .select("id")
          .eq("parent_id", onboardingRow.merchant_parent_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        storeIdToUpdate = latestStore?.id ?? null;
      }
      await db
        .from("merchant_onboarding_payments")
        .update({
          razorpay_payment_id: paymentId,
          status: "captured",
          razorpay_status: "captured",
          captured_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          merchant_store_id: storeIdToUpdate,
        })
        .eq("razorpay_order_id", orderId);
    }

    // 2) Subscription: order was created by create-payment-order with notes; fetch order to get store_id, plan_id
    if (!onboardingRow && razorpayKeyId && razorpayKeySecret) {
      const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
        headers: { Authorization: getRazorpayAuthHeader() },
      });
      if (orderRes.ok) {
        const orderData = await orderRes.json();
        const notes = orderData.notes || {};
        const storeIdPublic = notes.store_id;
        const planId = notes.plan_id ? Number(notes.plan_id) : null;
        if (storeIdPublic && planId) {
          // Idempotent: already recorded?
          const { data: existingPayment } = await db
            .from("subscription_payments")
            .select("id")
            .eq("payment_gateway_id", paymentId)
            .maybeSingle();
          if (!existingPayment) {
            const { data: store } = await db
              .from("merchant_stores")
              .select("id, parent_id")
              .eq("store_id", storeIdPublic)
              .single();
            if (store?.id && store?.parent_id) {
              const { data: plan } = await db.from("merchant_plans").select("id, price").eq("id", planId).single();
              if (plan) {
                const now = new Date();
                const expiryDate = new Date(now);
                expiryDate.setMonth(expiryDate.getMonth() + 1);
                const { data: existingSub } = await db
                  .from("merchant_subscriptions")
                  .select("id")
                  .eq("merchant_id", store.parent_id)
                  .eq("store_id", store.id)
                  .eq("subscription_status", "ACTIVE")
                  .maybeSingle();
                let subscriptionId: number;
                if (existingSub) {
                  await db
                    .from("merchant_subscriptions")
                    .update({
                      plan_id: planId,
                      subscription_status: "ACTIVE",
                      payment_status: "PAID",
                      start_date: now.toISOString(),
                      expiry_date: expiryDate.toISOString(),
                      is_active: true,
                      last_payment_date: now.toISOString(),
                      next_billing_date: expiryDate.toISOString(),
                      updated_at: now.toISOString(),
                    })
                    .eq("id", existingSub.id);
                  subscriptionId = existingSub.id;
                } else {
                  const { data: created } = await db
                    .from("merchant_subscriptions")
                    .insert({
                      merchant_id: store.parent_id,
                      store_id: store.id,
                      plan_id: planId,
                      subscription_status: "ACTIVE",
                      payment_status: "PAID",
                      start_date: now.toISOString(),
                      expiry_date: expiryDate.toISOString(),
                      is_active: true,
                      auto_renew: false,
                      last_payment_date: now.toISOString(),
                      next_billing_date: expiryDate.toISOString(),
                    })
                    .select("id")
                    .single();
                  subscriptionId = created!.id;
                }
                await db.from("subscription_payments").insert({
                  merchant_id: store.parent_id,
                  store_id: store.id,
                  subscription_id: subscriptionId,
                  plan_id: planId,
                  amount: Number(plan.price) || 0,
                  payment_gateway: "RAZORPAY",
                  payment_gateway_id: paymentId,
                  payment_gateway_response: { razorpay_order_id: orderId, razorpay_payment_id: paymentId, webhook: true },
                  payment_status: "PAID",
                  payment_date: now.toISOString(),
                  billing_period_start: now.toISOString(),
                  billing_period_end: expiryDate.toISOString(),
                });
              }
            }
          }
        }
      }
    }
  } else if (event === "payment.failed") {
    const payment = payload.payload?.payment?.entity;
    if (payment?.order_id) {
      const db = getSupabaseAdmin();
      await db
        .from("merchant_onboarding_payments")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: (payload.payload?.payment?.entity as any)?.error_description ?? "Payment failed",
          updated_at: new Date().toISOString(),
        })
        .eq("razorpay_order_id", payment.order_id);
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
