import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveStoreId(db: ReturnType<typeof getSupabase>, storeIdParam: string): Promise<number | null> {
  const { data, error } = await db
    .from('merchant_stores')
    .select('id')
    .eq('store_id', storeIdParam)
    .single();
  if (error || !data) return null;
  return data.id as number;
}

/**
 * GET /api/food-orders/stats?store_id=GMMC1001
 * Returns analytics: orders today, active orders, avg prep time, revenue today, completion rate
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('store_id');
    const dateParam = searchParams.get('date');

    if (!storeId) {
      return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
    }

    const db = getSupabase();
    const storeInternalId = await resolveStoreId(db, storeId);
    if (storeInternalId === null) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    let dayStart: Date;
    let dayEnd: Date;
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      dayStart = new Date(dateParam + 'T00:00:00.000Z');
      dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    } else {
      dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
    }
    const dayStartIso = dayStart.toISOString();
    const dayEndIso = dayEnd.toISOString();

    const { data: orders, error } = await db
      .from('orders_food')
      .select('id, order_status, created_at, food_items_total_value, preparation_time_minutes, prepared_at, accepted_at')
      .eq('merchant_store_id', storeInternalId)
      .gte('created_at', dayStartIso)
      .lt('created_at', dayEndIso);

    if (error) {
      console.error('[food-orders/stats] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = orders || [];
    const activeStatuses = ['CREATED', 'NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];

    const ordersToday = list.length;
    const activeOrders = list.filter((o) => activeStatuses.includes((o.order_status || 'CREATED')));
    const deliveredTodayList = list.filter((o) => (o.order_status || '').toUpperCase() === 'DELIVERED');
    const totalRevenue = deliveredTodayList.reduce((sum, o) => sum + Number(o.food_items_total_value || 0), 0);

    const pendingCount = list.filter((o) => ['CREATED', 'NEW'].includes((o.order_status || 'CREATED').toUpperCase())).length;
    const preparingCount = list.filter((o) => (o.order_status || '').toUpperCase() === 'PREPARING').length;
    const outForDeliveryCount = list.filter((o) => (o.order_status || '').toUpperCase() === 'OUT_FOR_DELIVERY').length;
    const deliveredTodayCount = deliveredTodayList.length;
    const cancelledTodayCount = list.filter((o) => (o.order_status || '').toUpperCase() === 'CANCELLED').length;

    const preparedWithTime = list.filter((o) => o.prepared_at && o.created_at);
    const prepTimes: number[] = preparedWithTime.map((o) => {
      const created = new Date(o.created_at).getTime();
      const prepared = new Date(o.prepared_at!).getTime();
      return Math.round((prepared - created) / 60000);
    });
    const avgPrepTime = prepTimes.length ? Math.round(prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length) : 0;

    const completionRate = ordersToday > 0 ? Math.round((deliveredTodayCount / ordersToday) * 100) : 0;
    const acceptedTodayCount = list.filter((o) => o.accepted_at != null).length;
    const acceptanceRatePercent = ordersToday > 0 ? Math.round((acceptedTodayCount / ordersToday) * 100) : 0;

    return NextResponse.json({
      ordersToday,
      activeOrders: activeOrders.length,
      pendingCount,
      acceptedTodayCount,
      preparingCount,
      outForDeliveryCount,
      deliveredTodayCount,
      cancelledTodayCount,
      avgPreparationTimeMinutes: avgPrepTime,
      totalRevenueToday: totalRevenue,
      completionRatePercent: completionRate,
      acceptanceRatePercent,
    });
  } catch (err) {
    console.error('[food-orders/stats] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
