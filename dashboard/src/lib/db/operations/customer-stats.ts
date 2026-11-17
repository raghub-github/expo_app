/**
 * Customer Dashboard Statistics Operations
 * Provides aggregated statistics for the customer dashboard
 */

import { getSql } from "../client";
import { countPendingAccountDeletionRequests } from "./account-deletion-requests";

export interface DashboardStatsFilters {
  orderType?: "food" | "parcel" | "person_ride";
  dateFrom?: string;
  dateTo?: string;
  city?: string;
  accountStatus?: string;
  riskFlag?: string;
}

export interface ServiceStats {
  orderType: "food" | "parcel" | "person_ride" | "all";
  totalUsers: number;
  totalOrders: number;
  totalRevenue: number;
}

export interface UserCategoryStats {
  category: string;
  count: number;
}

export interface DashboardStats {
  allUsers: number;
  foodUsers: number;
  parcelUsers: number;
  personUsers: number;
  newUsers: number;
  oldUsers: number;
  repeatedUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  suspendedUsers: number;
  fraudUsers: number;
  deletionRequestsPending: number;
  serviceStats: ServiceStats[];
  growthTrend: Array<{
    month: string;
    newUsers: number;
    totalUsers: number;
  }>;
  userOrderRelationship: Array<{
    orderCountRange: string;
    userCount: number;
  }>;
  revenueTrend: Array<{
    month: string;
    foodRevenue: number;
    parcelRevenue: number;
    personRevenue: number;
    totalRevenue: number;
  }>;
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Fast dashboard stats — a few parallel SQL queries (no nested empty fragments).
 */
export async function getCustomerDashboardStats(
  filters: DashboardStatsFilters = {}
): Promise<DashboardStats> {
  const sql = getSql();

  const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
  const dateTo = filters.dateTo
    ? (() => {
        const d = new Date(filters.dateTo!);
        d.setHours(23, 59, 59, 999);
        return d;
      })()
    : null;
  const accountStatus = filters.accountStatus?.trim() || null;
  const riskFlag = filters.riskFlag?.trim() || null;

  // Bind every optional filter as a real parameter (NULL = ignore).
  // Avoids nesting empty sql`` helpers which produced "syntax error at or near $1".
  const [
    cardRow,
    serviceRows,
    growthRows,
    orderBucketRows,
    revenueRows,
    deletionRequestsPending,
  ] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::int AS all_users,
        COUNT(*) FILTER (
          WHERE c.created_at >= (NOW() - INTERVAL '30 days')
        )::int AS new_users,
        COUNT(*) FILTER (
          WHERE c.account_status = 'ACTIVE'
        )::int AS active_users,
        COUNT(*) FILTER (
          WHERE c.account_status = 'BLOCKED'
        )::int AS inactive_users,
        COUNT(*) FILTER (
          WHERE c.account_status = 'SUSPENDED'
        )::int AS suspended_users,
        COUNT(*) FILTER (
          WHERE c.risk_flag IN ('HIGH', 'CRITICAL')
        )::int AS fraud_users,
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM public.orders_core o
            WHERE o.customer_id = c.id AND o.order_type = 'food'
          )
        )::int AS food_users,
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM public.orders_core o
            WHERE o.customer_id = c.id AND o.order_type = 'parcel'
          )
        )::int AS parcel_users,
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM public.orders_core o
            WHERE o.customer_id = c.id AND o.order_type = 'person_ride'
          )
        )::int AS person_users,
        COUNT(*) FILTER (
          WHERE (
            SELECT COUNT(*) FROM public.orders_core o WHERE o.customer_id = c.id
          ) >= 2
        )::int AS repeated_users
      FROM public.customers c
      WHERE c.deleted_at IS NULL
        AND (${dateFrom}::timestamptz IS NULL OR c.created_at >= ${dateFrom})
        AND (${dateTo}::timestamptz IS NULL OR c.created_at <= ${dateTo})
        AND (${accountStatus}::text IS NULL OR c.account_status::text = ${accountStatus})
        AND (${riskFlag}::text IS NULL OR c.risk_flag::text = ${riskFlag})
    `,
    sql`
      SELECT
        o.order_type::text AS order_type,
        COUNT(DISTINCT o.customer_id)::int AS total_users,
        COUNT(*)::int AS total_orders,
        COALESCE(SUM(o.fare_amount), 0)::float8 AS total_revenue
      FROM public.orders_core o
      INNER JOIN public.customers c ON c.id = o.customer_id
      WHERE c.deleted_at IS NULL
        AND o.customer_id IS NOT NULL
        AND (${dateFrom}::timestamptz IS NULL OR c.created_at >= ${dateFrom})
        AND (${dateTo}::timestamptz IS NULL OR c.created_at <= ${dateTo})
        AND (${accountStatus}::text IS NULL OR c.account_status::text = ${accountStatus})
        AND (${riskFlag}::text IS NULL OR c.risk_flag::text = ${riskFlag})
      GROUP BY o.order_type
    `,
    sql`
      WITH months AS (
        SELECT date_trunc('month', d)::date AS month_start
        FROM generate_series(
          date_trunc('month', NOW()) - INTERVAL '11 months',
          date_trunc('month', NOW()),
          INTERVAL '1 month'
        ) AS d
      ),
      monthly_new AS (
        SELECT
          date_trunc('month', c.created_at)::date AS month_start,
          COUNT(*)::int AS new_users
        FROM public.customers c
        WHERE c.deleted_at IS NULL
          AND (${accountStatus}::text IS NULL OR c.account_status::text = ${accountStatus})
          AND (${riskFlag}::text IS NULL OR c.risk_flag::text = ${riskFlag})
          AND c.created_at >= date_trunc('month', NOW()) - INTERVAL '11 months'
        GROUP BY 1
      ),
      cumulative AS (
        SELECT
          m.month_start,
          (
            SELECT COUNT(*)::int
            FROM public.customers c
            WHERE c.deleted_at IS NULL
              AND (${accountStatus}::text IS NULL OR c.account_status::text = ${accountStatus})
              AND (${riskFlag}::text IS NULL OR c.risk_flag::text = ${riskFlag})
              AND c.created_at < (m.month_start + INTERVAL '1 month')
          ) AS total_users
        FROM months m
      )
      SELECT
        to_char(m.month_start, 'YYYY-MM') AS month,
        COALESCE(n.new_users, 0)::int AS new_users,
        COALESCE(cu.total_users, 0)::int AS total_users
      FROM months m
      LEFT JOIN monthly_new n ON n.month_start = m.month_start
      LEFT JOIN cumulative cu ON cu.month_start = m.month_start
      ORDER BY m.month_start
    `,
    sql`
      WITH order_counts AS (
        SELECT o.customer_id, COUNT(*)::int AS order_count
        FROM public.orders_core o
        INNER JOIN public.customers c ON c.id = o.customer_id
        WHERE c.deleted_at IS NULL
          AND o.customer_id IS NOT NULL
          AND (${dateFrom}::timestamptz IS NULL OR c.created_at >= ${dateFrom})
          AND (${dateTo}::timestamptz IS NULL OR c.created_at <= ${dateTo})
          AND (${accountStatus}::text IS NULL OR c.account_status::text = ${accountStatus})
          AND (${riskFlag}::text IS NULL OR c.risk_flag::text = ${riskFlag})
        GROUP BY o.customer_id
      ),
      totals AS (
        SELECT COUNT(*)::int AS all_users
        FROM public.customers c
        WHERE c.deleted_at IS NULL
          AND (${dateFrom}::timestamptz IS NULL OR c.created_at >= ${dateFrom})
          AND (${dateTo}::timestamptz IS NULL OR c.created_at <= ${dateTo})
          AND (${accountStatus}::text IS NULL OR c.account_status::text = ${accountStatus})
          AND (${riskFlag}::text IS NULL OR c.risk_flag::text = ${riskFlag})
      )
      SELECT
        GREATEST(
          0,
          (SELECT all_users FROM totals) - (SELECT COUNT(*)::int FROM order_counts)
        ) AS zero_orders,
        COUNT(*) FILTER (WHERE order_count = 1)::int AS one_order,
        COUNT(*) FILTER (WHERE order_count BETWEEN 2 AND 5)::int AS two_to_five,
        COUNT(*) FILTER (WHERE order_count BETWEEN 6 AND 10)::int AS six_to_ten,
        COUNT(*) FILTER (WHERE order_count BETWEEN 11 AND 20)::int AS eleven_to_twenty,
        COUNT(*) FILTER (WHERE order_count >= 21)::int AS twenty_one_plus
      FROM order_counts
    `,
    sql`
      SELECT
        to_char(date_trunc('month', o.created_at), 'YYYY-MM') AS month,
        COALESCE(SUM(o.fare_amount) FILTER (WHERE o.order_type = 'food'), 0)::float8 AS food_revenue,
        COALESCE(SUM(o.fare_amount) FILTER (WHERE o.order_type = 'parcel'), 0)::float8 AS parcel_revenue,
        COALESCE(SUM(o.fare_amount) FILTER (WHERE o.order_type = 'person_ride'), 0)::float8 AS person_revenue
      FROM public.orders_core o
      INNER JOIN public.customers c ON c.id = o.customer_id
      WHERE c.deleted_at IS NULL
        AND o.customer_id IS NOT NULL
        AND o.created_at >= date_trunc('month', NOW()) - INTERVAL '11 months'
        AND (${dateFrom}::timestamptz IS NULL OR c.created_at >= ${dateFrom})
        AND (${dateTo}::timestamptz IS NULL OR c.created_at <= ${dateTo})
        AND (${accountStatus}::text IS NULL OR c.account_status::text = ${accountStatus})
        AND (${riskFlag}::text IS NULL OR c.risk_flag::text = ${riskFlag})
      GROUP BY 1
      ORDER BY 1
    `,
    countPendingAccountDeletionRequests(),
  ]);

  const cards = (Array.isArray(cardRow) ? cardRow[0] : null) as Record<string, unknown> | null;
  const allUsers = n(cards?.all_users);
  const newUsers = n(cards?.new_users);
  const foodUsers = n(cards?.food_users);
  const parcelUsers = n(cards?.parcel_users);
  const personUsers = n(cards?.person_users);
  const repeatedUsers = n(cards?.repeated_users);
  const activeUsers = n(cards?.active_users);
  const inactiveUsers = n(cards?.inactive_users);
  const suspendedUsers = n(cards?.suspended_users);
  const fraudUsers = n(cards?.fraud_users);

  const serviceMap = new Map<string, ServiceStats>();
  for (const row of Array.isArray(serviceRows) ? serviceRows : []) {
    const r = row as Record<string, unknown>;
    const orderType = String(r.order_type ?? "");
    if (orderType !== "food" && orderType !== "parcel" && orderType !== "person_ride") continue;
    serviceMap.set(orderType, {
      orderType,
      totalUsers: n(r.total_users),
      totalOrders: n(r.total_orders),
      totalRevenue: n(r.total_revenue),
    });
  }
  for (const orderType of ["food", "parcel", "person_ride"] as const) {
    if (!serviceMap.has(orderType)) {
      serviceMap.set(orderType, {
        orderType,
        totalUsers:
          orderType === "food" ? foodUsers : orderType === "parcel" ? parcelUsers : personUsers,
        totalOrders: 0,
        totalRevenue: 0,
      });
    }
  }

  const serviceStats: ServiceStats[] = [
    {
      orderType: "all",
      totalUsers: allUsers,
      totalOrders: [...serviceMap.values()].reduce((s, x) => s + x.totalOrders, 0),
      totalRevenue: [...serviceMap.values()].reduce((s, x) => s + x.totalRevenue, 0),
    },
    ...(["food", "parcel", "person_ride"] as const).map((t) => serviceMap.get(t)!),
  ];

  const growthTrend = (Array.isArray(growthRows) ? growthRows : []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      month: String(r.month ?? ""),
      newUsers: n(r.new_users),
      totalUsers: n(r.total_users),
    };
  });

  const buckets = (Array.isArray(orderBucketRows) ? orderBucketRows[0] : null) as
    | Record<string, unknown>
    | null;
  const userOrderRelationship = [
    { orderCountRange: "0 orders", userCount: n(buckets?.zero_orders) },
    { orderCountRange: "1 order", userCount: n(buckets?.one_order) },
    { orderCountRange: "2-5 orders", userCount: n(buckets?.two_to_five) },
    { orderCountRange: "6-10 orders", userCount: n(buckets?.six_to_ten) },
    { orderCountRange: "11-20 orders", userCount: n(buckets?.eleven_to_twenty) },
    { orderCountRange: "21+ orders", userCount: n(buckets?.twenty_one_plus) },
  ];

  const revenueByMonth = new Map<
    string,
    { foodRevenue: number; parcelRevenue: number; personRevenue: number }
  >();
  for (const row of Array.isArray(revenueRows) ? revenueRows : []) {
    const r = row as Record<string, unknown>;
    revenueByMonth.set(String(r.month ?? ""), {
      foodRevenue: n(r.food_revenue),
      parcelRevenue: n(r.parcel_revenue),
      personRevenue: n(r.person_revenue),
    });
  }
  const revenueTrend = growthTrend.map(({ month }) => {
    const rev = revenueByMonth.get(month) ?? {
      foodRevenue: 0,
      parcelRevenue: 0,
      personRevenue: 0,
    };
    return {
      month,
      ...rev,
      totalRevenue: rev.foodRevenue + rev.parcelRevenue + rev.personRevenue,
    };
  });

  return {
    allUsers,
    foodUsers,
    parcelUsers,
    personUsers,
    newUsers,
    oldUsers: Math.max(0, allUsers - newUsers),
    repeatedUsers,
    activeUsers,
    inactiveUsers,
    suspendedUsers,
    fraudUsers,
    deletionRequestsPending,
    serviceStats,
    growthTrend,
    userOrderRelationship,
    revenueTrend,
  };
}
