/**
 * POST /api/merchant/stores/[id]/orders/[orderId]/prep-delay
 * Body: { additional_minutes: 5 | 10 | 15 }
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ensureMerchantStoreDashboardAccess } from '@/lib/merchant-food-orders/store-access';
import { loadMerchantStoreFoodOrders } from '@/lib/merchant-food-orders/load-store-food-orders';
import { resolveMerchantFoodOrder } from '@/lib/merchant-food-orders/resolve-order-food-row';
import { computeExpectedReadyAtFromNow, PREP_DELAY_OPTIONS } from '@/lib/order-prep-time';
import { notifyCustomerPrepDelay } from '@/lib/notify-customer-prep-delay';

export const runtime = 'nodejs';

function getDb() {
  if (!supabaseAdmin) throw new Error('Supabase admin client not configured');
  return supabaseAdmin;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id, orderId } = await params;
    const storeId = parseInt(id, 10);
    const orderIdNum = parseInt(orderId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(orderIdNum)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const access = await ensureMerchantStoreDashboardAccess(storeId);
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    const storeInternalId = access.store.id;

    const body = await request.json().catch(() => ({}));
    const additional = Number(body?.additional_minutes);
    if (!PREP_DELAY_OPTIONS.includes(additional as (typeof PREP_DELAY_OPTIONS)[number])) {
      return NextResponse.json(
        { error: 'additional_minutes must be 5, 10, or 15' },
        { status: 400 }
      );
    }

    const db = getDb();
    const resolved = await resolveMerchantFoodOrder(db, storeInternalId, orderIdNum);
    if (!resolved?.foodRowId) {
      return NextResponse.json({ error: 'Food order row not found' }, { status: 404 });
    }

    const { data: existing, error: fetchErr } = await db
      .from('orders_food')
      .select('id, order_id, order_status, prep_ready_by_at, prep_delay_minutes, merchant_store_id')
      .eq('id', resolved.foodRowId)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const st = String(existing.order_status || '').toUpperCase();
    if (st !== 'PREPARING' && st !== 'ACCEPTED') {
      return NextResponse.json(
        { error: 'Prep delay only allowed while order is preparing' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const prevDelay = Number(existing.prep_delay_minutes) || 0;
    const newDelayTotal = prevDelay + additional;
    const newExpectedReadyAt = computeExpectedReadyAtFromNow(additional, now);

    const { error: updateErr } = await db
      .from('orders_food')
      .update({
        expected_ready_at: newExpectedReadyAt,
        prep_delay_minutes: newDelayTotal,
        last_prep_delay_minutes_added: additional,
        updated_at: now,
      })
      .eq('id', resolved.foodRowId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    try {
      await db
        .from('orders_core')
        .update({
          expected_ready_at: newExpectedReadyAt,
          prep_delay_minutes: newDelayTotal,
          updated_at: now,
        })
        .eq('id', existing.order_id as number);
    } catch (coreErr) {
      console.warn('[prep-delay] orders_core sync failed:', coreErr);
    }

    try {
      await db.from('merchant_order_food_actions').insert({
        orders_food_id: resolved.foodRowId,
        orders_core_id: existing.order_id as number,
        merchant_store_id: storeInternalId,
        from_status: st,
        to_status: st,
        action_source: 'website',
        actor_type: 'merchant',
        actor_label: 'Store',
        metadata: {
          prep_delay_minutes_added: additional,
          prep_delay_minutes_total: newDelayTotal,
          expected_ready_at: newExpectedReadyAt,
          prep_ready_by_at: existing.prep_ready_by_at,
        },
      });
    } catch (logErr) {
      console.warn('[prep-delay] action log failed:', logErr);
    }

    void notifyCustomerPrepDelay({
      ordersCoreId: existing.order_id as number,
      additionalMinutes: additional as 5 | 10 | 15,
    });

    const merged = await loadMerchantStoreFoodOrders(storeInternalId, {
      ordersFoodId: resolved.foodRowId,
      limit: 1,
    });
    const order = merged[0];
    if (!order) {
      return NextResponse.json({ error: 'Order not found after update' }, { status: 404 });
    }

    return NextResponse.json({
      order,
      expected_ready_at: newExpectedReadyAt,
      prep_ready_by_at: existing.prep_ready_by_at,
      prep_delay_minutes: newDelayTotal,
      last_prep_delay_minutes_added: additional,
    });
  } catch (e) {
    console.error('[POST prep-delay]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
