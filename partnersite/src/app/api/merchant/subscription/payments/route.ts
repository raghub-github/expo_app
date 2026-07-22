import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { settlementNoteVisibleUntil, isSettlementNoteVisible } from '@/lib/refund-settlement'

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
  total_paise?: number | null
  gst_amount_paise?: number | null
  subtotal_paise?: number | null
  gst_percent_applied?: number | null
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
  refund?: {
    refund_id: string | null
    razorpay_payment_id: string | null
    status: string | null
    amount: number | null
    reason: string | null
    requested_at: string | null
    completed_at: string | null
    failed_at: string | null
    failure_reason: string | null
    last_sync_at: string | null
    /** ISO instant settlement guidance stops showing (10 working days after
     * completion, IST). null unless the refund is COMPLETED. */
    settlement_note_until: string | null
    /** Whether that settlement note should show right now (server-evaluated). */
    settlement_note_visible: boolean
  } | null
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

    const [
      { data: payments, error: paymentsError },
      { data: subscriptions, error: subsError },
      { data: refundRows, error: refundsError },
    ] = await Promise.all([
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
        // Refund audit trail — the SINGLE SOURCE OF TRUTH for Razorpay refund
        // details (real refund id, status, requested/completed timestamps). Keyed
        // to each payment via payment_id.
        supabase
          .from('merchant_subscription_refunds')
          .select(
            'payment_id, razorpay_refund_id, razorpay_payment_id, status, amount, reason, initiated_at, completed_at, failed_at, failure_reason, last_refund_sync_at'
          )
          .eq('store_id', store.id),
      ])

    if (paymentsError) {
      return NextResponse.json({ error: paymentsError.message }, { status: 500 })
    }
    if (subsError) {
      return NextResponse.json({ error: subsError.message }, { status: 500 })
    }
    if (refundsError) {
      // Non-fatal: refund details are supplementary; still return payment history.
      console.warn('[subscription/payments] refund fetch failed:', refundsError.message)
    }

    // Map refund audit rows by payment_id for O(1) attach below.
    const refundByPaymentId = new Map<string, PlanHistoryEntry['refund']>()
    for (const rr of refundRows ?? []) {
      const r = rr as Record<string, unknown>
      const status = r.status != null ? String(r.status) : null
      const completedAt = toIso(r.completed_at)
      // Settlement guidance only for a gateway-CONFIRMED refund (COMPLETED).
      // The 10-working-day window is computed server-side so every surface
      // hides the guidance at exactly the same instant.
      const isCompleted = String(status ?? '').toUpperCase() === 'COMPLETED'
      const settlementUntil = isCompleted ? settlementNoteVisibleUntil(completedAt) : null
      refundByPaymentId.set(String(r.payment_id), {
        refund_id: r.razorpay_refund_id != null ? String(r.razorpay_refund_id) : null,
        razorpay_payment_id: r.razorpay_payment_id != null ? String(r.razorpay_payment_id) : null,
        status,
        amount: r.amount != null ? Number(r.amount) : null,
        reason: r.reason != null ? String(r.reason) : null,
        requested_at: toIso(r.initiated_at),
        completed_at: completedAt,
        failed_at: toIso(r.failed_at),
        failure_reason: r.failure_reason != null ? String(r.failure_reason) : null,
        last_sync_at: toIso(r.last_refund_sync_at),
        settlement_note_until: settlementUntil,
        settlement_note_visible: isCompleted ? isSettlementNoteVisible(completedAt) : false,
      })
    }

    const history: PlanHistoryEntry[] = []
    const paymentKeys = new Set<string>()

    for (const payment of payments ?? []) {
      const p = payment as Record<string, unknown>
      const plan = p.merchant_plans as { plan_name?: string; plan_code?: string } | null
      const billingEnd = toIso(p.billing_period_end)
      const key = `payment:${String(p.id)}`
      paymentKeys.add(key)
      // Always surface the IMMUTABLE amount the merchant actually paid (GST-inclusive
      // total captured at payment time), never the current/updated plan price. Prefer
      // total_paise (the authoritative charged total); fall back to the legacy `amount`
      // column only for rows predating the GST breakdown (run migration 0427 to backfill).
      const totalPaise = p.total_paise != null ? Number(p.total_paise) : null
      const paidAmount =
        totalPaise != null ? totalPaise / 100 : p.amount != null ? Number(p.amount) : null
      history.push({
        id: key,
        kind: 'payment',
        plan_name: plan?.plan_name ?? 'Plan Payment',
        plan_code: plan?.plan_code ?? null,
        amount: paidAmount,
        total_paise: totalPaise,
        gst_amount_paise: p.gst_amount_paise != null ? Number(p.gst_amount_paise) : null,
        subtotal_paise: p.subtotal_paise != null ? Number(p.subtotal_paise) : null,
        gst_percent_applied: p.gst_percent_applied != null ? Number(p.gst_percent_applied) : null,
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
        refund: refundByPaymentId.get(String(p.id)) ?? null,
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
      // Sort by WHEN the event actually happened (newest first): a purchase by its
      // payment_date, an expiry/cancel by when it occurred. Previously payments were
      // keyed on expired_at (= their billing_period_end), so a 16 Jun purchase floated
      // up next to its own 16 Jul expiry and rendered ABOVE the expiry event.
      const aTs = new Date(a.payment_date ?? a.expired_at ?? 0).getTime()
      const bTs = new Date(b.payment_date ?? b.expired_at ?? 0).getTime()
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
