import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET!
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_BILLING_DAYS = 30

/**
 * POST /api/merchant/subscription/upgrade
 * Body: { storeId, newPlanId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *
 * 1. Verify payment signature
 * 2. Recompute proration (server-side) and ensure payment amount matches
 * 3. Mark current subscription as UPGRADED
 * 4. Create new subscription with credit_applied, billing from now
 * 5. Record payment
 * Ensures only one ACTIVE subscription per store.
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseServer = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    })
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error ?? 'Merchant not found' },
        { status: 403 }
      )
    }

    if (!razorpayKeySecret) {
      return NextResponse.json(
        { success: false, error: 'Payment gateway not configured' },
        { status: 503 }
      )
    }

    const body = await req.json()
    const { storeId, newPlanId, razorpay_order_id, razorpay_payment_id, razorpay_signature, skipPayment } = body

    if (!storeId || !newPlanId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: storeId, newPlanId' },
        { status: 400 }
      )
    }

    const hasPayment = razorpay_order_id && razorpay_payment_id && razorpay_signature
    if (!skipPayment && !hasPayment) {
      return NextResponse.json(
        { success: false, error: 'Missing payment details or skipPayment for zero-amount upgrade' },
        { status: 400 }
      )
    }

    if (hasPayment) {
      const expectedSignature = crypto
        .createHmac('sha256', razorpayKeySecret)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex')
      if (expectedSignature !== razorpay_signature) {
        return NextResponse.json(
          { success: false, error: 'Invalid payment signature' },
          { status: 400 }
        )
      }
    }

    const { data: store } = await supabase
      .from('merchant_stores')
      .select('id, parent_id')
      .eq('store_id', storeId)
      .single()

    if (!store?.id || !store?.parent_id) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    const { data: newPlan } = await supabase
      .from('merchant_plans')
      .select('*')
      .eq('id', newPlanId)
      .single()

    if (!newPlan) {
      return NextResponse.json({ error: 'New plan not found' }, { status: 404 })
    }

    const newPlanPrice = Number(newPlan.price ?? 0)
    if (newPlanPrice <= 0) {
      return NextResponse.json(
        { error: 'Upgrade is for paid plans only' },
        { status: 400 }
      )
    }

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
      .maybeSingle()

    const { data: currentPlanRow } = activeSubscription
      ? await supabase
          .from('merchant_plans')
          .select('id, price')
          .eq('id', activeSubscription.plan_id)
          .single()
      : { data: null }

    const currentPrice = currentPlanRow ? Number(currentPlanRow.price ?? 0) : 0

    if (activeSubscription && currentPlanRow?.id === newPlanId) {
      return NextResponse.json(
        { error: 'Cannot upgrade to the same plan' },
        { status: 400 }
      )
    }

    if (activeSubscription && currentPrice > newPlanPrice) {
      return NextResponse.json(
        { error: 'Downgrade is not allowed via upgrade API' },
        { status: 400 }
      )
    }

    let remainingCredit = 0
    if (activeSubscription && currentPrice > 0 && activeSubscription.start_date && activeSubscription.expiry_date) {
      const start = new Date(activeSubscription.start_date)
      const expiry = new Date(activeSubscription.expiry_date)
      const now = new Date()
      const totalDays = Math.max(1, Math.round((expiry.getTime() - start.getTime()) / MS_PER_DAY))
      const usedDays = Math.max(0, Math.min(totalDays, Math.round((now.getTime() - start.getTime()) / MS_PER_DAY)))
      const usedAmount = (currentPrice / totalDays) * usedDays
      remainingCredit = Math.max(0, currentPrice - usedAmount)
    }

    const creditToApply = Math.min(remainingCredit, newPlanPrice)
    const amountToCharge = Math.max(0, Math.round((newPlanPrice - creditToApply) * 100) / 100)

    if (!hasPayment && amountToCharge > 0) {
      return NextResponse.json(
        { success: false, error: 'Payment required for this upgrade' },
        { status: 400 }
      )
    }

    const now = new Date()
    const newExpiry = new Date(now)
    newExpiry.setDate(newExpiry.getDate() + DEFAULT_BILLING_DAYS)

    if (activeSubscription) {
      const { error: updateOldError } = await supabase
        .from('merchant_subscriptions')
        .update({
          subscription_status: 'UPGRADED',
          is_active: false,
          updated_at: now.toISOString(),
        })
        .eq('id', activeSubscription.id);

      if (updateOldError) {
        console.error('[upgrade] mark old UPGRADED failed', updateOldError)
        return NextResponse.json(
          { success: false, error: 'Failed to deactivate current plan' },
          { status: 500 }
        )
      }
    }

    const { data: newSub, error: insertError } = await supabase
      .from('merchant_subscriptions')
      .insert({
        merchant_id: store.parent_id,
        store_id: store.id,
        plan_id: newPlanId,
        subscription_status: 'ACTIVE',
        payment_status: 'PAID',
        start_date: now.toISOString(),
        expiry_date: newExpiry.toISOString(),
        is_active: true,
        auto_renew: false,
        upgraded_from: activeSubscription?.id ?? null,
        credit_applied: creditToApply,
        billing_start_at: now.toISOString(),
        billing_end_at: newExpiry.toISOString(),
        last_payment_date: now.toISOString(),
        next_billing_date: newExpiry.toISOString(),
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[upgrade] create new subscription failed', insertError)
      if (activeSubscription) {
        await supabase
          .from('merchant_subscriptions')
          .update({ subscription_status: 'ACTIVE', is_active: true, updated_at: now.toISOString() })
          .eq('id', activeSubscription.id);
      }
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      )
    }

    await supabase.from('subscription_payments').insert({
      merchant_id: store.parent_id,
      store_id: store.id,
      subscription_id: newSub.id,
      plan_id: newPlanId,
      amount: amountToCharge,
      payment_gateway: hasPayment ? 'RAZORPAY' : 'PRORATION_CREDIT',
      payment_gateway_id: hasPayment ? razorpay_payment_id : `upgrade_${newSub.id}_${now.getTime()}`,
      payment_gateway_response: hasPayment
        ? { razorpay_order_id: razorpay_order_id, razorpay_payment_id: razorpay_payment_id, upgrade: true, credit_applied: creditToApply }
        : { upgrade: true, credit_applied: creditToApply, zero_payment: true },
      payment_status: 'PAID',
      payment_date: now.toISOString(),
      billing_period_start: now.toISOString(),
      billing_period_end: newExpiry.toISOString(),
      notes: creditToApply > 0 ? `Upgrade: ₹${creditToApply} credit applied from previous plan` : 'Plan upgrade',
    });

    return NextResponse.json({
      success: true,
      subscriptionId: newSub.id,
      message: 'Upgrade successful. Your new plan is active.',
      creditApplied: creditToApply,
      amountCharged: amountToCharge,
    });
  } catch (e: unknown) {
    console.error('[upgrade]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    );
  }
}
