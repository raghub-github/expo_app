import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * POST /api/merchant/subscription/create-payment-order
 * Body: { storeId: string, planId: number }
 * Creates Razorpay order for plan upgrade payment
 */
export async function POST(request: NextRequest) {
  try {
    const supabaseServer = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error ?? 'Merchant not found' },
        { status: 403 }
      );
    }

    if (!razorpayKeyId || !razorpayKeySecret) {
      return NextResponse.json(
        { success: false, error: "Payment gateway not configured" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { storeId, planId } = body;

    if (!storeId || !planId) {
      return NextResponse.json(
        { success: false, error: "storeId and planId are required" },
        { status: 400 }
      );
    }

    // Get store and merchant info
    const { data: store } = await supabase
      .from('merchant_stores')
      .select('id, parent_id, store_name')
      .eq('store_id', storeId)
      .single();

    if (!store?.id || !store?.parent_id) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Get plan details
    const { data: plan } = await supabase
      .from('merchant_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const newPlanPrice = Number(plan.price ?? 0);
    let amountToCharge = newPlanPrice;
    let isUpgrade = false;
    let creditApplied = 0;

    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const DEFAULT_BILLING_DAYS = 30;
    const { data: activeSubscription } = await supabase
      .from('merchant_subscriptions')
      .select('id, plan_id, start_date, expiry_date')
      .eq('merchant_id', store.parent_id)
      .eq('store_id', store.id)
      .eq('subscription_status', 'ACTIVE')
      .eq('is_active', true)
      .gt('expiry_date', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeSubscription && newPlanPrice > 0) {
      const { data: currentPlan } = await supabase
        .from('merchant_plans')
        .select('id, price')
        .eq('id', activeSubscription.plan_id)
        .single();
      const currentPrice = currentPlan ? Number(currentPlan.price ?? 0) : 0;
      if (currentPlan?.id !== planId && currentPrice > 0 && newPlanPrice > currentPrice) {
        isUpgrade = true;
        const start = new Date(activeSubscription.start_date);
        const expiry = activeSubscription.expiry_date ? new Date(activeSubscription.expiry_date) : null;
        const now = new Date();
        const totalDays = expiry
          ? Math.max(1, Math.round((expiry.getTime() - start.getTime()) / MS_PER_DAY))
          : DEFAULT_BILLING_DAYS;
        const usedDays = Math.max(0, Math.min(totalDays, Math.round((now.getTime() - start.getTime()) / MS_PER_DAY)));
        const usedAmount = (currentPrice / totalDays) * usedDays;
        const remainingCredit = Math.max(0, currentPrice - usedAmount);
        creditApplied = Math.min(remainingCredit, newPlanPrice);
        amountToCharge = Math.max(0, Math.round((newPlanPrice - creditApplied) * 100) / 100);
      }
    }

    // When proration covers full amount, no payment needed
    if (amountToCharge <= 0) {
      return NextResponse.json({
        success: true,
        skipPayment: true,
        orderId: null,
        keyId: razorpayKeyId,
        amount: 0,
        amountToCharge: 0,
        currency: 'INR',
        isUpgrade,
        creditApplied: isUpgrade ? creditApplied : undefined,
        plan: { id: plan.id, name: plan.plan_name, price: plan.price },
      });
    }

    const amountPaise = Math.round(amountToCharge * 100);
    const receipt = `plan_${isUpgrade ? 'upgrade' : 'new'}_${store.id}_${planId}_${Date.now()}`;

    // Create Razorpay order
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
        notes: {
          store_id: storeId,
          store_name: store.store_name,
          plan_id: planId.toString(),
          plan_name: plan.plan_name,
        },
      }),
    });

    if (!orderRes.ok) {
      const errText = await orderRes.text();
      console.error("[subscription/create-payment-order] Razorpay error:", orderRes.status, errText);
      return NextResponse.json(
        { success: false, error: "Could not create payment order" },
        { status: 502 }
      );
    }

    const order = await orderRes.json();

    return NextResponse.json({
      success: true,
      orderId: order.id,
      keyId: razorpayKeyId,
      amount: amountPaise,
      currency: "INR",
      isUpgrade,
      amountToCharge: amountToCharge,
      creditApplied: isUpgrade ? creditApplied : undefined,
      plan: {
        id: plan.id,
        name: plan.plan_name,
        price: plan.price,
      },
    });
  } catch (e) {
    console.error("[subscription/create-payment-order] Error:", e);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
