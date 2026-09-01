import "server-only";

import { getSql, num, safeQuery, str } from "@/lib/db/client";
import { parsePeriod, periodBounds, type Period } from "@/lib/period";

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
            (SELECT COUNT(*)::int FROM riders WHERE deleted_at IS NULL AND availability_status::text = 'ONLINE') AS riders_online,
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
                AND lower(status) IN ('paid', 'collected', 'deducted')
            ), 0)
            + COALESCE((
              SELECT SUM(amount) FROM merchant_penalties
              WHERE created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
                AND lower(status) IN ('paid', 'collected', 'deducted', 'applied')
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
  const { period, from, to } = boundsFromSearch(periodRaw);

  const [summary, recent] = await Promise.all([
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
            ms.store_name,
            r.name AS rider_name,
            oc.created_at
          FROM orders_core oc
          LEFT JOIN customers c ON c.id = oc.customer_id
          LEFT JOIN merchant_stores ms ON ms.id = oc.merchant_store_id
          LEFT JOIN riders r ON r.id = oc.rider_id
          ORDER BY oc.created_at DESC
          LIMIT 200
        `,
      []
    ),
  ]);

  return {
    period,
    summary: summary.map((r) => ({
      type: str(r.order_type),
      status: str(r.status),
      orders: num(r.orders),
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
      store: str(r.store_name) || "—",
      rider: str(r.rider_name) || "—",
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : str(r.created_at),
    })),
  };
}

export async function fetchCustomers(periodRaw: string | null) {
  const sql = getSql();
  const { period, from, to } = boundsFromSearch(periodRaw);

  const [stats, states, recent] = await Promise.all([
    safeQuery(
      "customers-stats",
      () =>
        sql<{ total: number; active: number; new_in_period: number; wallet: number }[]>`
          SELECT
            COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND account_status::text = 'ACTIVE')::int AS active,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz)::int AS new_in_period,
            COALESCE(SUM(wallet_balance) FILTER (WHERE deleted_at IS NULL), 0)::float AS wallet
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
      "customers-recent",
      () =>
        sql<
          {
            customer_id: string;
            full_name: string;
            email: string | null;
            primary_mobile: string;
            account_status: string;
            city: string | null;
            wallet: number;
            orders: number;
            gmv: number;
            created_at: Date | string;
          }[]
        >`
          SELECT
            c.customer_id,
            c.full_name,
            c.email,
            c.primary_mobile,
            c.account_status::text AS account_status,
            c.city,
            COALESCE(c.wallet_balance, 0)::float AS wallet,
            COALESCE((
              SELECT COUNT(*)::int FROM orders_core o WHERE o.customer_id = c.id
            ), 0) AS orders,
            COALESCE((
              SELECT SUM(${payableSql("o")})
              FROM orders_core o
              WHERE o.customer_id = c.id AND o.status::text = 'delivered'
            ), 0)::float AS gmv,
            c.created_at
          FROM customers c
          WHERE c.deleted_at IS NULL
          ORDER BY c.created_at DESC
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
      newInPeriod: num(stats[0]?.new_in_period),
      wallet: num(stats[0]?.wallet),
    },
    states: states.map((r) => ({ state: str(r.state), count: num(r.count) })),
    recent: recent.map((r) => ({
      id: str(r.customer_id),
      name: str(r.full_name),
      email: str(r.email) || "—",
      mobile: str(r.primary_mobile),
      status: str(r.account_status),
      city: str(r.city) || "—",
      wallet: num(r.wallet),
      orders: num(r.orders),
      gmv: num(r.gmv),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : str(r.created_at),
    })),
  };
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
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND availability_status::text = 'ONLINE')::int AS online,
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
            status: string;
            availability_status: string;
            kyc_status: string;
            city: string | null;
            vehicle_choice: string | null;
            wallet: number;
            deliveries: number;
            earnings: number;
            created_at: Date | string;
          }[]
        >`
          SELECT
            r.id,
            r.name,
            r.mobile,
            r.status::text AS status,
            r.availability_status::text AS availability_status,
            r.kyc_status::text AS kyc_status,
            r.city,
            r.vehicle_choice,
            COALESCE((SELECT total_balance FROM rider_wallet w WHERE w.rider_id = r.id LIMIT 1), 0)::float AS wallet,
            COALESCE((
              SELECT COUNT(*)::int FROM orders_core o WHERE o.rider_id = r.id AND o.status::text = 'delivered'
            ), 0) AS deliveries,
            COALESCE((
              SELECT SUM(${riderEarnSql("o")}) FROM orders_core o
              WHERE o.rider_id = r.id AND o.status::text = 'delivered'
            ), 0)::float AS earnings,
            r.created_at
          FROM riders r
          WHERE r.deleted_at IS NULL
          ORDER BY r.created_at DESC
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
    recent: recent.map((r) => ({
      id: num(r.id),
      name: str(r.name) || "Unnamed rider",
      mobile: str(r.mobile),
      status: str(r.status),
      availability: str(r.availability_status),
      kyc: str(r.kyc_status),
      city: str(r.city) || "—",
      vehicle: str(r.vehicle_choice) || "—",
      wallet: num(r.wallet),
      deliveries: num(r.deliveries),
      earnings: num(r.earnings),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : str(r.created_at),
    })),
  };
}

export async function fetchMerchants(periodRaw: string | null) {
  const sql = getSql();
  const { period, from, to } = boundsFromSearch(periodRaw);

  const [stats, types, recent] = await Promise.all([
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
      "mx-recent",
      () =>
        sql<
          {
            store_id: string;
            store_name: string;
            city: string | null;
            store_type: string | null;
            status: string;
            is_active: boolean | null;
            orders: number;
            gmv: number;
            packaging: number;
            commission: number;
            created_at: Date | string;
          }[]
        >`
          SELECT
            ms.store_id,
            ms.store_name,
            ms.city,
            ms.store_type::text AS store_type,
            ms.status::text AS status,
            ms.is_active,
            COALESCE(agg.orders, 0)::int AS orders,
            COALESCE(agg.ctm, 0)::float AS gmv,
            COALESCE(agg.packaging, 0)::float AS packaging,
            COALESCE(agg.commission, 0)::float AS commission,
            ms.created_at
          FROM merchant_stores ms
          LEFT JOIN (
            SELECT
              o.merchant_store_id,
              COUNT(*)::int AS orders,
              SUM(${ctmSql("o", "osb", "f")}) AS ctm,
              SUM(${packagingSql("o", "osb")}) AS packaging,
              SUM(COALESCE(osb.commission_amount, o.commission_amount, 0)) AS commission
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
            WHERE o.status::text = 'delivered'
              AND o.created_at >= ${from}::timestamptz AND o.created_at < ${to}::timestamptz
            GROUP BY o.merchant_store_id
          ) agg ON agg.merchant_store_id = ms.id
          WHERE ms.deleted_at IS NULL
          ORDER BY ms.created_at DESC
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
    recent: recent.map((r) => ({
      storeId: str(r.store_id),
      name: str(r.store_name),
      city: str(r.city) || "—",
      type: str(r.store_type) || "—",
      status: str(r.status),
      live: Boolean(r.is_active),
      orders: num(r.orders),
      gmv: num(r.gmv),
      packaging: num(r.packaging),
      commission: num(r.commission),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : str(r.created_at),
    })),
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
export type MerchantsData = Awaited<ReturnType<typeof fetchMerchants>>;
export type FinanceData = Awaited<ReturnType<typeof fetchFinance>>;
export type SupportData = Awaited<ReturnType<typeof fetchSupport>>;
export type TaxData = Awaited<ReturnType<typeof fetchTax>>;
export type { Period };
