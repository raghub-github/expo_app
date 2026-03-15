import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_BILLING_DAYS = 30

/**
 * GET /api/merchant/subscription/upgrade-quote?storeId=xxx&newPlanId=123
 * POST /api/merchant/subscription/upgrade-quote { storeId, newPlanId }
 *
 * Returns prorated amount for upgrading from current plan to new plan.
 * Used to show "You will be charged ₹X after adjusting unused time" before payment.
 */
export async function GET(req: NextRequest) {
  const storeId = req.nextUrl.searchParams.get('storeId')
  const newPlanId = req.nextUrl.searchParams.get('newPlanId')
  return handleQuote(storeId, newPlanId ? Number(newPlanId) : undefined, req)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { storeId, newPlanId } = body
    return handleQuote(storeId, newPlanId, req)
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

async function handleQuote(
  storeId: string | null,
  newPlanId: number | undefined,
  req: NextRequest
) {
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

    if (!storeId || newPlanId == null) {
      return NextResponse.json(
        { error: 'storeId and newPlanId are required' },
        { status: 400 }
      )
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
        { error: 'Upgrade endpoint is for paid plans only. Use subscription API for free plan.' },
        { status: 400 }
      )
    }

    const { data: activeSubscription } = await supabase
      .from('merchant_subscriptions')
      .select(`
        id,
        plan_id,
        start_date,
        expiry_date,
        merchant_plans (id, plan_name, plan_code, price)
      `)
      .eq('merchant_id', store.parent_id)
      .eq('store_id', store.id)
      .eq('subscription_status', 'ACTIVE')
      .eq('is_active', true)
      .gt('expiry_date', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const plansRaw = activeSubscription?.merchant_plans
    const currentPlan = Array.isArray(plansRaw)
      ? (plansRaw[0] as { id: number; plan_name: string; plan_code: string; price: number } | undefined) ?? null
      : (plansRaw as { id: number; plan_name: string; plan_code: string; price: number } | null | undefined) ?? null
    const currentPrice = currentPlan ? Number(currentPlan.price ?? 0) : 0

    if (activeSubscription && currentPlan?.id === newPlanId) {
      return NextResponse.json(
        { error: 'Cannot upgrade to the same plan' },
        { status: 400 }
      )
    }

    if (activeSubscription && currentPrice > newPlanPrice) {
      return NextResponse.json(
        { error: 'Downgrade is not allowed via upgrade API. Please wait for current plan to expire or contact support.' },
        { status: 400 }
      )
    }

    let remainingCredit = 0
    let usedDays = 0
    let totalDays = DEFAULT_BILLING_DAYS

    if (activeSubscription && currentPrice > 0 && activeSubscription.start_date && activeSubscription.expiry_date) {
      const start = new Date(activeSubscription.start_date)
      const expiry = new Date(activeSubscription.expiry_date)
      const now = new Date()
      totalDays = Math.max(1, Math.round((expiry.getTime() - start.getTime()) / MS_PER_DAY))
      usedDays = Math.max(0, Math.min(totalDays, Math.round((now.getTime() - start.getTime()) / MS_PER_DAY)))
      const usedAmount = totalDays > 0 ? (currentPrice / totalDays) * usedDays : 0
      remainingCredit = Math.max(0, currentPrice - usedAmount)
    }

    const creditToApply = Math.min(remainingCredit, newPlanPrice)
    const amountToCharge = Math.max(0, Math.round((newPlanPrice - creditToApply) * 100) / 100)

    return NextResponse.json({
      success: true,
      amountToCharge: Number(amountToCharge.toFixed(2)),
      amountToChargePaise: Math.round(amountToCharge * 100),
      remainingCredit: Number(remainingCredit.toFixed(2)),
      creditToApply: Number(creditToApply.toFixed(2)),
      usedDays,
      totalDays,
      currency: 'INR',
      newPlan: {
        id: newPlan.id,
        plan_name: newPlan.plan_name,
        plan_code: newPlan.plan_code,
        price: newPlan.price,
      },
      currentPlan: currentPlan ? { id: currentPlan.id, plan_name: currentPlan.plan_name, price: currentPlan.price } : null,
      currentSubscription: activeSubscription
        ? { id: activeSubscription.id, start_date: activeSubscription.start_date, expiry_date: activeSubscription.expiry_date }
        : null,
      isUpgrade: !!activeSubscription && currentPrice > 0,
      message:
        amountToCharge === 0
          ? 'No payment required; your unused time covers the new plan.'
          : `You will be charged ₹${amountToCharge.toFixed(2)} after adjusting unused time from your current plan.`,
    })
  } catch (e: unknown) {
    console.error('[upgrade-quote]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}
