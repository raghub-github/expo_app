import type { Sql } from "postgres";
import { buildGrowthBusinessInsights } from "./growth-business-insights.js";

export type QuickMetric = {
  value: number;
  display: string;
  pct_change: number | null;
};

export type GrowthQuickInsights = {
  period: string;
  primary_header: string;
  compare_header: string;
  sales: QuickMetric;
  orders: QuickMetric;
  aov: QuickMetric;
  rating: QuickMetric;
  online_pct: QuickMetric;
  active_orders: { value: number; display: string };
  pending_acceptance: { value: number; display: string };
  complaints: QuickMetric;
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

function fmtInr(v: number): string {
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function metric(current: number, compare: number, format: (v: number) => string): QuickMetric {
  return {
    value: current,
    display: format(current),
    pct_change: pctChange(current, compare),
  };
}

async function periodBounds(
  sql: Sql,
  period: string
): Promise<{ start: string; end: string; compareStart: string; compareEnd: string }> {
  const todayRows = await sql`
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date::text AS d
  `;
  const today = String((todayRows[0] as { d: string }).d).slice(0, 10);
  if (period === "yesterday") {
    const y = await sql`SELECT (${today}::date - 1)::text AS d`;
    const yStr = String((y[0] as { d: string }).d).slice(0, 10);
    const db = await sql`SELECT (${yStr}::date - 1)::text AS d`;
    const dbStr = String((db[0] as { d: string }).d).slice(0, 10);
    return { start: yStr, end: yStr, compareStart: dbStr, compareEnd: dbStr };
  }
  if (period === "week") {
    const b = await sql`
      SELECT date_trunc('week', ${today}::date)::date::text AS ws, ${today}::date::text AS te
    `;
    const ws = String((b[0] as { ws: string }).ws).slice(0, 10);
    const te = String((b[0] as { te: string }).te).slice(0, 10);
    const c = await sql`SELECT (${ws}::date - 7)::text AS cs, (${te}::date - 7)::text AS ce`;
    return {
      start: ws,
      end: te,
      compareStart: String((c[0] as { cs: string }).cs).slice(0, 10),
      compareEnd: String((c[0] as { ce: string }).ce).slice(0, 10),
    };
  }
  if (period === "month") {
    const b = await sql`
      SELECT date_trunc('month', ${today}::date)::date::text AS ms, ${today}::date::text AS te
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

async function avgRating(sql: Sql, storeId: number, start: string, end: string): Promise<number> {
  try {
    const rows = await sql`
      SELECT COALESCE(AVG(rating), 0)::numeric AS avg
      FROM merchant_store_ratings
      WHERE store_id = ${storeId}
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${start}::date
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${end}::date
    `;
    return Math.round(num((rows[0] as { avg: unknown }).avg) * 100) / 100;
  } catch {
    return 0;
  }
}

async function complaintCount(sql: Sql, storeId: number, start: string, end: string): Promise<number> {
  let ratingsCount = 0;
  let ticketCount = 0;
  try {
    const r = await sql`
      SELECT COUNT(*)::int AS c FROM merchant_store_ratings
      WHERE store_id = ${storeId} AND rating <= 3
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${start}::date
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${end}::date
    `;
    ratingsCount = Number((r[0] as { c: number }).c) || 0;
  } catch { /* */ }
  try {
    const t = await sql`
      SELECT COUNT(*)::int AS c FROM unified_tickets
      WHERE merchant_store_id = ${storeId}
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${start}::date
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${end}::date
    `;
    ticketCount = Number((t[0] as { c: number }).c) || 0;
  } catch { /* */ }
  return ratingsCount + ticketCount;
}

async function onlinePctEstimate(sql: Sql, storeId: number, start: string, end: string): Promise<number> {
  try {
    const rows = await sql`
      WITH events AS (
        SELECT created_at, upper(COALESCE(action, '')) AS action
        FROM merchant_store_status_log
        WHERE store_id = ${storeId}
          AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${start}::date
          AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${end}::date
        ORDER BY created_at
      ),
      tallies AS (
        SELECT
          COUNT(*) FILTER (WHERE action IN ('OPEN', 'ONLINE', 'RESUME'))::int AS opens,
          COUNT(*) FILTER (WHERE action IN ('CLOSE', 'OFFLINE', 'PAUSE'))::int AS closes
        FROM events
      )
      SELECT opens, closes FROM tallies
    `;
    const r = rows[0] as { opens: number; closes: number } | undefined;
    const opens = Number(r?.opens) || 0;
    const closes = Number(r?.closes) || 0;
    const total = opens + closes;
    if (total <= 0) {
      const avail = await sql`
        SELECT COALESCE(is_available, false) AS on FROM merchant_store_availability
        WHERE store_id = ${storeId} LIMIT 1
      `;
      return (avail[0] as { on: boolean } | undefined)?.on ? 100 : 0;
    }
    return Math.round((opens / total) * 1000) / 10;
  } catch {
    return 0;
  }
}

async function activeOrderCounts(
  sql: Sql,
  storeId: number
): Promise<{ active: number; pending: number }> {
  try {
    const rows = await sql`
      SELECT
        COUNT(*) FILTER (
          WHERE upper(COALESCE(order_status, '')) IN (
            'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'
          )
        )::int AS active,
        COUNT(*) FILTER (
          WHERE upper(COALESCE(order_status, '')) IN ('PLACED', 'NEW', 'PENDING')
            OR (accepted_at IS NULL AND upper(COALESCE(order_status, '')) NOT IN (
              'CANCELLED', 'REJECTED', 'DELIVERED', 'RTO'
            ))
        )::int AS pending
      FROM orders_food
      WHERE merchant_store_id = ${storeId}
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >=
            (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '2 days'
    `;
    const r = rows[0] as { active: number; pending: number };
    return { active: Number(r.active) || 0, pending: Number(r.pending) || 0 };
  } catch {
    return { active: 0, pending: 0 };
  }
}

/** At-a-glance KPIs for the Quick tab — real DB metrics with period comparison. */
export async function buildGrowthQuickInsights(
  sql: Sql,
  storeId: number,
  period: string
): Promise<GrowthQuickInsights> {
  const business = await buildGrowthBusinessInsights(sql, storeId, period);
  const bounds = await periodBounds(sql, period);

  const [
    ratingCur,
    ratingCmp,
    onlineCur,
    onlineCmp,
    complaintsCur,
    complaintsCmp,
    liveCounts,
  ] = await Promise.all([
    avgRating(sql, storeId, bounds.start, bounds.end),
    avgRating(sql, storeId, bounds.compareStart, bounds.compareEnd),
    onlinePctEstimate(sql, storeId, bounds.start, bounds.end),
    onlinePctEstimate(sql, storeId, bounds.compareStart, bounds.compareEnd),
    complaintCount(sql, storeId, bounds.start, bounds.end),
    complaintCount(sql, storeId, bounds.compareStart, bounds.compareEnd),
    activeOrderCounts(sql, storeId),
  ]);

  const { current, compare } = business;

  return {
    period,
    primary_header: business.primary_header,
    compare_header: business.compare_header,
    sales: metric(current.sales, compare.sales, fmtInr),
    orders: metric(current.orders, compare.orders, (v) => String(Math.round(v))),
    aov: metric(current.aov, compare.aov, fmtInr),
    rating: metric(ratingCur, ratingCmp, (v) => (v > 0 ? v.toFixed(1) : "—")),
    online_pct: metric(onlineCur, onlineCmp, (v) => `${v}%`),
    active_orders: {
      value: liveCounts.active,
      display: String(liveCounts.active),
    },
    pending_acceptance: {
      value: liveCounts.pending,
      display: String(liveCounts.pending),
    },
    complaints: metric(complaintsCur, complaintsCmp, (v) => String(Math.round(v))),
  };
}
