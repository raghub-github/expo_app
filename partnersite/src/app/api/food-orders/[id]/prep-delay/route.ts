import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extendPrepReadyByAtIso, PREP_DELAY_OPTIONS } from '@/lib/order-prep-time';
import { notifyCustomerPrepDelay } from '@/lib/notify-customer-prep-delay';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveStoreId(db: ReturnType<typeof getSupabase>, storeIdParam: string): Promise<number | null> {
  const { data } = await db.from('merchant_stores').select('id').eq('store_id', storeIdParam).single();
  return data?.id != null ? (data.id as number) : null;
}

/**
 * POST /api/food-orders/[id]/prep-delay?store_id=…
 * Body: { additional_minutes: 5 | 10 | 15 }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = new URL(req.url).searchParams.get('store_id');
    if (!storeId) {
      return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
    }

    const orderIdNum = parseInt(id, 10);
    if (isNaN(orderIdNum)) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const additional = Number(body?.additional_minutes);
    if (!PREP_DELAY_OPTIONS.includes(additional as (typeof PREP_DELAY_OPTIONS)[number])) {
      return NextResponse.json({ error: 'additional_minutes must be 5, 10, or 15' }, { status: 400 });
    }

    const db = getSupabase();
    const storeInternalId = await resolveStoreId(db, storeId);
    if (storeInternalId === null) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const { data: existing, error: fetchErr } = await db
      .from('orders_food')
      .select('id, order_id, order_status, prep_ready_by_at, prep_delay_minutes, prep_delay_use_count, merchant_store_id')
      .eq('id', orderIdNum)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (existing.merchant_store_id !== storeInternalId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const st = String(existing.order_status || '').toUpperCase();
    if (st !== 'PREPARING' && st !== 'ACCEPTED') {
      return NextResponse.json({ error: 'Prep delay only allowed while order is preparing' }, { status: 400 });
    }

    let isBulkOrder = false;
    if (existing.order_id != null) {
      const { data: coreRow } = await db
        .from('orders_core')
        .select('is_bulk_order')
        .eq('id', existing.order_id as number)
        .maybeSingle();
      isBulkOrder = Boolean(coreRow?.is_bulk_order);
    }

    const prevUseCount = Number(existing.prep_delay_use_count) || 0;
    const maxUses = isBulkOrder ? 2 : 1;
    if (prevUseCount >= maxUses) {
      return NextResponse.json({ error: 'prep_delay_limit_reached' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const prevDelay = Number(existing.prep_delay_minutes) || 0;
    const newDelayTotal = prevDelay + additional;
    const newUseCount = prevUseCount + 1;
    const newPrepReadyByAt = extendPrepReadyByAtIso(
      existing.prep_ready_by_at as string | null,
      additional,
      now
    );

    const { error: updateErr } = await db
      .from('orders_food')
      .update({
        prep_ready_by_at: newPrepReadyByAt,
        prep_delay_minutes: newDelayTotal,
        prep_delay_use_count: newUseCount,
        updated_at: now,
      })
      .eq('id', orderIdNum);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    try {
      await db
        .from('orders_core')
        .update({
          prep_ready_by_at: newPrepReadyByAt,
          prep_delay_minutes: newDelayTotal,
          prep_delay_use_count: newUseCount,
          updated_at: now,
        })
        .eq('id', existing.order_id as number);
    } catch {
      /* non-fatal */
    }

    try {
      await db.from('merchant_order_food_actions').insert({
        orders_food_id: orderIdNum,
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
          prep_ready_by_at: newPrepReadyByAt,
        },
      });
    } catch {
      /* non-fatal */
    }

    void notifyCustomerPrepDelay({
      ordersCoreId: existing.order_id as number,
      additionalMinutes: additional as 5 | 10 | 15,
    });

    return NextResponse.json({
      prep_ready_by_at: newPrepReadyByAt,
      prep_delay_minutes: newDelayTotal,
      prep_delay_use_count: newUseCount,
    });
  } catch (err) {
    console.error('[food-orders prep-delay] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
