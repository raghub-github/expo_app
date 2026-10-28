/**
 * FREE_DELIVERY platform offer analytics — usages + offer rows, scoped to FREE_DELIVERY.
 * Mirrors flash-sale-tracker patterns; does not mutate on read.
 */

import { getSql } from "@/lib/db/client";

export type DateRange = { from: string; to: string };

export type FreeDeliveryTrackerSummary = {
  total_offers: number;
  active_offers: number;
  eligible_customers: number | null;
  orders_applied: number;
  successful_redemptions: number;
  unique_customers: number;
  delivery_fees_waived: number;
  budget_consumed: number;
  budget_remaining: number | null;
  avg_discount_per_order: number | null;
  cancelled_refunded_redemptions: number;
  conversion_rate: number | null;
  reserved: number;
  consumed: number;
};

export type FreeDeliveryOfferRow = {
  offer_id: number;
  offer_name: string | null;
  coupon_code: string | null;
  is_active: boolean;
  service_type: string | null;
  customer_segment: string | null;
  min_order_amount: string | null;
  orders_applied: number;
  unique_customers: number;
  redemptions: number;
  original_delivery_fees: string;
  delivery_discount: string;
  budget_total: string | null;
  budget_used: string | null;
  budget_remaining: number | null;
  max_uses_per_user: number | null;
  starts_at: string | null;
  ends_at: string | null;
};

export type FreeDeliveryRedemptionRow = {
  redemption_id: number;
  offer_id: number;
  offer_name: string | null;
  coupon_code: string | null;
  customer_pk: number | null;
  customer_public_id: string | null;
  customer_name: string | null;
  order_pk: number | null;
  order_id_text: string | null;
  order_status: string | null;
  original_delivery_fee: string | null;
  discount_applied: string;
  final_delivery_fee: string | null;
  redemption_status: string;
  budget_status: string;
  cancel_refund_status: string | null;
  usage_restored: boolean;
  applied_at: string;
  consumed_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
};

export type FreeDeliveryDailyRow = {
  day: string;
  redemptions: number;
  discount_total: string;
};

export type FreeDeliveryAuditRow = {
  id: number;
  action_type: string;
  resource_id: string | null;
  agent_email: string;
  agent_name: string | null;
  action_details: unknown;
  previous_values: unknown;
  new_values: unknown;
  created_at: string;
};

export type FreeDeliveryConflictRow = {
  offer_id: number;
  offer_name: string | null;
  coupon_code: string | null;
  is_active: boolean;
  customer_segment: string | null;
  conflict_reason: string;
};

function defaultRange(now = new Date()): DateRange {
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(from), to: iso(to) };
}

export function defaultFreeDeliveryTrackerDateRange(now = new Date()): DateRange {
  return defaultRange(now);
}

function parseRange(range?: Partial<DateRange> | null): {
  fromIso: string;
  toIso: string;
  from: string;
  to: string;
} {
  const d = defaultRange();
  const from = range?.from && /^\d{4}-\d{2}-\d{2}$/.test(range.from) ? range.from : d.from;
  const to = range?.to && /^\d{4}-\d{2}-\d{2}$/.test(range.to) ? range.to : d.to;
  return {
    from,
    to,
    // Asia/Kolkata reporting day bounds converted via timestamptz literals (UTC wall clock
    // matching existing platform-offer-analytics convention).
    fromIso: `${from}T00:00:00.000Z`,
    toIso: `${to}T23:59:59.999Z`,
  };
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

export async function getFreeDeliveryTracker(range?: Partial<DateRange> | null): Promise<{
  range: DateRange;
  summary: FreeDeliveryTrackerSummary;
  perOffer: FreeDeliveryOfferRow[];
  redemptions: FreeDeliveryRedemptionRow[];
  daily: FreeDeliveryDailyRow[];
  budgetChart: { consumed: number; remaining: number | null; total: number };
  auditLogs: FreeDeliveryAuditRow[];
  conflicts: FreeDeliveryConflictRow[];
}> {
  const sql = getSql();
  const { from, to, fromIso, toIso } = parseRange(range);

  const [summaryRow] = await sql<
    Array<{
      total_offers: number;
      active_offers: number;
      orders_applied: number;
      successful_redemptions: number;
      unique_customers: number;
      delivery_fees_waived: string;
      budget_total: string;
      budget_consumed: string;
      cancelled_refunded: number;
      reserved: number;
      consumed: number;
    }>
  >`
    WITH fd_offers AS (
      SELECT *
      FROM billing_platform_offers
      WHERE UPPER(COALESCE(offer_kind, '')) = 'FREE_DELIVERY'
    ),
    u_scoped AS (
      SELECT u.*
      FROM platform_offer_usages u
      INNER JOIN fd_offers o ON o.id = u.platform_offer_id
      WHERE u.applied_at >= ${fromIso}::timestamptz
        AND u.applied_at <= ${toIso}::timestamptz
        AND COALESCE(u.order_id_text, '') NOT LIKE 'lifetime-lock:%'
    )
    SELECT
      (SELECT COUNT(*)::int FROM fd_offers) AS total_offers,
      (SELECT COUNT(*)::int FROM fd_offers WHERE is_active = true) AS active_offers,
      (SELECT COUNT(DISTINCT order_id)::int FROM u_scoped WHERE status IN ('reserved', 'consumed') AND order_id IS NOT NULL) AS orders_applied,
      (SELECT COUNT(*)::int FROM u_scoped WHERE status IN ('reserved', 'consumed')) AS successful_redemptions,
      (SELECT COUNT(DISTINCT customer_id)::int FROM u_scoped WHERE status IN ('reserved', 'consumed')) AS unique_customers,
      (SELECT COALESCE(SUM(discount_amount), 0)::text FROM u_scoped WHERE status IN ('reserved', 'consumed')) AS delivery_fees_waived,
      (SELECT COALESCE(SUM(budget_total), 0)::text FROM fd_offers WHERE budget_total IS NOT NULL) AS budget_total,
      (SELECT COALESCE(SUM(budget_used), 0)::text FROM fd_offers) AS budget_consumed,
      (SELECT COUNT(*)::int FROM u_scoped WHERE status IN ('cancelled', 'refunded')) AS cancelled_refunded,
      (SELECT COUNT(*)::int FROM u_scoped WHERE status = 'reserved') AS reserved,
      (SELECT COUNT(*)::int FROM u_scoped WHERE status = 'consumed') AS consumed
  `;

  const budgetTotal = num(summaryRow?.budget_total);
  const budgetConsumed = num(summaryRow?.budget_consumed);
  const waived = num(summaryRow?.delivery_fees_waived);
  const ordersApplied = summaryRow?.orders_applied ?? 0;
  const successful = summaryRow?.successful_redemptions ?? 0;

  const perOffer = await sql<FreeDeliveryOfferRow[]>`
    WITH u_scoped AS (
      SELECT u.*
      FROM platform_offer_usages u
      WHERE u.applied_at >= ${fromIso}::timestamptz
        AND u.applied_at <= ${toIso}::timestamptz
        AND COALESCE(u.order_id_text, '') NOT LIKE 'lifetime-lock:%'
    )
    SELECT
      o.id::int AS offer_id,
      o.name AS offer_name,
      o.coupon_code,
      COALESCE(o.is_active, false) AS is_active,
      o.service_type,
      o.customer_segment,
      o.min_order_amount::text AS min_order_amount,
      COALESCE(a.orders_applied, 0)::int AS orders_applied,
      COALESCE(a.unique_customers, 0)::int AS unique_customers,
      COALESCE(a.redemptions, 0)::int AS redemptions,
      COALESCE(a.delivery_discount, 0)::text AS original_delivery_fees,
      COALESCE(a.delivery_discount, 0)::text AS delivery_discount,
      o.budget_total::text AS budget_total,
      o.budget_used::text AS budget_used,
      o.max_uses_per_user,
      o.starts_at::text AS starts_at,
      o.ends_at::text AS ends_at
    FROM billing_platform_offers o
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE u.status IN ('reserved', 'consumed'))::int AS redemptions,
        COUNT(DISTINCT u.order_id) FILTER (WHERE u.status IN ('reserved', 'consumed') AND u.order_id IS NOT NULL)::int AS orders_applied,
        COUNT(DISTINCT u.customer_id) FILTER (WHERE u.status IN ('reserved', 'consumed'))::int AS unique_customers,
        COALESCE(SUM(CASE WHEN u.status IN ('reserved', 'consumed') THEN u.discount_amount ELSE 0 END), 0) AS delivery_discount
      FROM u_scoped u
      WHERE u.platform_offer_id = o.id
    ) a ON true
    WHERE UPPER(COALESCE(o.offer_kind, '')) = 'FREE_DELIVERY'
    ORDER BY a.redemptions DESC NULLS LAST, o.id ASC
    LIMIT 200
  `;

  const redemptions = await sql<FreeDeliveryRedemptionRow[]>`
    SELECT
      u.id::int AS redemption_id,
      u.platform_offer_id::int AS offer_id,
      o.name AS offer_name,
      o.coupon_code,
      u.customer_id::int AS customer_pk,
      COALESCE(NULLIF(trim(c.customer_id), ''), NULL) AS customer_public_id,
      COALESCE(NULLIF(trim(c.full_name), ''), NULL) AS customer_name,
      u.order_id::int AS order_pk,
      COALESCE(
        NULLIF(trim(oc.formatted_order_id), ''),
        NULLIF(trim(oc.order_id), ''),
        NULLIF(trim(u.order_id_text), ''),
        CASE WHEN u.order_id IS NOT NULL THEN ('GM' || lpad(u.order_id::text, 8, '0')) ELSE NULL END
      ) AS order_id_text,
      COALESCE(oc.current_status, oc.status::text) AS order_status,
      COALESCE(
        NULLIF(trim(oc.billing_snapshot #>> '{fees,delivery_fee_before_discount}'), ''),
        NULLIF(trim(oc.billing_snapshot #>> '{delivery,original_fee}'), ''),
        NULL
      ) AS original_delivery_fee,
      COALESCE(u.discount_amount, 0)::text AS discount_applied,
      COALESCE(
        NULLIF(trim(oc.billing_snapshot #>> '{fees,delivery_fee}'), ''),
        NULL
      ) AS final_delivery_fee,
      u.status AS redemption_status,
      CASE
        WHEN u.status = 'consumed' THEN 'consumed'
        WHEN u.status = 'reserved' THEN 'reserved'
        WHEN u.status IN ('cancelled', 'refunded') THEN 'released'
        ELSE u.status
      END AS budget_status,
      CASE
        WHEN u.status = 'cancelled' THEN 'cancelled'
        WHEN u.status = 'refunded' THEN 'refunded'
        ELSE NULL
      END AS cancel_refund_status,
      COALESCE(
        (u.metadata->>'budget_restored')::numeric > 0
          AND COALESCE(u.metadata->>'lifetime_eligibility_retained', 'true') = 'true',
        false
      ) AS usage_restored,
      u.applied_at::text AS applied_at,
      u.consumed_at::text AS consumed_at,
      u.cancelled_at::text AS cancelled_at,
      u.refunded_at::text AS refunded_at
    FROM platform_offer_usages u
    INNER JOIN billing_platform_offers o ON o.id = u.platform_offer_id
    LEFT JOIN customers c ON c.id = u.customer_id
    LEFT JOIN orders_core oc ON (
      oc.id = u.order_id
      OR (u.order_id_text IS NOT NULL AND oc.order_id = u.order_id_text)
      OR (u.order_id_text IS NOT NULL AND oc.formatted_order_id = u.order_id_text)
    )
    WHERE UPPER(COALESCE(o.offer_kind, '')) = 'FREE_DELIVERY'
      AND u.applied_at >= ${fromIso}::timestamptz
      AND u.applied_at <= ${toIso}::timestamptz
      AND COALESCE(u.order_id_text, '') NOT LIKE 'lifetime-lock:%'
    ORDER BY u.applied_at DESC
    LIMIT 500
  `;

  const daily = await sql<FreeDeliveryDailyRow[]>`
    SELECT
      to_char(date_trunc('day', u.applied_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS day,
      COUNT(*) FILTER (WHERE u.status IN ('reserved', 'consumed'))::int AS redemptions,
      COALESCE(SUM(CASE WHEN u.status IN ('reserved', 'consumed') THEN u.discount_amount ELSE 0 END), 0)::text AS discount_total
    FROM platform_offer_usages u
    INNER JOIN billing_platform_offers o ON o.id = u.platform_offer_id
    WHERE UPPER(COALESCE(o.offer_kind, '')) = 'FREE_DELIVERY'
      AND u.applied_at >= ${fromIso}::timestamptz
      AND u.applied_at <= ${toIso}::timestamptz
      AND COALESCE(u.order_id_text, '') NOT LIKE 'lifetime-lock:%'
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  let auditLogs: FreeDeliveryAuditRow[] = [];
  try {
    auditLogs = await sql<FreeDeliveryAuditRow[]>`
      SELECT
        a.id::int AS id,
        a.action_type,
        a.resource_id,
        a.agent_email,
        a.agent_name,
        a.action_details,
        a.previous_values,
        a.new_values,
        a.created_at::text AS created_at
      FROM action_audit_log a
      WHERE a.resource_type IN ('platform_offer', 'geo_platform_offer_binding')
        AND a.created_at >= ${fromIso}::timestamptz
        AND a.created_at <= ${toIso}::timestamptz
        AND (
          a.action_details::text ILIKE '%FREE_DELIVERY%'
          OR a.action_details::text ILIKE '%first_order%'
          OR a.action_details::text ILIKE '%FIRSTDELIVERY%'
          OR a.new_values::text ILIKE '%FREE_DELIVERY%'
          OR a.previous_values::text ILIKE '%FREE_DELIVERY%'
        )
      ORDER BY a.created_at DESC
      LIMIT 150
    `;
  } catch {
    auditLogs = [];
  }

  const conflicts = await sql<FreeDeliveryConflictRow[]>`
    SELECT
      o.id::int AS offer_id,
      o.name AS offer_name,
      o.coupon_code,
      COALESCE(o.is_active, false) AS is_active,
      o.customer_segment,
      CASE
        WHEN UPPER(COALESCE(o.customer_segment, '')) = 'NEW'
          AND COALESCE(o.conditions->>'first_order_only', 'false') IN ('true', '1')
          THEN 'Overlapping first-order FREE_DELIVERY campaign'
        WHEN COALESCE((o.promo_config->>'auto_apply')::boolean, false) = true
          THEN 'Active FREE_DELIVERY with auto_apply — may compete at checkout'
        ELSE 'Active FREE_DELIVERY campaign (exclusive checkout picks one delivery promo)'
      END AS conflict_reason
    FROM billing_platform_offers o
    WHERE UPPER(COALESCE(o.offer_kind, '')) = 'FREE_DELIVERY'
      AND COALESCE(o.is_active, false) = true
    ORDER BY o.id ASC
    LIMIT 50
  `;

  return {
    range: { from, to },
    summary: {
      total_offers: summaryRow?.total_offers ?? 0,
      active_offers: summaryRow?.active_offers ?? 0,
      // Expensive full-customer scan intentionally omitted (null = unavailable).
      eligible_customers: null,
      orders_applied: ordersApplied,
      successful_redemptions: successful,
      unique_customers: summaryRow?.unique_customers ?? 0,
      delivery_fees_waived: waived,
      budget_consumed: budgetConsumed,
      budget_remaining: budgetTotal > 0 ? Math.max(0, budgetTotal - budgetConsumed) : null,
      avg_discount_per_order: ordersApplied > 0 ? waived / ordersApplied : null,
      cancelled_refunded_redemptions: summaryRow?.cancelled_refunded ?? 0,
      // Conversion uses redeemed/active offers — not exposure (exposure unavailable).
      conversion_rate:
        (summaryRow?.active_offers ?? 0) > 0
          ? ordersApplied / (summaryRow?.active_offers ?? 1)
          : null,
      reserved: summaryRow?.reserved ?? 0,
      consumed: summaryRow?.consumed ?? 0,
    },
    perOffer: perOffer.map((r) => {
      const bt = num(r.budget_total);
      const bu = num(r.budget_used);
      return {
        ...r,
        budget_remaining: bt > 0 ? Math.max(0, bt - bu) : null,
      };
    }),
    redemptions,
    daily,
    budgetChart: {
      consumed: budgetConsumed,
      remaining: budgetTotal > 0 ? Math.max(0, budgetTotal - budgetConsumed) : null,
      total: budgetTotal,
    },
    auditLogs,
    conflicts,
  };
}
