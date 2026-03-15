import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/**
 * GET /api/merchant/subscription?storeId=GMMxxxx
 * Returns active subscription for a store
 */
export async function GET(req: NextRequest) {
  try {
    const supabaseServer = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const storeId = req.nextUrl.searchParams.get('storeId')
    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 })
    }

    // Get store and merchant info
    const { data: store } = await supabase
      .from('merchant_stores')
      .select('id, parent_id')
      .eq('store_id', storeId)
      .single()

    if (!store?.id || !store?.parent_id) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    // Get active subscription (store-specific or merchant-level)
    const { data: subscription } = await supabase
      .from('merchant_subscriptions')
      .select(`
        *,
        merchant_plans (*)
      `)
      .eq('merchant_id', store.parent_id)
      .or(`store_id.is.null,store_id.eq.${store.id}`)
      .eq('is_active', true)
      .eq('subscription_status', 'ACTIVE')
      .gt('expiry_date', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!subscription) {
      // Default plan when no active subscription: first active plan by display_order (works with any number of plans)
      const { data: defaultPlan } = await supabase
        .from('merchant_plans')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle()

      return NextResponse.json({
        subscription: null,
        plan: defaultPlan ?? null,
        isActive: false,
      })
    }

    return NextResponse.json({
      subscription,
      plan: subscription.merchant_plans,
      isActive: true,
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/merchant/subscription
 * Creates or updates a subscription
 * Body: { storeId, planId, paymentGatewayId?, paymentGatewayResponse? }
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

    const body = await req.json()
    const { storeId, planId, paymentGatewayId, paymentGatewayResponse } = body

    if (!storeId || !planId) {
      return NextResponse.json(
        { error: 'storeId and planId are required' },
        { status: 400 }
      )
    }

    // Get store and merchant info
    const { data: store } = await supabase
      .from('merchant_stores')
      .select('id, parent_id')
      .eq('store_id', storeId)
      .single()

    if (!store?.id || !store?.parent_id) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    // Get plan details
    const { data: plan } = await supabase
      .from('merchant_plans')
      .select('*')
      .eq('id', planId)
      .single()

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    }

    // Check if trying to downgrade to free plan while having active paid subscription
    if ((plan.price === 0 || plan.price === null) && plan.plan_code === 'FREE') {
      const { data: activeSubscription } = await supabase
        .from('merchant_subscriptions')
        .select('*')
        .eq('merchant_id', store.parent_id)
        .eq('store_id', store.id)
        .eq('is_active', true)
        .eq('subscription_status', 'ACTIVE')
        .gt('expiry_date', new Date().toISOString())
        .maybeSingle()

      if (activeSubscription) {
        // Get the plan details for the active subscription
        const { data: activePlan } = await supabase
          .from('merchant_plans')
          .select('price, plan_name')
          .eq('id', activeSubscription.plan_id)
          .single()

        if (activePlan && activePlan.price > 0) {
          const expiryDate = new Date(activeSubscription.expiry_date)
          return NextResponse.json({
            error: `आपका ${activePlan.plan_name} plan अभी भी active है (expires: ${expiryDate.toLocaleDateString('en-IN')})। Free plan पर move करने के लिए पहले current plan expire होना चाहिए।`,
            errorEn: `Your ${activePlan.plan_name} plan is still active (expires: ${expiryDate.toLocaleDateString('en-IN')}). Please wait until it expires to move to Free plan.`,
          }, { status: 400 })
        }
      }
    }

    const now = new Date()
    const expiryDate = new Date(now)
    expiryDate.setMonth(expiryDate.getMonth() + 1) // Default 1 month

    // Create or update subscription
    const { data: existingSubscription } = await supabase
      .from('merchant_subscriptions')
      .select('id')
      .eq('merchant_id', store.parent_id)
      .eq('store_id', store.id)
      .maybeSingle()

    let subscriptionId: number

    if (existingSubscription) {
      // Update existing subscription
      const { data: updated, error: updateError } = await supabase
        .from('merchant_subscriptions')
        .update({
          plan_id: planId,
          subscription_status: 'ACTIVE',
          payment_status: paymentGatewayId ? 'PAID' : 'PENDING',
          start_date: now.toISOString(),
          expiry_date: expiryDate.toISOString(),
          is_active: true,
          last_payment_date: paymentGatewayId ? now.toISOString() : null,
          next_billing_date: expiryDate.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', existingSubscription.id)
        .select('id')
        .single()

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
      subscriptionId = updated.id
    } else {
      // Create new subscription (auto_renew defaults to false)
      const { data: created, error: createError } = await supabase
        .from('merchant_subscriptions')
        .insert({
          merchant_id: store.parent_id,
          store_id: store.id,
          plan_id: planId,
          subscription_status: 'ACTIVE',
          payment_status: paymentGatewayId ? 'PAID' : 'PENDING',
          start_date: now.toISOString(),
          expiry_date: expiryDate.toISOString(),
          is_active: true,
          auto_renew: false, // Default to false
          last_payment_date: paymentGatewayId ? now.toISOString() : null,
          next_billing_date: expiryDate.toISOString(),
        })
        .select('id')
        .single()

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }
      subscriptionId = created.id
    }

    // Create payment record if payment info provided
    if (paymentGatewayId) {
      await supabase.from('subscription_payments').insert({
        merchant_id: store.parent_id,
        store_id: store.id,
        subscription_id: subscriptionId,
        plan_id: planId,
        amount: plan.price,
        payment_gateway: 'RAZORPAY', // Default, can be passed in body
        payment_gateway_id: paymentGatewayId,
        payment_gateway_response: paymentGatewayResponse || {},
        payment_status: 'PAID',
        payment_date: now.toISOString(),
        billing_period_start: now.toISOString(),
        billing_period_end: expiryDate.toISOString(),
      })
    }

    return NextResponse.json({
      success: true,
      subscriptionId,
      message: 'Subscription activated successfully',
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}
