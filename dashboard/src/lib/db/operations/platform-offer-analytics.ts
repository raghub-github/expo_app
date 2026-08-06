/**
 * Platform offer analytics for Super Admin.
 * Joins offer_order_applications → orders_core via formatted order_id (GM…).
 */

import { getSql } from "@/lib/db/client";

export type DateRange = { from: string; to: string };

export type PlatformOfferAnalyticsSummary = {
  total_offers: number;
  active_offers: number;
  total_redemptions: number;
  active_users: number;
  orders_applied: number;
  sales_attributed: number;
  discount_total: number;
  budget_total: number;
  budget_consumed: number;
  budget_remaining: number | null;
};

export type PlatformOfferUsageRow = {
  offer_id: number;
  offer_name: string | null;
  offer_kind: string | null;
  is_active: boolean;
  orders_applied: number;
  redemptions: number;
  unique_users: number;
  sales_attributed: string;
  discount_total: string;
  budget_total: string | null;
  budget_used: string | null;
};

export type PlatformOfferGeoUsageRow = {
  binding_id: number;
  geo_level: string;
  geo_ref_id: string;
  node_name: string | null;
  state_name: string | null;
  state_id: string | null;
  offer_id: number;
  offer_name: string | null;
  orders_applied: number;
  sales_attributed: string;
  discount_total: string;
  /** State-level impact for this offer (sub-row payload). */
  state_impact: {
    state_id: string | null;
    state_name: string | null;
    orders_applied: number;
    sales_attributed: string;
    discount_total: string;
    unique_customers: number;
  } | null;
  /** All states impacted by this offer in the selected range (expandable sub-rows). */
  state_impacts: Array<{
    state_id: string | null;
    state_name: string | null;
    orders_applied: number;
    sales_attributed: string;
    discount_total: string;
    unique_customers: number;
  }>;
};

export type PlatformOfferDailyUsageRow = {
  day: string;
  redemptions: number;
  unique_users: number;
  orders_applied: number;
  sales_attributed: string;
  discount_total: string;
};

export type PlatformOfferApplicationRow = {
  application_id: number;
  offer_id: number | null;
  offer_name: string | null;
  offer_title: string;
  order_pk: number | null;
  order_id_text: string | null;
  customer_id: number | null;
  order_status: string | null;
  discount_amount: string;
  sale_amount: string | null;
  applied_at: string;
  usage_status: string | null;
  state_name: string | null;
};

export type PlatformOfferAuditRow = {
  id: number;
  action_type: string;
  resource_type: string | null;
  resource_id: string | null;
  agent_email: string;
  agent_name: string | null;
  action_details: unknown;
  previous_values: unknown;
  new_values: unknown;
  created_at: string;
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

/** Default: last 2 calendar days (from start of yesterday → end of today), ISO date YYYY-MM-DD. */
export function defaultAnalyticsDateRange(now = new Date()): DateRange {
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(from), to: iso(to) };
}

function parseRange(range?: Partial<DateRange> | null): { fromIso: string; toIso: string; from: string; to: string } {
  const d = defaultAnalyticsDateRange();
  const from = (range?.from && /^\d{4}-\d{2}-\d{2}$/.test(range.from) ? range.from : d.from);
  const to = (range?.to && /^\d{4}-\d{2}-\d{2}$/.test(range.to) ? range.to : d.to);
  return {
    from,
    to,
    fromIso: `${from}T00:00:00.000Z`,
    toIso: `${to}T23:59:59.999Z`,
  };
}

export async function getPlatformOfferAnalytics(range?: Partial<DateRange> | null): Promise<{
  range: DateRange;
  summary: PlatformOfferAnalyticsSummary;
  perOffer: PlatformOfferUsageRow[];
  geoWise: PlatformOfferGeoUsageRow[];
  daily: PlatformOfferDailyUsageRow[];
  monthly: PlatformOfferDailyUsageRow[];
  recentApplications: PlatformOfferApplicationRow[];
  auditLogs: PlatformOfferAuditRow[];
}> {
  const sql = getSql();
  const { from, to, fromIso, toIso } = parseRange(range);

  const [summaryRow] = await sql<
    Array<{
      total_offers: number;
      active_offers: number;
      total_redemptions: number;
      active_users: number;
      orders_applied: number;
      sales_attributed: string | null;
      discount_total: string | null;
      budget_total: string | null;
      budget_consumed: string | null;
    }>
  >`
    WITH oa_scoped AS (
      SELECT oa.*
      FROM offer_order_applications oa
      WHERE oa.offer_source = 'PLATFORM'
        AND oa.platform_offer_id IS NOT NULL
        AND oa.created_at >= ${fromIso}::timestamptz
        AND oa.created_at <= ${toIso}::timestamptz
    ),
    oa_joined AS (
      SELECT
        oa.*,
        oc.customer_id AS oc_customer_id,
        oc.grand_total AS oc_grand_total
      FROM oa_scoped oa
      LEFT JOIN orders_core oc ON (
        oc.id = oa.order_id
        OR oc.order_id = ('GM' || oa.order_id::text)
        OR regexp_replace(COALESCE(oc.order_id, ''), '\\D', '', 'g') = oa.order_id::text
      )
    )
    SELECT
      (SELECT COUNT(*)::int FROM billing_platform_offers) AS total_offers,
      (SELECT COUNT(*)::int FROM billing_platform_offers WHERE is_active = true) AS active_offers,
      (SELECT COUNT(*)::int FROM oa_joined) AS total_redemptions,
      (SELECT COUNT(DISTINCT oc_customer_id)::int FROM oa_joined WHERE oc_customer_id IS NOT NULL) AS active_users,
      (SELECT COUNT(DISTINCT order_id)::int FROM oa_joined) AS orders_applied,
      (SELECT COALESCE(SUM(COALESCE(oc_grand_total, 0)), 0)::text FROM oa_joined) AS sales_attributed,
      (SELECT COALESCE(SUM(discount_amount), 0)::text FROM oa_joined) AS discount_total,
      (SELECT COALESCE(SUM(budget_total), 0)::text FROM billing_platform_offers WHERE budget_total IS NOT NULL) AS budget_total,
      (SELECT COALESCE(SUM(budget_used), 0)::text FROM billing_platform_offers) AS budget_consumed
  `;

  const budgetTotal = num(summaryRow?.budget_total);
  const budgetConsumed = num(summaryRow?.budget_consumed);

  const perOffer = await sql<PlatformOfferUsageRow[]>`
    WITH oa_scoped AS (
      SELECT oa.*
      FROM offer_order_applications oa
      WHERE oa.offer_source = 'PLATFORM'
        AND oa.platform_offer_id IS NOT NULL
        AND oa.created_at >= ${fromIso}::timestamptz
        AND oa.created_at <= ${toIso}::timestamptz
    )
    SELECT
      o.id::int AS offer_id,
      o.name AS offer_name,
      o.offer_kind AS offer_kind,
      COALESCE(o.is_active, false) AS is_active,
      COALESCE(a.orders_applied, 0)::int AS orders_applied,
      COALESCE(a.redemptions, 0)::int AS redemptions,
      COALESCE(a.unique_users, 0)::int AS unique_users,
      COALESCE(a.sales_attributed, 0)::text AS sales_attributed,
      COALESCE(a.discount_total, 0)::text AS discount_total,
      o.budget_total::text AS budget_total,
      o.budget_used::text AS budget_used
    FROM billing_platform_offers o
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS redemptions,
        COUNT(DISTINCT oa.order_id)::int AS orders_applied,
        COUNT(DISTINCT oc.customer_id)::int AS unique_users,
        COALESCE(SUM(COALESCE(oc.grand_total, 0)), 0) AS sales_attributed,
        COALESCE(SUM(oa.discount_amount), 0) AS discount_total
      FROM oa_scoped oa
      LEFT JOIN orders_core oc ON (
        oc.id = oa.order_id
        OR oc.order_id = ('GM' || oa.order_id::text)
        OR regexp_replace(COALESCE(oc.order_id, ''), '\\D', '', 'g') = oa.order_id::text
      )
      WHERE oa.platform_offer_id = o.id
    ) a ON true
    ORDER BY a.orders_applied DESC NULLS LAST, o.id ASC
    LIMIT 200
  `;

  const stateImpact = await sql<
    Array<{
      offer_id: number;
      state_id: string | null;
      state_name: string | null;
      orders_applied: number;
      sales_attributed: string;
      discount_total: string;
      unique_customers: number;
    }>
  >`
    WITH oa_scoped AS (
      SELECT oa.*
      FROM offer_order_applications oa
      WHERE oa.offer_source = 'PLATFORM'
        AND oa.platform_offer_id IS NOT NULL
        AND oa.created_at >= ${fromIso}::timestamptz
        AND oa.created_at <= ${toIso}::timestamptz
    ),
    mapped AS (
      SELECT
        oa.platform_offer_id AS offer_id,
        oc.customer_id,
        oc.grand_total,
        oa.discount_amount,
        oa.order_id,
        COALESCE(
          NULLIF(trim(oc.billing_snapshot #>> '{geo,stateName}'), ''),
          NULLIF(trim(oc.billing_snapshot #>> '{geo,state}'), ''),
          NULLIF(trim(oc.billing_snapshot #>> '{address,state}'), ''),
          'Unknown'
        ) AS state_name
      FROM oa_scoped oa
      LEFT JOIN orders_core oc ON (
        oc.id = oa.order_id
        OR oc.order_id = ('GM' || oa.order_id::text)
        OR regexp_replace(COALESCE(oc.order_id, ''), '\\D', '', 'g') = oa.order_id::text
      )
    )
    SELECT
      offer_id::int AS offer_id,
      NULL::text AS state_id,
      state_name,
      COUNT(DISTINCT order_id)::int AS orders_applied,
      COALESCE(SUM(COALESCE(grand_total, 0)), 0)::text AS sales_attributed,
      COALESCE(SUM(discount_amount), 0)::text AS discount_total,
      COUNT(DISTINCT customer_id)::int AS unique_customers
    FROM mapped
    GROUP BY offer_id, state_name
    ORDER BY offer_id, orders_applied DESC
  `;

  const impactByOfferState = new Map<string, (typeof stateImpact)[number]>();
  const impactByOffer = new Map<number, (typeof stateImpact)[number][]>();
  for (const row of stateImpact) {
    const key = `${row.offer_id}::${row.state_name ?? "Unknown"}`;
    impactByOfferState.set(key, row);
    const list = impactByOffer.get(row.offer_id) ?? [];
    list.push(row);
    impactByOffer.set(row.offer_id, list);
  }

  const geoRaw = await sql<
    Array<{
      binding_id: number;
      geo_level: string;
      geo_ref_id: string;
      node_name: string | null;
      state_name: string | null;
      state_id: string | null;
      offer_id: number;
      offer_name: string | null;
    }>
  >`
    SELECT
      b.id::int AS binding_id,
      b.geo_level::text AS geo_level,
      b.geo_ref_id::text AS geo_ref_id,
      CASE b.geo_level::text
        WHEN 'state' THEN (SELECT name FROM states WHERE id = b.geo_ref_id)
        WHEN 'region' THEN (SELECT name FROM regions WHERE id = b.geo_ref_id)
        WHEN 'district' THEN (SELECT name FROM districts WHERE id = b.geo_ref_id)
        WHEN 'division' THEN (SELECT name FROM divisions WHERE id = b.geo_ref_id)
        WHEN 'post_office' THEN (SELECT name FROM post_offices WHERE id = b.geo_ref_id)
        WHEN 'pincode' THEN (SELECT pincode FROM pincodes WHERE id = b.geo_ref_id)
        ELSE b.geo_ref_id::text
      END AS node_name,
      CASE b.geo_level::text
        WHEN 'state' THEN (SELECT name FROM states WHERE id = b.geo_ref_id)
        WHEN 'region' THEN (SELECT s.name FROM regions r JOIN states s ON s.id = r.state_id WHERE r.id = b.geo_ref_id)
        WHEN 'district' THEN (
          SELECT s.name FROM districts d
          JOIN regions r ON r.id = d.region_id JOIN states s ON s.id = r.state_id
          WHERE d.id = b.geo_ref_id)
        WHEN 'division' THEN (
          SELECT s.name FROM divisions dv
          JOIN districts d ON d.id = dv.district_id
          JOIN regions r ON r.id = d.region_id JOIN states s ON s.id = r.state_id
          WHERE dv.id = b.geo_ref_id)
        WHEN 'post_office' THEN (
          SELECT s.name FROM post_offices po
          JOIN divisions dv ON dv.id = po.division_id
          JOIN districts d ON d.id = dv.district_id
          JOIN regions r ON r.id = d.region_id JOIN states s ON s.id = r.state_id
          WHERE po.id = b.geo_ref_id)
        WHEN 'pincode' THEN (
          SELECT s.name FROM pincodes p
          JOIN pincode_post_offices ppo ON ppo.pincode_id = p.id
          JOIN post_offices po ON po.id = ppo.post_office_id
          JOIN divisions dv ON dv.id = po.division_id
          JOIN districts d ON d.id = dv.district_id
          JOIN regions r ON r.id = d.region_id JOIN states s ON s.id = r.state_id
          WHERE p.id = b.geo_ref_id
          LIMIT 1)
        ELSE NULL
      END AS state_name,
      CASE b.geo_level::text
        WHEN 'state' THEN b.geo_ref_id::text
        WHEN 'region' THEN (SELECT s.id::text FROM regions r JOIN states s ON s.id = r.state_id WHERE r.id = b.geo_ref_id)
        WHEN 'district' THEN (
          SELECT s.id::text FROM districts d
          JOIN regions r ON r.id = d.region_id JOIN states s ON s.id = r.state_id
          WHERE d.id = b.geo_ref_id)
        WHEN 'division' THEN (
          SELECT s.id::text FROM divisions dv
          JOIN districts d ON d.id = dv.district_id
          JOIN regions r ON r.id = d.region_id JOIN states s ON s.id = r.state_id
          WHERE dv.id = b.geo_ref_id)
        WHEN 'post_office' THEN (
          SELECT s.id::text FROM post_offices po
          JOIN divisions dv ON dv.id = po.division_id
          JOIN districts d ON d.id = dv.district_id
          JOIN regions r ON r.id = d.region_id JOIN states s ON s.id = r.state_id
          WHERE po.id = b.geo_ref_id)
        WHEN 'pincode' THEN (
          SELECT s.id::text FROM pincodes p
          JOIN pincode_post_offices ppo ON ppo.pincode_id = p.id
          JOIN post_offices po ON po.id = ppo.post_office_id
          JOIN divisions dv ON dv.id = po.division_id
          JOIN districts d ON d.id = dv.district_id
          JOIN regions r ON r.id = d.region_id JOIN states s ON s.id = r.state_id
          WHERE p.id = b.geo_ref_id
          LIMIT 1)
        ELSE NULL
      END AS state_id,
      o.id::int AS offer_id,
      o.name AS offer_name
    FROM geo_platform_offer_bindings b
    INNER JOIN billing_platform_offers o ON o.id = b.platform_offer_id
    ORDER BY o.id, state_name NULLS LAST, b.geo_level, b.id
    LIMIT 500
  `;

  const offerTotals = new Map(
    perOffer.map((p) => [
      p.offer_id,
      {
        orders_applied: p.orders_applied,
        sales_attributed: p.sales_attributed,
        discount_total: p.discount_total,
      },
    ]),
  );

  const geoWise: PlatformOfferGeoUsageRow[] = geoRaw.map((g) => {
    const stateKey = `${g.offer_id}::${g.state_name ?? "Unknown"}`;
    const impact =
      impactByOfferState.get(stateKey) ??
      (impactByOffer.get(g.offer_id)?.[0] ?? null);
    const allImpacts = (impactByOffer.get(g.offer_id) ?? []).map((x) => ({
      state_id: x.state_id,
      state_name: x.state_name,
      orders_applied: x.orders_applied,
      sales_attributed: x.sales_attributed,
      discount_total: x.discount_total,
      unique_customers: x.unique_customers,
    }));
    const totals = offerTotals.get(g.offer_id);
    return {
      ...g,
      orders_applied: impact?.orders_applied ?? totals?.orders_applied ?? 0,
      sales_attributed: impact?.sales_attributed ?? totals?.sales_attributed ?? "0",
      discount_total: impact?.discount_total ?? totals?.discount_total ?? "0",
      state_impact: impact
        ? {
            state_id: impact.state_id,
            state_name: impact.state_name,
            orders_applied: impact.orders_applied,
            sales_attributed: impact.sales_attributed,
            discount_total: impact.discount_total,
            unique_customers: impact.unique_customers,
          }
        : g.state_name
          ? {
              state_id: g.state_id,
              state_name: g.state_name,
              orders_applied: 0,
              sales_attributed: "0",
              discount_total: "0",
              unique_customers: 0,
            }
          : null,
      state_impacts:
        allImpacts.length > 0
          ? allImpacts
          : g.state_name
            ? [
                {
                  state_id: g.state_id,
                  state_name: g.state_name,
                  orders_applied: 0,
                  sales_attributed: "0",
                  discount_total: "0",
                  unique_customers: 0,
                },
              ]
            : [],
    };
  });

  const daily = await sql<PlatformOfferDailyUsageRow[]>`
    SELECT
      to_char(date_trunc('day', oa.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS redemptions,
      COUNT(DISTINCT oc.customer_id)::int AS unique_users,
      COUNT(DISTINCT oa.order_id)::int AS orders_applied,
      COALESCE(SUM(COALESCE(oc.grand_total, 0)), 0)::text AS sales_attributed,
      COALESCE(SUM(oa.discount_amount), 0)::text AS discount_total
    FROM offer_order_applications oa
    LEFT JOIN orders_core oc ON (
      oc.id = oa.order_id
      OR oc.order_id = ('GM' || oa.order_id::text)
      OR regexp_replace(COALESCE(oc.order_id, ''), '\\D', '', 'g') = oa.order_id::text
    )
    WHERE oa.offer_source = 'PLATFORM'
      AND oa.platform_offer_id IS NOT NULL
      AND oa.created_at >= ${fromIso}::timestamptz
      AND oa.created_at <= ${toIso}::timestamptz
    GROUP BY 1
    ORDER BY 1 DESC
  `;

  const monthly = await sql<PlatformOfferDailyUsageRow[]>`
    SELECT
      to_char(date_trunc('month', oa.created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS day,
      COUNT(*)::int AS redemptions,
      COUNT(DISTINCT oc.customer_id)::int AS unique_users,
      COUNT(DISTINCT oa.order_id)::int AS orders_applied,
      COALESCE(SUM(COALESCE(oc.grand_total, 0)), 0)::text AS sales_attributed,
      COALESCE(SUM(oa.discount_amount), 0)::text AS discount_total
    FROM offer_order_applications oa
    LEFT JOIN orders_core oc ON (
      oc.id = oa.order_id
      OR oc.order_id = ('GM' || oa.order_id::text)
      OR regexp_replace(COALESCE(oc.order_id, ''), '\\D', '', 'g') = oa.order_id::text
    )
    WHERE oa.offer_source = 'PLATFORM'
      AND oa.platform_offer_id IS NOT NULL
      AND oa.created_at >= ${fromIso}::timestamptz
      AND oa.created_at <= ${toIso}::timestamptz
    GROUP BY 1
    ORDER BY 1 DESC
  `;

  const recentApplications = await sql<PlatformOfferApplicationRow[]>`
    SELECT
      oa.id::int AS application_id,
      oa.platform_offer_id::int AS offer_id,
      o.name AS offer_name,
      oa.offer_title,
      oc.id::int AS order_pk,
      COALESCE(oc.order_id, ('GM' || oa.order_id::text)) AS order_id_text,
      oc.customer_id::int AS customer_id,
      COALESCE(oc.current_status, oc.status::text) AS order_status,
      COALESCE(oa.discount_amount, 0)::text AS discount_amount,
      oc.grand_total::text AS sale_amount,
      oa.created_at::text AS applied_at,
      pou.status AS usage_status,
      COALESCE(
        NULLIF(trim(oc.billing_snapshot #>> '{geo,stateName}'), ''),
        NULLIF(trim(oc.billing_snapshot #>> '{geo,state}'), ''),
        NULLIF(trim(oc.billing_snapshot #>> '{address,state}'), ''),
        NULL
      ) AS state_name
    FROM offer_order_applications oa
    LEFT JOIN billing_platform_offers o ON o.id = oa.platform_offer_id
    LEFT JOIN orders_core oc ON (
      oc.id = oa.order_id
      OR oc.order_id = ('GM' || oa.order_id::text)
      OR regexp_replace(COALESCE(oc.order_id, ''), '\\D', '', 'g') = oa.order_id::text
    )
    LEFT JOIN platform_offer_usages pou
      ON pou.platform_offer_id = oa.platform_offer_id
     AND (
       pou.order_id IS NOT DISTINCT FROM oc.id
       OR pou.order_id_text = oc.order_id
       OR pou.order_id = oa.order_id
     )
    WHERE oa.offer_source = 'PLATFORM'
      AND oa.platform_offer_id IS NOT NULL
      AND oa.created_at >= ${fromIso}::timestamptz
      AND oa.created_at <= ${toIso}::timestamptz
    ORDER BY oa.created_at DESC
    LIMIT 300
  `;

  let auditLogs: PlatformOfferAuditRow[] = [];
  try {
    auditLogs = await sql<PlatformOfferAuditRow[]>`
      SELECT
        id::int AS id,
        action_type,
        resource_type,
        resource_id,
        agent_email,
        agent_name,
        action_details,
        previous_values,
        new_values,
        created_at::text AS created_at
      FROM action_audit_log
      WHERE (
          resource_type IN ('platform_offer', 'geo_platform_offer_binding')
          OR (action_details::text ILIKE '%platform_offer%')
        )
        AND created_at >= ${fromIso}::timestamptz
        AND created_at <= ${toIso}::timestamptz
      ORDER BY created_at DESC
      LIMIT 150
    `;
  } catch {
    auditLogs = [];
  }

  return {
    range: { from, to },
    summary: {
      total_offers: summaryRow?.total_offers ?? 0,
      active_offers: summaryRow?.active_offers ?? 0,
      total_redemptions: summaryRow?.total_redemptions ?? 0,
      active_users: summaryRow?.active_users ?? 0,
      orders_applied: summaryRow?.orders_applied ?? 0,
      sales_attributed: num(summaryRow?.sales_attributed),
      discount_total: num(summaryRow?.discount_total),
      budget_total: budgetTotal,
      budget_consumed: budgetConsumed,
      budget_remaining: budgetTotal > 0 ? Math.max(0, budgetTotal - budgetConsumed) : null,
    },
    perOffer,
    geoWise,
    daily,
    monthly,
    recentApplications,
    auditLogs,
  };
}
