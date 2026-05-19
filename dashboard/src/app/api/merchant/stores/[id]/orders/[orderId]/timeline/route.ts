import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ensureMerchantStoreDashboardAccess } from '@/lib/merchant-food-orders/store-access';
import { resolveCoreOrderPkForTimeline } from '@/lib/merchant-food-orders/resolve-order-food-row';

export const runtime = 'nodejs';

/**
 * GET /api/merchant/stores/[id]/orders/[orderId]/timeline
 * Same as partnersite GET /api/food-orders/[id]/timeline:
 * orders_food id (or core id) → orders_core.id → order_timelines.order_id
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id, orderId: orderIdStr } = await params;
    const storeId = parseInt(id, 10);
    const orderIdParam = parseInt(orderIdStr, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(orderIdParam)) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
    }

    const access = await ensureMerchantStoreDashboardAccess(storeId);
    if ('error' in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    const db = supabaseAdmin;
    const coreOrderId = await resolveCoreOrderPkForTimeline(db, access.store.id, orderIdParam);
    if (coreOrderId == null) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const { data: rows, error } = await db
      .from('order_timelines')
      .select(
        'id, status, previous_status, status_message, actor_type, occurred_at, expected_by_at, metadata'
      )
      .eq('order_id', coreOrderId)
      .order('occurred_at', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      console.error('[GET order timeline]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ timeline: rows ?? [] });
  } catch (e) {
    console.error('[GET order timeline]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
