import { supabaseAdmin } from "@/lib/supabase/server";
import { resolvePartnerPipeline } from "@/lib/partner-orders-unify";
import type { FoodOrderStats } from "@/lib/types/food-orders";

function getDb() {
  if (!supabaseAdmin) throw new Error("Supabase admin client not configured");
  return supabaseAdmin;
}

/**
 * Same metrics as partnersite GET /api/food-orders/stats (orders_core–centric).
 */
export async function loadMerchantStoreFoodOrderStats(
  merchantStoreInternalId: number,
  dateParam?: string | null
): Promise<FoodOrderStats> {
  const db = getDb();

  let dayStart: Date;
  let dayEnd: Date;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    dayStart = new Date(`${dateParam}T00:00:00.000Z`);
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
    .from("orders_core")
    .select("id, status, current_status, created_at, grand_total, item_total, cancelled_at, placed_at")
    .eq("merchant_store_id", merchantStoreInternalId)
    .gte("created_at", dayStartIso)
    .lt("created_at", dayEndIso);

  if (error) {
    throw new Error(error.message);
  }

  const list = orders || [];
  const effectiveUi = (o: { status?: string; current_status?: string | null }) =>
    resolvePartnerPipeline(null, o.status ?? "assigned", o.current_status ?? null);

  const pipelineTodayStatuses = ["CREATED", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"];

  const ordersToday = list.length;
  const ordersTodayActive = list.filter((o) =>
    pipelineTodayStatuses.includes(effectiveUi(o as { status?: string; current_status?: string | null }))
  ).length;
  const activeOrders = ordersTodayActive;

  const deliveredTodayList = list.filter(
    (o) => effectiveUi(o as { status?: string; current_status?: string | null }) === "DELIVERED"
  );
  const totalRevenue = deliveredTodayList.reduce(
    (sum, o) => sum + Number((o as { grand_total?: string | number }).grand_total || 0),
    0
  );

  const deliveredTodayCount = deliveredTodayList.length;
  const completionRatePercent = ordersToday > 0 ? Math.round((deliveredTodayCount / ordersToday) * 100) : 0;

  const { data: foodToday } = await db
    .from("orders_food")
    .select("created_at, prepared_at")
    .eq("merchant_store_id", merchantStoreInternalId)
    .gte("created_at", dayStartIso)
    .lt("created_at", dayEndIso);

  const prepTimes: number[] = (foodToday || [])
    .filter((r) => (r as { prepared_at?: string }).prepared_at && (r as { created_at?: string }).created_at)
    .map((o) => {
      const row = o as { created_at: string; prepared_at: string };
      return Math.round((new Date(row.prepared_at).getTime() - new Date(row.created_at).getTime()) / 60000);
    });
  const avgPreparationTimeMinutes = prepTimes.length
    ? Math.round(prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length)
    : 0;

  return {
    ordersToday,
    ordersTodayActive,
    activeOrders,
    avgPreparationTimeMinutes,
    totalRevenueToday: totalRevenue,
    completionRatePercent,
  };
}
