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
  const { data, error } = await db.from('merchant_stores').select('id').eq('store_id', storeIdParam).single();
  if (error || !data) return null;
  return data.id as number;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Format date as "18 Jan" */
function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * GET /api/dashboard-analytics?store_id=GMMxxxx&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
 * Returns KPIs and chart data from orders_food for the given store.
 * Optional date_from, date_to for custom range (default: last 30 days).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('store_id');
    const dateFromParam = searchParams.get('date_from');
    const dateToParam = searchParams.get('date_to');
    if (!storeId) return NextResponse.json({ error: 'store_id is required' }, { status: 400 });

    const db = getSupabase();
    const storeInternalId = await resolveStoreId(db, storeId);
    if (!storeInternalId) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    const now = new Date();
    const tz = 'Asia/Kolkata';

    let rangeStart: Date;
    let rangeEnd: Date;
    if (dateFromParam && dateToParam && /^\d{4}-\d{2}-\d{2}$/.test(dateFromParam) && /^\d{4}-\d{2}-\d{2}$/.test(dateToParam)) {
      rangeStart = new Date(dateFromParam + 'T00:00:00.000Z');
      rangeEnd = new Date(dateToParam + 'T23:59:59.999Z');
      if (rangeStart.getTime() > rangeEnd.getTime()) [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
    } else {
      rangeEnd = new Date(now);
      rangeEnd.setHours(23, 59, 59, 999);
      rangeStart = new Date(rangeEnd);
      rangeStart.setDate(rangeStart.getDate() - 29);
      rangeStart.setHours(0, 0, 0, 0);
    }
    const queryStart = rangeStart;

    const { data: rows, error } = await db
      .from('orders_food')
      .select('id, order_status, created_at, food_items_total_value, preparation_time_minutes, prepared_at, accepted_at, veg_non_veg')
      .eq('merchant_store_id', storeInternalId)
      .gte('created_at', queryStart.toISOString());

    if (error) {
      console.error('[dashboard-analytics]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = rows || [];

    const toLocalDate = (iso: string) => {
      const d = new Date(iso);
      return new Date(d.toLocaleString('en-US', { timeZone: tz })).toDateString();
    };
    const toLocalHour = (iso: string) => {
      const d = new Date(iso);
      return parseInt(d.toLocaleString('en-CA', { timeZone: tz, hour: '2-digit', hour12: false }), 10);
    };

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = toLocalDate(todayStart.toISOString());

    const activeStatuses = ['CREATED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];
    const pending = list.filter((o) => (o.order_status || '') === 'CREATED').length;
    const preparing = list.filter((o) => (o.order_status || '') === 'PREPARING').length;
    const outForDelivery = list.filter((o) => (o.order_status || '') === 'OUT_FOR_DELIVERY').length;
    const todayOrders = list.filter((o) => toLocalDate(o.created_at) === todayStr);
    const deliveredToday = todayOrders.filter((o) => (o.order_status || '').toUpperCase() === 'DELIVERED');
    const cancelledToday = todayOrders.filter((o) => (o.order_status || '').toUpperCase() === 'CANCELLED');
    const revenueToday = deliveredToday.reduce((s, o) => s + Number(o.food_items_total_value || 0), 0);
    const acceptedToday = todayOrders.filter((o) => o.accepted_at).length;
    const acceptanceRate = todayOrders.length > 0 ? Math.round((acceptedToday / todayOrders.length) * 100) : 0;
    const withPrep = list.filter((o) => o.prepared_at && o.created_at);
    const avgPrepTime = withPrep.length
      ? Math.round(
          withPrep.reduce((s, o) => s + Math.round((new Date(o.prepared_at!).getTime() - new Date(o.created_at).getTime()) / 60000), 0) / withPrep.length
        )
      : 0;

    // Filter list to range for period-specific metrics
    const inRange = (iso: string) => {
      const t = new Date(iso).getTime();
      return t >= rangeStart.getTime() && t <= rangeEnd.getTime();
    };
    const listInRange = list.filter((o) => inRange(o.created_at));

    // Sales & Views totals and growth (current half vs previous half of range)
    const rangeDays = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1;
    const halfDays = Math.max(1, Math.floor(rangeDays / 2));
    const midDate = new Date(rangeStart);
    midDate.setDate(midDate.getDate() + halfDays);
    const prevHalf = list.filter((o) => {
      const t = new Date(o.created_at).getTime();
      return t >= rangeStart.getTime() && t < midDate.getTime();
    });
    const currHalf = list.filter((o) => {
      const t = new Date(o.created_at).getTime();
      return t >= midDate.getTime() && t <= rangeEnd.getTime();
    });
    const prevRev = prevHalf.filter((o) => (o.order_status || '').toUpperCase() === 'DELIVERED').reduce((s, o) => s + Number(o.food_items_total_value || 0), 0);
    const currRev = currHalf.filter((o) => (o.order_status || '').toUpperCase() === 'DELIVERED').reduce((s, o) => s + Number(o.food_items_total_value || 0), 0);
    const salesTotal = listInRange.filter((o) => (o.order_status || '').toUpperCase() === 'DELIVERED').reduce((s, o) => s + Number(o.food_items_total_value || 0), 0);
    const viewsTotal = listInRange.length;
    const salesGrowth = prevRev > 0 ? Math.round(((currRev - prevRev) / prevRev) * 1000) / 10 : 0;
    const viewsGrowth = prevHalf.length > 0 ? Math.round(((currHalf.length - prevHalf.length) / prevHalf.length) * 1000) / 10 : 0;

    const ordersTrend: { day: string; orders: number }[] = [];
    const daysToShow = Math.min(7, rangeDays);
    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date(rangeEnd);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dateStr = toLocalDate(d.toISOString());
      const count = list.filter((o) => toLocalDate(o.created_at) === dateStr).length;
      ordersTrend.push({ day: DAY_LABELS[d.getDay()], orders: count });
    }

    const revenueByDay: { d: string; rev: number }[] = [];
    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date(rangeEnd);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dateStr = toLocalDate(d.toISOString());
      const dayOrders = list.filter((o) => toLocalDate(o.created_at) === dateStr && (o.order_status || '').toUpperCase() === 'DELIVERED');
      const rev = dayOrders.reduce((s, o) => s + Number(o.food_items_total_value || 0), 0);
      revenueByDay.push({ d: DAY_LABELS[d.getDay()], rev: Math.round(rev / 1000) });
    }

    const vegCount = list.filter((o) => (o.veg_non_veg || '').toString().toLowerCase() === 'veg').length;
    const nonVegCount = list.filter((o) => (o.veg_non_veg || '').toString().toLowerCase() === 'non_veg').length;
    const mixedCount = list.filter((o) => (o.veg_non_veg || '').toString().toLowerCase() === 'mixed').length;
    const otherCount = list.length - vegCount - nonVegCount - mixedCount;
    const categoryDistribution = [
      { name: 'Veg', value: vegCount || 0, color: '#10b981' },
      { name: 'Non-Veg', value: nonVegCount || 0, color: '#f97316' },
      { name: 'Mixed', value: mixedCount || 0, color: '#8b5cf6' },
      { name: 'Other', value: otherCount || 0, color: '#94a3b8' },
    ].filter((x) => x.value > 0);
    if (categoryDistribution.length === 0) categoryDistribution.push({ name: 'No data', value: 1, color: '#e2e8f0' });

    const hourlyBuckets: number[] = Array.from({ length: 12 }, () => 0);
    const hourIndex = (h: number) => {
      if (h >= 10 && h <= 21) return h - 10;
      return -1;
    };
    list.forEach((o) => {
      const h = toLocalHour(o.created_at);
      const idx = hourIndex(h);
      if (idx >= 0) hourlyBuckets[idx]++;
    });
    const hourlyMax = Math.max(...hourlyBuckets, 1);
    const hourlyHeatmap = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map((h, i) => ({
      hour: h,
      count: hourlyBuckets[i] || 0,
      pct: Math.round(((hourlyBuckets[i] || 0) / hourlyMax) * 100),
    }));

    const weeklyPerformance: { w: string; orders: number }[] = [];
    for (let w = 3; w >= 0; w--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - w * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const count = list.filter((o) => {
        const created = new Date(o.created_at).getTime();
        return created >= weekStart.getTime() && created < weekEnd.getTime();
      }).length;
      weeklyPerformance.push({ w: `W${4 - w}`, orders: count });
    }

    const deliverySuccessRate: { d: string; rate: number }[] = [];
    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date(rangeEnd);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dateStr = toLocalDate(d.toISOString());
      const dayOrders = list.filter((o) => toLocalDate(o.created_at) === dateStr);
      const delivered = dayOrders.filter((o) => (o.order_status || '').toUpperCase() === 'DELIVERED').length;
      const terminal = dayOrders.filter((o) =>
        ['DELIVERED', 'RTO', 'CANCELLED'].includes((o.order_status || '').toUpperCase())
      ).length;
      const rate = terminal > 0 ? Math.round((delivered / terminal) * 100) : 100;
      deliverySuccessRate.push({ d: DAY_LABELS[d.getDay()], rate });
    }

    const dateRangeLabel = `${fmtShort(rangeStart)} - ${fmtShort(rangeEnd)}`;

    // Multi-metric stacked area: orders, revenue (scaled), cancellations per day
    const stackedTrend: { day: string; orders: number; revenue: number; cancellations: number }[] = [];
    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date(rangeEnd);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dateStr = toLocalDate(d.toISOString());
      const dayOrders = list.filter((o) => toLocalDate(o.created_at) === dateStr);
      const orders = dayOrders.length;
      const rev = dayOrders
        .filter((o) => (o.order_status || '').toUpperCase() === 'DELIVERED')
        .reduce((s, o) => s + Number(o.food_items_total_value || 0), 0);
      const canc = dayOrders.filter((o) => (o.order_status || '').toUpperCase() === 'CANCELLED').length;
      stackedTrend.push({
        day: DAY_LABELS[d.getDay()],
        orders,
        revenue: Math.round(rev / 100) / 10, // scale to thousands for chart
        cancellations: canc,
      });
    }

    // Order lifecycle funnel (today's date filter for accuracy)
    const todayList = list.filter((o) => toLocalDate(o.created_at) === todayStr);
    const funnelData = [
      { stage: 'Placed', value: todayList.length, fill: '#f97316' },
      { stage: 'Accepted', value: todayList.filter((o) => o.accepted_at != null).length, fill: '#3b82f6' },
      { stage: 'Preparing', value: todayList.filter((o) => (o.order_status || '') === 'PREPARING').length, fill: '#8b5cf6' },
      { stage: 'Out for Delivery', value: todayList.filter((o) => (o.order_status || '') === 'OUT_FOR_DELIVERY').length, fill: '#06b6d4' },
      { stage: 'Delivered', value: todayList.filter((o) => (o.order_status || '').toUpperCase() === 'DELIVERED').length, fill: '#10b981' },
    ];

    // Donut data: veg/non-veg for percentage insights
    const totalVnV = vegCount + nonVegCount + mixedCount || 1;
    let donutVegNonVeg = [
      { name: 'Veg', value: vegCount, color: '#10b981', pct: Math.round((vegCount / totalVnV) * 100) },
      { name: 'Non-Veg', value: nonVegCount, color: '#f97316', pct: Math.round((nonVegCount / totalVnV) * 100) },
      { name: 'Mixed', value: mixedCount, color: '#8b5cf6', pct: Math.round((mixedCount / totalVnV) * 100) },
    ].filter((x) => x.value > 0);
    if (donutVegNonVeg.length === 0) {
      donutVegNonVeg = [{ name: 'No data', value: 1, color: '#e2e8f0', pct: 100 }];
    }

    return NextResponse.json({
      dateRangeLabel,
      salesTotal: Math.round(salesTotal),
      salesGrowth,
      viewsTotal,
      viewsGrowth,
      kpis: {
        pending,
        preparing,
        outForDelivery,
        deliveredToday: deliveredToday.length,
        cancelled: cancelledToday.length,
        revenueToday: Math.round(revenueToday),
        avgPrepTime,
        acceptanceRate,
      },
      ordersTrend,
      revenueByDay,
      categoryDistribution,
      hourlyHeatmap,
      weeklyPerformance,
      deliverySuccessRate,
      stackedTrend,
      funnelData,
      donutVegNonVeg,
    });
  } catch (err) {
    console.error('[dashboard-analytics]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
