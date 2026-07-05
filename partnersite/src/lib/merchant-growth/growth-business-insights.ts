import type { Sql } from "postgres";
import {
  countMerchantDeliveredOrdersIst,
  sumMerchantLedgerEarningsIst,
} from "./merchant-growth-metrics";

export type GrowthBusinessBucket = {
  key: string;
  label: string;
  orders: number;
  sales: number;
  compare_orders: number;
  compare_sales: number;
};

export type GrowthBusinessInsights = {
  period: string;
  primary_header: string;
  compare_header: string;
  current: { orders: number; sales: number; aov: number };
  compare: { orders: number; sales: number; aov: number };
  buckets: GrowthBusinessBucket[];
};

const SLOT_LABELS = ["12–3am", "3–6am", "6–9am", "9–12pm", "12–3pm", "3–6pm", "6–9pm", "9–12am"];

function numSales(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function aov(sales: number, orders: number): number {
  if (orders <= 0) return 0;
  return Math.round(sales / orders);
}

/** Format YYYY-MM-DD (IST calendar day from DB) for UI labels. */
function formatIstDateLabel(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const anchor = new Date(Date.UTC(y, mo, d, 12, 0, 0));
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Kolkata",
  })
    .format(anchor)
    .replace(/,/g, "")
    .trim();
}

async function slotBuckets(sql: Sql, storeId: number, dayStr: string): Promise<{ orders: number; sales: number }[]> {
  const br = await sql`
    SELECT (FLOOR(EXTRACT(HOUR FROM (created_at AT TIME ZONE 'Asia/Kolkata')) / 3))::int AS slot,
           COUNT(*)::int AS orders_count,
           COALESCE(SUM(food_items_total_value), 0)::numeric AS sales_sum
    FROM orders_food
    WHERE merchant_store_id = ${storeId}
      AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = ${dayStr}::date
    GROUP BY 1 ORDER BY 1
  `;
  const byS = new Map<number, { orders: number; sales: number }>();
  for (const r of br as unknown as Array<{ slot: number; orders_count: number; sales_sum: unknown }>) {
    byS.set(Number(r.slot), { orders: Number(r.orders_count) || 0, sales: numSales(r.sales_sum) });
  }
  const out: { orders: number; sales: number }[] = [];
  for (let s = 0; s < 8; s++) {
    out.push(byS.get(s) ?? { orders: 0, sales: 0 });
  }
  return out;
}

async function dayRangeBuckets(
  sql: Sql,
  storeId: number,
  startStr: string,
  endStr: string
): Promise<{ label: string; orders: number; sales: number }[]> {
  const br = await sql`
    SELECT gs::date AS d,
           trim(to_char(gs::date, 'Dy')) AS label,
           COALESCE(o.c, 0)::int AS orders,
           COALESCE(o.s, 0)::numeric AS sales
    FROM generate_series(${startStr}::date, ${endStr}::date, INTERVAL '1 day') AS gs
    LEFT JOIN (
      SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS d,
             COUNT(*)::int AS c,
             COALESCE(SUM(food_items_total_value), 0)::numeric AS s
      FROM orders_food
      WHERE merchant_store_id = ${storeId}
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${startStr}::date
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${endStr}::date
      GROUP BY 1
    ) o ON o.d = gs::date
    ORDER BY gs
  `;
  return (br as unknown as Array<{ label: string; orders: number; sales: unknown }>).map((r) => ({
    label: String(r.label || "—").replace(/\.$/, ""),
    orders: Number(r.orders) || 0,
    sales: numSales(r.sales),
  }));
}

async function monthDayBuckets(
  sql: Sql,
  storeId: number,
  monthStartStr: string,
  rangeEndStr: string
): Promise<{ label: string; orders: number; sales: number }[]> {
  const br = await sql`
    SELECT gs::date AS d,
           (EXTRACT(DAY FROM gs::date))::int::text AS label,
           COALESCE(o.c, 0)::int AS orders,
           COALESCE(o.s, 0)::numeric AS sales
    FROM generate_series(${monthStartStr}::date, ${rangeEndStr}::date, INTERVAL '1 day') AS gs
    LEFT JOIN (
      SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS d,
             COUNT(*)::int AS c,
             COALESCE(SUM(food_items_total_value), 0)::numeric AS s
      FROM orders_food
      WHERE merchant_store_id = ${storeId}
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${monthStartStr}::date
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${rangeEndStr}::date
      GROUP BY 1
    ) o ON o.d = gs::date
    ORDER BY gs
  `;
  return (br as unknown as Array<{ label: string; orders: number; sales: unknown }>).map((r) => ({
    label: String(r.label || "—"),
    orders: Number(r.orders) || 0,
    sales: numSales(r.sales),
  }));
}

async function alltimeMonthSeries(
  sql: Sql,
  storeId: number,
  seriesEndOffsetMonths: number,
  seriesStartOffsetMonths: number
): Promise<{ key: string; label: string; orders: number; sales: number }[]> {
  const br = await sql`
    SELECT gs::date AS m,
           COALESCE(o.c, 0)::int AS orders,
           COALESCE(o.s, 0)::numeric AS sales
    FROM generate_series(
      (date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::timestamp)
        - (${seriesStartOffsetMonths} * INTERVAL '1 month'))::date,
      (date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::timestamp)
        - (${seriesEndOffsetMonths} * INTERVAL '1 month'))::date,
      INTERVAL '1 month'
    ) AS gs
    LEFT JOIN (
      SELECT date_trunc('month', (created_at AT TIME ZONE 'Asia/Kolkata'))::date AS m,
             COUNT(*)::int AS c,
             COALESCE(SUM(food_items_total_value), 0)::numeric AS s
      FROM orders_food
      WHERE merchant_store_id = ${storeId}
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >= (
          date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::timestamp)
            - (${seriesStartOffsetMonths} * INTERVAL '1 month')
        )::date
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date < (
          date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::timestamp)
            - (${seriesEndOffsetMonths} * INTERVAL '1 month')
            + INTERVAL '1 month'
        )::date
      GROUP BY 1
    ) o ON o.m = gs::date
    ORDER BY gs
  `;
  const fmt = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "Asia/Kolkata" });
  const rows = br as unknown as Array<{ m: string | Date; orders: number; sales: unknown }>;
  return rows.map((r) => {
    const dt = typeof r.m === "string" ? new Date(r.m + "T12:00:00Z") : r.m;
    const label = Number.isFinite(dt.getTime()) ? fmt.format(dt) : "—";
    return {
      key: String(r.m),
      label,
      orders: Number(r.orders) || 0,
      sales: numSales(r.sales),
    };
  });
}

async function totalsForRange(sql: Sql, storeId: number, startStr: string, endStr: string): Promise<{ orders: number; sales: number }> {
  const [orders, sales] = await Promise.all([
    countMerchantDeliveredOrdersIst(sql, storeId, startStr, endStr),
    sumMerchantLedgerEarningsIst(sql, storeId, startStr, endStr),
  ]);
  return { orders, sales };
}

/**
 * Business insights: current period vs comparison, with per-bucket orders/sales for sparklines.
 */
export async function buildGrowthBusinessInsights(
  sql: Sql,
  storeId: number,
  period: string
): Promise<GrowthBusinessInsights> {
  const dates = await sql`
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date AS today_ist
  `;
  const todayIst = (dates[0] as { today_ist: string | Date }).today_ist;
  const todayStr =
    typeof todayIst === "string" ? todayIst.slice(0, 10) : (todayIst as Date).toISOString().slice(0, 10);

  if (period === "today") {
    const y = await sql`
      SELECT ((${todayStr}::date - INTERVAL '1 day')::date)::text AS y
    `;
    const yStr = String((y[0] as { y: string }).y).slice(0, 10);
    const [cur, cmp, tCur, tCmp] = await Promise.all([
      totalsForRange(sql, storeId, todayStr, todayStr),
      totalsForRange(sql, storeId, yStr, yStr),
      slotBuckets(sql, storeId, todayStr),
      slotBuckets(sql, storeId, yStr),
    ]);
    const buckets: GrowthBusinessBucket[] = SLOT_LABELS.map((label, i) => ({
      key: `t-${i}`,
      label,
      orders: tCur[i]!.orders,
      sales: tCur[i]!.sales,
      compare_orders: tCmp[i]!.orders,
      compare_sales: tCmp[i]!.sales,
    }));
    return {
      period,
      primary_header: `Today • ${formatIstDateLabel(todayStr)}`,
      compare_header: `Compared against: Yesterday • ${formatIstDateLabel(yStr)}`,
      current: { ...cur, aov: aov(cur.sales, cur.orders) },
      compare: { ...cmp, aov: aov(cmp.sales, cmp.orders) },
      buckets,
    };
  }

  if (period === "yesterday") {
    const yStr = await sql`SELECT ((${todayStr}::date - INTERVAL '1 day')::date)::text AS d`;
    const yesterday = String((yStr[0] as { d: string }).d).slice(0, 10);
    const dbStr = await sql`SELECT ((${yesterday}::date - INTERVAL '1 day')::date)::text AS d`;
    const dayBefore = String((dbStr[0] as { d: string }).d).slice(0, 10);
    const [cur, cmp, tCur, tCmp] = await Promise.all([
      totalsForRange(sql, storeId, yesterday, yesterday),
      totalsForRange(sql, storeId, dayBefore, dayBefore),
      slotBuckets(sql, storeId, yesterday),
      slotBuckets(sql, storeId, dayBefore),
    ]);
    const buckets: GrowthBusinessBucket[] = SLOT_LABELS.map((label, i) => ({
      key: `y-${i}`,
      label,
      orders: tCur[i]!.orders,
      sales: tCur[i]!.sales,
      compare_orders: tCmp[i]!.orders,
      compare_sales: tCmp[i]!.sales,
    }));
    return {
      period,
      primary_header: `Yesterday • ${formatIstDateLabel(yesterday)}`,
      compare_header: `Compared against: Day before • ${formatIstDateLabel(dayBefore)}`,
      current: { ...cur, aov: aov(cur.sales, cur.orders) },
      compare: { ...cmp, aov: aov(cmp.sales, cmp.orders) },
      buckets,
    };
  }

  if (period === "week") {
    const bounds = await sql`
      SELECT date_trunc('week', ${todayStr}::date)::date AS ws,
             ${todayStr}::date AS te
    `;
    const ws = String((bounds[0] as { ws: string | Date }).ws).slice(0, 10);
    const te = String((bounds[0] as { te: string | Date }).te).slice(0, 10);
    const cmpStart = await sql`SELECT (${ws}::date - INTERVAL '7 days')::text AS d`;
    const cmpEnd = await sql`SELECT (${te}::date - INTERVAL '7 days')::text AS d`;
    const wsC = String((cmpStart[0] as { d: string }).d).slice(0, 10);
    const teC = String((cmpEnd[0] as { d: string }).d).slice(0, 10);
    const [cur, cmp, bCur, bCmp] = await Promise.all([
      totalsForRange(sql, storeId, ws, te),
      totalsForRange(sql, storeId, wsC, teC),
      dayRangeBuckets(sql, storeId, ws, te),
      dayRangeBuckets(sql, storeId, wsC, teC),
    ]);
    const buckets: GrowthBusinessBucket[] = bCur.map((b, i) => ({
      key: `w-${i}`,
      label: b.label,
      orders: b.orders,
      sales: b.sales,
      compare_orders: bCmp[i]?.orders ?? 0,
      compare_sales: bCmp[i]?.sales ?? 0,
    }));
    return {
      period,
      primary_header: `This week • ${formatIstDateLabel(ws)} – ${formatIstDateLabel(te)}`,
      compare_header: `Compared against: Prior week • ${formatIstDateLabel(wsC)} – ${formatIstDateLabel(teC)}`,
      current: { ...cur, aov: aov(cur.sales, cur.orders) },
      compare: { ...cmp, aov: aov(cmp.sales, cmp.orders) },
      buckets,
    };
  }

  if (period === "month") {
    const bounds = await sql`
      SELECT date_trunc('month', ${todayStr}::date)::date AS ms,
             ${todayStr}::date AS te
    `;
    const ms = String((bounds[0] as { ms: string | Date }).ms).slice(0, 10);
    const te = String((bounds[0] as { te: string | Date }).te).slice(0, 10);
    const prev = await sql`
      SELECT (date_trunc('month', ${todayStr}::date) - INTERVAL '1 month')::date::text AS pms,
             ((date_trunc('month', ${todayStr}::date) - INTERVAL '1 month')::date
               + (${te}::date - ${ms}::date))::text AS pend
    `;
    const pms = String((prev[0] as { pms: string }).pms).slice(0, 10);
    const pend = String((prev[0] as { pend: string }).pend).slice(0, 10);
    const [cur, cmp, bCur, bCmp] = await Promise.all([
      totalsForRange(sql, storeId, ms, te),
      totalsForRange(sql, storeId, pms, pend),
      monthDayBuckets(sql, storeId, ms, te),
      monthDayBuckets(sql, storeId, pms, pend),
    ]);
    const buckets: GrowthBusinessBucket[] = bCur.map((b, i) => ({
      key: `m-${i}`,
      label: b.label,
      orders: b.orders,
      sales: b.sales,
      compare_orders: bCmp[i]?.orders ?? 0,
      compare_sales: bCmp[i]?.sales ?? 0,
    }));
    return {
      period,
      primary_header: `This month • ${formatIstDateLabel(ms)} – ${formatIstDateLabel(te)}`,
      compare_header: `Compared against: Last month • ${formatIstDateLabel(pms)} – ${formatIstDateLabel(pend)}`,
      current: { ...cur, aov: aov(cur.sales, cur.orders) },
      compare: { ...cmp, aov: aov(cmp.sales, cmp.orders) },
      buckets,
    };
  }

  /** alltime — last 12 months vs the 12 months before that */
  const curB = await alltimeMonthSeries(sql, storeId, 0, 11);
  const cmpB = await alltimeMonthSeries(sql, storeId, 12, 23);
  const curTotals = curB.reduce(
    (a, b) => ({ orders: a.orders + b.orders, sales: a.sales + b.sales }),
    { orders: 0, sales: 0 }
  );
  const cmpTotals = cmpB.reduce(
    (a, b) => ({ orders: a.orders + b.orders, sales: a.sales + b.sales }),
    { orders: 0, sales: 0 }
  );
  const buckets: GrowthBusinessBucket[] = curB.map((b, i) => ({
    key: b.key,
    label: b.label,
    orders: b.orders,
    sales: b.sales,
    compare_orders: cmpB[i]?.orders ?? 0,
    compare_sales: cmpB[i]?.sales ?? 0,
  }));
  const firstK = curB[0]?.key ?? todayStr;
  const lastK = curB[curB.length - 1]?.key ?? todayStr;
  return {
    period: "alltime",
    primary_header: `All time • ${formatIstDateLabel(String(firstK).slice(0, 10))} – ${formatIstDateLabel(String(lastK).slice(0, 10))}`,
    compare_header: "Compared against: Prior 12 months",
    current: { ...curTotals, aov: aov(curTotals.sales, curTotals.orders) },
    compare: { ...cmpTotals, aov: aov(cmpTotals.sales, cmpTotals.orders) },
    buckets,
  };
}
