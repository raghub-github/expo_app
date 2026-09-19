import "server-only";

import { getSql, num, safeQuery, str } from "@/lib/db/client";
import { parsePeriod, periodBounds, type Period } from "@/lib/period";
import { resolveSelfieUrl } from "@/lib/rider-media";

function isoTs(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const s = String(value ?? "");
  if (!s) return new Date(0).toISOString();
  return s;
}

function boundsFromSearch(periodRaw: string | null) {
  const period = parsePeriod(periodRaw);
  const bounds = periodBounds(period);
  return {
    period,
    from: isoTs(bounds.from),
    to: isoTs(bounds.to),
    previousFrom: isoTs(bounds.previousFrom),
  };
}

function payableSql(alias = "") {
  const p = alias ? `${alias}.` : "";
  return getSql().unsafe(`COALESCE(
    NULLIF(${p}grand_total, 0),
    NULLIF(${p}fare_amount, 0),
    NULLIF(NULLIF(${p}billing_snapshot->>'final_amount', '')::numeric, 0),
    NULLIF(NULLIF(${p}billing_snapshot->'gst_totals'->>'final_payable', '')::numeric, 0),
    0
  )`);
}

function chargesArraySql(alias = "") {
  const p = alias ? `${alias}.` : "";
  return `CASE
    WHEN jsonb_typeof(${p}billing_snapshot->'charges') = 'array' THEN ${p}billing_snapshot->'charges'
    ELSE '[]'::jsonb
  END`;
}

function gstSql(alias = "") {
  const p = alias ? `${alias}.` : "";
  return getSql().unsafe(`GREATEST(
    COALESCE(NULLIF(${p}billing_snapshot->>'tax_total', '')::numeric, 0),
    COALESCE(NULLIF(${p}billing_snapshot->'gst_totals'->>'total_tax', '')::numeric, 0)
  )`);
}

/** GST GatiMitra remits: platform/subscription/convenience + ride GST. Item GST stays with the merchant. */
function gstRemitSql(alias = "") {
  const p = alias ? `${alias}.` : "";
  return getSql().unsafe(`(
    COALESCE((${p}billing_snapshot->'gst_components'->'platform'->>'gst')::numeric, 0)
    + COALESCE((${p}billing_snapshot->'gst_components'->'subscription'->>'gst')::numeric, 0)
    + COALESCE((${p}billing_snapshot->'gst_components'->'convenience'->>'gst')::numeric, 0)
    + COALESCE((${p}billing_snapshot->'gst_components'->'small_order'->>'gst')::numeric, 0)
    + COALESCE((${p}billing_snapshot->'gst_components'->'delivery'->>'gst')::numeric, 0)
    + CASE
        WHEN ${p}order_type::text IN ('food', 'grocery', 'mart', 'pharmacy') THEN 0
        ELSE GREATEST(
          COALESCE(NULLIF(${p}billing_snapshot->>'tax_total', '')::numeric, 0)
          - COALESCE((${p}billing_snapshot->'gst_components'->'platform'->>'gst')::numeric, 0)
          - COALESCE((${p}billing_snapshot->'gst_components'->'subscription'->>'gst')::numeric, 0),
          0
        )
      END
  )`);
}

function gstComponentCollectedExpr(alias: string, key: string) {
  const p = alias ? `${alias}.` : "";
  return `(
    COALESCE((${p}billing_snapshot->'gst_components'->'${key}'->>'original')::numeric, 0)
    + COALESCE((${p}billing_snapshot->'gst_components'->'${key}'->>'gst')::numeric, 0)
  )`;
}

/** What GatiMitra collected on the customer bill: platform / convenience / Plus / surge (incl. GST). */
function platformChargesSql(alias = "") {
  return getSql().unsafe(`(
    ${gstComponentCollectedExpr(alias, "platform")}
    + ${gstComponentCollectedExpr(alias, "convenience")}
    + ${gstComponentCollectedExpr(alias, "small_order")}
    + ${gstComponentCollectedExpr(alias, "subscription")}
    + ${gstComponentCollectedExpr(alias, "surge")}
  )`);
}

function platformFeeSql(alias = "") {
  const p = alias ? `${alias}.` : "";
  return getSql().unsafe(`GREATEST(
    COALESCE(NULLIF(${p}billing_snapshot->>'platform_fee', '')::numeric, 0),
    COALESCE((${p}billing_snapshot->'gst_components'->'platform'->>'original')::numeric, 0)
  )`);
}

function subscriptionSql(alias = "") {
  const p = alias ? `${alias}.` : "";
  const charges = chargesArraySql(alias);
  return getSql().unsafe(`GREATEST(
    COALESCE((${p}billing_snapshot->'gst_components'->'subscription'->>'original')::numeric, 0),
    COALESCE((
      SELECT SUM((c->>'amount')::numeric)
      FROM jsonb_array_elements(${charges}) c
      WHERE LOWER(COALESCE(c->'meta'->>'source', '')) = 'customer_subscription_checkout'
         OR LOWER(COALESCE(c->>'label', '')) LIKE '%plus%'
         OR LOWER(COALESCE(c->>'label', '')) LIKE '%subscription%'
    ), 0)
  )`);
}

function tipSql(alias = "") {
  const p = alias ? `${alias}.` : "";
  const charges = chargesArraySql(alias);
  return getSql().unsafe(`GREATEST(
    COALESCE(${p}tip_amount, 0),
    COALESCE(NULLIF(${p}billing_snapshot->>'tip_amount', '')::numeric, 0),
    COALESCE(NULLIF(${p}billing_snapshot->'checkout_metadata'->>'tipAmount', '')::numeric, 0),
    COALESCE((
      SELECT SUM((c->>'amount')::numeric)
      FROM jsonb_array_elements(${charges}) c
      WHERE LOWER(COALESCE(c->'meta'->>'source', '')) = 'checkout_tipamount'
         OR (
           LOWER(COALESCE(c->>'label', '')) LIKE '%tip%'
           AND LOWER(COALESCE(c->>'label', '')) NOT LIKE '%waiting%'
         )
    ), 0)
  )`);
}

function donationSql(alias = "") {
  const p = alias ? `${alias}.` : "";
  const charges = chargesArraySql(alias);
  return getSql().unsafe(`GREATEST(
    COALESCE(${p}donation_amount, 0),
    COALESCE(NULLIF(${p}billing_snapshot->>'donation_amount', '')::numeric, 0),
    COALESCE(NULLIF(${p}billing_snapshot->'checkout_metadata'->>'donationAmount', '')::numeric, 0),
    COALESCE((
      SELECT SUM((c->>'amount')::numeric)
      FROM jsonb_array_elements(${charges}) c
      WHERE LOWER(COALESCE(c->'meta'->>'source', '')) = 'checkout_donationamount'
         OR LOWER(COALESCE(c->>'label', '')) LIKE '%feeding%'
         OR LOWER(COALESCE(c->>'label', '')) LIKE '%donation%'
    ), 0)
  )`);
}

function riderEarnSql(alias = "") {
  const p = alias ? `${alias}.` : "";
  const charges = chargesArraySql(alias);
  return getSql().unsafe(`GREATEST(
    0,
    COALESCE(
      NULLIF((${p}billing_snapshot->'rider_payout_snapshot'->>'totalEarning')::numeric, 0),
      COALESCE(${p}rider_earning, 0)
    )
    - COALESCE((
        SELECT SUM((c->>'amount')::numeric)
        FROM jsonb_array_elements(${charges}) c
        WHERE LOWER(COALESCE(c->>'label', '')) LIKE '%waiting%'
      ), 0)
  )`);
}

function gatiCashSql(alias = "") {
  const p = alias ? `${alias}.` : "";
  return getSql().unsafe(`GREATEST(
    COALESCE(NULLIF(${p}billing_snapshot->'checkoutAdjustments'->>'gatiCashApplied', '')::numeric, 0),
    COALESCE(NULLIF(${p}billing_snapshot->'checkout_adjustments'->>'gatiCashApplied', '')::numeric, 0),
    COALESCE(NULLIF(${p}billing_snapshot->>'gatiCashApplied', '')::numeric, 0),
    COALESCE(NULLIF(${p}billing_snapshot->>'gati_cash_applied', '')::numeric, 0),
    COALESCE(NULLIF(${p}billing_snapshot->>'gatiCashAmount', '')::numeric, 0),
    COALESCE(NULLIF(${p}billing_snapshot->>'gati_cash_amount', '')::numeric, 0),
    COALESCE(NULLIF(${p}billing_snapshot->'checkout_metadata'->>'gatiCashAmount', '')::numeric, 0),
    COALESCE(NULLIF(${p}billing_snapshot->'checkoutMetadata'->>'gatiCashAmount', '')::numeric, 0)
  )`);
}

function packagingExpr(alias = "", osbAlias = "") {
  const p = alias ? `${alias}.` : "";
  const charges = chargesArraySql(alias);
  const osbBit = osbAlias ? `COALESCE(${osbAlias}.packaging_charge, 0),` : "";
  return `GREATEST(
    ${osbBit}
    COALESCE((${p}billing_snapshot->'gst_components'->'packaging'->>'original')::numeric, 0),
    COALESCE(NULLIF(${p}billing_snapshot->>'packaging_charges', '')::numeric, 0),
    COALESCE(NULLIF(${p}billing_snapshot->>'packagingCharges', '')::numeric, 0),
    COALESCE(NULLIF(${p}billing_snapshot->>'packaging_fee', '')::numeric, 0),
    COALESCE(NULLIF(${p}billing_snapshot->>'packagingFee', '')::numeric, 0),
    COALESCE((
      SELECT SUM((c->>'amount')::numeric)
      FROM jsonb_array_elements(${charges}) c
      WHERE LOWER(COALESCE(c->>'label', '')) LIKE '%packag%'
    ), 0)
  )`;
}

function packagingSql(alias = "", osbAlias = "") {
  return getSql().unsafe(packagingExpr(alias, osbAlias));
}

/**
 * Merchant CTM frozen on the order (items + packaging after store offers).
 * Do not use orders_core.item_total — that is the GST-inclusive customer line.
 */
function ctmExpr(alias = "", osbAlias = "", foodAlias = "") {
  const p = alias ? `${alias}.` : "";
  const pack = packagingExpr(alias, osbAlias);
  const gross = osbAlias
    ? `NULLIF(${osbAlias}.merchant_gross, 0)`
    : `NULLIF((SELECT osb.merchant_gross FROM order_settlement_breakdown osb WHERE osb.order_id = ${p}id LIMIT 1), 0)`;
  const food = foodAlias
    ? `NULLIF(${foodAlias}.food_items_total_value, 0)`
    : `NULLIF((SELECT f.food_items_total_value FROM orders_food f WHERE f.order_id = ${p}id LIMIT 1), 0)`;
  return `COALESCE(
    NULLIF(${p}total_ctm, 0),
    ${gross},
    ${food},
    COALESCE(NULLIF(${p}item_total, 0), NULLIF((${p}billing_snapshot->'gst_components'->'items'->>'original')::numeric, 0), 0) + ${pack}
  )`;
}

function ctmSql(alias = "", osbAlias = "", foodAlias = "") {
  return getSql().unsafe(ctmExpr(alias, osbAlias, foodAlias));
}

function commissionSql(alias = "") {
  const p = alias ? `${alias}.` : "";
  return getSql().unsafe(`COALESCE(${p}commission_amount, 0)`);
}

function deltaPct(current: number, previous: number): number | null {
  if (!previous) return current ? 100 : null;
  return ((current - previous) / previous) * 100;
}

export async function fetchOverview(periodRaw: string | null) {
  const sql = getSql();
  const { period, from, to, previousFrom } = boundsFromSearch(periodRaw);

  const [current, previous, byType, trend, fleet, ticketsOpen, money, rev, penaltyRow] = await Promise.all([
    safeQuery(
      "overview-current",
      () =>
        sql<{
          orders: number;
          delivered: number;
          cancelled: number;
          live: number;
          gmv: number;
          commission: number;
          new_customers: number;
        }[]>`
          SELECT
            (SELECT COUNT(*)::int FROM orders_core WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz) AS orders,
            (SELECT COUNT(*)::int FROM orders_core WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz AND status::text = 'delivered') AS delivered,
            (SELECT COUNT(*)::int FROM orders_core WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz AND status::text = 'cancelled') AS cancelled,
            (SELECT COUNT(*)::int FROM orders_core WHERE status::text IN ('assigned','accepted','reached_store','picked_up','in_transit','created','dispatch_ready','dispatched','bill_ready','payment_done','pymt_assign_rx')) AS live,
            (SELECT COALESCE(SUM(${payableSql()}), 0)::float FROM orders_core WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz AND status::text = 'delivered') AS gmv,
            (SELECT COALESCE(SUM(${commissionSql()} + ${platformFeeSql()}), 0)::float FROM orders_core WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz AND status::text = 'delivered') AS commission,
            (SELECT COUNT(*)::int FROM customers WHERE deleted_at IS NULL AND created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz) AS new_customers
        `,
      []
    ),
    safeQuery(
      "overview-previous",
      () =>
        sql<{ orders: number; gmv: number; new_customers: number }[]>`
          SELECT
            (SELECT COUNT(*)::int FROM orders_core WHERE created_at >= ${previousFrom}::timestamptz AND created_at < ${from}::timestamptz) AS orders,
            (SELECT COALESCE(SUM(${payableSql()}), 0)::float FROM orders_core WHERE created_at >= ${previousFrom}::timestamptz AND created_at < ${from}::timestamptz AND status::text = 'delivered') AS gmv,
            (SELECT COUNT(*)::int FROM customers WHERE deleted_at IS NULL AND created_at >= ${previousFrom}::timestamptz AND created_at < ${from}::timestamptz) AS new_customers
        `,
      []
    ),
    safeQuery(
      "overview-by-type",
      () =>
        sql<{ order_type: string; orders: number; delivered: number; gmv: number }[]>`
          SELECT
            order_type::text AS order_type,
            COUNT(*)::int AS orders,
            COUNT(*) FILTER (WHERE status::text = 'delivered')::int AS delivered,
            COALESCE(SUM(${payableSql()}) FILTER (WHERE status::text = 'delivered'), 0)::float AS gmv
          FROM orders_core
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
          GROUP BY order_type
          ORDER BY gmv DESC
        `,
      []
    ),
    safeQuery(
      "overview-trend",
      () =>
        sql<{ day: string; orders: number; gmv: number }[]>`
          SELECT
            to_char(date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS day,
            COUNT(*)::int AS orders,
            COALESCE(SUM(${payableSql()}) FILTER (WHERE status::text = 'delivered'), 0)::float AS gmv
          FROM orders_core
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
          GROUP BY 1
          ORDER BY 1
        `,
      []
    ),
    safeQuery(
      "overview-fleet",
      () =>
        sql<{
          customers: number;
          riders: number;
          riders_online: number;
          stores: number;
          stores_live: number;
        }[]>`
          SELECT
            (SELECT COUNT(*)::int FROM customers WHERE deleted_at IS NULL) AS customers,
            (SELECT COUNT(*)::int FROM riders WHERE deleted_at IS NULL) AS riders,
            (SELECT COUNT(*)::int
             FROM riders r
             WHERE r.deleted_at IS NULL
               AND (
                 SELECT UPPER(dl.status::text)
                 FROM duty_logs dl
                 WHERE dl.rider_id = r.id
                 ORDER BY dl.timestamp DESC, dl.id DESC
                 LIMIT 1
               ) = 'ON'
            ) AS riders_online,
            (SELECT COUNT(*)::int FROM merchant_stores WHERE deleted_at IS NULL) AS stores,
            (SELECT COUNT(*)::int FROM merchant_stores WHERE deleted_at IS NULL AND COALESCE(is_active, false) = true) AS stores_live
        `,
      []
    ),
    safeQuery(
      "overview-tickets",
      () =>
        sql<{ open_tickets: number }[]>`
          SELECT COUNT(*)::int AS open_tickets
          FROM unified_tickets
          WHERE status::text IN ('OPEN','IN_PROGRESS','PENDING','ASSIGNED','REOPENED')
        `,
      [{ open_tickets: 0 }]
    ),
    safeQuery(
      "overview-money",
      () =>
        sql<{
          gst: number;
          gst_bills: number;
          tips: number;
          donations: number;
          wallet_used: number;
          wallet_float: number;
          refunds: number;
          rider_earning: number;
          platform_fee: number;
        }[]>`
          SELECT
            COALESCE(SUM(${gstRemitSql()}) FILTER (WHERE status::text = 'delivered'), 0)::float AS gst,
            COALESCE(SUM(${gstSql()}) FILTER (WHERE status::text = 'delivered'), 0)::float AS gst_bills,
            COALESCE(SUM(COALESCE(tip_amount, 0)) FILTER (WHERE status::text = 'delivered'), 0)::float AS tips,
            COALESCE(SUM(COALESCE(donation_amount, 0)) FILTER (WHERE status::text = 'delivered'), 0)::float AS donations,
            COALESCE(SUM(${gatiCashSql()}) FILTER (WHERE status::text = 'delivered'), 0)::float AS wallet_used,
            COALESCE((SELECT SUM(COALESCE(current_balance, 0)) FROM customer_wallet), 0)::float AS wallet_float,
            COALESCE((
              SELECT COALESCE(SUM(refund_amount), 0)::float FROM order_refunds
              WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
            ), 0)::float AS refunds,
            COALESCE(SUM(GREATEST(
              0,
              COALESCE(
                NULLIF((billing_snapshot->'rider_payout_snapshot'->>'totalEarning')::numeric, 0),
                COALESCE(rider_earning, 0)
              )
            )) FILTER (WHERE status::text = 'delivered'), 0)::float AS rider_earning,
            COALESCE(SUM(${platformFeeSql()} + COALESCE((billing_snapshot->'gst_components'->'subscription'->>'original')::numeric, 0)) FILTER (WHERE status::text = 'delivered'), 0)::float AS platform_fee
          FROM orders_core
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
        `,
      []
    ),
    safeQuery(
      "overview-rev",
      () =>
        sql<{
          charges: number;
          charges_prev: number;
          commission_take: number;
          onboarding: number;
          onboarding_prev: number;
        }[]>`
          SELECT
            COALESCE((
              SELECT SUM(${platformChargesSql()})
              FROM orders_core
              WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
                AND status::text = 'delivered'
            ), 0)::float AS charges,
            COALESCE((
              SELECT SUM(${platformChargesSql()})
              FROM orders_core
              WHERE created_at >= ${previousFrom}::timestamptz AND created_at < ${from}::timestamptz
                AND status::text = 'delivered'
            ), 0)::float AS charges_prev,
            COALESCE((
              SELECT SUM(COALESCE(commission_amount, 0))
              FROM orders_core
              WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
                AND status::text = 'delivered'
            ), 0)::float AS commission_take,
            (
              COALESCE((
                SELECT SUM(amount) FROM onboarding_payments
                WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
                  AND status::text IN ('completed', 'captured', 'paid', 'success')
              ), 0)
              + COALESCE((
                SELECT SUM(amount_paise)::numeric / 100 FROM merchant_onboarding_payments
                WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
                  AND status::text IN ('completed', 'captured', 'paid', 'success')
              ), 0)
            )::float AS onboarding,
            (
              COALESCE((
                SELECT SUM(amount) FROM onboarding_payments
                WHERE created_at >= ${previousFrom}::timestamptz AND created_at < ${from}::timestamptz
                  AND status::text IN ('completed', 'captured', 'paid', 'success')
              ), 0)
              + COALESCE((
                SELECT SUM(amount_paise)::numeric / 100 FROM merchant_onboarding_payments
                WHERE created_at >= ${previousFrom}::timestamptz AND created_at < ${from}::timestamptz
                  AND status::text IN ('completed', 'captured', 'paid', 'success')
              ), 0)
            )::float AS onboarding_prev
        `,
      []
    ),
    safeQuery(
      "overview-penalties",
      () =>
        sql<{ penalties: number }[]>`
          SELECT (
            COALESCE((
              SELECT SUM(amount) FROM rider_penalties
              WHERE imposed_at >= ${from}::timestamptz AND imposed_at < ${to}::timestamptz
                AND lower(status::text) IN ('paid', 'collected', 'deducted')
            ), 0)
            + COALESCE((
              SELECT SUM(amount) FROM merchant_penalties
              WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
                AND lower(status::text) IN ('paid', 'collected', 'deducted', 'applied')
            ), 0)
          )::float AS penalties
        `,
      [{ penalties: 0 }]
    ),
  ]);

  const cur = current[0] ?? {
    orders: 0,
    delivered: 0,
    cancelled: 0,
    live: 0,
    gmv: 0,
    commission: 0,
    new_customers: 0,
  };
  const prev = previous[0] ?? { orders: 0, gmv: 0, new_customers: 0 };
  const fleetRow = fleet[0] ?? {
    customers: 0,
    riders: 0,
    riders_online: 0,
    stores: 0,
    stores_live: 0,
  };

  const charges = num(rev[0]?.charges);
  const commissionTake = num(rev[0]?.commission_take);
  const onboarding = num(rev[0]?.onboarding);
  const penalties = num(penaltyRow[0]?.penalties);
  const platformRevenue = charges + commissionTake + onboarding + penalties;
  const platformRevenuePrev =
    num(rev[0]?.charges_prev) + num(rev[0]?.onboarding_prev);

  return {
    period,
    range: { from, to },
    kpis: {
      gmv: num(cur.gmv),
      gmvDelta: deltaPct(num(cur.gmv), num(prev.gmv)),
      orders: num(cur.orders),
      ordersDelta: deltaPct(num(cur.orders), num(prev.orders)),
      delivered: num(cur.delivered),
      cancelled: num(cur.cancelled),
      live: num(cur.live),
      commission: num(cur.commission),
      newCustomers: num(cur.new_customers),
      newCustomersDelta: deltaPct(num(cur.new_customers), num(prev.new_customers)),
      customers: num(fleetRow.customers),
      riders: num(fleetRow.riders),
      ridersOnline: num(fleetRow.riders_online),
      stores: num(fleetRow.stores),
      storesLive: num(fleetRow.stores_live),
      openTickets: num(ticketsOpen[0]?.open_tickets),
      completionRate: num(cur.orders) ? (num(cur.delivered) / num(cur.orders)) * 100 : 0,
      gstCollected: num(money[0]?.gst),
      gstOnBills: num(money[0]?.gst_bills),
      riderTips: num(money[0]?.tips),
      riderTipsLifetime: num(money[0]?.tips),
      feedingIndia: num(money[0]?.donations),
      feedingIndiaLifetime: num(money[0]?.donations),
      wallet: num(money[0]?.wallet_float),
      walletUsed: num(money[0]?.wallet_used),
      refunds: num(money[0]?.refunds),
      riderEarning: num(money[0]?.rider_earning),
      platformFee: num(money[0]?.platform_fee),
      platformRevenue,
      platformRevenueDelta: deltaPct(platformRevenue, platformRevenuePrev),
      platformRevenueCharges: charges + commissionTake,
      platformRevenueOnboarding: onboarding,
      platformRevenuePenalties: penalties,
    },
    byType: byType.map((r) => ({
      type: str(r.order_type),
      orders: num(r.orders),
      delivered: num(r.delivered),
      gmv: num(r.gmv),
    })),
    trend: trend.map((r) => ({
      day: str(r.day),
      orders: num(r.orders),
      gmv: num(r.gmv),
    })),
  };
}

export async function fetchPerformance(periodRaw: string | null) {
  const sql = getSql();
  const { period, from, to } = boundsFromSearch(periodRaw);

  const [byType, byStatus, eta, grocery] = await Promise.all([
    safeQuery(
      "perf-by-type",
      () =>
        sql<
          {
            order_type: string;
            orders: number;
            delivered: number;
            cancelled: number;
            failed: number;
            avg_minutes: number;
            gmv: number;
          }[]
        >`
          SELECT
            order_type::text AS order_type,
            COUNT(*)::int AS orders,
            COUNT(*) FILTER (WHERE status::text = 'delivered')::int AS delivered,
            COUNT(*) FILTER (WHERE status::text = 'cancelled')::int AS cancelled,
            COUNT(*) FILTER (WHERE status::text IN ('failed','rejected'))::int AS failed,
            COALESCE(AVG(EXTRACT(EPOCH FROM (actual_delivery_time - created_at)) / 60)
              FILTER (WHERE actual_delivery_time IS NOT NULL AND status::text = 'delivered'), 0)::float AS avg_minutes,
            COALESCE(SUM(${payableSql()}) FILTER (WHERE status::text = 'delivered'), 0)::float AS gmv
          FROM orders_core
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
          GROUP BY order_type
          ORDER BY orders DESC
        `,
      []
    ),
    safeQuery(
      "perf-status",
      () =>
        sql<{ status: string; orders: number }[]>`
          SELECT status::text AS status, COUNT(*)::int AS orders
          FROM orders_core
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
          GROUP BY status
          ORDER BY orders DESC
        `,
      []
    ),
    safeQuery(
      "perf-eta",
      () =>
        sql<{ breached: number; total_delivered: number }[]>`
          SELECT
            COUNT(*) FILTER (WHERE eta_breached_at IS NOT NULL)::int AS breached,
            COUNT(*) FILTER (WHERE status::text = 'delivered')::int AS total_delivered
          FROM orders_core
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
        `,
      []
    ),
    safeQuery(
      "perf-grocery",
      () =>
        sql<{ store_type: string; orders: number; gmv: number }[]>`
          SELECT
            COALESCE(NULLIF(ms.store_type::text, ''), 'unspecified') AS store_type,
            COUNT(*)::int AS orders,
            COALESCE(SUM(${payableSql("oc")}) FILTER (WHERE oc.status::text = 'delivered'), 0)::float AS gmv
          FROM orders_core oc
          LEFT JOIN merchant_stores ms ON ms.id = oc.merchant_store_id
          WHERE oc.created_at >= ${from}::timestamptz AND oc.created_at < ${to}::timestamptz
            AND oc.order_type::text = 'food'
          GROUP BY 1
          ORDER BY orders DESC
          LIMIT 12
        `,
      []
    ),
  ]);

  return {
    period,
    byType: byType.map((r) => ({
      type: str(r.order_type),
      orders: num(r.orders),
      delivered: num(r.delivered),
      cancelled: num(r.cancelled),
      failed: num(r.failed),
      avgMinutes: num(r.avg_minutes),
      gmv: num(r.gmv),
      completionRate: num(r.orders) ? (num(r.delivered) / num(r.orders)) * 100 : 0,
      cancelRate: num(r.orders) ? (num(r.cancelled) / num(r.orders)) * 100 : 0,
    })),
    byStatus: byStatus.map((r) => ({ status: str(r.status), orders: num(r.orders) })),
    eta: {
      breached: num(eta[0]?.breached),
      delivered: num(eta[0]?.total_delivered),
    },
    storeTypes: grocery.map((r) => ({
      storeType: str(r.store_type),
      orders: num(r.orders),
      gmv: num(r.gmv),
    })),
  };
}

export async function fetchAnalytics(periodRaw: string | null) {
  const sql = getSql();
  const { period, from, to } = boundsFromSearch(periodRaw);

  const [hourly, topStores, topCities, paymentMix] = await Promise.all([
    safeQuery(
      "analytics-hourly",
      () =>
        sql<{ hour: number; orders: number }[]>`
          SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata')::int AS hour,
                 COUNT(*)::int AS orders
          FROM orders_core
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
          GROUP BY 1
          ORDER BY 1
        `,
      []
    ),
    safeQuery(
      "analytics-stores",
      () =>
        sql<{ store_name: string; orders: number; gmv: number }[]>`
          SELECT
            COALESCE(ms.store_name, 'Unknown store') AS store_name,
            COUNT(*)::int AS orders,
            COALESCE(SUM(${payableSql("oc")}) FILTER (WHERE oc.status::text = 'delivered'), 0)::float AS gmv
          FROM orders_core oc
          JOIN merchant_stores ms ON ms.id = oc.merchant_store_id
          WHERE oc.created_at >= ${from}::timestamptz AND oc.created_at < ${to}::timestamptz
          GROUP BY ms.store_name
          ORDER BY gmv DESC
          LIMIT 10
        `,
      []
    ),
    safeQuery(
      "analytics-cities",
      () =>
        sql<{ city: string; riders: number }[]>`
          SELECT COALESCE(NULLIF(city, ''), 'Unknown') AS city, COUNT(*)::int AS riders
          FROM riders
          WHERE deleted_at IS NULL
          GROUP BY 1
          ORDER BY riders DESC
          LIMIT 10
        `,
      []
    ),
    safeQuery(
      "analytics-pay",
      () =>
        sql<{ method: string; orders: number; amount: number }[]>`
          SELECT
            COALESCE(payment_method::text, 'unknown') AS method,
            COUNT(*)::int AS orders,
            COALESCE(SUM(${payableSql()}), 0)::float AS amount
          FROM orders_core
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
          GROUP BY 1
          ORDER BY amount DESC
        `,
      []
    ),
  ]);

  return {
    period,
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      orders: num(hourly.find((r) => Number(r.hour) === hour)?.orders),
    })),
    topStores: topStores.map((r) => ({
      name: str(r.store_name),
      orders: num(r.orders),
      gmv: num(r.gmv),
    })),
    riderCities: topCities.map((r) => ({ city: str(r.city), riders: num(r.riders) })),
    paymentMix: paymentMix.map((r) => ({
      method: str(r.method),
      orders: num(r.orders),
      amount: num(r.amount),
    })),
  };
}

export async function fetchPayments(periodRaw: string | null) {
  const sql = getSql();
  const { period, from, to } = boundsFromSearch(periodRaw);

  const [mix, status, onboarding, payouts, withdrawals, waterflow, settlement, refunds, byType, onboardRows, payoutRows, withdrawalRows] =
    await Promise.all([
    safeQuery(
      "pay-mix",
      () =>
        sql<{ method: string; status: string; orders: number; amount: number }[]>`
          SELECT
            COALESCE(payment_method::text, 'unknown') AS method,
            COALESCE(payment_status::text, 'unknown') AS status,
            COUNT(*)::int AS orders,
            COALESCE(SUM(${payableSql()}), 0)::float AS amount
          FROM orders_core
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
          GROUP BY 1, 2
          ORDER BY amount DESC
        `,
      []
    ),
    safeQuery(
      "pay-status",
      () =>
        sql<{ status: string; orders: number; amount: number }[]>`
          SELECT
            COALESCE(payment_status::text, 'unknown') AS status,
            COUNT(*)::int AS orders,
            COALESCE(SUM(${payableSql()}), 0)::float AS amount
          FROM orders_core
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
          GROUP BY 1
          ORDER BY amount DESC
        `,
      []
    ),
    safeQuery(
      "pay-onboarding",
      () =>
        sql<{ kind: string; status: string; count: number; amount: number }[]>`
          SELECT kind, status, COUNT(*)::int AS count, SUM(amount)::float AS amount
          FROM (
            SELECT
              'rider'::text AS kind,
              status::text AS status,
              COALESCE(amount, 0) AS amount
            FROM onboarding_payments
            WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
            UNION ALL
            SELECT
              'merchant'::text AS kind,
              status::text AS status,
              COALESCE(amount_paise, 0)::numeric / 100.0 AS amount
            FROM merchant_onboarding_payments
            WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
          ) fees
          GROUP BY kind, status
          ORDER BY kind, amount DESC
        `,
      []
    ),
    safeQuery(
      "pay-payouts",
      () =>
        sql<{ status: string; count: number; amount: number }[]>`
          SELECT
            status::text AS status,
            COUNT(*)::int AS count,
            COALESCE(SUM(COALESCE(net_payout_amount, amount)), 0)::float AS amount
          FROM merchant_payout_requests
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
          GROUP BY 1
        `,
      []
    ),
    safeQuery(
      "pay-withdrawals",
      () =>
        sql<{ status: string; count: number; amount: number }[]>`
          SELECT
            status::text AS status,
            COUNT(*)::int AS count,
            COALESCE(SUM(amount), 0)::float AS amount
          FROM withdrawal_requests
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
          GROUP BY 1
        `,
      []
    ),
    safeQuery(
      "pay-waterflow",
      () =>
        sql<
          {
            orders: number;
            gmv: number;
            tips: number;
            donations: number;
            commission: number;
            rider_earning: number;
            gst: number;
            gst_remit: number;
            platform_fee: number;
            wallet: number;
            item_total: number;
            gateway: number;
            cash: number;
            online: number;
          }[]
        >`
          SELECT
            COUNT(*)::int AS orders,
            COALESCE(SUM(${payableSql()}), 0)::float AS gmv,
            COALESCE(SUM(${tipSql()}), 0)::float AS tips,
            COALESCE(SUM(${donationSql()}), 0)::float AS donations,
            COALESCE(SUM(COALESCE(commission_amount, 0)), 0)::float AS commission,
            COALESCE(SUM(${riderEarnSql()}), 0)::float AS rider_earning,
            COALESCE(SUM(${gstSql()}), 0)::float AS gst,
            COALESCE(SUM(${gstRemitSql()}), 0)::float AS gst_remit,
            COALESCE(SUM(${platformFeeSql()} + ${subscriptionSql()}), 0)::float AS platform_fee,
            COALESCE(SUM(${gatiCashSql()}), 0)::float AS wallet,
            COALESCE(SUM(COALESCE(item_total, 0)), 0)::float AS item_total,
            COALESCE(SUM(${payableSql()}) FILTER (
              WHERE payment_method::text IN ('online','upi','card','netbanking')
            ), 0)::float AS online,
            COALESCE(SUM(${payableSql()}) FILTER (
              WHERE payment_method::text IN ('cash','cod')
            ), 0)::float AS cash,
            COALESCE(SUM(${payableSql()}) FILTER (
              WHERE payment_method::text IN ('wallet')
            ), 0)::float AS gateway
          FROM orders_core
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
            AND status::text = 'delivered'
        `,
      []
    ),
    safeQuery(
      "pay-settlement",
      () =>
        sql<{ gst: number; tds: number; platform_commission: number; merchant_net: number }[]>`
          SELECT
            COALESCE(SUM(COALESCE(osb.gst_amount, 0)), 0)::float AS gst,
            COALESCE(SUM(COALESCE(osb.tds_amount, 0)), 0)::float AS tds,
            COALESCE(SUM(COALESCE(osb.commission_amount, 0)), 0)::float AS platform_commission,
            COALESCE(SUM(COALESCE(osb.merchant_net, 0)), 0)::float AS merchant_net
          FROM order_settlement_breakdown osb
          JOIN orders_core oc ON oc.id = osb.order_id
          WHERE oc.created_at >= ${from}::timestamptz AND oc.created_at < ${to}::timestamptz
            AND oc.status::text = 'delivered'
        `,
      []
    ),
    safeQuery(
      "pay-refunds",
      () =>
        sql<{ count: number; amount: number }[]>`
          SELECT COUNT(*)::int AS count, COALESCE(SUM(refund_amount), 0)::float AS amount
          FROM order_refunds
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
        `,
      [{ count: 0, amount: 0 }]
    ),
    safeQuery(
      "pay-by-type",
      () =>
        sql<{ order_type: string; gmv: number; orders: number; gst: number; tips: number; donations: number }[]>`
          SELECT
            order_type::text AS order_type,
            COUNT(*)::int AS orders,
            COALESCE(SUM(${payableSql()}), 0)::float AS gmv,
            COALESCE(SUM(${gstRemitSql()}), 0)::float AS gst,
            COALESCE(SUM(${tipSql()}), 0)::float AS tips,
            COALESCE(SUM(${donationSql()}), 0)::float AS donations
          FROM orders_core
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
            AND status::text = 'delivered'
          GROUP BY order_type
          ORDER BY gmv DESC
        `,
      []
    ),
    safeQuery(
      "pay-onboarding-rows",
      () =>
        sql<
          {
            kind: string;
            name: string;
            status: string;
            amount: number;
            created_at: Date | string;
          }[]
        >`
          SELECT kind, name, status, amount::float AS amount, created_at FROM (
            SELECT
              'rider'::text AS kind,
              COALESCE(NULLIF(r.name, ''), r.mobile, 'Rider') AS name,
              op.status::text AS status,
              COALESCE(op.amount, 0) AS amount,
              op.created_at
            FROM onboarding_payments op
            LEFT JOIN riders r ON r.id = op.rider_id
            UNION ALL
            SELECT
              'merchant'::text AS kind,
              COALESCE(NULLIF(ms.store_name, ''), mop.payer_name, 'Merchant') AS name,
              mop.status::text AS status,
              (COALESCE(mop.amount_paise, 0)::numeric / 100.0) AS amount,
              mop.created_at
            FROM merchant_onboarding_payments mop
            LEFT JOIN merchant_stores ms ON ms.id = mop.merchant_store_id
          ) fees
          ORDER BY created_at DESC
          LIMIT 50
        `,
      []
    ),
    safeQuery(
      "pay-payout-rows",
      () =>
        sql<
          {
            store: string;
            status: string;
            amount: number;
            net: number;
            utr: string | null;
            created_at: Date | string;
          }[]
        >`
          SELECT
            COALESCE(NULLIF(ms.store_name, ''), 'Store #' || mw.merchant_store_id::text) AS store,
            mpr.status::text AS status,
            COALESCE(mpr.amount, 0)::float AS amount,
            COALESCE(mpr.net_payout_amount, mpr.amount, 0)::float AS net,
            mpr.utr_reference AS utr,
            mpr.created_at
          FROM merchant_payout_requests mpr
          LEFT JOIN merchant_wallet mw ON mw.id = mpr.wallet_id
          LEFT JOIN merchant_stores ms ON ms.id = mw.merchant_store_id
          ORDER BY mpr.created_at DESC
          LIMIT 50
        `,
      []
    ),
    safeQuery(
      "pay-withdrawal-rows",
      () =>
        sql<
          {
            rider: string;
            status: string;
            amount: number;
            created_at: Date | string;
          }[]
        >`
          SELECT
            COALESCE(NULLIF(r.name, ''), r.mobile, 'Rider #' || wr.rider_id::text) AS rider,
            wr.status::text AS status,
            COALESCE(wr.amount, 0)::float AS amount,
            wr.created_at
          FROM withdrawal_requests wr
          LEFT JOIN riders r ON r.id = wr.rider_id
          ORDER BY wr.created_at DESC
          LIMIT 50
        `,
      []
    ),
  ]);

  const collected = status
    .filter((r) => ["completed", "paid", "success"].includes(str(r.status).toLowerCase()))
    .reduce((sum, r) => sum + num(r.amount), 0);
  const failed = status
    .filter((r) => ["failed", "cancelled"].includes(str(r.status).toLowerCase()))
    .reduce((sum, r) => sum + num(r.amount), 0);

  const w = waterflow[0];
  const s = settlement[0];
  const walletFromMethod = num(w?.gateway);
  const gatiCash = num(w?.wallet);
  const walletTotal = Math.max(walletFromMethod, gatiCash);
  const realCollected = Math.max(0, num(w?.gmv) - gatiCash);

  return {
    period,
    collected,
    failed,
    waterflow: {
      orders: num(w?.orders),
      gmv: num(w?.gmv),
      itemTotal: num(w?.item_total),
      realAmount: realCollected,
      walletAmount: walletTotal,
      online: num(w?.online),
      cash: num(w?.cash),
      gstCustomer: num(w?.gst),
      gstPlatform: num(w?.gst_remit) || num(s?.gst),
      tds: num(s?.tds),
      platformFee: num(w?.platform_fee),
      commission: num(w?.commission) || num(s?.platform_commission),
      merchantNet: num(s?.merchant_net),
      riderEarning: num(w?.rider_earning),
      riderTips: num(w?.tips),
      feedingIndia: num(w?.donations),
      refunds: num(refunds[0]?.amount),
      refundCount: num(refunds[0]?.count),
      netAfterRefunds: num(w?.gmv) - num(refunds[0]?.amount),
    },
    byService: byType.map((r) => ({
      type: str(r.order_type),
      orders: num(r.orders),
      gmv: num(r.gmv),
      gst: num(r.gst),
      tips: num(r.tips),
      donations: num(r.donations),
    })),
    mix: mix.map((r) => ({
      method: str(r.method),
      status: str(r.status),
      orders: num(r.orders),
      amount: num(r.amount),
    })),
    status: status.map((r) => ({
      status: str(r.status),
      orders: num(r.orders),
      amount: num(r.amount),
    })),
    onboarding: onboarding.map((r) => ({
      kind: str(r.kind) || "rider",
      status: str(r.status),
      count: num(r.count),
      amount: num(r.amount),
    })),
    onboardingRecords: onboardRows.map((r) => ({
      kind: str(r.kind),
      name: str(r.name) || "—",
      status: str(r.status),
      amount: num(r.amount),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : str(r.created_at),
    })),
    payouts: payouts.map((r) => ({
      status: str(r.status),
      count: num(r.count),
      amount: num(r.amount),
    })),
    payoutRecords: payoutRows.map((r) => ({
      store: str(r.store) || "—",
      status: str(r.status),
      amount: num(r.amount),
      net: num(r.net),
      utr: str(r.utr) || "—",
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : str(r.created_at),
    })),
    withdrawals: withdrawals.map((r) => ({
      status: str(r.status),
      count: num(r.count),
      amount: num(r.amount),
    })),
    withdrawalRecords: withdrawalRows.map((r) => ({
      rider: str(r.rider) || "—",
      status: str(r.status),
      amount: num(r.amount),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : str(r.created_at),
    })),
  };
}

export async function fetchOrders(periodRaw: string | null) {
  const sql = getSql();
  const { period, from, to, previousFrom } = boundsFromSearch(periodRaw);

  const [kpis, prevKpis, summary, byStatus, byType, trend, hourly, paymentMix, topStores, extras, recent] =
    await Promise.all([
      safeQuery(
        "orders-kpis",
        () =>
          sql<{
            orders: number;
            delivered: number;
            cancelled: number;
            live: number;
            gmv: number;
            tips: number;
            gst: number;
            donations: number;
          }[]>`
            SELECT
              (SELECT COUNT(*)::int FROM orders_core
                WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz) AS orders,
              (SELECT COUNT(*)::int FROM orders_core
                WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
                  AND status::text = 'delivered') AS delivered,
              (SELECT COUNT(*)::int FROM orders_core
                WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
                  AND status::text = 'cancelled') AS cancelled,
              (SELECT COUNT(*)::int FROM orders_core
                WHERE status::text IN (
                  'assigned','accepted','reached_store','picked_up','in_transit','created',
                  'dispatch_ready','dispatched','bill_ready','payment_done','pymt_assign_rx'
                )) AS live,
              (SELECT COALESCE(SUM(${payableSql()}), 0)::float FROM orders_core
                WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
                  AND status::text = 'delivered') AS gmv,
              (SELECT COALESCE(SUM(${tipSql()}), 0)::float FROM orders_core
                WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
                  AND status::text = 'delivered') AS tips,
              (SELECT COALESCE(SUM(${gstSql()}), 0)::float FROM orders_core
                WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
                  AND status::text = 'delivered') AS gst,
              (SELECT COALESCE(SUM(${donationSql()}), 0)::float FROM orders_core
                WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
                  AND status::text = 'delivered') AS donations
          `,
        []
      ),
      safeQuery(
        "orders-kpis-prev",
        () =>
          sql<{ orders: number; gmv: number; delivered: number }[]>`
            SELECT
              (SELECT COUNT(*)::int FROM orders_core
                WHERE created_at >= ${previousFrom}::timestamptz AND created_at < ${from}::timestamptz) AS orders,
              (SELECT COALESCE(SUM(${payableSql()}), 0)::float FROM orders_core
                WHERE created_at >= ${previousFrom}::timestamptz AND created_at < ${from}::timestamptz
                  AND status::text = 'delivered') AS gmv,
              (SELECT COUNT(*)::int FROM orders_core
                WHERE created_at >= ${previousFrom}::timestamptz AND created_at < ${from}::timestamptz
                  AND status::text = 'delivered') AS delivered
          `,
        []
      ),
      safeQuery(
        "orders-summary",
        () =>
          sql<{ order_type: string; status: string; orders: number }[]>`
            SELECT order_type::text AS order_type, status::text AS status, COUNT(*)::int AS orders
            FROM orders_core
            WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
            GROUP BY 1, 2
            ORDER BY orders DESC
          `,
        []
      ),
      safeQuery(
        "orders-by-status",
        () =>
          sql<{ status: string; orders: number }[]>`
            SELECT status::text AS status, COUNT(*)::int AS orders
            FROM orders_core
            WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
            GROUP BY 1
            ORDER BY orders DESC
          `,
        []
      ),
      safeQuery(
        "orders-by-type",
        () =>
          sql<{ order_type: string; orders: number; delivered: number; gmv: number }[]>`
            SELECT
              order_type::text AS order_type,
              COUNT(*)::int AS orders,
              COUNT(*) FILTER (WHERE status::text = 'delivered')::int AS delivered,
              COALESCE(SUM(${payableSql()}) FILTER (WHERE status::text = 'delivered'), 0)::float AS gmv
            FROM orders_core
            WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
            GROUP BY 1
            ORDER BY orders DESC
          `,
        []
      ),
      safeQuery(
        "orders-trend",
        () =>
          sql<{ day: string; orders: number; delivered: number; cancelled: number; gmv: number }[]>`
            SELECT
              to_char(date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS day,
              COUNT(*)::int AS orders,
              COUNT(*) FILTER (WHERE status::text = 'delivered')::int AS delivered,
              COUNT(*) FILTER (WHERE status::text = 'cancelled')::int AS cancelled,
              COALESCE(SUM(${payableSql()}) FILTER (WHERE status::text = 'delivered'), 0)::float AS gmv
            FROM orders_core
            WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
            GROUP BY 1
            ORDER BY 1
          `,
        []
      ),
      safeQuery(
        "orders-hourly",
        () =>
          sql<{ hour: number; orders: number }[]>`
            SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata')::int AS hour,
                   COUNT(*)::int AS orders
            FROM orders_core
            WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
            GROUP BY 1
            ORDER BY 1
          `,
        []
      ),
      safeQuery(
        "orders-pay-mix",
        () =>
          sql<{ method: string; orders: number; amount: number }[]>`
            SELECT
              COALESCE(payment_method::text, 'unknown') AS method,
              COUNT(*)::int AS orders,
              COALESCE(SUM(${payableSql()}), 0)::float AS amount
            FROM orders_core
            WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
            GROUP BY 1
            ORDER BY amount DESC
          `,
        []
      ),
      safeQuery(
        "orders-top-stores",
        () =>
          sql<{ store_name: string; orders: number; gmv: number }[]>`
            SELECT
              COALESCE(ms.store_name, 'Unknown store') AS store_name,
              COUNT(*)::int AS orders,
              COALESCE(SUM(${payableSql("oc")}) FILTER (WHERE oc.status::text = 'delivered'), 0)::float AS gmv
            FROM orders_core oc
            JOIN merchant_stores ms ON ms.id = oc.merchant_store_id
            WHERE oc.created_at >= ${from}::timestamptz AND oc.created_at < ${to}::timestamptz
            GROUP BY ms.store_name
            ORDER BY gmv DESC
            LIMIT 8
          `,
        []
      ),
      safeQuery(
        "orders-extras",
        () =>
          sql<{
            total_customers: number;
            new_customers: number;
            prev_new_customers: number;
            ordered_customers: number;
            repeat_customers: number;
            riders: number;
            riders_online: number;
            avg_minutes: number;
            rider_earning: number;
          }[]>`
            SELECT
              (SELECT COUNT(*)::int FROM customers WHERE deleted_at IS NULL) AS total_customers,
              (SELECT COUNT(*)::int FROM customers
                WHERE deleted_at IS NULL
                  AND created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz) AS new_customers,
              (SELECT COUNT(*)::int FROM customers
                WHERE deleted_at IS NULL
                  AND created_at >= ${previousFrom}::timestamptz AND created_at < ${from}::timestamptz) AS prev_new_customers,
              (SELECT COUNT(DISTINCT customer_id)::int FROM orders_core
                WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
                  AND customer_id IS NOT NULL) AS ordered_customers,
              (SELECT COUNT(*)::int FROM (
                SELECT customer_id FROM orders_core
                WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
                  AND customer_id IS NOT NULL
                GROUP BY customer_id
                HAVING COUNT(*) > 1
              ) rc) AS repeat_customers,
              (SELECT COUNT(*)::int FROM riders WHERE deleted_at IS NULL) AS riders,
              (SELECT COUNT(*)::int
               FROM riders r
               WHERE r.deleted_at IS NULL
                 AND (
                   SELECT UPPER(dl.status::text)
                   FROM duty_logs dl
                   WHERE dl.rider_id = r.id
                   ORDER BY dl.timestamp DESC, dl.id DESC
                   LIMIT 1
                 ) = 'ON'
              ) AS riders_online,
              (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (actual_delivery_time - created_at)) / 60.0), 0)::float
               FROM orders_core
               WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
                 AND status::text = 'delivered'
                 AND actual_delivery_time IS NOT NULL) AS avg_minutes,
              (SELECT COALESCE(SUM(${riderEarnSql()}), 0)::float
               FROM orders_core
               WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
                 AND status::text = 'delivered') AS rider_earning
          `,
        []
      ),
      safeQuery(
        "orders-recent",
        () =>
          sql<
            {
              id: number;
              formatted_order_id: string | null;
              order_type: string;
              status: string;
              payment_status: string | null;
              payment_method: string | null;
              amount: number;
              tip: number;
              donation: number;
              gst: number;
              customer_name: string | null;
              customer_mobile: string | null;
              customer_cc: string | null;
              customer_address: string | null;
              referred_by_name: string | null;
              store_name: string | null;
              rider_name: string | null;
              created_at: Date | string;
            }[]
          >`
            SELECT
              oc.id,
              oc.formatted_order_id,
              oc.order_type::text AS order_type,
              oc.status::text AS status,
              oc.payment_status::text AS payment_status,
              oc.payment_method::text AS payment_method,
              ${payableSql("oc")}::float AS amount,
              ${tipSql("oc")}::float AS tip,
              ${donationSql("oc")}::float AS donation,
              ${gstSql("oc")}::float AS gst,
              c.full_name AS customer_name,
              c.primary_mobile AS customer_mobile,
              c.primary_mobile_country_code AS customer_cc,
              COALESCE(
                NULLIF(
                  TRIM(BOTH ', ' FROM CONCAT_WS(', ',
                    NULLIF(TRIM(ca.address_line1), ''),
                    NULLIF(TRIM(ca.address_line2), ''),
                    NULLIF(TRIM(ca.landmark), ''),
                    NULLIF(TRIM(ca.city), ''),
                    NULLIF(TRIM(ca.state), ''),
                    NULLIF(TRIM(ca.postal_code), '')
                  )),
                  ''
                ),
                NULLIF(TRIM(COALESCE(NULLIF(oc.drop_address_normalized, ''), oc.drop_address_raw)), ''),
                NULLIF(
                  TRIM(BOTH ', ' FROM CONCAT_WS(', ',
                    NULLIF(TRIM(c.address_line1), ''),
                    NULLIF(TRIM(c.address_line2), ''),
                    NULLIF(TRIM(c.city), ''),
                    NULLIF(TRIM(c.state), ''),
                    NULLIF(TRIM(c.pincode), '')
                  )),
                  ''
                )
              ) AS customer_address,
              COALESCE(NULLIF(TRIM(ref.full_name), ''), NULLIF(TRIM(c.referred_by), '')) AS referred_by_name,
              ms.store_name,
              r.name AS rider_name,
              oc.created_at
            FROM orders_core oc
            LEFT JOIN customers c ON c.id = oc.customer_id
            LEFT JOIN customers ref ON (
              (c.referrer_customer_id IS NOT NULL AND ref.id = c.referrer_customer_id)
              OR (
                c.referrer_customer_id IS NULL
                AND NULLIF(TRIM(c.referred_by), '') IS NOT NULL
                AND UPPER(ref.referral_code) = UPPER(TRIM(c.referred_by))
              )
            )
            LEFT JOIN LATERAL (
              SELECT
                ca.address_line1,
                ca.address_line2,
                ca.landmark,
                ca.city,
                ca.state,
                ca.postal_code
              FROM customer_addresses ca
              WHERE ca.customer_id = c.id
              ORDER BY
                COALESCE(ca.is_default, false) DESC,
                COALESCE(ca.is_last_used, false) DESC,
                ca.last_used_at DESC NULLS LAST,
                ca.created_at DESC
              LIMIT 1
            ) ca ON TRUE
            LEFT JOIN merchant_stores ms ON ms.id = oc.merchant_store_id
            LEFT JOIN riders r ON r.id = oc.rider_id
            WHERE oc.created_at >= ${from}::timestamptz AND oc.created_at < ${to}::timestamptz
            ORDER BY oc.created_at DESC
            LIMIT 200
          `,
        []
      ),
    ]);

  const cur = kpis[0] ?? {
    orders: 0,
    delivered: 0,
    cancelled: 0,
    live: 0,
    gmv: 0,
    tips: 0,
    gst: 0,
    donations: 0,
  };
  const prev = prevKpis[0] ?? { orders: 0, gmv: 0, delivered: 0 };
  const ex = extras[0] ?? {
    total_customers: 0,
    new_customers: 0,
    prev_new_customers: 0,
    ordered_customers: 0,
    repeat_customers: 0,
    riders: 0,
    riders_online: 0,
    avg_minutes: 0,
    rider_earning: 0,
  };
  const orders = num(cur.orders);
  const delivered = num(cur.delivered);
  const gmv = num(cur.gmv);
  const orderedCustomers = num(ex.ordered_customers);
  const repeatCustomers = num(ex.repeat_customers);
  const newCustomers = num(ex.new_customers);

  return {
    period,
    kpis: {
      orders,
      delivered,
      cancelled: num(cur.cancelled),
      live: num(cur.live),
      gmv,
      tips: num(cur.tips),
      gst: num(cur.gst),
      donations: num(cur.donations),
      completionRate: orders ? (delivered / orders) * 100 : 0,
      aov: delivered ? gmv / delivered : 0,
      ordersDelta: deltaPct(orders, num(prev.orders)),
      gmvDelta: deltaPct(gmv, num(prev.gmv)),
      deliveredDelta: deltaPct(delivered, num(prev.delivered)),
      aovDelta: deltaPct(
        delivered ? gmv / delivered : 0,
        num(prev.delivered) ? num(prev.gmv) / num(prev.delivered) : 0
      ),
      newCustomers,
      newCustomersDelta: deltaPct(newCustomers, num(ex.prev_new_customers)),
    },
    customers: {
      total: num(ex.total_customers),
      newInPeriod: newCustomers,
      newDelta: deltaPct(newCustomers, num(ex.prev_new_customers)),
      ordered: orderedCustomers,
      repeatRate: orderedCustomers ? (repeatCustomers / orderedCustomers) * 100 : 0,
      retentionRate: orderedCustomers
        ? (Math.max(orderedCustomers - newCustomers, 0) / orderedCustomers) * 100
        : 0,
    },
    delivery: {
      riders: num(ex.riders),
      ridersOnline: num(ex.riders_online),
      avgMinutes: num(ex.avg_minutes),
      onTimeRate: orders ? (delivered / orders) * 100 : 0,
      partnerEarnings: num(ex.rider_earning),
    },
    summary: summary.map((r) => ({
      type: str(r.order_type),
      status: str(r.status),
      orders: num(r.orders),
    })),
    byStatus: byStatus.map((r) => ({ status: str(r.status), orders: num(r.orders) })),
    byType: byType.map((r) => ({
      type: str(r.order_type),
      orders: num(r.orders),
      delivered: num(r.delivered),
      gmv: num(r.gmv),
    })),
    trend: trend.map((r) => ({
      day: str(r.day),
      orders: num(r.orders),
      delivered: num(r.delivered),
      cancelled: num(r.cancelled),
      gmv: num(r.gmv),
    })),
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      orders: num(hourly.find((r) => Number(r.hour) === hour)?.orders),
    })),
    paymentMix: paymentMix.map((r) => ({
      method: str(r.method),
      orders: num(r.orders),
      amount: num(r.amount),
    })),
    topStores: topStores.map((r) => ({
      name: str(r.store_name),
      orders: num(r.orders),
      gmv: num(r.gmv),
    })),
    recent: recent.map((r) => ({
      id: num(r.id),
      orderId: str(r.formatted_order_id) || `#${r.id}`,
      type: str(r.order_type),
      status: str(r.status),
      paymentStatus: str(r.payment_status),
      paymentMethod: str(r.payment_method),
      amount: num(r.amount),
      tip: num(r.tip),
      donation: num(r.donation),
      gst: num(r.gst),
      customer: str(r.customer_name) || "—",
      customerPhone: formatCustomerMobile(str(r.customer_mobile), r.customer_cc),
      customerAddress: str(r.customer_address) || null,
      referredByName: str(r.referred_by_name) || null,
      store: str(r.store_name) || "—",
      rider: str(r.rider_name) || "—",
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : str(r.created_at),
    })),
  };
}

export async function fetchCustomers(periodRaw: string | null) {
  const sql = getSql();
  const { period, from, to } = boundsFromSearch(periodRaw);

  const [stats, states, cities, recent] = await Promise.all([
    safeQuery(
      "customers-stats",
      () =>
        sql<{
          total: number;
          active: number;
          new_in_period: number;
          wallet: number;
          plus: number;
          ordered: number;
        }[]>`
          SELECT
            COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND account_status::text = 'ACTIVE')::int AS active,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz)::int AS new_in_period,
            COALESCE(SUM(wallet_balance) FILTER (WHERE deleted_at IS NULL), 0)::float AS wallet,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND COALESCE(gmitra_plus_active, false) = true)::int AS plus,
            COUNT(*) FILTER (
              WHERE deleted_at IS NULL
                AND EXISTS (
                  SELECT 1 FROM orders_core o
                  WHERE o.customer_id = customers.id
                    AND COALESCE(o.actual_delivery_time, o.created_at) >= ${from}::timestamptz
                    AND COALESCE(o.actual_delivery_time, o.created_at) < ${to}::timestamptz
                )
            )::int AS ordered
          FROM customers
        `,
      []
    ),
    safeQuery(
      "customers-states",
      () =>
        sql<{ state: string; count: number }[]>`
          SELECT COALESCE(NULLIF(state, ''), 'Unknown') AS state, COUNT(*)::int AS count
          FROM customers
          WHERE deleted_at IS NULL
          GROUP BY 1
          ORDER BY count DESC
          LIMIT 10
        `,
      []
    ),
    safeQuery(
      "customers-cities",
      () =>
        sql<{ city: string; count: number }[]>`
          SELECT COALESCE(NULLIF(city, ''), 'Unknown') AS city, COUNT(*)::int AS count
          FROM customers
          WHERE deleted_at IS NULL
          GROUP BY 1
          ORDER BY count DESC
          LIMIT 12
        `,
      []
    ),
    safeQuery(
      "customers-recent",
      () =>
        sql<
          {
            id: number;
            customer_id: string;
            full_name: string;
            email: string | null;
            primary_mobile: string;
            country_code: string | null;
            account_status: string;
            city: string | null;
            state: string | null;
            pincode: string | null;
            risk_flag: string | null;
            trust_score: number | null;
            gmitra_plus_active: boolean | null;
            profile_image_url: string | null;
            wallet: number;
            orders: number;
            gmv: number;
            food_orders: number;
            parcel_orders: number;
            ride_orders: number;
            last_order_at: Date | string | null;
            created_at: Date | string;
          }[]
        >`
          SELECT
            c.id,
            c.customer_id,
            c.full_name,
            c.email,
            c.primary_mobile,
            c.primary_mobile_country_code AS country_code,
            c.account_status::text AS account_status,
            c.city,
            c.state,
            c.pincode,
            c.risk_flag::text AS risk_flag,
            c.trust_score::float AS trust_score,
            c.gmitra_plus_active,
            c.profile_image_url,
            COALESCE(c.wallet_balance, 0)::float AS wallet,
            COALESCE((
              SELECT COUNT(*)::int FROM orders_core o WHERE o.customer_id = c.id
            ), 0) AS orders,
            COALESCE((
              SELECT SUM(${payableSql("o")})
              FROM orders_core o
              WHERE o.customer_id = c.id AND o.status::text = 'delivered'
            ), 0)::float AS gmv,
            COALESCE((
              SELECT COUNT(*)::int FROM orders_core o
              WHERE o.customer_id = c.id
                AND o.order_type::text IN ('food', 'grocery', 'mart', 'pharmacy')
            ), 0) AS food_orders,
            COALESCE((
              SELECT COUNT(*)::int FROM orders_core o
              WHERE o.customer_id = c.id AND o.order_type::text = 'parcel'
            ), 0) AS parcel_orders,
            COALESCE((
              SELECT COUNT(*)::int FROM orders_core o
              WHERE o.customer_id = c.id
                AND o.order_type::text IN ('person_ride', 'ride', 'cab')
            ), 0) AS ride_orders,
            COALESCE(
              c.last_order_at,
              (
                SELECT MAX(COALESCE(o.actual_delivery_time, o.created_at))
                FROM orders_core o
                WHERE o.customer_id = c.id
              )
            ) AS last_order_at,
            c.created_at
          FROM customers c
          WHERE c.deleted_at IS NULL
          ORDER BY
            c.created_at ASC NULLS LAST,
            c.customer_id ASC
          LIMIT 300
        `,
      []
    ),
  ]);

  return {
    period,
    stats: {
      total: num(stats[0]?.total),
      active: num(stats[0]?.active),
      newInPeriod: num(stats[0]?.new_in_period),
      wallet: num(stats[0]?.wallet),
      plus: num(stats[0]?.plus),
      ordered: num(stats[0]?.ordered),
    },
    states: states.map((r) => ({ state: str(r.state), count: num(r.count) })),
    cities: cities.map((r) => ({ city: str(r.city), count: num(r.count) })),
    recent: recent.map((r) => ({
      id: str(r.customer_id),
      dbId: num(r.id),
      name: str(r.full_name) || "Unnamed",
      email: str(r.email) || "—",
      mobile: formatCustomerMobile(r.primary_mobile, r.country_code),
      status: str(r.account_status),
      city: str(r.city) || "—",
      state: str(r.state) || "—",
      pincode: str(r.pincode),
      risk: str(r.risk_flag) || "LOW",
      trustScore: r.trust_score == null ? null : num(r.trust_score),
      plus: Boolean(r.gmitra_plus_active),
      avatarUrl: resolveSelfieUrl(str(r.profile_image_url)) || null,
      wallet: num(r.wallet),
      orders: num(r.orders),
      gmv: num(r.gmv),
      foodOrders: num(r.food_orders),
      parcelOrders: num(r.parcel_orders),
      rideOrders: num(r.ride_orders),
      lastOrderAt:
        r.last_order_at instanceof Date
          ? r.last_order_at.toISOString()
          : r.last_order_at
            ? str(r.last_order_at)
            : null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : str(r.created_at),
      cityGroup: str(r.city).trim() || "Unknown",
    })),
  };
}

function formatCustomerMobile(mobile: string, countryCode?: string | null) {
  const m = str(mobile).trim();
  if (!m) return "—";
  if (m.startsWith("+")) return m;
  const cc = str(countryCode).trim() || "+91";
  return `${cc}${m.replace(/^0+/, "")}`;
}

export async function fetchCustomerDetail(customerIdRaw: string, periodRaw: string | null) {
  const sql = getSql();
  const customerId = str(customerIdRaw).trim();
  if (!customerId) throw new Error("Invalid customer id");
  const { period, from, to } = boundsFromSearch(periodRaw);

  const [profileRows, orderRows, mixRows, spendRows, activeRows, addressRows] = await Promise.all([
    safeQuery(
      "customer-detail",
      () =>
        sql<
          {
            id: number;
            customer_id: string;
            full_name: string;
            email: string | null;
            primary_mobile: string;
            country_code: string | null;
            account_status: string;
            city: string | null;
            state: string | null;
            pincode: string | null;
            address_line1: string | null;
            address_line2: string | null;
            risk_flag: string | null;
            trust_score: number | null;
            gmitra_plus_active: boolean | null;
            profile_image_url: string | null;
            referral_code: string | null;
            referred_by: string | null;
            referred_by_name: string | null;
            preferred_language: string | null;
            wallet: number;
            wallet_locked: number;
            orders: number;
            gmv: number;
            cancelled: number;
            delivered: number;
            last_order_at: Date | string | null;
            last_login_at: Date | string | null;
            created_at: Date | string;
            created_via: string | null;
          }[]
        >`
          SELECT
            c.id,
            c.customer_id,
            c.full_name,
            c.email,
            c.primary_mobile,
            c.primary_mobile_country_code AS country_code,
            c.account_status::text AS account_status,
            c.city,
            c.state,
            c.pincode,
            c.address_line1,
            c.address_line2,
            c.risk_flag::text AS risk_flag,
            c.trust_score::float AS trust_score,
            c.gmitra_plus_active,
            c.profile_image_url,
            c.referral_code,
            c.referred_by,
            COALESCE(NULLIF(TRIM(ref.full_name), ''), NULLIF(TRIM(c.referred_by), '')) AS referred_by_name,
            c.preferred_language,
            COALESCE(c.wallet_balance, 0)::float AS wallet,
            COALESCE(c.wallet_locked_amount, 0)::float AS wallet_locked,
            COALESCE((SELECT COUNT(*)::int FROM orders_core o WHERE o.customer_id = c.id), 0) AS orders,
            COALESCE((
              SELECT SUM(${payableSql("o")}) FROM orders_core o
              WHERE o.customer_id = c.id AND o.status::text = 'delivered'
            ), 0)::float AS gmv,
            COALESCE((
              SELECT COUNT(*)::int FROM orders_core o
              WHERE o.customer_id = c.id AND o.status::text = 'cancelled'
            ), 0) AS cancelled,
            COALESCE((
              SELECT COUNT(*)::int FROM orders_core o
              WHERE o.customer_id = c.id AND o.status::text = 'delivered'
            ), 0) AS delivered,
            COALESCE(
              c.last_order_at,
              (
                SELECT MAX(COALESCE(o.actual_delivery_time, o.created_at))
                FROM orders_core o
                WHERE o.customer_id = c.id
              )
            ) AS last_order_at,
            c.last_login_at,
            c.created_at,
            c.created_via
          FROM customers c
          LEFT JOIN customers ref ON (
            (c.referrer_customer_id IS NOT NULL AND ref.id = c.referrer_customer_id)
            OR (
              c.referrer_customer_id IS NULL
              AND NULLIF(TRIM(c.referred_by), '') IS NOT NULL
              AND UPPER(ref.referral_code) = UPPER(TRIM(c.referred_by))
            )
          )
          WHERE c.deleted_at IS NULL
            AND (c.customer_id = ${customerId} OR c.id::text = ${customerId})
          LIMIT 1
        `,
      []
    ),
    safeQuery(
      "customer-orders",
      () =>
        sql<
          {
            id: number;
            order_code: string | null;
            status: string;
            order_type: string;
            pickup: string | null;
            dropoff: string | null;
            payable: number;
            created_at: Date | string;
            delivered_at: Date | string | null;
          }[]
        >`
          SELECT
            o.id,
            COALESCE(NULLIF(o.formatted_order_id, ''), NULLIF(o.order_id, ''), o.id::text) AS order_code,
            o.status::text AS status,
            o.order_type::text AS order_type,
            COALESCE(NULLIF(o.pickup_address_normalized, ''), o.pickup_address_raw) AS pickup,
            COALESCE(NULLIF(o.drop_address_normalized, ''), o.drop_address_raw) AS dropoff,
            COALESCE(${payableSql("o")}, 0)::float AS payable,
            o.created_at,
            o.actual_delivery_time AS delivered_at
          FROM orders_core o
          JOIN customers c ON c.id = o.customer_id
          WHERE c.deleted_at IS NULL
            AND (c.customer_id = ${customerId} OR c.id::text = ${customerId})
          ORDER BY o.created_at DESC
          LIMIT 40
        `,
      []
    ),
    safeQuery(
      "customer-order-mix",
      () =>
        sql<{ order_type: string; orders: number; gmv: number }[]>`
          SELECT
            CASE
              WHEN o.order_type::text IN ('food', 'grocery', 'mart', 'pharmacy') THEN 'food'
              WHEN o.order_type::text = 'parcel' THEN 'parcel'
              WHEN o.order_type::text IN ('person_ride', 'ride', 'cab') THEN 'ride'
              ELSE COALESCE(NULLIF(o.order_type::text, ''), 'other')
            END AS order_type,
            COUNT(*)::int AS orders,
            COALESCE(SUM(${payableSql("o")}) FILTER (WHERE o.status::text = 'delivered'), 0)::float AS gmv
          FROM orders_core o
          JOIN customers c ON c.id = o.customer_id
          WHERE c.deleted_at IS NULL
            AND (c.customer_id = ${customerId} OR c.id::text = ${customerId})
          GROUP BY 1
          ORDER BY orders DESC
        `,
      []
    ),
    safeQuery(
      "customer-spend-days",
      () =>
        sql<{ day: string; gmv: number; orders: number }[]>`
          SELECT
            DATE(o.created_at AT TIME ZONE 'Asia/Kolkata')::text AS day,
            COALESCE(SUM(${payableSql("o")}) FILTER (WHERE o.status::text = 'delivered'), 0)::float AS gmv,
            COUNT(*)::int AS orders
          FROM orders_core o
          JOIN customers c ON c.id = o.customer_id
          WHERE c.deleted_at IS NULL
            AND (c.customer_id = ${customerId} OR c.id::text = ${customerId})
            AND o.created_at >= ${from}::timestamptz
            AND o.created_at < ${to}::timestamptz
          GROUP BY 1
          ORDER BY 1 ASC
        `,
      []
    ),
    safeQuery(
      "customer-active-order",
      () =>
        sql<
          {
            id: number;
            order_code: string | null;
            status: string;
            order_type: string;
            pickup: string | null;
            dropoff: string | null;
            payable: number;
            created_at: Date | string;
          }[]
        >`
          SELECT
            o.id,
            COALESCE(NULLIF(o.formatted_order_id, ''), NULLIF(o.order_id, ''), o.id::text) AS order_code,
            o.status::text AS status,
            o.order_type::text AS order_type,
            COALESCE(NULLIF(o.pickup_address_normalized, ''), o.pickup_address_raw) AS pickup,
            COALESCE(NULLIF(o.drop_address_normalized, ''), o.drop_address_raw) AS dropoff,
            COALESCE(${payableSql("o")}, 0)::float AS payable,
            o.created_at
          FROM orders_core o
          JOIN customers c ON c.id = o.customer_id
          WHERE c.deleted_at IS NULL
            AND (c.customer_id = ${customerId} OR c.id::text = ${customerId})
            AND o.status::text NOT IN ('delivered', 'cancelled', 'failed')
            AND o.cancelled_at IS NULL
          ORDER BY o.updated_at DESC NULLS LAST, o.created_at DESC
          LIMIT 1
        `,
      []
    ),
    safeQuery(
      "customer-saved-addresses",
      () =>
        sql<
          {
            id: number;
            address_id: string;
            label: string;
            custom_label: string | null;
            address_line1: string;
            address_line2: string | null;
            landmark: string | null;
            city: string;
            state: string;
            postal_code: string;
            contact_name: string | null;
            contact_mobile: string | null;
            is_default: boolean | null;
            is_last_used: boolean | null;
            last_used_at: Date | string | null;
            created_at: Date | string;
          }[]
        >`
          SELECT
            ca.id,
            ca.address_id,
            ca.label::text AS label,
            ca.custom_label,
            ca.address_line1,
            ca.address_line2,
            ca.landmark,
            ca.city,
            ca.state,
            ca.postal_code,
            ca.contact_name,
            ca.contact_mobile,
            ca.is_default,
            ca.is_last_used,
            ca.last_used_at,
            ca.created_at
          FROM customer_addresses ca
          JOIN customers c ON c.id = ca.customer_id
          WHERE c.deleted_at IS NULL
            AND ca.deleted_at IS NULL
            AND COALESCE(ca.is_active, true) = true
            AND (c.customer_id = ${customerId} OR c.id::text = ${customerId})
          ORDER BY
            COALESCE(ca.is_default, false) DESC,
            COALESCE(ca.is_last_used, false) DESC,
            ca.last_used_at DESC NULLS LAST,
            ca.created_at DESC
        `,
      []
    ),
  ]);

  const profile = profileRows[0];
  if (!profile) throw new Error("Customer not found");

  const active = activeRows[0] ?? null;
  const selectedAddressRow = addressRows[0] ?? null;
  const selectedAddress = selectedAddressRow
    ? [str(selectedAddressRow.address_line1), str(selectedAddressRow.address_line2), str(selectedAddressRow.landmark), str(selectedAddressRow.city), str(selectedAddressRow.state), str(selectedAddressRow.postal_code)]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(", ")
    : "";
  const profileAddress = [str(profile.address_line1), str(profile.address_line2), str(profile.city), str(profile.state), str(profile.pincode)]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
  const address = selectedAddress || profileAddress;
  const displayCity = selectedAddressRow
    ? str(selectedAddressRow.city) || str(profile.city) || "—"
    : str(profile.city) || "—";
  const displayState = selectedAddressRow
    ? str(selectedAddressRow.state) || str(profile.state) || "—"
    : str(profile.state) || "—";
  const displayPincode = selectedAddressRow
    ? str(selectedAddressRow.postal_code) || str(profile.pincode)
    : str(profile.pincode);

  const derivedLastOrder =
    profile.last_order_at instanceof Date
      ? profile.last_order_at.toISOString()
      : profile.last_order_at
        ? str(profile.last_order_at)
        : orderRows[0]
          ? orderRows[0].delivered_at instanceof Date
            ? orderRows[0].delivered_at.toISOString()
            : orderRows[0].delivered_at
              ? str(orderRows[0].delivered_at)
              : orderRows[0].created_at instanceof Date
                ? orderRows[0].created_at.toISOString()
                : str(orderRows[0].created_at)
          : null;

  return {
    period,
    customer: {
      id: str(profile.customer_id),
      dbId: num(profile.id),
      name: str(profile.full_name) || "Unnamed",
      email: str(profile.email) || "—",
      mobile: formatCustomerMobile(profile.primary_mobile, profile.country_code),
      status: str(profile.account_status),
      city: displayCity,
      state: displayState,
      pincode: displayPincode,
      address: address || "—",
      risk: str(profile.risk_flag) || "LOW",
      trustScore: profile.trust_score == null ? null : num(profile.trust_score),
      plus: Boolean(profile.gmitra_plus_active),
      avatarUrl: resolveSelfieUrl(str(profile.profile_image_url)) || null,
      referralCode: str(profile.referral_code) || null,
      referredBy: str(profile.referred_by) || null,
      referredByName: str(profile.referred_by_name) || null,
      language: str(profile.preferred_language) || "en",
      wallet: num(profile.wallet),
      walletLocked: num(profile.wallet_locked),
      orders: num(profile.orders),
      gmv: num(profile.gmv),
      cancelled: num(profile.cancelled),
      delivered: num(profile.delivered),
      createdVia: str(profile.created_via) || "app",
      lastOrderAt: derivedLastOrder,
      lastLoginAt:
        profile.last_login_at instanceof Date
          ? profile.last_login_at.toISOString()
          : profile.last_login_at
            ? str(profile.last_login_at)
            : null,
      createdAt:
        profile.created_at instanceof Date ? profile.created_at.toISOString() : str(profile.created_at),
    },
    activeOrder: active
      ? {
          id: num(active.id),
          code: str(active.order_code) || String(active.id),
          status: str(active.status),
          type: str(active.order_type),
          pickup: str(active.pickup) || "—",
          dropoff: str(active.dropoff) || "—",
          payable: num(active.payable),
          createdAt:
            active.created_at instanceof Date ? active.created_at.toISOString() : str(active.created_at),
        }
      : null,
    orderHistory: orderRows.map((o) => ({
      id: num(o.id),
      code: str(o.order_code) || String(o.id),
      status: str(o.status),
      type: str(o.order_type),
      pickup: str(o.pickup) || "—",
      dropoff: str(o.dropoff) || "—",
      payable: num(o.payable),
      createdAt: o.created_at instanceof Date ? o.created_at.toISOString() : str(o.created_at),
      deliveredAt:
        o.delivered_at instanceof Date
          ? o.delivered_at.toISOString()
          : o.delivered_at
            ? str(o.delivered_at)
            : null,
    })),
    orderMix: mixRows.map((r) => ({
      type: str(r.order_type),
      orders: num(r.orders),
      gmv: num(r.gmv),
    })),
    spendSeries: spendRows.map((r) => ({
      day: str(r.day),
      gmv: num(r.gmv),
      orders: num(r.orders),
    })),
    savedAddresses: addressRows.map((a) => ({
      id: num(a.id),
      addressId: str(a.address_id),
      label: str(a.label) || "HOME",
      customLabel: str(a.custom_label) || null,
      line1: str(a.address_line1),
      line2: str(a.address_line2) || null,
      landmark: str(a.landmark) || null,
      city: str(a.city),
      state: str(a.state),
      postalCode: str(a.postal_code),
      contactName: str(a.contact_name) || null,
      contactMobile: str(a.contact_mobile) || null,
      isDefault: Boolean(a.is_default),
      isLastUsed: Boolean(a.is_last_used),
      lastUsedAt:
        a.last_used_at instanceof Date
          ? a.last_used_at.toISOString()
          : a.last_used_at
            ? str(a.last_used_at)
            : null,
      createdAt: a.created_at instanceof Date ? a.created_at.toISOString() : str(a.created_at),
    })),
  };
}

function vehicleLabel(parts: {
  make?: string | null;
  model?: string | null;
  vehicleType?: string | null;
  vehicleCategory?: string | null;
  vehicleChoice?: string | null;
}) {
  const named = [str(parts.make), str(parts.model)].filter(Boolean).join(" ").trim();
  if (named) return named;
  const type = str(parts.vehicleCategory) || str(parts.vehicleType) || str(parts.vehicleChoice);
  return type ? type.replace(/_/g, " ") : "No vehicle";
}

function fleetGroupKey(vehicleType: string, vehicleCategory: string) {
  const raw = `${vehicleCategory} ${vehicleType}`.toLowerCase();
  if (/\b(auto|rickshaw|e_rickshaw|ev_auto)\b/.test(raw)) return "AUTOS";
  if (/\b(car|cab|taxi|ev_car)\b/.test(raw)) return "CARS";
  if (/\b(cycle|bicycle)\b/.test(raw)) return "CYCLES";
  if (/\b(scooter)\b/.test(raw)) return "SCOOTERS";
  if (/\b(bike|ev_bike)\b/.test(raw)) return "BIKES";
  if (vehicleType || vehicleCategory) return "OTHER";
  return "UNASSIGNED";
}

function workingAreaLabel(parts: {
  city?: string | null;
  district?: string | null;
  region?: string | null;
  state?: string | null;
  localityCode?: string | null;
}) {
  const bits = [str(parts.localityCode), str(parts.city), str(parts.district), str(parts.region), str(parts.state)]
    .map((s) => s.trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const b of bits) {
    if (!unique.some((u) => u.toLowerCase() === b.toLowerCase())) unique.push(b);
  }
  return unique.length ? unique.join(", ") : "—";
}

function formatRiderMobile(mobile: string, countryCode?: string | null) {
  const m = str(mobile).trim();
  if (!m) return "—";
  const cc = str(countryCode).trim() || "+91";
  if (m.startsWith("+")) return m;
  return `${cc}${m.replace(/^0+/, "")}`;
}

export async function fetchRiders(periodRaw: string | null) {
  const sql = getSql();
  const { period, from, to } = boundsFromSearch(periodRaw);

  const [stats, cities, recent] = await Promise.all([
    safeQuery(
      "riders-stats",
      () =>
        sql<{
          total: number;
          active: number;
          online: number;
          kyc: number;
          new_in_period: number;
          wallet: number;
        }[]>`
          SELECT
            COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND status::text = 'ACTIVE')::int AS active,
            COUNT(*) FILTER (
              WHERE deleted_at IS NULL
                AND (
                  SELECT UPPER(dl.status::text)
                  FROM duty_logs dl
                  WHERE dl.rider_id = riders.id
                  ORDER BY dl.timestamp DESC, dl.id DESC
                  LIMIT 1
                ) = 'ON'
            )::int AS online,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND kyc_status::text = 'APPROVED')::int AS kyc,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz)::int AS new_in_period,
            COALESCE((SELECT SUM(total_balance) FROM rider_wallet), 0)::float AS wallet
          FROM riders
        `,
      []
    ),
    safeQuery(
      "riders-cities",
      () =>
        sql<{ city: string; count: number }[]>`
          SELECT COALESCE(NULLIF(city, ''), 'Unknown') AS city, COUNT(*)::int AS count
          FROM riders
          WHERE deleted_at IS NULL
          GROUP BY 1
          ORDER BY count DESC
          LIMIT 10
        `,
      []
    ),
    safeQuery(
      "riders-recent",
      () =>
        sql<
          {
            id: number;
            name: string | null;
            mobile: string;
            country_code: string | null;
            status: string;
            availability_status: string;
            duty_status: string | null;
            active_orders: number;
            kyc_status: string;
            city: string | null;
            district: string | null;
            region: string | null;
            state: string | null;
            locality_code: string | null;
            vehicle_choice: string | null;
            wallet: number;
            deliveries: number;
            earnings: number;
            created_at: Date | string;
            vehicle_type: string | null;
            vehicle_category: string | null;
            vehicle_make: string | null;
            vehicle_model: string | null;
            registration_number: string | null;
            fuel_type: string | null;
            vehicle_color: string | null;
            vehicle_year: number | null;
            seating_capacity: number | null;
            vehicle_verified: boolean | null;
            selfie_url: string | null;
            selfie_doc_key: string | null;
            selfie_doc_url: string | null;
          }[]
        >`
          SELECT
            r.id,
            r.name,
            r.mobile,
            r.country_code,
            r.status::text AS status,
            CASE
              WHEN UPPER(COALESCE(ld.duty_status, '')) = 'ON' AND COALESCE(ao.active_orders, 0) > 0 THEN 'BUSY'
              WHEN UPPER(COALESCE(ld.duty_status, '')) = 'ON' THEN 'ONLINE'
              ELSE 'OFFLINE'
            END AS availability_status,
            ld.duty_status,
            COALESCE(ao.active_orders, 0)::int AS active_orders,
            r.kyc_status::text AS kyc_status,
            r.city,
            r.district,
            r.region,
            r.state,
            r.locality_code,
            r.vehicle_choice,
            r.selfie_url,
            sd.r2_key AS selfie_doc_key,
            sd.file_url AS selfie_doc_url,
            COALESCE((SELECT total_balance FROM rider_wallet w WHERE w.rider_id = r.id LIMIT 1), 0)::float AS wallet,
            COALESCE((
              SELECT COUNT(*)::int FROM orders_core o WHERE o.rider_id = r.id AND o.status::text = 'delivered'
            ), 0) AS deliveries,
            COALESCE((
              SELECT SUM(${riderEarnSql("o")}) FROM orders_core o
              WHERE o.rider_id = r.id AND o.status::text = 'delivered'
            ), 0)::float AS earnings,
            r.created_at,
            v.vehicle_type::text AS vehicle_type,
            v.vehicle_category::text AS vehicle_category,
            v.make AS vehicle_make,
            v.model AS vehicle_model,
            v.registration_number,
            v.fuel_type::text AS fuel_type,
            v.color AS vehicle_color,
            v.year AS vehicle_year,
            v.seating_capacity,
            v.verified AS vehicle_verified
          FROM riders r
          LEFT JOIN LATERAL (
            SELECT dl.status::text AS duty_status
            FROM duty_logs dl
            WHERE dl.rider_id = r.id
            ORDER BY dl.timestamp DESC, dl.id DESC
            LIMIT 1
          ) ld ON TRUE
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS active_orders
            FROM orders_core o
            WHERE o.rider_id = r.id
              AND o.status::text NOT IN ('delivered', 'cancelled', 'failed')
              AND o.cancelled_at IS NULL
          ) ao ON TRUE
          LEFT JOIN LATERAL (
            SELECT *
            FROM rider_vehicles rv
            WHERE rv.rider_id = r.id
            ORDER BY rv.is_active DESC, rv.updated_at DESC NULLS LAST, rv.id DESC
            LIMIT 1
          ) v ON TRUE
          LEFT JOIN LATERAL (
            SELECT d.r2_key, d.file_url
            FROM rider_documents d
            WHERE d.rider_id = r.id
              AND d.doc_type::text IN ('selfie', 'profile_photo')
            ORDER BY d.verified DESC, d.updated_at DESC NULLS LAST, d.id DESC
            LIMIT 1
          ) sd ON TRUE
          WHERE r.deleted_at IS NULL
          ORDER BY
            CASE
              WHEN UPPER(COALESCE(ld.duty_status, '')) = 'ON' AND COALESCE(ao.active_orders, 0) > 0 THEN 0
              WHEN UPPER(COALESCE(ld.duty_status, '')) = 'ON' THEN 1
              ELSE 2
            END,
            r.created_at DESC
          LIMIT 200
        `,
      []
    ),
  ]);

  return {
    period,
    stats: {
      total: num(stats[0]?.total),
      active: num(stats[0]?.active),
      online: num(stats[0]?.online),
      kyc: num(stats[0]?.kyc),
      newInPeriod: num(stats[0]?.new_in_period),
      wallet: num(stats[0]?.wallet),
    },
    cities: cities.map((r) => ({ city: str(r.city), count: num(r.count) })),
    recent: recent.map((r) => {
      const vehicleType = str(r.vehicle_type);
      const vehicleCategory = str(r.vehicle_category);
      const availability = resolveEngineAvailability(r.duty_status, num(r.active_orders) > 0);
      return {
      id: num(r.id),
      name: str(r.name) || "Unnamed rider",
        mobile: formatRiderMobile(r.mobile, r.country_code),
      status: str(r.status),
        availability,
      kyc: str(r.kyc_status),
      city: str(r.city) || "—",
        workingArea: workingAreaLabel({
          city: r.city,
          district: r.district,
          region: r.region,
          state: r.state,
          localityCode: r.locality_code,
        }),
        vehicle: vehicleLabel({
          make: r.vehicle_make,
          model: r.vehicle_model,
          vehicleType,
          vehicleCategory,
          vehicleChoice: r.vehicle_choice,
        }),
        vehicleType,
        vehicleCategory,
        vehicleGroup: fleetGroupKey(vehicleType, vehicleCategory),
        plate: str(r.registration_number),
        fuelType: str(r.fuel_type),
        color: str(r.vehicle_color),
        year: r.vehicle_year == null ? null : num(r.vehicle_year),
        seats: r.seating_capacity == null ? null : num(r.seating_capacity),
        vehicleVerified: Boolean(r.vehicle_verified),
        selfieUrl:
          resolveSelfieUrl(r.selfie_url) ||
          resolveSelfieUrl(r.selfie_doc_key) ||
          resolveSelfieUrl(r.selfie_doc_url),
      wallet: num(r.wallet),
      deliveries: num(r.deliveries),
      earnings: num(r.earnings),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : str(r.created_at),
      };
    }),
  };
}

function mapDutyLabel(availability: string, orderStatus: string | null) {
  if (orderStatus && ["picked_up", "in_transit", "dispatched"].includes(orderStatus)) return "ON THE WAY";
  if (orderStatus && ["assigned", "accepted", "reached_store", "dispatch_ready", "bill_ready"].includes(orderStatus)) {
    return "LOADING";
  }
  if (availability === "BUSY") return "ON THE WAY";
  // Online but idle → Waiting for next trip
  if (availability === "ONLINE") return "WAITING";
  return "OFFLINE";
}

/** Same source of truth as rider app / assignment engine: latest duty_logs.status. */
function resolveEngineAvailability(
  dutyStatus: string | null | undefined,
  hasActiveOrder: boolean
): "ONLINE" | "BUSY" | "OFFLINE" {
  if (String(dutyStatus ?? "").toUpperCase() === "ON") {
    return hasActiveOrder ? "BUSY" : "ONLINE";
  }
  return "OFFLINE";
}

/** Lightweight duty snapshot for live fleet status polling. */
export async function fetchRiderDutyStatuses() {
  const sql = getSql();
  const rows = await safeQuery(
    "riders-duty-status",
    () =>
      sql<
        {
          id: number;
          duty_status: string | null;
          active_orders: number;
          latest_status: string | null;
        }[]
      >`
        SELECT
          r.id,
          ld.duty_status,
          COALESCE(ao.active_orders, 0)::int AS active_orders,
          ao.latest_status
        FROM riders r
        LEFT JOIN LATERAL (
          SELECT dl.status::text AS duty_status
          FROM duty_logs dl
          WHERE dl.rider_id = r.id
          ORDER BY dl.timestamp DESC, dl.id DESC
          LIMIT 1
        ) ld ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS active_orders,
            (array_agg(o.status::text ORDER BY o.created_at DESC))[1] AS latest_status
          FROM orders_core o
          WHERE o.rider_id = r.id
            AND o.status::text NOT IN ('delivered', 'cancelled', 'failed')
            AND o.cancelled_at IS NULL
        ) ao ON TRUE
        WHERE r.deleted_at IS NULL
      `,
    []
  );

  const riders = rows.map((r) => {
    const availability = resolveEngineAvailability(r.duty_status, num(r.active_orders) > 0);
    return {
      id: num(r.id),
      availability,
      dutyLabel: mapDutyLabel(availability, r.latest_status ? str(r.latest_status) : null),
    };
  });

  return {
    online: riders.filter((r) => r.availability === "ONLINE" || r.availability === "BUSY").length,
    riders,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchRiderDetail(riderIdRaw: string, periodRaw: string | null) {
  const sql = getSql();
  const riderId = Number(riderIdRaw);
  if (!Number.isFinite(riderId) || riderId <= 0) throw new Error("Invalid rider id");
  const { period, from, to } = boundsFromSearch(periodRaw);

  const [riderRows, activeRows, historyRows, timeCats, workDays] = await Promise.all([
    safeQuery(
      "rider-detail",
      () =>
        sql<
          {
            id: number;
            name: string | null;
            mobile: string;
            country_code: string | null;
            status: string;
            availability_status: string;
            duty_status: string | null;
            active_orders: number;
            kyc_status: string;
            city: string | null;
            district: string | null;
            region: string | null;
            state: string | null;
            locality_code: string | null;
            vehicle_choice: string | null;
            wallet: number;
            deliveries: number;
            earnings: number;
            created_at: Date | string;
            vehicle_type: string | null;
            vehicle_category: string | null;
            vehicle_make: string | null;
            vehicle_model: string | null;
            registration_number: string | null;
            fuel_type: string | null;
            vehicle_color: string | null;
            vehicle_year: number | null;
            seating_capacity: number | null;
            vehicle_verified: boolean | null;
            rc_document_url: string | null;
            selfie_url: string | null;
            selfie_doc_key: string | null;
            selfie_doc_url: string | null;
          }[]
        >`
          SELECT
            r.id,
            r.name,
            r.mobile,
            r.country_code,
            r.status::text AS status,
            CASE
              WHEN UPPER(COALESCE(ld.duty_status, '')) = 'ON' AND COALESCE(ao.active_orders, 0) > 0 THEN 'BUSY'
              WHEN UPPER(COALESCE(ld.duty_status, '')) = 'ON' THEN 'ONLINE'
              ELSE 'OFFLINE'
            END AS availability_status,
            ld.duty_status,
            COALESCE(ao.active_orders, 0)::int AS active_orders,
            r.kyc_status::text AS kyc_status,
            r.city,
            r.district,
            r.region,
            r.state,
            r.locality_code,
            r.vehicle_choice,
            r.selfie_url,
            sd.r2_key AS selfie_doc_key,
            sd.file_url AS selfie_doc_url,
            COALESCE((SELECT total_balance FROM rider_wallet w WHERE w.rider_id = r.id LIMIT 1), 0)::float AS wallet,
            COALESCE((
              SELECT COUNT(*)::int FROM orders_core o WHERE o.rider_id = r.id AND o.status::text = 'delivered'
            ), 0) AS deliveries,
            COALESCE((
              SELECT SUM(${riderEarnSql("o")}) FROM orders_core o
              WHERE o.rider_id = r.id AND o.status::text = 'delivered'
            ), 0)::float AS earnings,
            r.created_at,
            v.vehicle_type::text AS vehicle_type,
            v.vehicle_category::text AS vehicle_category,
            v.make AS vehicle_make,
            v.model AS vehicle_model,
            v.registration_number,
            v.fuel_type::text AS fuel_type,
            v.color AS vehicle_color,
            v.year AS vehicle_year,
            v.seating_capacity,
            v.verified AS vehicle_verified,
            v.rc_document_url
          FROM riders r
          LEFT JOIN LATERAL (
            SELECT dl.status::text AS duty_status
            FROM duty_logs dl
            WHERE dl.rider_id = r.id
            ORDER BY dl.timestamp DESC, dl.id DESC
            LIMIT 1
          ) ld ON TRUE
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS active_orders
            FROM orders_core o
            WHERE o.rider_id = r.id
              AND o.status::text NOT IN ('delivered', 'cancelled', 'failed')
              AND o.cancelled_at IS NULL
          ) ao ON TRUE
          LEFT JOIN LATERAL (
            SELECT *
            FROM rider_vehicles rv
            WHERE rv.rider_id = r.id
            ORDER BY rv.is_active DESC, rv.updated_at DESC NULLS LAST, rv.id DESC
            LIMIT 1
          ) v ON TRUE
          LEFT JOIN LATERAL (
            SELECT d.r2_key, d.file_url
            FROM rider_documents d
            WHERE d.rider_id = r.id
              AND d.doc_type::text IN ('selfie', 'profile_photo')
            ORDER BY d.verified DESC, d.updated_at DESC NULLS LAST, d.id DESC
            LIMIT 1
          ) sd ON TRUE
          WHERE r.id = ${riderId} AND r.deleted_at IS NULL
          LIMIT 1
        `,
      []
    ),
    safeQuery(
      "rider-active-order",
      () =>
        sql<
          {
            id: number;
            order_code: string | null;
            status: string;
            order_type: string;
            pickup: string | null;
            dropoff: string | null;
            distance_km: number | null;
            eta_seconds: number | null;
            earning: number;
            created_at: Date | string;
            estimated_delivery_time: Date | string | null;
          }[]
        >`
          SELECT
            o.id,
            COALESCE(NULLIF(o.formatted_order_id, ''), NULLIF(o.order_id, ''), o.id::text) AS order_code,
            o.status::text AS status,
            o.order_type::text AS order_type,
            COALESCE(NULLIF(o.pickup_address_normalized, ''), o.pickup_address_raw) AS pickup,
            COALESCE(NULLIF(o.drop_address_normalized, ''), o.drop_address_raw) AS dropoff,
            o.distance_km::float AS distance_km,
            o.eta_seconds,
            COALESCE(${riderEarnSql("o")}, 0)::float AS earning,
            o.created_at,
            o.estimated_delivery_time
          FROM orders_core o
          WHERE o.rider_id = ${riderId}
            AND o.status::text IN (
              'assigned','accepted','reached_store','picked_up','in_transit','created',
              'dispatch_ready','dispatched','bill_ready','payment_done','pymt_assign_rx'
            )
          ORDER BY o.updated_at DESC NULLS LAST, o.created_at DESC
          LIMIT 1
        `,
      []
    ),
    safeQuery(
      "rider-route-history",
      () =>
        sql<
          {
            id: number;
            order_code: string | null;
            status: string;
            order_type: string;
            pickup: string | null;
            dropoff: string | null;
            distance_km: number | null;
            created_at: Date | string;
            delivered_at: Date | string | null;
          }[]
        >`
          SELECT
            o.id,
            COALESCE(NULLIF(o.formatted_order_id, ''), NULLIF(o.order_id, ''), o.id::text) AS order_code,
            o.status::text AS status,
            o.order_type::text AS order_type,
            COALESCE(NULLIF(o.pickup_address_normalized, ''), o.pickup_address_raw) AS pickup,
            COALESCE(NULLIF(o.drop_address_normalized, ''), o.drop_address_raw) AS dropoff,
            o.distance_km::float AS distance_km,
            o.created_at,
            o.actual_delivery_time AS delivered_at
          FROM orders_core o
          WHERE o.rider_id = ${riderId}
            AND o.status::text = 'delivered'
          ORDER BY COALESCE(o.actual_delivery_time, o.created_at) DESC
          LIMIT 80
        `,
      []
    ),
    safeQuery(
      "rider-time-categories",
      () =>
        sql<{ category: string; seconds: number }[]>`
          WITH rider_orders AS (
            SELECT id
            FROM orders_core
            WHERE rider_id = ${riderId}
              AND created_at >= ${from}::timestamptz
              AND created_at < ${to}::timestamptz
          ),
          timed AS (
            SELECT
              ot.order_id,
              ot.status,
              ot.occurred_at,
              LEAD(ot.occurred_at) OVER (PARTITION BY ot.order_id ORDER BY ot.occurred_at, ot.id) AS next_at
            FROM order_timelines ot
            JOIN rider_orders ro ON ro.id = ot.order_id
          )
          SELECT
            CASE
              WHEN LOWER(status) IN ('picked_up', 'in_transit', 'dispatched') THEN 'on_the_way'
              WHEN LOWER(status) IN ('delivered', 'reached_customer', 'arrived') THEN 'unloading'
              WHEN LOWER(status) IN ('accepted', 'reached_store', 'bill_ready', 'dispatch_ready') THEN 'loading'
              ELSE 'waiting'
            END AS category,
            COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(next_at, NOW()) - occurred_at))), 0)::float AS seconds
          FROM timed
          GROUP BY 1
        `,
      []
    ),
    safeQuery(
      "rider-working-days",
      () =>
        sql<{ day: string; seconds: number }[]>`
          WITH ordered AS (
            SELECT
              status::text AS status,
              "timestamp" AS ts,
              LEAD(status::text) OVER (ORDER BY "timestamp", id) AS next_status,
              LEAD("timestamp") OVER (ORDER BY "timestamp", id) AS next_ts
            FROM duty_logs
            WHERE rider_id = ${riderId}
              AND "timestamp" >= (${to}::timestamptz - INTERVAL '14 days')
              AND "timestamp" < ${to}::timestamptz
          ),
          sessions AS (
            SELECT
              DATE(ts AT TIME ZONE 'Asia/Kolkata') AS day,
              EXTRACT(EPOCH FROM (COALESCE(next_ts, LEAST(NOW(), ${to}::timestamptz)) - ts)) AS seconds
            FROM ordered
            WHERE status = 'ON'
          )
          SELECT day::text AS day, COALESCE(SUM(seconds), 0)::float AS seconds
          FROM sessions
          GROUP BY 1
          ORDER BY 1 DESC
          LIMIT 7
        `,
      []
    ),
  ]);

  const rider = riderRows[0];
  if (!rider) throw new Error("Rider not found");

  const active = activeRows[0] ?? null;
  const availability = resolveEngineAvailability(rider.duty_status, num(rider.active_orders) > 0);
  // Duty OFF always wins over stale order rows — matches rider app OFF-DUTY.
  const dutyLabel =
    availability === "OFFLINE" ? "OFFLINE" : mapDutyLabel(availability, active ? str(active.status) : null);

  const catMap: Record<string, number> = {
    on_the_way: 0,
    unloading: 0,
    loading: 0,
    waiting: 0,
  };
  for (const row of timeCats) {
    const key = str(row.category);
    if (key in catMap) catMap[key] = num(row.seconds);
  }
  const catTotal = Object.values(catMap).reduce((a, b) => a + b, 0) || 1;

  const workSeries = [...workDays]
    .reverse()
    .map((d) => ({
      day: str(d.day),
      hours: Math.round((num(d.seconds) / 3600) * 10) / 10,
    }));
  const avgHours =
    workSeries.length > 0
      ? Math.round((workSeries.reduce((a, b) => a + b.hours, 0) / workSeries.length) * 10) / 10
      : 0;

  const vehicleType = str(rider.vehicle_type);
  const vehicleCategory = str(rider.vehicle_category);

  return {
    period,
    rider: {
      id: num(rider.id),
      name: str(rider.name) || "Unnamed rider",
      mobile: formatRiderMobile(rider.mobile, rider.country_code),
      status: str(rider.status),
      availability,
      dutyLabel,
      kyc: str(rider.kyc_status),
      city: str(rider.city) || "—",
      workingArea: workingAreaLabel({
        city: rider.city,
        district: rider.district,
        region: rider.region,
        state: rider.state,
        localityCode: rider.locality_code,
      }),
      vehicle: vehicleLabel({
        make: rider.vehicle_make,
        model: rider.vehicle_model,
        vehicleType,
        vehicleCategory,
        vehicleChoice: rider.vehicle_choice,
      }),
      vehicleType,
      vehicleCategory,
      plate: str(rider.registration_number),
      fuelType: str(rider.fuel_type),
      color: str(rider.vehicle_color),
      year: rider.vehicle_year == null ? null : num(rider.vehicle_year),
      seats: rider.seating_capacity == null ? null : num(rider.seating_capacity),
      vehicleVerified: Boolean(rider.vehicle_verified),
      hasDocuments: Boolean(rider.rc_document_url) || str(rider.kyc_status) === "APPROVED",
      selfieUrl:
        resolveSelfieUrl(rider.selfie_url) ||
        resolveSelfieUrl(rider.selfie_doc_key) ||
        resolveSelfieUrl(rider.selfie_doc_url),
      wallet: num(rider.wallet),
      deliveries: num(rider.deliveries),
      earnings: num(rider.earnings),
      createdAt: rider.created_at instanceof Date ? rider.created_at.toISOString() : str(rider.created_at),
    },
    activeRoute: active
      ? {
          id: num(active.id),
          code: str(active.order_code) || String(active.id),
          status: str(active.status),
          type: str(active.order_type),
          pickup: str(active.pickup) || "—",
          dropoff: str(active.dropoff) || "—",
          distanceKm: active.distance_km == null ? null : num(active.distance_km),
          etaSeconds: active.eta_seconds == null ? null : num(active.eta_seconds),
          earning: num(active.earning),
          createdAt: active.created_at instanceof Date ? active.created_at.toISOString() : str(active.created_at),
          etaAt:
            active.estimated_delivery_time instanceof Date
              ? active.estimated_delivery_time.toISOString()
              : active.estimated_delivery_time
                ? str(active.estimated_delivery_time)
                : null,
        }
      : null,
    routeHistory: historyRows.map((o) => ({
      id: num(o.id),
      code: str(o.order_code) || String(o.id),
      status: str(o.status),
      type: str(o.order_type),
      pickup: str(o.pickup) || "—",
      dropoff: str(o.dropoff) || "—",
      distanceKm: o.distance_km == null ? null : num(o.distance_km),
      createdAt: o.created_at instanceof Date ? o.created_at.toISOString() : str(o.created_at),
      deliveredAt:
        o.delivered_at instanceof Date
          ? o.delivered_at.toISOString()
          : o.delivered_at
            ? str(o.delivered_at)
            : null,
    })),
    timeCategories: [
      { key: "on_the_way", label: "On the way", seconds: catMap.on_the_way, pct: (catMap.on_the_way / catTotal) * 100 },
      { key: "unloading", label: "At drop", seconds: catMap.unloading, pct: (catMap.unloading / catTotal) * 100 },
      { key: "loading", label: "At pickup", seconds: catMap.loading, pct: (catMap.loading / catTotal) * 100 },
      { key: "waiting", label: "Waiting", seconds: catMap.waiting, pct: (catMap.waiting / catTotal) * 100 },
    ],
    workingTime: {
      days: workSeries.map((d) => ({ ...d, average: avgHours })),
      averageHours: avgHours,
    },
  };
}

export async function fetchMerchants(periodRaw: string | null) {
  const sql = getSql();
  const { period, from, to } = boundsFromSearch(periodRaw);

  const [stats, types, cities, recent] = await Promise.all([
    safeQuery(
      "mx-stats",
      () =>
        sql<{ total: number; live: number; accepting: number; new_in_period: number }[]>`
          SELECT
            COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND COALESCE(is_active, false) = true)::int AS live,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND COALESCE(is_accepting_orders, false) = true)::int AS accepting,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz)::int AS new_in_period
          FROM merchant_stores
        `,
      []
    ),
    safeQuery(
      "mx-types",
      () =>
        sql<{ store_type: string; count: number }[]>`
          SELECT COALESCE(NULLIF(store_type::text, ''), 'unspecified') AS store_type, COUNT(*)::int AS count
          FROM merchant_stores
          WHERE deleted_at IS NULL
          GROUP BY 1
          ORDER BY count DESC
        `,
      []
    ),
    safeQuery(
      "mx-cities",
      () =>
        sql<{ city: string; count: number }[]>`
          SELECT COALESCE(NULLIF(TRIM(city), ''), 'Unknown') AS city, COUNT(*)::int AS count
          FROM merchant_stores
          WHERE deleted_at IS NULL
          GROUP BY 1
          ORDER BY count DESC
          LIMIT 40
        `,
      []
    ),
    safeQuery(
      "mx-recent",
      () =>
        sql<
          {
            id: number;
            store_id: string;
            store_name: string;
            owner_full_name: string | null;
            store_phones: string[] | null;
            store_email: string | null;
            city: string | null;
            state: string | null;
            postal_code: string | null;
            store_type: string | null;
            status: string;
            approval_status: string | null;
            is_active: boolean | null;
            is_accepting_orders: boolean | null;
            banner_url: string | null;
            is_pure_veg: boolean | null;
            orders: number;
            delivered: number;
            cancelled: number;
            gmv: number;
            packaging: number;
            commission: number;
            wallet: number;
            rating_avg: number | null;
            rating_count: number;
            created_at: Date | string;
          }[]
        >`
          SELECT
            ms.id,
            ms.store_id,
            ms.store_name,
            ms.owner_full_name,
            ms.store_phones,
            ms.store_email,
            ms.city,
            ms.state,
            ms.postal_code,
            ms.store_type::text AS store_type,
            ms.status::text AS status,
            ms.approval_status::text AS approval_status,
            ms.is_active,
            ms.is_accepting_orders,
            ms.banner_url,
            ms.is_pure_veg,
            COALESCE(agg.orders, 0)::int AS orders,
            COALESCE(agg.delivered, 0)::int AS delivered,
            COALESCE(agg.cancelled, 0)::int AS cancelled,
            COALESCE(agg.ctm, 0)::float AS gmv,
            COALESCE(agg.packaging, 0)::float AS packaging,
            COALESCE(agg.commission, 0)::float AS commission,
            COALESCE(mw.available_balance, 0)::float AS wallet,
            rat.rating_avg,
            COALESCE(rat.rating_count, 0)::int AS rating_count,
            ms.created_at
          FROM merchant_stores ms
          LEFT JOIN merchant_wallet mw ON mw.merchant_store_id = ms.id
          LEFT JOIN (
            SELECT
              o.merchant_store_id,
              COUNT(*)::int AS orders,
              COUNT(*) FILTER (WHERE o.status::text = 'delivered')::int AS delivered,
              COUNT(*) FILTER (WHERE o.status::text = 'cancelled')::int AS cancelled,
              SUM(${ctmSql("o", "osb", "f")}) FILTER (WHERE o.status::text = 'delivered') AS ctm,
              SUM(${packagingSql("o", "osb")}) FILTER (WHERE o.status::text = 'delivered') AS packaging,
              SUM(COALESCE(osb.commission_amount, o.commission_amount, 0))
                FILTER (WHERE o.status::text = 'delivered') AS commission
            FROM orders_core o
            LEFT JOIN LATERAL (
              SELECT merchant_gross, packaging_charge, commission_amount
              FROM order_settlement_breakdown
              WHERE order_id = o.id
              LIMIT 1
            ) osb ON TRUE
            LEFT JOIN LATERAL (
              SELECT food_items_total_value
              FROM orders_food
              WHERE order_id = o.id
              LIMIT 1
            ) f ON TRUE
            WHERE o.merchant_store_id IS NOT NULL
            GROUP BY o.merchant_store_id
          ) agg ON agg.merchant_store_id = ms.id
          LEFT JOIN (
            SELECT
              store_id,
              AVG(rating)::float AS rating_avg,
              COUNT(*)::int AS rating_count
            FROM merchant_store_ratings
            GROUP BY store_id
          ) rat ON rat.store_id = ms.id
          WHERE ms.deleted_at IS NULL
          ORDER BY
            COALESCE(ms.is_active, false) DESC,
            COALESCE(ms.is_accepting_orders, false) DESC,
            COALESCE(agg.ctm, 0) DESC,
            ms.created_at ASC
          LIMIT 400
        `,
      []
    ),
  ]);

  return {
    period,
    stats: {
      total: num(stats[0]?.total),
      live: num(stats[0]?.live),
      accepting: num(stats[0]?.accepting),
      newInPeriod: num(stats[0]?.new_in_period),
    },
    types: types.map((r) => ({ type: str(r.store_type), count: num(r.count) })),
    cities: cities.map((r) => ({ city: str(r.city), count: num(r.count) })),
    recent: recent.map((r) => {
      const phones = Array.isArray(r.store_phones) ? r.store_phones.map((p) => str(p)).filter(Boolean) : [];
      return {
        id: num(r.id),
      storeId: str(r.store_id),
        name: str(r.store_name) || "Unnamed store",
        ownerName: str(r.owner_full_name) || "—",
        phone: phones[0] || "—",
        email: str(r.store_email) || "—",
      city: str(r.city) || "—",
        state: str(r.state) || "—",
        pincode: str(r.postal_code),
        cityGroup: str(r.city).trim() || "Unknown",
      type: str(r.store_type) || "—",
      status: str(r.status),
        approval: str(r.approval_status) || "—",
      live: Boolean(r.is_active),
        accepting: Boolean(r.is_accepting_orders),
        pureVeg: Boolean(r.is_pure_veg),
        bannerUrl: resolveSelfieUrl(str(r.banner_url)) || null,
      orders: num(r.orders),
        delivered: num(r.delivered),
        cancelled: num(r.cancelled),
      gmv: num(r.gmv),
      packaging: num(r.packaging),
      commission: num(r.commission),
        wallet: num(r.wallet),
        ratingAvg: r.rating_avg == null ? null : num(r.rating_avg),
        ratingCount: num(r.rating_count),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : str(r.created_at),
      };
    }),
    byCtm: recent
      .map((r) => ({
        name: str(r.store_name) || str(r.store_id),
        orders: num(r.orders),
        ctm: num(r.gmv),
        packaging: num(r.packaging),
      }))
      .filter((r) => r.ctm > 0 || r.orders > 0)
      .sort((a, b) => b.ctm - a.ctm)
      .slice(0, 8),
  };
}

export async function fetchMerchantDetail(storeIdRaw: string, periodRaw: string | null) {
  const sql = getSql();
  const storeKey = str(storeIdRaw).trim();
  if (!storeKey) throw new Error("Invalid store id");
  const { period, from, to } = boundsFromSearch(periodRaw);

  const [profileRows, orderRows, statusRows, spendRows, activeRows, ratingRows, payoutRows] =
    await Promise.all([
      safeQuery(
        "merchant-detail",
        () =>
          sql<
            {
              id: number;
              store_id: string;
              store_name: string;
              store_display_name: string | null;
              store_description: string | null;
              owner_full_name: string | null;
              store_email: string | null;
              store_phones: string[] | null;
              full_address: string | null;
              landmark: string | null;
              city: string | null;
              state: string | null;
              postal_code: string | null;
              store_type: string | null;
              status: string;
              approval_status: string | null;
              is_active: boolean | null;
              is_accepting_orders: boolean | null;
              is_available: boolean | null;
              banner_url: string | null;
              cuisine_types: string[] | null;
              avg_preparation_time_minutes: number | null;
              packaging_charge_amount: number | null;
              min_order_amount: number | null;
              delivery_radius_km: number | null;
              is_pure_veg: boolean | null;
              accepts_online_payment: boolean | null;
              accepts_cash: boolean | null;
              onboarding_completed: boolean | null;
              current_onboarding_step: number | null;
              parent_name: string | null;
              parent_merchant_id: string | null;
              wallet: number;
              wallet_pending: number;
              wallet_hold: number;
              lifetime_credit: number;
              lifetime_debit: number;
              total_earned: number;
              total_withdrawn: number;
              rating_avg: number | null;
              rating_count: number;
              lifetime_orders: number;
              lifetime_delivered: number;
              lifetime_cancelled: number;
              lifetime_ctm: number;
              lifetime_commission: number;
              created_at: Date | string;
              last_activity_at: Date | string | null;
            }[]
          >`
            SELECT
              ms.id,
              ms.store_id,
              ms.store_name,
              ms.store_display_name,
              ms.store_description,
              ms.owner_full_name,
              ms.store_email,
              ms.store_phones,
              ms.full_address,
              ms.landmark,
              ms.city,
              ms.state,
              ms.postal_code,
              ms.store_type::text AS store_type,
              ms.status::text AS status,
              ms.approval_status::text AS approval_status,
              ms.is_active,
              ms.is_accepting_orders,
              ms.is_available,
              ms.banner_url,
              ms.cuisine_types,
              ms.avg_preparation_time_minutes,
              ms.packaging_charge_amount::float AS packaging_charge_amount,
              ms.min_order_amount::float AS min_order_amount,
              ms.delivery_radius_km::float AS delivery_radius_km,
              ms.is_pure_veg,
              ms.accepts_online_payment,
              ms.accepts_cash,
              ms.onboarding_completed,
              ms.current_onboarding_step,
              mp.parent_name,
              mp.parent_merchant_id,
              COALESCE(mw.available_balance, 0)::float AS wallet,
              COALESCE(mw.pending_balance, 0)::float AS wallet_pending,
              COALESCE(mw.hold_balance, 0)::float AS wallet_hold,
              COALESCE(mw.lifetime_credit, 0)::float AS lifetime_credit,
              COALESCE(mw.lifetime_debit, 0)::float AS lifetime_debit,
              COALESCE(mw.total_earned, 0)::float AS total_earned,
              COALESCE(mw.total_withdrawn, 0)::float AS total_withdrawn,
              rat.rating_avg,
              COALESCE(rat.rating_count, 0)::int AS rating_count,
              COALESCE(life.orders, 0)::int AS lifetime_orders,
              COALESCE(life.delivered, 0)::int AS lifetime_delivered,
              COALESCE(life.cancelled, 0)::int AS lifetime_cancelled,
              COALESCE(life.ctm, 0)::float AS lifetime_ctm,
              COALESCE(life.commission, 0)::float AS lifetime_commission,
              ms.created_at,
              ms.last_activity_at
            FROM merchant_stores ms
            LEFT JOIN merchant_parents mp ON mp.id = ms.parent_id
            LEFT JOIN merchant_wallet mw ON mw.merchant_store_id = ms.id
            LEFT JOIN (
              SELECT store_id, AVG(rating)::float AS rating_avg, COUNT(*)::int AS rating_count
              FROM merchant_store_ratings
              GROUP BY store_id
            ) rat ON rat.store_id = ms.id
            LEFT JOIN (
              SELECT
                o.merchant_store_id,
                COUNT(*)::int AS orders,
                COUNT(*) FILTER (WHERE o.status::text = 'delivered')::int AS delivered,
                COUNT(*) FILTER (WHERE o.status::text = 'cancelled')::int AS cancelled,
                SUM(${ctmSql("o", "osb", "f")}) FILTER (WHERE o.status::text = 'delivered') AS ctm,
                SUM(COALESCE(osb.commission_amount, o.commission_amount, 0))
                  FILTER (WHERE o.status::text = 'delivered') AS commission
              FROM orders_core o
              LEFT JOIN LATERAL (
                SELECT merchant_gross, packaging_charge, commission_amount
                FROM order_settlement_breakdown WHERE order_id = o.id LIMIT 1
              ) osb ON TRUE
              LEFT JOIN LATERAL (
                SELECT food_items_total_value FROM orders_food WHERE order_id = o.id LIMIT 1
              ) f ON TRUE
              WHERE o.merchant_store_id IS NOT NULL
              GROUP BY o.merchant_store_id
            ) life ON life.merchant_store_id = ms.id
            WHERE ms.deleted_at IS NULL
              AND (ms.store_id = ${storeKey} OR ms.id::text = ${storeKey})
            LIMIT 1
          `,
        []
      ),
      safeQuery(
        "merchant-orders",
        () =>
          sql<
            {
              id: number;
              order_code: string | null;
              status: string;
              order_type: string;
              pickup: string | null;
              dropoff: string | null;
              payable: number;
              ctm: number;
              gross_ctm: number;
              net_ctm: number;
              commission: number;
              compensation: number;
              penalty: number;
              created_at: Date | string;
              delivered_at: Date | string | null;
            }[]
          >`
            SELECT
              o.id,
              COALESCE(NULLIF(o.formatted_order_id, ''), NULLIF(o.order_id, ''), o.id::text) AS order_code,
              o.status::text AS status,
              o.order_type::text AS order_type,
              COALESCE(NULLIF(o.pickup_address_normalized, ''), o.pickup_address_raw) AS pickup,
              COALESCE(NULLIF(o.drop_address_normalized, ''), o.drop_address_raw) AS dropoff,
              COALESCE(${payableSql("o")}, 0)::float AS payable,
              COALESCE(${ctmSql("o", "osb", "f")}, 0)::float AS ctm,
              COALESCE(osb.merchant_gross, ${ctmSql("o", "osb", "f")}, 0)::float AS gross_ctm,
              COALESCE(
                osb.merchant_net,
                COALESCE(osb.merchant_gross, ${ctmSql("o", "osb", "f")}, 0)
                  - COALESCE(osb.commission_amount, o.commission_amount, 0),
                0
              )::float AS net_ctm,
              COALESCE(osb.commission_amount, o.commission_amount, 0)::float AS commission,
              COALESCE(adj.compensation, 0)::float AS compensation,
              COALESCE(GREATEST(COALESCE(adj.penalty, 0), COALESCE(pen.penalty, 0)), 0)::float AS penalty,
              o.created_at,
              o.actual_delivery_time AS delivered_at
            FROM orders_core o
            JOIN merchant_stores ms ON ms.id = o.merchant_store_id
            LEFT JOIN LATERAL (
              SELECT merchant_gross, merchant_net, packaging_charge, commission_amount
              FROM order_settlement_breakdown WHERE order_id = o.id LIMIT 1
            ) osb ON TRUE
            LEFT JOIN LATERAL (
              SELECT food_items_total_value FROM orders_food WHERE order_id = o.id LIMIT 1
            ) f ON TRUE
            LEFT JOIN LATERAL (
              SELECT
                COALESCE(SUM(mwl.amount) FILTER (
                  WHERE mwl.direction::text = 'CREDIT'
                    AND mwl.category::text IN ('ORDER_ADJUSTMENT', 'BONUS', 'MANUAL_CREDIT', 'CASHBACK')
                ), 0) AS compensation,
                COALESCE(SUM(mwl.amount) FILTER (
                  WHERE mwl.direction::text = 'DEBIT'
                    AND mwl.category::text IN ('PENALTY', 'ADJUSTMENT', 'MANUAL_DEBIT')
                ), 0) AS penalty
              FROM merchant_wallet_ledger mwl
              WHERE mwl.reference_type::text = 'ORDER'
                AND mwl.reference_id = o.id
            ) adj ON TRUE
            LEFT JOIN LATERAL (
              SELECT COALESCE(SUM(mp.amount), 0) AS penalty
              FROM merchant_penalties mp
              WHERE mp.reference_type::text = 'ORDER'
                AND mp.reference_id = o.id
            ) pen ON TRUE
            WHERE ms.deleted_at IS NULL
              AND (ms.store_id = ${storeKey} OR ms.id::text = ${storeKey})
            ORDER BY o.created_at DESC
            LIMIT 50
          `,
        []
      ),
      safeQuery(
        "merchant-status-mix",
        () =>
          sql<{ status: string; orders: number }[]>`
            SELECT o.status::text AS status, COUNT(*)::int AS orders
            FROM orders_core o
            JOIN merchant_stores ms ON ms.id = o.merchant_store_id
            WHERE ms.deleted_at IS NULL
              AND (ms.store_id = ${storeKey} OR ms.id::text = ${storeKey})
            GROUP BY 1
            ORDER BY orders DESC
          `,
        []
      ),
      safeQuery(
        "merchant-spend-days",
        () =>
          sql<{ day: string; ctm: number; orders: number; commission: number }[]>`
            SELECT
              DATE(o.created_at AT TIME ZONE 'Asia/Kolkata')::text AS day,
              COALESCE(SUM(${ctmSql("o", "osb", "f")}) FILTER (WHERE o.status::text = 'delivered'), 0)::float AS ctm,
              COUNT(*)::int AS orders,
              COALESCE(SUM(COALESCE(osb.commission_amount, o.commission_amount, 0))
                FILTER (WHERE o.status::text = 'delivered'), 0)::float AS commission
            FROM orders_core o
            JOIN merchant_stores ms ON ms.id = o.merchant_store_id
            LEFT JOIN LATERAL (
              SELECT merchant_gross, packaging_charge, commission_amount
              FROM order_settlement_breakdown WHERE order_id = o.id LIMIT 1
            ) osb ON TRUE
            LEFT JOIN LATERAL (
              SELECT food_items_total_value FROM orders_food WHERE order_id = o.id LIMIT 1
            ) f ON TRUE
            WHERE ms.deleted_at IS NULL
              AND (ms.store_id = ${storeKey} OR ms.id::text = ${storeKey})
              AND o.created_at >= ${from}::timestamptz
              AND o.created_at < ${to}::timestamptz
            GROUP BY 1
            ORDER BY 1 ASC
          `,
        []
      ),
      safeQuery(
        "merchant-active-order",
        () =>
          sql<
            {
              id: number;
              order_code: string | null;
              status: string;
              order_type: string;
              pickup: string | null;
              dropoff: string | null;
              payable: number;
              created_at: Date | string;
            }[]
          >`
            SELECT
              o.id,
              COALESCE(NULLIF(o.formatted_order_id, ''), NULLIF(o.order_id, ''), o.id::text) AS order_code,
              o.status::text AS status,
              o.order_type::text AS order_type,
              COALESCE(NULLIF(o.pickup_address_normalized, ''), o.pickup_address_raw) AS pickup,
              COALESCE(NULLIF(o.drop_address_normalized, ''), o.drop_address_raw) AS dropoff,
              COALESCE(${payableSql("o")}, 0)::float AS payable,
              o.created_at
            FROM orders_core o
            JOIN merchant_stores ms ON ms.id = o.merchant_store_id
            WHERE ms.deleted_at IS NULL
              AND (ms.store_id = ${storeKey} OR ms.id::text = ${storeKey})
              AND o.status::text NOT IN ('delivered', 'cancelled', 'failed')
              AND o.cancelled_at IS NULL
            ORDER BY o.updated_at DESC NULLS LAST, o.created_at DESC
            LIMIT 1
          `,
        []
      ),
      safeQuery(
        "merchant-ratings",
        () =>
          sql<
            {
              id: number;
              rating: number;
              food_rating: number | null;
              service_rating: number | null;
              packaging_rating: number | null;
              review_text: string | null;
              review_title: string | null;
              created_at: Date | string;
            }[]
          >`
            SELECT
              r.id, r.rating, r.food_rating, r.service_rating, r.packaging_rating,
              r.review_text, r.review_title, r.created_at
            FROM merchant_store_ratings r
            JOIN merchant_stores ms ON ms.id = r.store_id
            WHERE ms.deleted_at IS NULL
              AND (ms.store_id = ${storeKey} OR ms.id::text = ${storeKey})
            ORDER BY r.created_at DESC
            LIMIT 30
          `,
        []
      ),
      safeQuery(
        "merchant-payouts",
        () =>
          sql<
            {
              id: number;
              amount: number;
              net: number;
              status: string;
              created_at: Date | string;
            }[]
          >`
            SELECT
              mpr.id,
              COALESCE(mpr.amount, 0)::float AS amount,
              COALESCE(mpr.net_payout_amount, mpr.amount, 0)::float AS net,
              mpr.status::text AS status,
              mpr.created_at
            FROM merchant_payout_requests mpr
            JOIN merchant_wallet mw ON mw.id = mpr.wallet_id
            JOIN merchant_stores ms ON ms.id = mw.merchant_store_id
            WHERE ms.deleted_at IS NULL
              AND (ms.store_id = ${storeKey} OR ms.id::text = ${storeKey})
            ORDER BY mpr.created_at DESC
            LIMIT 20
          `,
        []
      ),
    ]);

  const profile = profileRows[0];
  if (!profile) throw new Error("Store not found");

  const phones = Array.isArray(profile.store_phones)
    ? profile.store_phones.map((p) => str(p)).filter(Boolean)
    : [];
  const cuisines = Array.isArray(profile.cuisine_types)
    ? profile.cuisine_types.map((c) => str(c)).filter(Boolean)
    : [];

  const active = activeRows[0] ?? null;
  const periodOrders = orderRows.filter((o) => {
    const t = o.created_at instanceof Date ? o.created_at.getTime() : new Date(String(o.created_at)).getTime();
    const fromT = new Date(from).getTime();
    const toT = new Date(to).getTime();
    return Number.isFinite(t) && t >= fromT && t < toT;
  });
  const periodDelivered = periodOrders.filter((o) => str(o.status) === "delivered").length;
  const periodCancelled = periodOrders.filter((o) => str(o.status) === "cancelled").length;
  const periodCtm = periodOrders
    .filter((o) => str(o.status) === "delivered")
    .reduce((a, o) => a + num(o.ctm), 0);
  const periodCommission = periodOrders
    .filter((o) => str(o.status) === "delivered")
    .reduce((a, o) => a + num(o.commission), 0);

  return {
    period,
    store: {
      id: num(profile.id),
      storeId: str(profile.store_id),
      name: str(profile.store_name) || "Unnamed store",
      displayName: str(profile.store_display_name) || str(profile.store_name) || "Unnamed store",
      description: str(profile.store_description) || "—",
      ownerName: str(profile.owner_full_name) || "—",
      email: str(profile.store_email) || "—",
      phone: phones[0] || "—",
      phones,
      address: str(profile.full_address) || "—",
      landmark: str(profile.landmark) || "—",
      city: str(profile.city) || "—",
      state: str(profile.state) || "—",
      pincode: str(profile.postal_code),
      type: str(profile.store_type) || "—",
      status: str(profile.status),
      approval: str(profile.approval_status) || "—",
      live: Boolean(profile.is_active),
      accepting: Boolean(profile.is_accepting_orders),
      available: Boolean(profile.is_available),
      bannerUrl: resolveSelfieUrl(str(profile.banner_url)) || null,
      cuisines,
      prepMinutes: profile.avg_preparation_time_minutes == null ? null : num(profile.avg_preparation_time_minutes),
      packagingCharge: profile.packaging_charge_amount == null ? null : num(profile.packaging_charge_amount),
      minOrder: profile.min_order_amount == null ? null : num(profile.min_order_amount),
      deliveryRadiusKm: profile.delivery_radius_km == null ? null : num(profile.delivery_radius_km),
      pureVeg: Boolean(profile.is_pure_veg),
      acceptsOnline: Boolean(profile.accepts_online_payment),
      acceptsCash: Boolean(profile.accepts_cash),
      onboardingDone: Boolean(profile.onboarding_completed),
      onboardingStep: profile.current_onboarding_step == null ? null : num(profile.current_onboarding_step),
      parentName: str(profile.parent_name) || null,
      parentId: str(profile.parent_merchant_id) || null,
      wallet: num(profile.wallet),
      walletPending: num(profile.wallet_pending),
      walletHold: num(profile.wallet_hold),
      lifetimeCredit: num(profile.lifetime_credit),
      lifetimeDebit: num(profile.lifetime_debit),
      totalEarned: num(profile.total_earned),
      totalWithdrawn: num(profile.total_withdrawn),
      ratingAvg: profile.rating_avg == null ? null : num(profile.rating_avg),
      ratingCount: num(profile.rating_count),
      lifetimeOrders: num(profile.lifetime_orders),
      lifetimeDelivered: num(profile.lifetime_delivered),
      lifetimeCancelled: num(profile.lifetime_cancelled),
      lifetimeCtm: num(profile.lifetime_ctm),
      lifetimeCommission: num(profile.lifetime_commission),
      periodOrders: periodOrders.length,
      periodDelivered,
      periodCancelled,
      periodCtm,
      periodCommission,
      createdAt:
        profile.created_at instanceof Date ? profile.created_at.toISOString() : str(profile.created_at),
      lastActivityAt:
        profile.last_activity_at instanceof Date
          ? profile.last_activity_at.toISOString()
          : profile.last_activity_at
            ? str(profile.last_activity_at)
            : null,
    },
    activeOrder: active
      ? {
          id: num(active.id),
          code: str(active.order_code) || String(active.id),
          status: str(active.status),
          type: str(active.order_type),
          pickup: str(active.pickup) || "—",
          dropoff: str(active.dropoff) || "—",
          payable: num(active.payable),
          createdAt:
            active.created_at instanceof Date ? active.created_at.toISOString() : str(active.created_at),
        }
      : null,
    orderHistory: orderRows.map((o) => ({
      id: num(o.id),
      code: str(o.order_code) || String(o.id),
      status: str(o.status),
      type: str(o.order_type),
      pickup: str(o.pickup) || "—",
      dropoff: str(o.dropoff) || "—",
      payable: num(o.payable),
      ctm: num(o.ctm),
      grossCtm: num(o.gross_ctm),
      netCtm: num(o.net_ctm),
      commission: num(o.commission),
      compensation: num(o.compensation),
      penalty: num(o.penalty),
      createdAt: o.created_at instanceof Date ? o.created_at.toISOString() : str(o.created_at),
      deliveredAt:
        o.delivered_at instanceof Date
          ? o.delivered_at.toISOString()
          : o.delivered_at
            ? str(o.delivered_at)
            : null,
    })),
    statusMix: statusRows.map((r) => ({ status: str(r.status), orders: num(r.orders) })),
    spendSeries: spendRows.map((r) => ({
      day: str(r.day),
      ctm: num(r.ctm),
      orders: num(r.orders),
      commission: num(r.commission),
    })),
    ratings: ratingRows.map((r) => ({
      id: num(r.id),
      rating: num(r.rating),
      food: r.food_rating == null ? null : num(r.food_rating),
      service: r.service_rating == null ? null : num(r.service_rating),
      packaging: r.packaging_rating == null ? null : num(r.packaging_rating),
      title: str(r.review_title) || null,
      text: str(r.review_text) || null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : str(r.created_at),
    })),
    payouts: payoutRows.map((r) => ({
      id: num(r.id),
      amount: num(r.amount),
      net: num(r.net),
      status: str(r.status),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : str(r.created_at),
    })),
  };
}


export async function fetchFinance(periodRaw: string | null) {
  const sql = getSql();
  const { period, from, to } = boundsFromSearch(periodRaw);

  const [core, refunds, wallets] = await Promise.all([
    safeQuery(
      "fin-core",
      () =>
        sql<{
          gmv: number;
          commission: number;
          rider_earning: number;
          gst: number;
          tips: number;
          donations: number;
          platform_fee: number;
        }[]>`
          SELECT
            COALESCE(SUM(${payableSql()}) FILTER (WHERE status::text = 'delivered'), 0)::float AS gmv,
            COALESCE(SUM(${commissionSql()} + ${platformFeeSql()}) FILTER (WHERE status::text = 'delivered'), 0)::float AS commission,
            COALESCE(SUM(${riderEarnSql()}) FILTER (WHERE status::text = 'delivered'), 0)::float AS rider_earning,
            COALESCE(SUM(${gstRemitSql()}) FILTER (WHERE status::text = 'delivered'), 0)::float AS gst,
            COALESCE(SUM(${tipSql()}) FILTER (WHERE status::text = 'delivered'), 0)::float AS tips,
            COALESCE(SUM(${donationSql()}) FILTER (WHERE status::text = 'delivered'), 0)::float AS donations,
            COALESCE(SUM(${platformFeeSql()} + ${subscriptionSql()}) FILTER (WHERE status::text = 'delivered'), 0)::float AS platform_fee
          FROM orders_core
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
        `,
      []
    ),
    safeQuery(
      "fin-refunds",
      () =>
        sql<{ count: number; amount: number }[]>`
          SELECT COUNT(*)::int AS count, COALESCE(SUM(refund_amount), 0)::float AS amount
          FROM order_refunds
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
        `,
      [{ count: 0, amount: 0 }]
    ),
    safeQuery(
      "fin-wallets",
      () =>
        sql<{ customer_wallet: number; rider_wallet: number }[]>`
          SELECT
            COALESCE((SELECT SUM(COALESCE(current_balance, 0)) FROM customer_wallet), 0)::float AS customer_wallet,
            COALESCE((SELECT SUM(COALESCE(total_balance, 0)) FROM rider_wallet), 0)::float AS rider_wallet
        `,
      []
    ),
  ]);

  return {
    period,
    gmv: num(core[0]?.gmv),
    commission: num(core[0]?.commission),
    riderEarning: num(core[0]?.rider_earning),
    gst: num(core[0]?.gst),
    riderTips: num(core[0]?.tips),
    feedingIndia: num(core[0]?.donations),
    platformFee: num(core[0]?.platform_fee),
    refunds: { count: num(refunds[0]?.count), amount: num(refunds[0]?.amount) },
    customerWallet: num(wallets[0]?.customer_wallet),
    riderWallet: num(wallets[0]?.rider_wallet),
  };
}

export async function fetchSupport(periodRaw: string | null) {
  const sql = getSql();
  const { period, from, to } = boundsFromSearch(periodRaw);

  const [stats, byStatus, bySource, recent] = await Promise.all([
    safeQuery(
      "sup-stats",
      () =>
        sql<{ total: number; open: number; resolved: number }[]>`
          SELECT
            COUNT(*) FILTER (WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz)::int AS total,
            COUNT(*) FILTER (WHERE status::text IN ('OPEN','IN_PROGRESS','PENDING','ASSIGNED','REOPENED'))::int AS open,
            COUNT(*) FILTER (WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz AND status::text IN ('RESOLVED','CLOSED'))::int AS resolved
          FROM unified_tickets
        `,
      []
    ),
    safeQuery(
      "sup-status",
      () =>
        sql<{ status: string; count: number }[]>`
          SELECT status::text AS status, COUNT(*)::int AS count
          FROM unified_tickets
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
          GROUP BY 1
          ORDER BY count DESC
        `,
      []
    ),
    safeQuery(
      "sup-source",
      () =>
        sql<{ source: string; count: number }[]>`
          SELECT ticket_source::text AS source, COUNT(*)::int AS count
          FROM unified_tickets
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
          GROUP BY 1
          ORDER BY count DESC
        `,
      []
    ),
    safeQuery(
      "sup-recent",
      () =>
        sql<
          {
            ticket_id: string;
            subject: string;
            status: string;
            priority: string;
            ticket_source: string;
            created_at: Date;
          }[]
        >`
          SELECT ticket_id, subject, status::text AS status, priority::text AS priority,
                 ticket_source::text AS ticket_source, created_at
          FROM unified_tickets
          ORDER BY created_at DESC
          LIMIT 30
        `,
      []
    ),
  ]);

  return {
    period,
    stats: {
      total: num(stats[0]?.total),
      open: num(stats[0]?.open),
      resolved: num(stats[0]?.resolved),
    },
    byStatus: byStatus.map((r) => ({ status: str(r.status), count: num(r.count) })),
    bySource: bySource.map((r) => ({ source: str(r.source), count: num(r.count) })),
    recent: recent.map((r) => ({
      id: str(r.ticket_id),
      subject: str(r.subject),
      status: str(r.status),
      priority: str(r.priority),
      source: str(r.ticket_source),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : str(r.created_at),
    })),
  };
}

async function ensureTaxFilingsTable() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS platform_tax_filings (
      id bigserial PRIMARY KEY,
      tax_type text NOT NULL DEFAULT 'GST',
      period_label text NOT NULL,
      period_start date NOT NULL,
      period_end date NOT NULL,
      amount_due numeric(14,2) NOT NULL DEFAULT 0,
      amount_filed numeric(14,2) NOT NULL DEFAULT 0,
      filed_at timestamptz,
      reference text,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS platform_tax_filings_period_idx
      ON platform_tax_filings (tax_type, period_start DESC)
  `;
}

export async function fetchTax(periodRaw: string | null) {
  const sql = getSql();
  const { period, from, to } = boundsFromSearch(periodRaw);
  await ensureTaxFilingsTable();

  const [monthly, filings, current, tdsRow] = await Promise.all([
    safeQuery(
      "tax-monthly",
      () =>
        sql<{ month: string; gst: number; tds: number; orders: number }[]>`
          SELECT
            to_char(date_trunc('month', created_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM') AS month,
            COALESCE(SUM(${gstRemitSql()}), 0)::float AS gst,
            0::float AS tds,
            COUNT(*)::int AS orders
          FROM orders_core
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
            AND status::text = 'delivered'
          GROUP BY 1
          ORDER BY 1
        `,
      []
    ),
    safeQuery(
      "tax-filings",
      () =>
        sql<
          {
            id: number;
            tax_type: string;
            period_label: string;
            amount_due: number;
            amount_filed: number;
            filed_at: Date | null;
            reference: string | null;
          }[]
        >`
          SELECT id, tax_type, period_label, amount_due::float AS amount_due,
                 amount_filed::float AS amount_filed, filed_at, reference
          FROM platform_tax_filings
          ORDER BY period_start DESC
          LIMIT 24
        `,
      []
    ),
    safeQuery(
      "tax-current",
      () =>
        sql<{ gst: number; platform_gst: number }[]>`
          SELECT
            COALESCE(SUM(${gstSql()}), 0)::float AS gst,
            COALESCE(SUM(${gstRemitSql()}), 0)::float AS platform_gst
          FROM orders_core
          WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
            AND status::text = 'delivered'
        `,
      []
    ),
    safeQuery(
      "tax-tds",
      () =>
        sql<{ tds: number }[]>`
          SELECT COALESCE(SUM(COALESCE(osb.tds_amount, 0)), 0)::float AS tds
          FROM order_settlement_breakdown osb
          JOIN orders_core oc ON oc.id = osb.order_id
          WHERE oc.created_at >= ${from}::timestamptz AND oc.created_at < ${to}::timestamptz
            AND oc.status::text = 'delivered'
        `,
      [{ tds: 0 }]
    ),
  ]);

  const gstDue = num(current[0]?.gst);
  const platformGst = num(current[0]?.platform_gst);
  const tds = num(tdsRow[0]?.tds);
  const gstFiled = filings
    .filter((f) => str(f.tax_type).toUpperCase() === "GST")
    .reduce((s, f) => s + num(f.amount_filed), 0);
  const lastFiling = filings[0] ?? null;

  return {
    period,
    gstCollected: gstDue,
    gstPlatform: platformGst,
    tdsCollected: tds,
    gstFiled,
    gstRemaining: Math.max(0, platformGst - gstFiled),
    lastFiledAt: lastFiling?.filed_at
      ? lastFiling.filed_at instanceof Date
        ? lastFiling.filed_at.toISOString()
        : str(lastFiling.filed_at)
      : null,
    lastFiledLabel: lastFiling ? str(lastFiling.period_label) : null,
    monthly: monthly.map((r) => ({
      month: str(r.month),
      gst: num(r.gst),
      tds: num(r.tds),
      orders: num(r.orders),
    })),
    filings: filings.map((r) => ({
      id: num(r.id),
      taxType: str(r.tax_type),
      periodLabel: str(r.period_label),
      amountDue: num(r.amount_due),
      amountFiled: num(r.amount_filed),
      filedAt: r.filed_at instanceof Date ? r.filed_at.toISOString() : r.filed_at ? str(r.filed_at) : null,
      reference: str(r.reference) || "—",
    })),
  };
}

export async function recordTaxFiling(input: {
  taxType: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  amountDue: number;
  amountFiled: number;
  reference?: string;
  notes?: string;
}) {
  await ensureTaxFilingsTable();
  const sql = getSql();
  const rows = await sql<{ id: number }[]>`
    INSERT INTO platform_tax_filings (
      tax_type, period_label, period_start, period_end, amount_due, amount_filed, filed_at, reference, notes
    ) VALUES (
      ${input.taxType || "GST"},
      ${input.periodLabel},
      ${input.periodStart},
      ${input.periodEnd},
      ${input.amountDue},
      ${input.amountFiled},
      now(),
      ${input.reference || null},
      ${input.notes || null}
    )
    RETURNING id
  `;
  return { id: rows[0]?.id ?? 0 };
}

export type OverviewData = Awaited<ReturnType<typeof fetchOverview>>;
export type PerformanceData = Awaited<ReturnType<typeof fetchPerformance>>;
export type AnalyticsData = Awaited<ReturnType<typeof fetchAnalytics>>;
export type PaymentsData = Awaited<ReturnType<typeof fetchPayments>>;
export type OrdersData = Awaited<ReturnType<typeof fetchOrders>>;
export type CustomersData = Awaited<ReturnType<typeof fetchCustomers>>;
export type RidersData = Awaited<ReturnType<typeof fetchRiders>>;
export type RiderDetailData = Awaited<ReturnType<typeof fetchRiderDetail>>;
export type MerchantsData = Awaited<ReturnType<typeof fetchMerchants>>;
export type MerchantDetailData = Awaited<ReturnType<typeof fetchMerchantDetail>>;
export type FinanceData = Awaited<ReturnType<typeof fetchFinance>>;
export type SupportData = Awaited<ReturnType<typeof fetchSupport>>;
export type TaxData = Awaited<ReturnType<typeof fetchTax>>;
export type { Period };
