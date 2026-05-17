/**
 * Real offer performance from offer_order_applications + orders_food (no estimates).
 */

export type MerchantOfferInsightsMonthly = {
  key: string;
  label: string;
  offer_gross: number;
  offer_discount: number;
  offer_orders: number;
  store_gross: number;
  store_orders: number;
};

export type MerchantOfferInsightsResponse = {
  gross: number;
  discount: number;
  orders: number;
  total_store_orders: number;
  total_store_sales: number;
  monthly: MerchantOfferInsightsMonthly[];
  discount_types: { offer_type: string; gross: number; discount: number; orders: number }[];
  customers: { new_orders: number; repeat_orders: number; lapsed_orders: number };
};

type Sql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
};

function parseNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function monthKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelFromKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 15).toLocaleDateString("en-IN", { month: "short" });
}

function enumerateMonths(startMs: number, endMs: number): { key: string; label: string; start: Date; end: Date }[] {
  const out: { key: string; label: string; start: Date; end: Date }[] = [];
  const start = new Date(startMs);
  const end = new Date(endMs);
  let y = start.getFullYear();
  let m = start.getMonth();
  const endY = end.getFullYear();
  const endM = end.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    const monthStart = new Date(y, m, 1, 0, 0, 0, 0);
    const monthEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);
    const key = monthKeyFromDate(monthStart);
    out.push({
      key,
      label: monthLabelFromKey(key),
      start: new Date(Math.max(monthStart.getTime(), startMs)),
      end: new Date(Math.min(monthEnd.getTime(), endMs)),
    });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

export async function loadMerchantOfferInsights(
  sql: Sql,
  storeId: number,
  startMs: number,
  endMs: number
): Promise<MerchantOfferInsightsResponse> {
  const startIso = new Date(startMs).toISOString();
  const endIso = new Date(endMs).toISOString();

  /** Only delivered orders count toward performance (offer + store comparison). */
  const deliveredFilter = sql`UPPER(of.order_status) = 'DELIVERED'`;

  const storeAgg = await sql`
    SELECT COUNT(*)::int AS total_orders,
           COALESCE(SUM(of.food_items_total_value), 0)::numeric AS total_sales
    FROM orders_food of
    WHERE of.merchant_store_id = ${storeId}
      AND ${deliveredFilter}
      AND of.created_at >= ${startIso}::timestamptz
      AND of.created_at <= ${endIso}::timestamptz
  `;
  const storeRow = (storeAgg[0] ?? {}) as { total_orders?: number; total_sales?: unknown };
  const total_store_orders = Number(storeRow.total_orders) || 0;
  const total_store_sales = parseNum(storeRow.total_sales);

  const offerRows = await sql`
    SELECT
      mo.offer_type,
      date_trunc('month', (of.created_at AT TIME ZONE 'Asia/Kolkata'))::date AS month_start,
      of.order_id AS food_row_id,
      oc.id AS core_order_pk,
      of.customer_id,
      of.created_at,
      COALESCE(of.food_items_total_value, 0)::numeric AS gross,
      COALESCE(oa.discount_amount, 0)::numeric AS discount
    FROM offer_order_applications oa
    INNER JOIN orders_core oc
      ON oc.id = oa.order_id
      OR oc.order_id = ('GM' || oa.order_id::text)
    INNER JOIN orders_food of
      ON (of.order_id = oc.id OR of.core_order_id = oc.order_id)
      AND of.merchant_store_id = ${storeId}
    INNER JOIN merchant_offers mo ON mo.id = oa.merchant_offer_id
    WHERE mo.store_id = ${storeId}
      AND oa.merchant_offer_id IS NOT NULL
      AND oa.offer_source = 'MERCHANT'
      AND ${deliveredFilter}
      AND of.created_at >= ${startIso}::timestamptz
      AND of.created_at <= ${endIso}::timestamptz
  `;

  type OfferRow = {
    offer_type: string;
    month_start: string | Date;
    food_row_id: number | string;
    core_order_pk: number | string;
    customer_id: number | string | null;
    created_at: string | Date;
    gross: unknown;
    discount: unknown;
  };

  const rows = offerRows as OfferRow[];

  const orderMap = new Map<
    string,
    { gross: number; discount: number; customer_id: number | null; created_at: number; offer_types: Set<string> }
  >();
  let discountTotal = 0;

  rows.forEach((r) => {
    const oid = String(r.core_order_pk ?? r.food_row_id);
    const disc = parseNum(r.discount);
    discountTotal += disc;
    const existing = orderMap.get(oid);
    if (!existing) {
      orderMap.set(oid, {
        gross: parseNum(r.gross),
        discount: disc,
        customer_id: r.customer_id != null ? Number(r.customer_id) : null,
        created_at: new Date(r.created_at).getTime(),
        offer_types: new Set([String(r.offer_type)]),
      });
    } else {
      existing.discount += disc;
      existing.offer_types.add(String(r.offer_type));
    }
  });

  let grossTotal = 0;
  orderMap.forEach((o) => {
    grossTotal += o.gross;
  });

  const months = enumerateMonths(startMs, endMs);
  const monthlyMap = new Map<string, MerchantOfferInsightsMonthly>();
  months.forEach((mo) => {
    monthlyMap.set(mo.key, {
      key: mo.key,
      label: mo.label,
      offer_gross: 0,
      offer_discount: 0,
      offer_orders: 0,
      store_gross: 0,
      store_orders: 0,
    });
  });

  function monthKeyFromPgDate(d: string | Date): string {
    const raw = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
    return raw.length >= 7 ? raw.slice(0, 7) : monthKeyFromDate(new Date(d));
  }

  const orderMonthKey = new Map<string, string>();
  rows.forEach((r) => {
    const oid = String(r.core_order_pk ?? r.food_row_id);
    if (!orderMonthKey.has(oid) && r.month_start) {
      orderMonthKey.set(oid, monthKeyFromPgDate(r.month_start));
    }
  });

  const monthlyOrderSeen = new Map<string, Set<string>>();
  orderMap.forEach((o, oid) => {
    const mk = orderMonthKey.get(oid) ?? monthKeyFromDate(new Date(o.created_at));
    const pt = monthlyMap.get(mk);
    if (!pt) return;
    pt.offer_gross += o.gross;
    pt.offer_discount += o.discount;
    if (!monthlyOrderSeen.has(mk)) monthlyOrderSeen.set(mk, new Set());
    const seen = monthlyOrderSeen.get(mk)!;
    if (!seen.has(oid)) {
      seen.add(oid);
      pt.offer_orders += 1;
    }
  });

  const storeMonthlyRows = await sql`
    SELECT
      date_trunc('month', (of.created_at AT TIME ZONE 'Asia/Kolkata'))::date AS month_start,
      COUNT(*)::int AS orders_count,
      COALESCE(SUM(of.food_items_total_value), 0)::numeric AS sales
    FROM orders_food of
    WHERE of.merchant_store_id = ${storeId}
      AND ${deliveredFilter}
      AND of.created_at >= ${startIso}::timestamptz
      AND of.created_at <= ${endIso}::timestamptz
    GROUP BY 1
    ORDER BY 1
  `;

  for (const r of storeMonthlyRows as Array<{ month_start: string | Date; orders_count: number; sales: unknown }>) {
    const mk = monthKeyFromPgDate(r.month_start);
    const pt = monthlyMap.get(mk);
    if (!pt) continue;
    pt.store_orders = Number(r.orders_count) || 0;
    pt.store_gross = parseNum(r.sales);
  }

  const typeMap = new Map<string, { gross: number; discount: number; orders: Set<string> }>();
  rows.forEach((r) => {
    const t = String(r.offer_type || "OTHER");
    const oid = String(r.core_order_pk ?? r.food_row_id);
    if (!typeMap.has(t)) typeMap.set(t, { gross: 0, discount: 0, orders: new Set() });
    const bucket = typeMap.get(t)!;
    bucket.discount += parseNum(r.discount);
    bucket.orders.add(oid);
  });
  orderMap.forEach((o, oid) => {
    const types = [...o.offer_types];
    if (types.length === 0) return;
    const share = o.gross / types.length;
    types.forEach((t) => {
      if (!typeMap.has(t)) typeMap.set(t, { gross: 0, discount: 0, orders: new Set() });
      const bucket = typeMap.get(t)!;
      bucket.gross += share;
      bucket.orders.add(oid);
    });
  });

  let new_orders = 0;
  let repeat_orders = 0;
  let lapsed_orders = 0;

  if (orderMap.size > 0) {
    const segRows = await sql`
      WITH offer_orders AS (
        SELECT DISTINCT
          oc.id AS order_pk,
          of.customer_id,
          of.created_at
        FROM offer_order_applications oa
        INNER JOIN orders_core oc
          ON oc.id = oa.order_id
          OR oc.order_id = ('GM' || oa.order_id::text)
        INNER JOIN orders_food of
          ON (of.order_id = oc.id OR of.core_order_id = oc.order_id)
          AND of.merchant_store_id = ${storeId}
        INNER JOIN merchant_offers mo ON mo.id = oa.merchant_offer_id
        WHERE mo.store_id = ${storeId}
          AND oa.merchant_offer_id IS NOT NULL
          AND oa.offer_source = 'MERCHANT'
          AND ${deliveredFilter}
          AND of.created_at >= ${startIso}::timestamptz
          AND of.created_at <= ${endIso}::timestamptz
      )
      SELECT
        CASE
          WHEN oo.customer_id IS NULL THEN 'new'
          WHEN prev.last_prior IS NULL THEN 'new'
          WHEN EXTRACT(EPOCH FROM (oo.created_at - prev.last_prior)) / 86400.0 <= 60 THEN 'repeat'
          WHEN EXTRACT(EPOCH FROM (oo.created_at - prev.last_prior)) / 86400.0 <= 90 THEN 'lapsed'
          ELSE 'new'
        END AS segment,
        COUNT(*)::int AS cnt
      FROM offer_orders oo
      LEFT JOIN LATERAL (
        SELECT MAX(p.created_at) AS last_prior
        FROM orders_food p
        WHERE p.merchant_store_id = ${storeId}
          AND p.customer_id = oo.customer_id
          AND p.created_at < oo.created_at
      ) prev ON TRUE
      GROUP BY 1
    `;
    for (const sr of segRows as Array<{ segment: string; cnt: number }>) {
      const c = Number(sr.cnt) || 0;
      if (sr.segment === "repeat") repeat_orders += c;
      else if (sr.segment === "lapsed") lapsed_orders += c;
      else new_orders += c;
    }
  }

  return {
    gross: grossTotal,
    discount: discountTotal,
    orders: orderMap.size,
    total_store_orders,
    total_store_sales,
    monthly: Array.from(monthlyMap.values()),
    discount_types: Array.from(typeMap.entries()).map(([offer_type, v]) => ({
      offer_type,
      gross: v.gross,
      discount: v.discount,
      orders: v.orders.size,
    })),
    customers: { new_orders, repeat_orders, lapsed_orders },
  };
}
