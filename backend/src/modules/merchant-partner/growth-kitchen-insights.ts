import type { Sql } from "postgres";

export type KitchenBucket = {
  key: string;
  label: string;
  orders_count: number;
  late_count: number;
};

export type GrowthKitchenInsights = {
  period: string;
  primary_header: string;
  configured_prep_minutes: number;
  avg_prep_actual_minutes: number | null;
  prep_delay_pct: number;
  prep_reliability_score: number;
  prep_samples_count: number;
  orders_prepared: number;
  orders_late: number;
  late_rate_pct: number;
  avg_late_minutes: number;
  currently_preparing: number;
  currently_ready: number;
  buckets: KitchenBucket[];
};

const SLOT_LABELS = ["12–3am", "3–6am", "6–9am", "9–12pm", "12–3pm", "3–6pm", "6–9pm", "9–12am"];

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function pctRate(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

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

async function periodRange(
  sql: Sql,
  period: string
): Promise<{ start: string; end: string; header: string }> {
  const todayRows = await sql`
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date::text AS d
  `;
  const today = String((todayRows[0] as { d: string }).d).slice(0, 10);
  if (period === "yesterday") {
    const y = await sql`SELECT (${today}::date - 1)::text AS d`;
    const yStr = String((y[0] as { d: string }).d).slice(0, 10);
    return { start: yStr, end: yStr, header: `Yesterday • ${formatIstDateLabel(yStr)}` };
  }
  if (period === "week") {
    const b = await sql`
      SELECT date_trunc('week', ${today}::date)::date::text AS ws, ${today}::date::text AS te
    `;
    const ws = String((b[0] as { ws: string }).ws).slice(0, 10);
    const te = String((b[0] as { te: string }).te).slice(0, 10);
    return { start: ws, end: te, header: `This week • ${formatIstDateLabel(ws)} – ${formatIstDateLabel(te)}` };
  }
  if (period === "month") {
    const b = await sql`
      SELECT date_trunc('month', ${today}::date)::date::text AS ms, ${today}::date::text AS te
    `;
    const ms = String((b[0] as { ms: string }).ms).slice(0, 10);
    const te = String((b[0] as { te: string }).te).slice(0, 10);
    return { start: ms, end: te, header: `This month • ${formatIstDateLabel(ms)} – ${formatIstDateLabel(te)}` };
  }
  if (period === "alltime") {
    return { start: "1970-01-01", end: today, header: "All time" };
  }
  return { start: today, end: today, header: `Today • ${formatIstDateLabel(today)}` };
}

/** Kitchen prep performance for the Kitchen tab — store rolling stats + order prep outcomes. */
export async function buildGrowthKitchenInsights(
  sql: Sql,
  storeId: number,
  period: string
): Promise<GrowthKitchenInsights> {
  const range = await periodRange(sql, period);

  const storeRows = await sql`
    SELECT
      COALESCE(avg_preparation_time_minutes, 18)::int AS configured,
      avg_prep_time_actual_minutes,
      prep_delay_pct::text,
      prep_reliability_score::text,
      prep_samples_count
    FROM merchant_stores
    WHERE id = ${storeId}
    LIMIT 1
  `;
  const store = storeRows[0] as {
    configured: number;
    avg_prep_time_actual_minutes: number | null;
    prep_delay_pct: string | null;
    prep_reliability_score: string | null;
    prep_samples_count: number | null;
  } | undefined;

  let ordersPrepared = 0;
  let ordersLate = 0;
  let avgLateMinutes = 0;
  let currentlyPreparing = 0;
  let currentlyReady = 0;
  const bucketMap = new Map<number, { prepared: number; late: number }>();

  try {
    const stats = await sql`
      SELECT
        COUNT(*) FILTER (WHERE prepared_at IS NOT NULL)::int AS prepared,
        COUNT(*) FILTER (
          WHERE prepared_at IS NOT NULL
            AND COALESCE(prepared_late_minutes, 0) > 0
        )::int AS late,
        COALESCE(AVG(prepared_late_minutes) FILTER (
          WHERE prepared_late_minutes IS NOT NULL AND prepared_late_minutes > 0
        ), 0)::numeric AS avg_late,
        COUNT(*) FILTER (
          WHERE upper(COALESCE(order_status, '')) = 'PREPARING'
        )::int AS preparing_now,
        COUNT(*) FILTER (
          WHERE upper(COALESCE(order_status, '')) IN ('READY_FOR_PICKUP', 'READY')
        )::int AS ready_now
      FROM orders_food
      WHERE merchant_store_id = ${storeId}
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${range.start}::date
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date <= ${range.end}::date
    `;
    const s = stats[0] as {
      prepared: number;
      late: number;
      avg_late: unknown;
      preparing_now: number;
      ready_now: number;
    };
    ordersPrepared = Number(s.prepared) || 0;
    ordersLate = Number(s.late) || 0;
    avgLateMinutes = Math.round(num(s.avg_late));
    currentlyPreparing = Number(s.preparing_now) || 0;
    currentlyReady = Number(s.ready_now) || 0;
  } catch { /* */ }

  try {
    const slotRows = await sql`
      SELECT
        (FLOOR(EXTRACT(HOUR FROM (prepared_at AT TIME ZONE 'Asia/Kolkata')) / 3))::int AS slot,
        COUNT(*)::int AS prepared,
        COUNT(*) FILTER (WHERE COALESCE(prepared_late_minutes, 0) > 0)::int AS late
      FROM orders_food
      WHERE merchant_store_id = ${storeId}
        AND prepared_at IS NOT NULL
        AND (prepared_at AT TIME ZONE 'Asia/Kolkata')::date >= ${range.start}::date
        AND (prepared_at AT TIME ZONE 'Asia/Kolkata')::date <= ${range.end}::date
      GROUP BY 1 ORDER BY 1
    `;
    for (const r of slotRows as unknown as Array<{ slot: number; prepared: number; late: number }>) {
      bucketMap.set(Number(r.slot), { prepared: Number(r.prepared) || 0, late: Number(r.late) || 0 });
    }
  } catch { /* */ }

  const buckets: KitchenBucket[] = [];
  if (period === "today" || period === "yesterday") {
    for (let s = 0; s < 8; s++) {
      const b = bucketMap.get(s) ?? { prepared: 0, late: 0 };
      buckets.push({
        key: `k-${s}`,
        label: SLOT_LABELS[s] ?? String(s),
        orders_count: b.prepared,
        late_count: b.late,
      });
    }
  } else {
    const dayRows = await sql`
      SELECT gs::date::text AS d, trim(to_char(gs::date, 'Dy')) AS label
      FROM generate_series(${range.start}::date, ${range.end}::date, INTERVAL '1 day') AS gs
      ORDER BY gs
    `;
    for (const row of dayRows as unknown as Array<{ d: string; label: string }>) {
      const d = String(row.d).slice(0, 10);
      try {
        const dr = await sql`
          SELECT
            COUNT(*) FILTER (WHERE prepared_at IS NOT NULL)::int AS prepared,
            COUNT(*) FILTER (WHERE COALESCE(prepared_late_minutes, 0) > 0)::int AS late
          FROM orders_food
          WHERE merchant_store_id = ${storeId}
            AND prepared_at IS NOT NULL
            AND (prepared_at AT TIME ZONE 'Asia/Kolkata')::date = ${d}::date
        `;
        const x = dr[0] as { prepared: number; late: number };
        buckets.push({
          key: `k-${d}`,
          label: String(row.label),
          orders_count: Number(x.prepared) || 0,
          late_count: Number(x.late) || 0,
        });
      } catch {
        buckets.push({ key: `k-${d}`, label: String(row.label), orders_count: 0, late_count: 0 });
      }
    }
  }

  return {
    period,
    primary_header: range.header,
    configured_prep_minutes: Number(store?.configured) || 18,
    avg_prep_actual_minutes:
      store?.avg_prep_time_actual_minutes != null ? Number(store.avg_prep_time_actual_minutes) : null,
    prep_delay_pct: num(store?.prep_delay_pct),
    prep_reliability_score: num(store?.prep_reliability_score),
    prep_samples_count: Number(store?.prep_samples_count) || 0,
    orders_prepared: ordersPrepared,
    orders_late: ordersLate,
    late_rate_pct: pctRate(ordersLate, ordersPrepared),
    avg_late_minutes: avgLateMinutes,
    currently_preparing: currentlyPreparing,
    currently_ready: currentlyReady,
    buckets,
  };
}
