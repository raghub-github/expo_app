/**
 * Flash Sale redemption tracker — reads flash_sale_redemptions + joins for display IDs.
 */

import { getSql } from "@/lib/db/client";

export type DateRange = { from: string; to: string };

export type FlashTrackerSummary = {
  total_redemptions: number;
  reserved: number;
  consumed: number;
  cancelled: number;
  refunded: number;
  unique_customers: number;
  subsidy_spent: number;
  food_count: number;
  ride_count: number;
  parcel_count: number;
  blocked_attempts: number;
};

export type FlashTrackerRow = {
  redemption_id: number;
  offer_id: number;
  offer_name: string | null;
  service_type: string;
  store_id: number | null;
  store_name: string | null;
  store_public_id: string | null;
  customer_pk: number | null;
  customer_public_id: string | null;
  order_pk: number | null;
  order_id_text: string | null;
  order_status: string | null;
  original_amount: string | null;
  flash_amount: string | null;
  subsidy_amount: string;
  status: string;
  applied_at: string;
  item_ids: unknown;
};

function defaultRange(now = new Date()): DateRange {
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(from), to: iso(to) };
}

export function defaultFlashTrackerDateRange(now = new Date()): DateRange {
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
    fromIso: `${from}T00:00:00.000Z`,
    toIso: `${to}T23:59:59.999Z`,
  };
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

export async function getFlashSaleTracker(range?: Partial<DateRange> | null): Promise<{
  range: DateRange;
  summary: FlashTrackerSummary;
  rows: FlashTrackerRow[];
}> {
  const sql = getSql();
  const { from, to, fromIso, toIso } = parseRange(range);

  const [summaryRow] = await sql<
    Array<{
      total_redemptions: number;
      reserved: number;
      consumed: number;
      cancelled: number;
      refunded: number;
      unique_customers: number;
      subsidy_spent: string;
      food_count: number;
      ride_count: number;
      parcel_count: number;
    }>
  >`
    SELECT
      COUNT(*)::int AS total_redemptions,
      COUNT(*) FILTER (WHERE status = 'reserved')::int AS reserved,
      COUNT(*) FILTER (WHERE status = 'consumed')::int AS consumed,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
      COUNT(*) FILTER (WHERE status = 'refunded')::int AS refunded,
      COUNT(DISTINCT customer_id)::int AS unique_customers,
      COALESCE(SUM(CASE WHEN status IN ('reserved', 'consumed') THEN subsidy_amount ELSE 0 END), 0)::text AS subsidy_spent,
      COUNT(*) FILTER (WHERE UPPER(service_type) IN ('FOOD', 'ALL'))::int AS food_count,
      COUNT(*) FILTER (WHERE UPPER(service_type) = 'RIDE')::int AS ride_count,
      COUNT(*) FILTER (WHERE UPPER(service_type) = 'PARCEL')::int AS parcel_count
    FROM flash_sale_redemptions
    WHERE applied_at >= ${fromIso}::timestamptz
      AND applied_at <= ${toIso}::timestamptz
  `;

  const rows = await sql<FlashTrackerRow[]>`
    SELECT
      r.id::int AS redemption_id,
      r.platform_offer_id::int AS offer_id,
      o.name AS offer_name,
      UPPER(COALESCE(r.service_type, 'FOOD')) AS service_type,
      r.store_id::int AS store_id,
      COALESCE(NULLIF(trim(ms.store_display_name), ''), NULLIF(trim(ms.store_name), '')) AS store_name,
      ms.store_id AS store_public_id,
      r.customer_id::int AS customer_pk,
      COALESCE(NULLIF(trim(c.customer_id), ''), NULL) AS customer_public_id,
      r.order_id::int AS order_pk,
      COALESCE(
        NULLIF(trim(oc.formatted_order_id), ''),
        NULLIF(trim(oc.order_id), ''),
        NULLIF(trim(r.order_id_text), ''),
        CASE
          WHEN r.order_id IS NOT NULL THEN ('GM' || lpad(r.order_id::text, 8, '0'))
          ELSE NULL
        END
      ) AS order_id_text,
      COALESCE(oc.current_status, oc.status::text) AS order_status,
      r.original_item_price::text AS original_amount,
      r.flash_sale_price::text AS flash_amount,
      COALESCE(r.subsidy_amount, 0)::text AS subsidy_amount,
      r.status,
      r.applied_at::text AS applied_at,
      r.item_ids
    FROM flash_sale_redemptions r
    LEFT JOIN billing_platform_offers o ON o.id = r.platform_offer_id
    LEFT JOIN customers c ON c.id = r.customer_id
    LEFT JOIN orders_core oc ON (
      oc.id = r.order_id
      OR (r.order_id_text IS NOT NULL AND oc.order_id = r.order_id_text)
    )
    LEFT JOIN merchant_stores ms ON ms.id = r.store_id
    WHERE r.applied_at >= ${fromIso}::timestamptz
      AND r.applied_at <= ${toIso}::timestamptz
    ORDER BY r.applied_at DESC
    LIMIT 500
  `;

  return {
    range: { from, to },
    summary: {
      total_redemptions: summaryRow?.total_redemptions ?? 0,
      reserved: summaryRow?.reserved ?? 0,
      consumed: summaryRow?.consumed ?? 0,
      cancelled: summaryRow?.cancelled ?? 0,
      refunded: summaryRow?.refunded ?? 0,
      unique_customers: summaryRow?.unique_customers ?? 0,
      subsidy_spent: num(summaryRow?.subsidy_spent),
      food_count: summaryRow?.food_count ?? 0,
      ride_count: summaryRow?.ride_count ?? 0,
      parcel_count: summaryRow?.parcel_count ?? 0,
      blocked_attempts: 0,
    },
    rows,
  };
}
