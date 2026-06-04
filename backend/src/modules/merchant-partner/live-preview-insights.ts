import type { Sql } from "postgres";
import { buildGrowthBusinessInsights } from "./growth-business-insights.js";

export type InsightMetric = {
  value: number;
  display: string;
  pct_change: number | null;
  sparkline: number[];
};

export type LivePreviewInsights = {
  period: string;
  compare_header: string;
  sales: {
    sales: InsightMetric;
    delivered_orders: InsightMetric;
    aov: InsightMetric;
  };
  ratings: InsightMetric;
  bad_orders: {
    rejected: InsightMetric;
    delayed: InsightMetric;
    poor_rated: InsightMetric;
  };
  complaints: InsightMetric;
  lost_sales: InsightMetric;
  online_pct: InsightMetric;
  funnel: {
    impressions: InsightMetric;
    impressions_to_menu: InsightMetric;
    menu_to_cart: InsightMetric;
    cart_to_order: InsightMetric;
  };
  user_segments: {
    new_users: InsightMetric;
    repeat_users: InsightMetric;
    lapsed_users: InsightMetric;
  };
};

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function pctChange(current: number, compare: number): number | null {
  if (compare === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - compare) / compare) * 1000) / 10;
}

function pctRate(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function fmtInr(v: number): string {
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function metricFromSeries(
  current: number,
  compare: number,
  series: number[],
  format: (v: number) => string
): InsightMetric {
  return {
    value: current,
    display: format(current),
    pct_change: pctChange(current, compare),
    sparkline: series.length > 0 ? series : [0],
  };
}

async function istToday(sql: Sql): Promise<string> {
  const rows = await sql`
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date::text AS d
  `;
  return String((rows[0] as { d: string }).d).slice(0, 10);
}

async function periodBounds(
  sql: Sql,
  period: string
): Promise<{ start: string; end: string; compareStart: string; compareEnd: string }> {
  const today = await istToday(sql);
  if (period === "yesterday") {
    const y = await sql`SELECT (${today}::date - 1)::text AS d`;
    const yStr = String((y[0] as { d: string }).d).slice(0, 10);
    const db = await sql`SELECT (${yStr}::date - 1)::text AS d`;
    const dbStr = String((db[0] as { d: string }).d).slice(0, 10);
    return { start: yStr, end: yStr, compareStart: dbStr, compareEnd: dbStr };
  }
  if (period === "week") {
    const b = await sql`
      SELECT date_trunc('week', ${today}::date)::date::text AS ws,
             ${today}::date::text AS te
    `;
    const ws = String((b[0] as { ws: string }).ws).slice(0, 10);
    const te = String((b[0] as { te: string }).te).slice(0, 10);
    const c = await sql`
      SELECT (${ws}::date - 7)::text AS cs, (${te}::date - 7)::text AS ce
    `;
    return {
      start: ws,
      end: te,
      compareStart: String((c[0] as { cs: string }).cs).slice(0, 10),
      compareEnd: String((c[0] as { ce: string }).ce).slice(0, 10),
    };
  }
  if (period === "month") {
    const b = await sql`
      SELECT date_trunc('month', ${today}::date)::date::text AS ms,
             ${today}::date::text AS te
    `;
    const ms = String((b[0] as { ms: string }).ms).slice(0, 10);
    const te = String((b[0] as { te: string }).te).slice(0, 10);
    const p = await sql`
      SELECT (date_trunc('month', ${today}::date) - INTERVAL '1 month')::date::text AS pms,
             ((date_trunc('month', ${today}::date) - INTERVAL '1 month')::date
               + (${te}::date - ${ms}::date))::text AS pend
    `;
    return {
      start: ms,
      end: te,
      compareStart: String((p[0] as { pms: string }).pms).slice(0, 10),
      compareEnd: String((p[0] as { pend: string }).pend).slice(0, 10),
    };
  }
  if (period === "alltime") {
    return { start: "1970-01-01", end: today, compareStart: "1970-01-01", compareEnd: today };
  }
  const y = await sql`SELECT (${today}::date - 1)::text AS d`;
  const yStr = String((y[0] as { d: string }).d).slice(0, 10);
  return { start: today, end: today, compareStart: yStr, compareEnd: yStr };
}

async function dailyOrderCounts(
  sql: Sql,
  storeId: number,
  start: string,
  end: string
): Promise<number[]> {
  const rows = await sql`
    SELECT COALESCE(o.c, 0)::int AS v
    FROM generate_series(${start}::date, ${end}::date, INTERVAL '1 day') AS gs
    LEFT JOIN (
      SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS d, COUNT(*)::int AS c
      FROM orders_food
      WHERE merchant_store_id = ${storeId}
      GROUP BY 1
    ) o ON o.d = gs::date
    ORDER BY gs
  `;
  const vals = (rows as Array<{ v: number }>).map((r) => Number(r.v) || 0);
  return vals.length <= 10 ? vals : vals.slice(-10);
}

async function dailyRatingAvg(
  sql: Sql,
  storeId: number,
  start: string,
  end: string
): Promise<number[]> {
  const rows = await sql`
    SELECT COALESCE(r.avg, 0)::numeric AS v
    FROM generate_series(${start}::date, ${end}::date, INTERVAL '1 day') AS gs
    LEFT JOIN (
      SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS d, AVG(rating)::numeric AS avg
      FROM merchant_store_ratings
      WHERE store_id = ${storeId}
      GROUP BY 1
    ) r ON r.d = gs::date
    ORDER BY gs
  `;
  const vals = (rows as Array<{ v: unknown }>).map((r) => num(r.v));
  return vals.length <= 10 ? vals : vals.slice(-10);
}

async function orderFunnelTotals(
  sql: Sql,
  storeId: number,
  start: string,
  end: string
): Promise<{ placed: number; accepted: number; preparing: number; delivered: number }> {
  const rows = await sql`
    SELECT
      COUNT(*)::int AS placed,
      COUNT(*) FILTER (WHERE accepted_at IS NOT NULL)::int AS accepted,
      COUNT(*) FILTER (
        WHERE prepared_at IS NOT NULL
          OR upper(COALESCE(order_status, '')) IN (
            'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED'
          )
      )::int AS preparing,
      COUNT(*) FILTER (WHERE upper(COALESCE(order_status, '')) = 'DELIVERED')::int AS delivered
    FROM orders_food
    WHERE merchant_store_id = ${storeId}
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${start}::date
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${end}::date
  `;
  const r = rows[0] as { placed: number; accepted: number; preparing: number; delivered: number };
  return {
    placed: Number(r.placed) || 0,
    accepted: Number(r.accepted) || 0,
    preparing: Number(r.preparing) || 0,
    delivered: Number(r.delivered) || 0,
  };
}

async function badOrderRates(
  sql: Sql,
  storeId: number,
  start: string,
  end: string
): Promise<{ rejected_pct: number; delayed_pct: number; poor_rated_pct: number; total: number }> {
  let total = 0;
  let rejected = 0;
  let delayed = 0;
  let delivered = 0;

  try {
    const rows = await sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE upper(COALESCE(order_status, '')) IN ('CANCELLED', 'REJECTED')
        )::int AS rejected,
        COUNT(*) FILTER (
          WHERE upper(COALESCE(order_status, '')) = 'DELIVERED'
            AND delivered_at IS NOT NULL
            AND accepted_at IS NOT NULL
            AND EXTRACT(EPOCH FROM (delivered_at - accepted_at)) / 60.0
              > COALESCE(preparation_time_minutes, 30) + 35
        )::int AS delayed,
        COUNT(*) FILTER (
          WHERE upper(COALESCE(order_status, '')) = 'DELIVERED'
        )::int AS delivered
      FROM orders_food
      WHERE merchant_store_id = ${storeId}
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${start}::date
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${end}::date
    `;
    const r = rows[0] as { total: number; rejected: number; delayed: number; delivered: number };
    total = Number(r.total) || 0;
    rejected = Number(r.rejected) || 0;
    delayed = Number(r.delayed) || 0;
    delivered = Number(r.delivered) || 0;
  } catch {
    /* orders_food columns may differ on older DBs */
  }

  let poorRated = 0;
  try {
    const pr = await sql`
      SELECT COUNT(DISTINCT r.order_id)::int AS c
      FROM merchant_store_ratings r
      INNER JOIN orders_food f ON f.order_id = r.order_id
      WHERE r.store_id = ${storeId}
        AND r.rating <= 2
        AND (r.created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${start}::date
        AND (r.created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${end}::date
        AND f.merchant_store_id = ${storeId}
    `;
    poorRated = Number((pr[0] as { c: number }).c) || 0;
  } catch {
    poorRated = 0;
  }

  return {
    total,
    rejected_pct: pctRate(rejected, total),
    delayed_pct: pctRate(delayed, Math.max(delivered, 1)),
    poor_rated_pct: pctRate(poorRated, Math.max(delivered, 1)),
  };
}

async function lostSalesTotal(sql: Sql, storeId: number, start: string, end: string): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(SUM(food_items_total_value), 0)::numeric AS v
    FROM orders_food
    WHERE merchant_store_id = ${storeId}
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${start}::date
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${end}::date
      AND (
        upper(COALESCE(order_status, '')) IN ('CANCELLED', 'REJECTED', 'RTO')
        OR (rejected_reason IS NOT NULL AND trim(rejected_reason) <> '')
      )
  `;
  return num((rows[0] as { v: unknown }).v);
}

async function avgRating(sql: Sql, storeId: number, start: string, end: string): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(AVG(rating), 0)::numeric AS avg
    FROM merchant_store_ratings
    WHERE store_id = ${storeId}
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${start}::date
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${end}::date
  `;
  return Math.round(num((rows[0] as { avg: unknown }).avg) * 100) / 100;
}

async function complaintCount(sql: Sql, storeId: number, start: string, end: string): Promise<number> {
  let ratingsCount = 0;
  try {
    const r = await sql`
      SELECT COUNT(*)::int AS c
      FROM merchant_store_ratings
      WHERE store_id = ${storeId}
        AND rating <= 3
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${start}::date
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${end}::date
    `;
    ratingsCount = Number((r[0] as { c: number }).c) || 0;
  } catch {
    ratingsCount = 0;
  }

  let ticketCount = 0;
  try {
    const t = await sql`
      SELECT COUNT(*)::int AS c
      FROM unified_tickets
      WHERE merchant_store_id = ${storeId}
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${start}::date
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${end}::date
    `;
    ticketCount = Number((t[0] as { c: number }).c) || 0;
  } catch {
    ticketCount = 0;
  }

  return ratingsCount + ticketCount;
}

async function onlinePctEstimate(sql: Sql, storeId: number, start: string, end: string): Promise<number> {
  try {
    const rows = await sql`
      WITH events AS (
        SELECT created_at,
               upper(COALESCE(action, '')) AS action
        FROM merchant_store_status_log
        WHERE store_id = ${storeId}
          AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${start}::date
          AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${end}::date
        ORDER BY created_at
      ),
      tallies AS (
        SELECT
          COUNT(*) FILTER (WHERE action LIKE '%OPEN%')::int AS opens,
          COUNT(*) FILTER (WHERE action LIKE '%CLOSE%')::int AS closes
        FROM events
      )
      SELECT opens, closes FROM tallies
    `;
    const r = rows[0] as { opens: number; closes: number };
    const opens = Number(r.opens) || 0;
    const closes = Number(r.closes) || 0;
    if (opens + closes === 0) {
      const cur = await sql`
        SELECT COALESCE(is_open, false) AS is_open
        FROM merchant_store_availability
        WHERE store_id = ${storeId}
        LIMIT 1
      `;
      return (cur[0] as { is_open: boolean } | undefined)?.is_open ? 100 : 0;
    }
    return Math.min(100, Math.round((opens / Math.max(opens + closes, 1)) * 1000) / 10);
  } catch {
    return 0;
  }
}

async function userSegmentCounts(
  sql: Sql,
  storeId: number,
  start: string,
  end: string
): Promise<{ new_users: number; repeat_users: number; lapsed_users: number }> {
  const rows = await sql`
    WITH period_orders AS (
      SELECT DISTINCT of.customer_id, of.created_at
      FROM orders_food of
      WHERE of.merchant_store_id = ${storeId}
        AND of.customer_id IS NOT NULL
        AND upper(COALESCE(of.order_status, '')) = 'DELIVERED'
        AND (of.created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${start}::date
        AND (of.created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${end}::date
    ),
    segmented AS (
      SELECT
        po.customer_id,
        CASE
          WHEN prev.last_prior IS NULL THEN 'new'
          WHEN EXTRACT(EPOCH FROM (po.created_at - prev.last_prior)) / 86400.0 <= 60 THEN 'repeat'
          WHEN EXTRACT(EPOCH FROM (po.created_at - prev.last_prior)) / 86400.0 <= 90 THEN 'lapsed'
          ELSE 'new'
        END AS segment
      FROM period_orders po
      LEFT JOIN LATERAL (
        SELECT MAX(p.created_at) AS last_prior
        FROM orders_food p
        WHERE p.merchant_store_id = ${storeId}
          AND p.customer_id = po.customer_id
          AND p.created_at < po.created_at
          AND upper(COALESCE(p.order_status, '')) = 'DELIVERED'
      ) prev ON TRUE
    )
    SELECT segment, COUNT(DISTINCT customer_id)::int AS cnt
    FROM segmented
    GROUP BY segment
  `;
  let new_users = 0;
  let repeat_users = 0;
  let lapsed_users = 0;
  for (const r of rows as Array<{ segment: string; cnt: number }>) {
    const c = Number(r.cnt) || 0;
    if (r.segment === "repeat") repeat_users += c;
    else if (r.segment === "lapsed") lapsed_users += c;
    else new_users += c;
  }
  return { new_users, repeat_users, lapsed_users };
}

export async function buildLivePreviewInsights(
  sql: Sql,
  storeId: number,
  period: string
): Promise<LivePreviewInsights> {
  const bounds = await periodBounds(sql, period);
  const business = await buildGrowthBusinessInsights(sql, storeId, period);

  const salesSpark = business.buckets.map((b) => b.sales);
  const ordersSpark = business.buckets.map((b) => b.orders);
  const aovSpark = business.buckets.map((b) =>
    b.orders > 0 ? Math.round(b.sales / b.orders) : 0
  );

  const [
    funnelCur,
    funnelCmp,
    badCur,
    badCmp,
    lostCur,
    lostCmp,
    ratingCur,
    ratingCmp,
    complaintsCur,
    complaintsCmp,
    onlineCur,
    onlineCmp,
    segCur,
    segCmp,
  ] = await Promise.all([
    orderFunnelTotals(sql, storeId, bounds.start, bounds.end),
    orderFunnelTotals(sql, storeId, bounds.compareStart, bounds.compareEnd),
    badOrderRates(sql, storeId, bounds.start, bounds.end),
    badOrderRates(sql, storeId, bounds.compareStart, bounds.compareEnd),
    lostSalesTotal(sql, storeId, bounds.start, bounds.end),
    lostSalesTotal(sql, storeId, bounds.compareStart, bounds.compareEnd),
    avgRating(sql, storeId, bounds.start, bounds.end),
    avgRating(sql, storeId, bounds.compareStart, bounds.compareEnd),
    complaintCount(sql, storeId, bounds.start, bounds.end),
    complaintCount(sql, storeId, bounds.compareStart, bounds.compareEnd),
    onlinePctEstimate(sql, storeId, bounds.start, bounds.end),
    onlinePctEstimate(sql, storeId, bounds.compareStart, bounds.compareEnd),
    userSegmentCounts(sql, storeId, bounds.start, bounds.end),
    userSegmentCounts(sql, storeId, bounds.compareStart, bounds.compareEnd),
  ]);

  const ratingSpark = await dailyRatingAvg(sql, storeId, bounds.start, bounds.end);

  const impressionsCur = funnelCur.placed;
  const impressionsCmp = funnelCmp.placed;
  const itmCur = pctRate(funnelCur.accepted, funnelCur.placed);
  const itmCmp = pctRate(funnelCmp.accepted, funnelCmp.placed);
  const mtcCur = pctRate(funnelCur.preparing, funnelCur.accepted);
  const mtcCmp = pctRate(funnelCmp.preparing, funnelCmp.accepted);
  const ctoCur = pctRate(funnelCur.delivered, funnelCur.placed);
  const ctoCmp = pctRate(funnelCmp.delivered, funnelCmp.placed);

  const funnelImpressionsSpark = await dailyOrderCounts(sql, storeId, bounds.start, bounds.end);

  return {
    period,
    compare_header: business.compare_header,
    sales: {
      sales: metricFromSeries(
        business.current.sales,
        business.compare.sales,
        salesSpark,
        fmtInr
      ),
      delivered_orders: metricFromSeries(
        business.current.orders,
        business.compare.orders,
        ordersSpark,
        (v) => (v > 0 ? String(v) : "—")
      ),
      aov: metricFromSeries(
        business.current.aov,
        business.compare.aov,
        aovSpark,
        fmtInr
      ),
    },
    ratings: metricFromSeries(ratingCur, ratingCmp, ratingSpark, (v) =>
      v > 0 ? v.toFixed(2) : "—"
    ),
    bad_orders: {
      rejected: metricFromSeries(
        badCur.rejected_pct,
        badCmp.rejected_pct,
        [badCur.rejected_pct],
        (v) => `${v.toFixed(1)}%`
      ),
      delayed: metricFromSeries(
        badCur.delayed_pct,
        badCmp.delayed_pct,
        [badCur.delayed_pct],
        (v) => `${v.toFixed(1)}%`
      ),
      poor_rated: metricFromSeries(
        badCur.poor_rated_pct,
        badCmp.poor_rated_pct,
        [badCur.poor_rated_pct],
        (v) => `${v.toFixed(1)}%`
      ),
    },
    complaints: metricFromSeries(complaintsCur, complaintsCmp, [complaintsCur], (v) =>
      String(Math.round(v))
    ),
    lost_sales: metricFromSeries(lostCur, lostCmp, [lostCur], fmtInr),
    online_pct: metricFromSeries(onlineCur, onlineCmp, [onlineCur], (v) => `${v.toFixed(1)}%`),
    funnel: {
      impressions: metricFromSeries(impressionsCur, impressionsCmp, funnelImpressionsSpark, (v) =>
        String(Math.round(v))
      ),
      impressions_to_menu: metricFromSeries(itmCur, itmCmp, [itmCur], (v) => `${v.toFixed(1)}%`),
      menu_to_cart: metricFromSeries(mtcCur, mtcCmp, [mtcCur], (v) => `${v.toFixed(1)}%`),
      cart_to_order: metricFromSeries(ctoCur, ctoCmp, [ctoCur], (v) => `${v.toFixed(1)}%`),
    },
    user_segments: {
      new_users: metricFromSeries(segCur.new_users, segCmp.new_users, [segCur.new_users], (v) =>
        String(Math.round(v))
      ),
      repeat_users: metricFromSeries(
        segCur.repeat_users,
        segCmp.repeat_users,
        [segCur.repeat_users],
        (v) => String(Math.round(v))
      ),
      lapsed_users: metricFromSeries(
        segCur.lapsed_users,
        segCmp.lapsed_users,
        [segCur.lapsed_users],
        (v) => String(Math.round(v))
      ),
    },
  };
}
