import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co"
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key"
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export type PlanHistoryEntry = {
  id: string
  kind: 'payment' | 'expired' | 'upgraded' | 'cancelled'
  plan_name: string
  plan_code?: string | null
  amount?: number | null
  payment_status?: string | null
  subscription_status?: string | null
  payment_date?: string | null
  billing_period_start?: string | null
  billing_period_end?: string | null
  expired_at?: string | null
  payment_gateway?: string | null
  payment_gateway_id?: string | null
  payment_gateway_response?: Record<string, unknown> | null
  auto_renew?: boolean | null
}

function toIso(value: unknown): string | null {
  if (value == null) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

/**
 * GET /api/merchant/subscription/payments?storeId=GMMxxxx
 * Returns payment + subscription lifecycle history for a store.
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

    const { data: store } = await supabase
      .from('merchant_stores')
      .select('id, parent_id')
      .eq('store_id', storeId)
      .single()

    if (!store?.id) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    }

    const nowIso = new Date().toISOString()

    const [{ data: payments, error: paymentsError }, { data: subscriptions, error: subsError }] =
      await Promise.all([
        supabase
          .from('subscription_payments')
          .select(`
            *,
            merchant_plans (plan_name, plan_code)
          `)
          .eq('store_id', store.id)
          .order('payment_date', { ascending: false })
          .limit(50),
        supabase
          .from('merchant_subscriptions')
          .select(`
            id,
            plan_id,
            subscription_status,
            payment_status,
            auto_renew,
            start_date,
            expiry_date,
            billing_start_at,
            billing_end_at,
            cancelled_at,
            updated_at,
            created_at,
            merchant_plans (plan_name, plan_code, price)
          `)
          .eq('store_id', store.id)
          .order('created_at', { ascending: false })
          .limit(30),
      ])

    if (paymentsError) {
      return NextResponse.json({ error: paymentsError.message }, { status: 500 })
    }
    if (subsError) {
      return NextResponse.json({ error: subsError.message }, { status: 500 })
    }

    const history: PlanHistoryEntry[] = []
    const paymentKeys = new Set<string>()

    for (const payment of payments ?? []) {
      const p = payment as Record<string, unknown>
      const plan = p.merchant_plans as { plan_name?: string; plan_code?: string } | null
      const billingEnd = toIso(p.billing_period_end)
      const key = `payment:${String(p.id)}`
      paymentKeys.add(key)
      history.push({
        id: key,
        kind: 'payment',
        plan_name: plan?.plan_name ?? 'Plan Payment',
        plan_code: plan?.plan_code ?? null,
        amount: p.amount != null ? Number(p.amount) : null,
        payment_status: p.payment_status != null ? String(p.payment_status) : null,
        payment_date: toIso(p.payment_date),
        billing_period_start: toIso(p.billing_period_start),
        billing_period_end: billingEnd,
        expired_at: billingEnd,
        payment_gateway: p.payment_gateway != null ? String(p.payment_gateway) : null,
        payment_gateway_id: p.payment_gateway_id != null ? String(p.payment_gateway_id) : null,
        payment_gateway_response:
          p.payment_gateway_response && typeof p.payment_gateway_response === 'object'
            ? (p.payment_gateway_response as Record<string, unknown>)
            : null,
      })
    }

    for (const sub of subscriptions ?? []) {
      const s = sub as Record<string, unknown>
      const plan = s.merchant_plans as { plan_name?: string; plan_code?: string; price?: number } | null
      const status = String(s.subscription_status ?? '').toUpperCase()
      const expiry = toIso(s.billing_end_at ?? s.expiry_date)
      const isPastExpiry = expiry != null && expiry <= nowIso
      const planPrice = plan?.price != null ? Number(plan.price) : 0

      if (status === 'UPGRADED') {
        history.push({
          id: `upgraded:${String(s.id)}`,
          kind: 'upgraded',
          plan_name: plan?.plan_name ?? 'Plan',
          plan_code: plan?.plan_code ?? null,
          amount: planPrice > 0 ? planPrice : null,
          subscription_status: status,
          payment_date: toIso(s.updated_at ?? s.created_at),
          billing_period_start: toIso(s.billing_start_at ?? s.start_date),
          billing_period_end: expiry,
          expired_at: expiry,
          auto_renew: s.auto_renew === true,
        })
        continue
      }

      if (status === 'CANCELLED') {
        history.push({
          id: `cancelled:${String(s.id)}`,
          kind: 'cancelled',
          plan_name: plan?.plan_name ?? 'Plan',
          plan_code: plan?.plan_code ?? null,
          amount: planPrice > 0 ? planPrice : null,
          subscription_status: status,
          payment_date: toIso(s.cancelled_at ?? s.updated_at ?? s.created_at),
          billing_period_start: toIso(s.billing_start_at ?? s.start_date),
          billing_period_end: expiry,
          expired_at: toIso(s.cancelled_at ?? expiry),
          auto_renew: s.auto_renew === true,
        })
        continue
      }

      if (status === 'EXPIRED' || (isPastExpiry && planPrice > 0)) {
        history.push({
          id: `expired:${String(s.id)}`,
          kind: 'expired',
          plan_name: plan?.plan_name ?? 'Plan',
          plan_code: plan?.plan_code ?? null,
          amount: planPrice > 0 ? planPrice : null,
          subscription_status: isPastExpiry && status === 'ACTIVE' ? 'EXPIRED' : status,
          payment_date: expiry,
          billing_period_start: toIso(s.billing_start_at ?? s.start_date),
          billing_period_end: expiry,
          expired_at: expiry,
          auto_renew: s.auto_renew === true,
        })
      }
    }

    history.sort((a, b) => {
      const aTs = new Date(a.expired_at ?? a.payment_date ?? 0).getTime()
      const bTs = new Date(b.expired_at ?? b.payment_date ?? 0).getTime()
      return bTs - aTs
    })

    return NextResponse.json({
      payments: payments ?? [],
      history,
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server error' },
      { status: 500 }
    )
  }
}
