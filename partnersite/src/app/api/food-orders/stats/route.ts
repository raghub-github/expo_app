import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolvePartnerPipeline } from '@/lib/partner-orders-unify';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveStoreId(db: ReturnType<typeof getSupabase>, storeIdParam: string): Promise<number | null> {
  const { data, error } = await db.from('merchant_stores').select('id').eq('store_id', storeIdParam).single();
  if (error || !data) return null;
  return data.id as number;
}

/**
 * GET /api/food-orders/stats?store_id=GMMC1001
 * Counts from orders_core (canonical) for the store; revenue from delivered rows today.
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
      .from('orders_core')
      .select('id, status, current_status, created_at, grand_total, item_total, cancelled_at, placed_at')
      .eq('merchant_store_id', storeInternalId)
      .gte('created_at', dayStartIso)
      .lt('created_at', dayEndIso);

    if (error) {
      console.error('[food-orders/stats] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = orders || [];
    const effectiveUi = (o: { status?: string; current_status?: string | null }) =>
      resolvePartnerPipeline(null, o.status ?? 'assigned', o.current_status ?? null);

    const pipelineTodayStatuses = ['CREATED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];

    const ordersToday = list.length;
    const ordersTodayActive = list.filter((o) =>
      pipelineTodayStatuses.includes(effectiveUi(o as { status?: string; current_status?: string | null }))
    ).length;

    /** Count of today’s orders still in the merchant pipeline (same as ordersTodayActive). */
    const activeOrdersCount = list.filter((o) =>
      pipelineTodayStatuses.includes(effectiveUi(o as { status?: string; current_status?: string | null }))
    ).length;

    const deliveredTodayList = list.filter(
      (o) => effectiveUi(o as { status?: string; current_status?: string | null }) === 'DELIVERED'
    );
    const totalRevenue = deliveredTodayList.reduce(
      (sum, o) => sum + Number((o as { grand_total?: string | number }).grand_total || 0),
      0
    );

    const pendingCount = list.filter(
      (o) => effectiveUi(o as { status?: string; current_status?: string | null }) === 'CREATED'
    ).length;
    const preparingCount = list.filter((o) =>
      ['ACCEPTED', 'PREPARING'].includes(effectiveUi(o as { status?: string; current_status?: string | null }))
    ).length;
    const outForDeliveryCount = list.filter(
      (o) => effectiveUi(o as { status?: string; current_status?: string | null }) === 'OUT_FOR_DELIVERY'
    ).length;
    const deliveredTodayCount = deliveredTodayList.length;
    const cancelledTodayCount = list.filter((o) =>
      ['CANCELLED', 'RTO'].includes(effectiveUi(o as { status?: string; current_status?: string | null }))
    ).length;

    const { data: foodToday } = await db
      .from('orders_food')
      .select('created_at, prepared_at')
      .eq('merchant_store_id', storeInternalId)
      .gte('created_at', dayStartIso)
      .lt('created_at', dayEndIso);
    const prepTimes: number[] = (foodToday || [])
      .filter((r) => (r as { prepared_at?: string }).prepared_at && (r as { created_at?: string }).created_at)
      .map((o) => {
        const row = o as { created_at: string; prepared_at: string };
        return Math.round(
          (new Date(row.prepared_at).getTime() - new Date(row.created_at).getTime()) / 60000
        );
      });
    const avgPrepTime = prepTimes.length
      ? Math.round(prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length)
      : 0;

    const completionRate = ordersToday > 0 ? Math.round((deliveredTodayCount / ordersToday) * 100) : 0;
    const acceptedTodayCount = list.filter((o) =>
      ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(
        effectiveUi(o as { status?: string; current_status?: string | null })
      )
    ).length;
    const acceptanceRatePercent = ordersToday > 0 ? Math.round((acceptedTodayCount / ordersToday) * 100) : 0;

    return NextResponse.json({
      ordersToday,
      ordersTodayActive,
      activeOrders: activeOrdersCount,
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
