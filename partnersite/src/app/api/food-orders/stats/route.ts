import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolvePartnerPipeline } from '@/lib/partner-orders-unify';
import { isLiveSidebarPipelineFromCore } from '@/lib/foodOrdersLivePipeline';
import { backfillMissingDeliveredOrderCredits } from '@/lib/backfill-merchant-wallet-credits';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";
const IST = 'Asia/Kolkata';

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

function istDateString(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function istDayBounds(dateParam?: string | null): { dayStart: Date; dayEnd: Date; ymd: string } {
  let anchor = new Date();
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    anchor = new Date(`${dateParam}T12:00:00+05:30`);
  }
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(anchor);
  const dayStart = new Date(`${ymd}T00:00:00+05:30`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return { dayStart, dayEnd, ymd };
}

function resolveDeliveredCtm(
  foodRow: { food_items_total_value?: unknown },
  coreRow?: { total_ctm?: unknown } | null
): number {
  const frozen = Number(coreRow?.total_ctm);
  if (Number.isFinite(frozen) && frozen > 0) return frozen;
  const fromFood = Number(foodRow.food_items_total_value);
  if (Number.isFinite(fromFood) && fromFood > 0) return fromFood;
  return 0;
}

/**
 * GET /api/food-orders/stats?store_id=GMMC1001
 * KPIs use IST calendar day. Revenue = merchant CTM for orders delivered today.
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

    try {
      await backfillMissingDeliveredOrderCredits(db, storeInternalId);
    } catch (backfillErr) {
      console.warn('[food-orders/stats] backfill credits:', backfillErr);
    }

    const { dayStart, dayEnd, ymd } = istDayBounds(dateParam);
    const lookbackStart = new Date(dayStart);
    lookbackStart.setDate(lookbackStart.getDate() - 2);

    const { data: foodRows, error: foodErr } = await db
      .from('orders_food')
      .select('id, order_id, order_status, created_at, delivered_at, food_items_total_value, prepared_at, accepted_at')
      .eq('merchant_store_id', storeInternalId)
      .gte('created_at', lookbackStart.toISOString());

    if (foodErr) {
      console.error('[food-orders/stats] food:', foodErr);
      return NextResponse.json({ error: foodErr.message }, { status: 500 });
    }

    const list = foodRows || [];
    const coreIds = [...new Set(list.map((r) => Number((r as { order_id: number }).order_id)).filter(Number.isFinite))];

    const coreById = new Map<number, { status?: string; current_status?: string | null; total_ctm?: unknown }>();
    if (coreIds.length > 0) {
      const { data: coreRows } = await db
        .from('orders_core')
        .select('id, status, current_status, total_ctm')
        .in('id', coreIds);
      for (const c of coreRows || []) {
        const id = Number((c as { id: number }).id);
        if (Number.isFinite(id)) coreById.set(id, c as { status?: string; current_status?: string | null; total_ctm?: unknown });
      }
    }

    const effectiveUiForFood = (row: {
      order_id: number;
      order_status?: string | null;
    }) => {
      const core = coreById.get(Number(row.order_id));
      return resolvePartnerPipeline(
        row.order_status ?? null,
        core?.status ?? 'assigned',
        core?.current_status ?? null
      );
    };

    const placedToday = list.filter((o) => istDateString((o as { created_at: string }).created_at) === ymd);

    const deliveredToday = list.filter((o) => {
      const row = o as { delivered_at?: string | null; order_status?: string | null; order_id: number };
      const ui = effectiveUiForFood(row);
      if (ui !== 'DELIVERED') return false;
      const deliveredDay = istDateString(row.delivered_at ?? row.created_at);
      return deliveredDay === ymd;
    });

    const ordersToday = placedToday.length;
    const pipelineTodayStatuses = ['CREATED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];
    const ordersTodayActive = placedToday.filter((o) =>
      pipelineTodayStatuses.includes(
        effectiveUiForFood(o as { order_id: number; order_status?: string | null })
      )
    ).length;

    const totalRevenue = deliveredToday.reduce((sum, o) => {
      const row = o as { order_id: number; food_items_total_value?: unknown };
      const core = coreById.get(Number(row.order_id));
      return sum + resolveDeliveredCtm(row, core);
    }, 0);

    const pendingCount = placedToday.filter(
      (o) => effectiveUiForFood(o as { order_id: number; order_status?: string | null }) === 'CREATED'
    ).length;
    const preparingCount = placedToday.filter((o) =>
      ['ACCEPTED', 'PREPARING'].includes(
        effectiveUiForFood(o as { order_id: number; order_status?: string | null })
      )
    ).length;
    const outForDeliveryCount = placedToday.filter(
      (o) => effectiveUiForFood(o as { order_id: number; order_status?: string | null }) === 'OUT_FOR_DELIVERY'
    ).length;
    const deliveredTodayCount = deliveredToday.length;
    const cancelledTodayCount = placedToday.filter((o) =>
      ['CANCELLED', 'RTO'].includes(
        effectiveUiForFood(o as { order_id: number; order_status?: string | null })
      )
    ).length;

    const { data: activeCoreRows, error: activeCoreError } = await db
      .from('orders_core')
      .select('id, status, current_status')
      .eq('merchant_store_id', storeInternalId);
    if (activeCoreError) {
      console.error('[food-orders/stats] active core:', activeCoreError);
    }
    let activeOrdersCount = 0;
    const coreForActive = activeCoreRows || [];
    if (coreForActive.length > 0) {
      const activeCoreIds = coreForActive.map((c) => Number((c as { id: number }).id)).filter(Number.isFinite);
      const { data: activeFoodRows } = await db
        .from('orders_food')
        .select('order_id, order_status')
        .in('order_id', activeCoreIds);
      const foodStatusByCoreId = new Map<number, string | null>();
      for (const row of activeFoodRows || []) {
        const oid = Number((row as { order_id: number }).order_id);
        if (Number.isFinite(oid)) {
          foodStatusByCoreId.set(oid, (row as { order_status?: string | null }).order_status ?? null);
        }
      }
      activeOrdersCount = coreForActive.filter((core) => {
        const id = Number((core as { id: number }).id);
        const c = core as { status?: string; current_status?: string | null };
        return isLiveSidebarPipelineFromCore(
          foodStatusByCoreId.get(id) ?? null,
          c.status ?? 'assigned',
          c.current_status ?? null
        );
      }).length;
    }

    const prepTimes: number[] = placedToday
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
    const acceptedTodayCount = placedToday.filter((o) =>
      ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(
        effectiveUiForFood(o as { order_id: number; order_status?: string | null })
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
