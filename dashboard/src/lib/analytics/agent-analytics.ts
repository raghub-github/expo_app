import { getSql } from "@/lib/db/client";
import type { AnalyticsCategory, AnalyticsRecordScope } from "./analytics-scope";
import { resolveAnalyticsDisplayName } from "./display-name";

export type AnalyticsPeriod = "today" | "week" | "month" | "custom";

export function resolveAnalyticsDateRange(
  period: AnalyticsPeriod,
  startDateParam?: string | null,
  endDateParam?: string | null
): { startDate: Date; endDate: Date; startDateStr: string; endDateStr: string; startTs: string; endTs: string } {
  const endDate = new Date();
  endDate.setHours(23, 59, 59, 999);
  let startDate: Date;

  if (period === "week") {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);
  } else if (period === "month") {
    // Default analytics window: last 30 calendar days (inclusive).
    startDate = new Date();
    startDate.setDate(startDate.getDate() - 29);
  } else if (period === "custom" && startDateParam && endDateParam) {
    startDate = new Date(`${startDateParam}T00:00:00`);
    const endLocal = new Date(`${endDateParam}T23:59:59.999`);
    endDate.setTime(endLocal.getTime());
  } else {
    startDate = new Date();
  }
  startDate.setHours(0, 0, 0, 0);

  return {
    startDate,
    endDate,
    startDateStr: startDate.toISOString().slice(0, 10),
    endDateStr: endDate.toISOString().slice(0, 10),
    startTs: startDate.toISOString(),
    endTs: endDate.toISOString(),
  };
}

export type AgentAnalyticsRow = {
  userId: number;
  systemUserId: string;
  fullName: string;
  email: string;
  primaryRole: string;
  workSeconds: number;
  loginCount: number;
  logoutCount: number;
  ticketsWorked: number;
  ticketsResolved: number;
  ticketsAssigned: number;
  ordersWorked: number;
};

export type AgentDayRow = {
  day: string;
  workSeconds: number;
  loginCount: number;
  logoutCount: number;
  ticketsWorked: number;
  ticketsResolved: number;
  ticketsAssigned: number;
  ordersWorked: number;
};

/**
 * List agents with aggregated analytics for the period.
 * When agentIds is non-null, restrict to those IDs (OWN / single agent).
 */
export async function listAgentAnalytics(params: {
  startTs: string;
  endTs: string;
  agentIds: number[] | null;
}): Promise<AgentAnalyticsRow[]> {
  const sql = getSql();
  const { startTs, endTs, agentIds: ids } = params;

  const rows = await sql`
    WITH agents AS (
      SELECT
        su.id,
        su.system_user_id,
        su.full_name,
        su.first_name,
        su.last_name,
        su.email,
        su.primary_role::text AS primary_role
      FROM public.system_users su
      WHERE su.deleted_at IS NULL
        AND su.status = 'ACTIVE'
        AND (
          ${ids}::int[] IS NULL
          OR su.id = ANY(${ids}::int[])
        )
        AND (
          EXISTS (
            SELECT 1 FROM public.dashboard_access da
            WHERE da.system_user_id = su.id
              AND da.is_active = true
              AND da.dashboard_type IN (
                'TICKET', 'TICKET_FOOD', 'TICKET_PARCEL', 'TICKET_PERSON_RIDE', 'TICKET_GENERAL',
                'TICKET_CUSTOMER_FOOD', 'TICKET_CUSTOMER_PARCEL', 'TICKET_CUSTOMER_PERSON_RIDE',
                'TICKET_CUSTOMER_GENERAL', 'ORDER_FOOD', 'ORDER_PARCEL', 'ORDER_PERSON_RIDE',
                'ANALYTICS', 'CUSTOMER', 'RIDER', 'MERCHANT', 'SYSTEM'
              )
          )
          OR EXISTS (SELECT 1 FROM public.agent_profiles ap WHERE ap.user_id = su.id)
          OR (${ids}::int[] IS NOT NULL)
        )
    ),
    sessions AS (
      SELECT
        us.user_id,
        COALESCE(SUM(us.work_seconds), 0)::int AS work_seconds,
        COUNT(*)::int AS login_count,
        COUNT(*) FILTER (WHERE us.logout_time IS NOT NULL)::int AS logout_count
      FROM public.user_sessions us
      WHERE us.login_time >= ${startTs}::timestamptz
        AND us.login_time <= ${endTs}::timestamptz
        AND (${ids}::int[] IS NULL OR us.user_id = ANY(${ids}::int[]))
      GROUP BY us.user_id
    ),
    tickets AS (
      SELECT
        ut.assigned_to_agent_id::bigint AS user_id,
        COUNT(*) FILTER (
          WHERE (ut.assigned_at IS NOT NULL AND ut.assigned_at >= ${startTs}::timestamptz AND ut.assigned_at <= ${endTs}::timestamptz)
             OR (ut.updated_at >= ${startTs}::timestamptz AND ut.updated_at <= ${endTs}::timestamptz)
             OR (ut.resolved_at IS NOT NULL AND ut.resolved_at >= ${startTs}::timestamptz AND ut.resolved_at <= ${endTs}::timestamptz)
             OR (ut.closed_at IS NOT NULL AND ut.closed_at >= ${startTs}::timestamptz AND ut.closed_at <= ${endTs}::timestamptz)
        )::int AS tickets_worked,
        COUNT(DISTINCT ut.id) FILTER (
          WHERE (
            (ut.resolved_at IS NOT NULL AND ut.resolved_at >= ${startTs}::timestamptz AND ut.resolved_at <= ${endTs}::timestamptz)
            OR (ut.closed_at IS NOT NULL AND ut.closed_at >= ${startTs}::timestamptz AND ut.closed_at <= ${endTs}::timestamptz)
            OR (
              LOWER(COALESCE(ut.status::text, '')) IN ('resolved', 'closed', 'completed')
              AND (
                (ut.assigned_at IS NOT NULL AND ut.assigned_at >= ${startTs}::timestamptz AND ut.assigned_at <= ${endTs}::timestamptz)
                OR (ut.updated_at >= ${startTs}::timestamptz AND ut.updated_at <= ${endTs}::timestamptz)
              )
            )
          )
        )::int AS tickets_resolved,
        COUNT(*) FILTER (
          WHERE ut.assigned_at IS NOT NULL
            AND ut.assigned_at >= ${startTs}::timestamptz
            AND ut.assigned_at <= ${endTs}::timestamptz
        )::int AS tickets_assigned
      FROM public.unified_tickets ut
      WHERE ut.assigned_to_agent_id IS NOT NULL
        AND (${ids}::int[] IS NULL OR ut.assigned_to_agent_id = ANY(${ids}::int[]))
      GROUP BY 1
    ),
    orders AS (
      SELECT
        orx.actor_id::bigint AS user_id,
        COUNT(DISTINCT orx.order_id)::int AS orders_worked
      FROM public.order_remarks orx
      WHERE orx.actor_id IS NOT NULL
        AND orx.created_at >= ${startTs}::timestamptz
        AND orx.created_at <= ${endTs}::timestamptz
        AND (${ids}::int[] IS NULL OR orx.actor_id = ANY(${ids}::int[]))
      GROUP BY 1
    )
    SELECT
      a.id AS user_id,
      a.system_user_id,
      a.full_name,
      a.first_name,
      a.last_name,
      a.email,
      a.primary_role,
      COALESCE(s.work_seconds, 0)::int AS work_seconds,
      COALESCE(s.login_count, 0)::int AS login_count,
      COALESCE(s.logout_count, 0)::int AS logout_count,
      COALESCE(t.tickets_worked, 0)::int AS tickets_worked,
      COALESCE(t.tickets_resolved, 0)::int AS tickets_resolved,
      COALESCE(t.tickets_assigned, 0)::int AS tickets_assigned,
      COALESCE(o.orders_worked, 0)::int AS orders_worked
    FROM agents a
    LEFT JOIN sessions s ON s.user_id = a.id
    LEFT JOIN tickets t ON t.user_id = a.id
    LEFT JOIN orders o ON o.user_id = a.id
    ORDER BY a.full_name ASC NULLS LAST, a.id ASC
  `;

  return (rows as Array<Record<string, unknown>>).map((r) => ({
    userId: Number(r.user_id),
    systemUserId: String(r.system_user_id ?? ""),
    fullName: resolveAnalyticsDisplayName({
      fullName: r.full_name == null ? null : String(r.full_name),
      firstName: r.first_name == null ? null : String(r.first_name),
      lastName: r.last_name == null ? null : String(r.last_name),
      email: r.email == null ? null : String(r.email),
      systemUserId: r.system_user_id == null ? null : String(r.system_user_id),
    }),
    email: String(r.email ?? ""),
    primaryRole: String(r.primary_role ?? ""),
    workSeconds: Number(r.work_seconds) || 0,
    loginCount: Number(r.login_count) || 0,
    logoutCount: Number(r.logout_count) || 0,
    ticketsWorked: Number(r.tickets_worked) || 0,
    ticketsResolved: Number(r.tickets_resolved) || 0,
    ticketsAssigned: Number(r.tickets_assigned) || 0,
    ordersWorked: Number(r.orders_worked) || 0,
  }));
}

export async function getAgentDailyAnalytics(params: {
  agentId: number;
  startTs: string;
  endTs: string;
}): Promise<AgentDayRow[]> {
  const sql = getSql();
  const { agentId, startTs, endTs } = params;

  const rows = await sql`
    WITH days AS (
      SELECT generate_series(
        (timezone('Asia/Kolkata', ${startTs}::timestamptz))::date,
        (timezone('Asia/Kolkata', ${endTs}::timestamptz))::date,
        interval '1 day'
      )::date AS day
    ),
    sessions AS (
      SELECT
        (timezone('Asia/Kolkata', us.login_time))::date AS day,
        COALESCE(SUM(us.work_seconds), 0)::int AS work_seconds,
        COUNT(*)::int AS login_count,
        COUNT(*) FILTER (WHERE us.logout_time IS NOT NULL)::int AS logout_count
      FROM public.user_sessions us
      WHERE us.user_id = ${agentId}
        AND us.login_time >= ${startTs}::timestamptz
        AND us.login_time <= ${endTs}::timestamptz
      GROUP BY 1
    ),
    tickets AS (
      SELECT
        d.day,
        COUNT(DISTINCT ut.id) FILTER (
          WHERE (ut.assigned_at IS NOT NULL AND (timezone('Asia/Kolkata', ut.assigned_at))::date = d.day)
             OR ((timezone('Asia/Kolkata', ut.updated_at))::date = d.day)
             OR (ut.resolved_at IS NOT NULL AND (timezone('Asia/Kolkata', ut.resolved_at))::date = d.day)
             OR (ut.closed_at IS NOT NULL AND (timezone('Asia/Kolkata', ut.closed_at))::date = d.day)
        )::int AS tickets_worked,
        COUNT(DISTINCT ut.id) FILTER (
          WHERE (
              (ut.resolved_at IS NOT NULL AND (timezone('Asia/Kolkata', ut.resolved_at))::date = d.day)
              OR (ut.closed_at IS NOT NULL AND (timezone('Asia/Kolkata', ut.closed_at))::date = d.day)
              OR (
                LOWER(COALESCE(ut.status::text, '')) IN ('resolved', 'closed', 'completed')
                AND (
                  (ut.assigned_at IS NOT NULL AND (timezone('Asia/Kolkata', ut.assigned_at))::date = d.day)
                  OR ((timezone('Asia/Kolkata', ut.updated_at))::date = d.day)
                )
              )
            )
        )::int AS tickets_resolved,
        COUNT(DISTINCT ut.id) FILTER (
          WHERE ut.assigned_at IS NOT NULL
            AND (timezone('Asia/Kolkata', ut.assigned_at))::date = d.day
        )::int AS tickets_assigned
      FROM days d
      LEFT JOIN public.unified_tickets ut
        ON ut.assigned_to_agent_id = ${agentId}
      GROUP BY d.day
    ),
    orders AS (
      SELECT
        (timezone('Asia/Kolkata', orx.created_at))::date AS day,
        COUNT(DISTINCT orx.order_id)::int AS orders_worked
      FROM public.order_remarks orx
      WHERE orx.actor_id = ${agentId}
        AND orx.created_at >= ${startTs}::timestamptz
        AND orx.created_at <= ${endTs}::timestamptz
      GROUP BY 1
    )
    SELECT
      d.day::text AS day,
      COALESCE(s.work_seconds, 0)::int AS work_seconds,
      COALESCE(s.login_count, 0)::int AS login_count,
      COALESCE(s.logout_count, 0)::int AS logout_count,
      COALESCE(t.tickets_worked, 0)::int AS tickets_worked,
      COALESCE(t.tickets_resolved, 0)::int AS tickets_resolved,
      COALESCE(t.tickets_assigned, 0)::int AS tickets_assigned,
      COALESCE(o.orders_worked, 0)::int AS orders_worked
    FROM days d
    LEFT JOIN sessions s ON s.day = d.day
    LEFT JOIN tickets t ON t.day = d.day
    LEFT JOIN orders o ON o.day = d.day
    ORDER BY d.day DESC
  `;

  return (rows as Array<Record<string, unknown>>).map((r) => ({
    day: String(r.day),
    workSeconds: Number(r.work_seconds) || 0,
    loginCount: Number(r.login_count) || 0,
    logoutCount: Number(r.logout_count) || 0,
    ticketsWorked: Number(r.tickets_worked) || 0,
    ticketsResolved: Number(r.tickets_resolved) || 0,
    ticketsAssigned: Number(r.tickets_assigned) || 0,
    ordersWorked: Number(r.orders_worked) || 0,
  }));
}

export async function getAnalyticsHubSummary(params: {
  startTs: string;
  endTs: string;
  agentIds: number[] | null;
  scope: AnalyticsRecordScope;
}): Promise<{
  scope: AnalyticsRecordScope;
  categories: Array<{
    key: AnalyticsCategory;
    label: string;
    description: string;
    count: number;
    unit: string;
  }>;
  totals: {
    agentCount: number;
    workSeconds: number;
    ticketsWorked: number;
    ordersWorked: number;
    loginCount: number;
    logoutCount: number;
  };
}> {
  const agents = await listAgentAnalytics({
    startTs: params.startTs,
    endTs: params.endTs,
    agentIds: params.agentIds,
  });

  const totals = agents.reduce(
    (acc, a) => {
      acc.agentCount += 1;
      acc.workSeconds += a.workSeconds;
      acc.ticketsWorked += a.ticketsWorked;
      acc.ordersWorked += a.ordersWorked;
      acc.loginCount += a.loginCount;
      acc.logoutCount += a.logoutCount;
      return acc;
    },
    {
      agentCount: 0,
      workSeconds: 0,
      ticketsWorked: 0,
      ordersWorked: 0,
      loginCount: 0,
      logoutCount: 0,
    }
  );

  return {
    scope: params.scope,
    categories: [
      {
        key: "agents",
        label: "Agents",
        description: "Agent roster and work summary",
        count: totals.agentCount,
        unit: totals.agentCount === 1 ? "Agent" : "Agents",
      },
      {
        key: "tickets",
        label: "Tickets",
        description: "Ticket work by agents",
        count: totals.ticketsWorked,
        unit: "Tickets worked",
      },
      {
        key: "orders",
        label: "Orders",
        description: "Order page work by agents",
        count: totals.ordersWorked,
        unit: "Orders worked",
      },
      {
        key: "sessions",
        label: "Sessions",
        description: "Login / logout activity",
        count: totals.loginCount,
        unit: "Logins",
      },
    ],
    totals,
  };
}

export function sortAgentsForCategory(
  agents: AgentAnalyticsRow[],
  category: AnalyticsCategory
): AgentAnalyticsRow[] {
  const copy = [...agents];
  if (category === "tickets") {
    return copy.sort((a, b) => b.ticketsWorked - a.ticketsWorked || a.fullName.localeCompare(b.fullName));
  }
  if (category === "orders") {
    return copy.sort((a, b) => b.ordersWorked - a.ordersWorked || a.fullName.localeCompare(b.fullName));
  }
  if (category === "sessions") {
    return copy.sort((a, b) => b.loginCount - a.loginCount || a.fullName.localeCompare(b.fullName));
  }
  return copy.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export type AgentDayDetailType = "sessions" | "tickets" | "orders" | "audit";

function dayBoundsIst(day: string): { dayStart: string; dayEnd: string } {
  // Interpret YYYY-MM-DD as Asia/Kolkata calendar day.
  return {
    dayStart: `${day}T00:00:00+05:30`,
    dayEnd: `${day}T23:59:59.999+05:30`,
  };
}

/** Prefer stored formatted_order_id; otherwise type-aware GMF/GMC/GMP + padded core id. */
export function resolveAnalyticsFormattedOrderId(opts: {
  formattedOrderId?: string | null;
  publicOrderId?: string | null;
  orderType?: string | null;
  coreId: number;
}): string | null {
  const formatted = (opts.formattedOrderId ?? "").trim().replace(/^#/, "");
  if (formatted) return formatted;
  const publicId = (opts.publicOrderId ?? "").trim().replace(/^#/, "");
  if (publicId) return publicId;
  if (!Number.isFinite(opts.coreId) || opts.coreId <= 0) return null;
  const t = String(opts.orderType ?? "food").toLowerCase();
  const prefix =
    t === "person_ride" || t === "person" || t === "ride"
      ? "GMP"
      : t === "parcel"
        ? "GMC"
        : "GMF";
  return `${prefix}${String(opts.coreId).padStart(6, "0")}`;
}

export async function getAgentDaySessions(agentId: number, day: string) {
  const sql = getSql();
  const { dayStart, dayEnd } = dayBoundsIst(day);
  const rows = await sql`
    SELECT
      us.id,
      us.login_time,
      us.logout_time,
      us.offline_at,
      us.current_status,
      us.status_changed_at,
      us.work_seconds,
      us.break_seconds
    FROM public.user_sessions us
    WHERE us.user_id = ${agentId}
      AND us.login_time >= ${dayStart}::timestamptz
      AND us.login_time <= ${dayEnd}::timestamptz
    ORDER BY us.login_time ASC
  `;

  let segments: Array<Record<string, unknown>> = [];
  try {
    segments = (await sql`
      SELECT id, status, started_at, ended_at, duration_minutes, reason, change_source
      FROM public.agent_status_segments
      WHERE agent_user_id = ${agentId}
        AND started_at <= ${dayEnd}::timestamptz
        AND (ended_at IS NULL OR ended_at >= ${dayStart}::timestamptz)
      ORDER BY started_at ASC
      LIMIT 200
    `) as Array<Record<string, unknown>>;
  } catch {
    segments = [];
  }

  return {
    sessions: (rows as Array<Record<string, unknown>>).map((r) => ({
      id: Number(r.id),
      loginTime: r.login_time ? new Date(String(r.login_time)).toISOString() : null,
      logoutTime: r.logout_time ? new Date(String(r.logout_time)).toISOString() : null,
      offlineAt: r.offline_at ? new Date(String(r.offline_at)).toISOString() : null,
      currentStatus: String(r.current_status ?? ""),
      statusChangedAt: r.status_changed_at
        ? new Date(String(r.status_changed_at)).toISOString()
        : null,
      workSeconds: Number(r.work_seconds) || 0,
      breakSeconds: Number(r.break_seconds) || 0,
    })),
    statusSegments: segments.map((r) => ({
      id: Number(r.id),
      status: String(r.status ?? ""),
      startedAt: r.started_at ? new Date(String(r.started_at)).toISOString() : null,
      endedAt: r.ended_at ? new Date(String(r.ended_at)).toISOString() : null,
      durationMinutes: Number(r.duration_minutes) || 0,
      reason: r.reason == null ? null : String(r.reason),
      changeSource: r.change_source == null ? null : String(r.change_source),
    })),
  };
}

export async function getAgentDayTickets(agentId: number, day: string) {
  const sql = getSql();
  const { dayStart, dayEnd } = dayBoundsIst(day);
  const rows = await sql`
    SELECT
      ut.id,
      ut.ticket_id,
      ut.subject,
      ut.status,
      ut.priority,
      ut.ticket_type,
      ut.order_type,
      ut.assigned_at,
      ut.updated_at,
      ut.resolved_at,
      ut.closed_at,
      CASE
        WHEN ut.resolved_at IS NOT NULL AND ut.resolved_at >= ${dayStart}::timestamptz AND ut.resolved_at <= ${dayEnd}::timestamptz THEN true
        WHEN ut.closed_at IS NOT NULL AND ut.closed_at >= ${dayStart}::timestamptz AND ut.closed_at <= ${dayEnd}::timestamptz THEN true
        WHEN LOWER(COALESCE(ut.status::text, '')) IN ('resolved', 'closed', 'completed') THEN true
        ELSE false
      END AS resolved_that_day
    FROM public.unified_tickets ut
    WHERE ut.assigned_to_agent_id = ${agentId}
      AND (
        (ut.assigned_at IS NOT NULL AND ut.assigned_at >= ${dayStart}::timestamptz AND ut.assigned_at <= ${dayEnd}::timestamptz)
        OR (ut.updated_at >= ${dayStart}::timestamptz AND ut.updated_at <= ${dayEnd}::timestamptz)
        OR (ut.resolved_at IS NOT NULL AND ut.resolved_at >= ${dayStart}::timestamptz AND ut.resolved_at <= ${dayEnd}::timestamptz)
        OR (ut.closed_at IS NOT NULL AND ut.closed_at >= ${dayStart}::timestamptz AND ut.closed_at <= ${dayEnd}::timestamptz)
      )
    ORDER BY COALESCE(ut.resolved_at, ut.updated_at, ut.assigned_at) DESC
    LIMIT 200
  `;

  return (rows as Array<Record<string, unknown>>).map((r) => ({
    id: Number(r.id),
    ticketId: String(r.ticket_id ?? r.id),
    subject: String(r.subject ?? "—"),
    status: String(r.status ?? ""),
    priority: r.priority == null ? null : String(r.priority),
    ticketType: r.ticket_type == null ? null : String(r.ticket_type),
    orderType: r.order_type == null ? null : String(r.order_type),
    assignedAt: r.assigned_at ? new Date(String(r.assigned_at)).toISOString() : null,
    updatedAt: r.updated_at ? new Date(String(r.updated_at)).toISOString() : null,
    resolvedAt: r.resolved_at ? new Date(String(r.resolved_at)).toISOString() : null,
    closedAt: r.closed_at ? new Date(String(r.closed_at)).toISOString() : null,
    resolvedThatDay: Boolean(r.resolved_that_day),
  }));
}

export async function getAgentDayOrders(agentId: number, day: string) {
  const sql = getSql();
  const { dayStart, dayEnd } = dayBoundsIst(day);
  const rows = await sql`
    SELECT
      orx.order_id,
      COUNT(*)::int AS remark_count,
      MIN(orx.created_at) AS first_action_at,
      MAX(orx.created_at) AS last_action_at,
      oc.formatted_order_id,
      oc.order_id AS public_order_id,
      oc.order_type::text AS order_type,
      oc.status::text AS order_status
    FROM public.order_remarks orx
    LEFT JOIN public.orders_core oc ON oc.id = orx.order_id
    WHERE orx.actor_id = ${agentId}
      AND orx.created_at >= ${dayStart}::timestamptz
      AND orx.created_at <= ${dayEnd}::timestamptz
    GROUP BY orx.order_id, oc.formatted_order_id, oc.order_id, oc.order_type, oc.status
    ORDER BY MAX(orx.created_at) DESC
    LIMIT 200
  `;

  return (rows as Array<Record<string, unknown>>).map((r) => {
    const coreId = Number(r.order_id) || 0;
    const orderType = r.order_type == null ? null : String(r.order_type);
    const formatted = resolveAnalyticsFormattedOrderId({
      formattedOrderId: r.formatted_order_id == null ? null : String(r.formatted_order_id),
      publicOrderId: r.public_order_id == null ? null : String(r.public_order_id),
      orderType,
      coreId,
    });
    return {
      orderId: String(coreId || ""),
      formattedOrderId: formatted,
      orderType,
      orderStatus: r.order_status == null ? null : String(r.order_status),
      remarkCount: Number(r.remark_count) || 0,
      firstActionAt: r.first_action_at ? new Date(String(r.first_action_at)).toISOString() : null,
      lastActionAt: r.last_action_at ? new Date(String(r.last_action_at)).toISOString() : null,
    };
  });
}

export type AgentDayHourlyBucket = {
  hour: number;
  label: string;
  logins: number;
  workSeconds: number;
  breakSeconds: number;
  ticketsWorked: number;
  ticketsResolved: number;
  ordersWorked: number;
  orderActions: number;
};

export async function getAgentDayHourlyBuckets(agentId: number, day: string): Promise<AgentDayHourlyBucket[]> {
  const sql = getSql();
  const { dayStart, dayEnd } = dayBoundsIst(day);
  const rows = await sql`
    WITH hours AS (
      SELECT generate_series(0, 23) AS hour
    ),
    sessions AS (
      SELECT
        EXTRACT(HOUR FROM timezone('Asia/Kolkata', us.login_time))::int AS hour,
        COUNT(*)::int AS logins,
        COALESCE(SUM(us.work_seconds), 0)::int AS work_seconds,
        COALESCE(SUM(us.break_seconds), 0)::int AS break_seconds
      FROM public.user_sessions us
      WHERE us.user_id = ${agentId}
        AND us.login_time >= ${dayStart}::timestamptz
        AND us.login_time <= ${dayEnd}::timestamptz
      GROUP BY 1
    ),
    tickets AS (
      SELECT
        EXTRACT(
          HOUR FROM timezone(
            'Asia/Kolkata',
            COALESCE(
              CASE
                WHEN ut.resolved_at IS NOT NULL
                  AND ut.resolved_at >= ${dayStart}::timestamptz
                  AND ut.resolved_at <= ${dayEnd}::timestamptz
                THEN ut.resolved_at
                ELSE NULL
              END,
              CASE
                WHEN ut.closed_at IS NOT NULL
                  AND ut.closed_at >= ${dayStart}::timestamptz
                  AND ut.closed_at <= ${dayEnd}::timestamptz
                THEN ut.closed_at
                ELSE NULL
              END,
              CASE
                WHEN ut.updated_at >= ${dayStart}::timestamptz
                  AND ut.updated_at <= ${dayEnd}::timestamptz
                THEN ut.updated_at
                ELSE NULL
              END,
              ut.assigned_at
            )
          )
        )::int AS hour,
        COUNT(DISTINCT ut.id)::int AS tickets_worked,
        COUNT(DISTINCT ut.id) FILTER (
          WHERE (
            (ut.resolved_at IS NOT NULL AND ut.resolved_at >= ${dayStart}::timestamptz AND ut.resolved_at <= ${dayEnd}::timestamptz)
            OR (ut.closed_at IS NOT NULL AND ut.closed_at >= ${dayStart}::timestamptz AND ut.closed_at <= ${dayEnd}::timestamptz)
            OR LOWER(COALESCE(ut.status::text, '')) IN ('resolved', 'closed', 'completed')
          )
        )::int AS tickets_resolved
      FROM public.unified_tickets ut
      WHERE ut.assigned_to_agent_id = ${agentId}
        AND (
          (ut.assigned_at IS NOT NULL AND ut.assigned_at >= ${dayStart}::timestamptz AND ut.assigned_at <= ${dayEnd}::timestamptz)
          OR (ut.updated_at >= ${dayStart}::timestamptz AND ut.updated_at <= ${dayEnd}::timestamptz)
          OR (ut.resolved_at IS NOT NULL AND ut.resolved_at >= ${dayStart}::timestamptz AND ut.resolved_at <= ${dayEnd}::timestamptz)
          OR (ut.closed_at IS NOT NULL AND ut.closed_at >= ${dayStart}::timestamptz AND ut.closed_at <= ${dayEnd}::timestamptz)
        )
      GROUP BY 1
    ),
    orders AS (
      SELECT
        EXTRACT(HOUR FROM timezone('Asia/Kolkata', orx.created_at))::int AS hour,
        COUNT(DISTINCT orx.order_id)::int AS orders_worked,
        COUNT(*)::int AS order_actions
      FROM public.order_remarks orx
      WHERE orx.actor_id = ${agentId}
        AND orx.created_at >= ${dayStart}::timestamptz
        AND orx.created_at <= ${dayEnd}::timestamptz
      GROUP BY 1
    )
    SELECT
      h.hour,
      COALESCE(s.logins, 0)::int AS logins,
      COALESCE(s.work_seconds, 0)::int AS work_seconds,
      COALESCE(s.break_seconds, 0)::int AS break_seconds,
      COALESCE(t.tickets_worked, 0)::int AS tickets_worked,
      COALESCE(t.tickets_resolved, 0)::int AS tickets_resolved,
      COALESCE(o.orders_worked, 0)::int AS orders_worked,
      COALESCE(o.order_actions, 0)::int AS order_actions
    FROM hours h
    LEFT JOIN sessions s ON s.hour = h.hour
    LEFT JOIN tickets t ON t.hour = h.hour
    LEFT JOIN orders o ON o.hour = h.hour
    ORDER BY h.hour ASC
  `;

  return (rows as Array<Record<string, unknown>>).map((r) => {
    const hour = Number(r.hour) || 0;
    return {
      hour,
      label: `${String(hour).padStart(2, "0")}:00`,
      logins: Number(r.logins) || 0,
      workSeconds: Number(r.work_seconds) || 0,
      breakSeconds: Number(r.break_seconds) || 0,
      ticketsWorked: Number(r.tickets_worked) || 0,
      ticketsResolved: Number(r.tickets_resolved) || 0,
      ordersWorked: Number(r.orders_worked) || 0,
      orderActions: Number(r.order_actions) || 0,
    };
  });
}

export async function getAgentDayAudit(agentId: number, day: string) {
  const [sessionDetail, tickets, orders, hourly] = await Promise.all([
    getAgentDaySessions(agentId, day),
    getAgentDayTickets(agentId, day),
    getAgentDayOrders(agentId, day),
    getAgentDayHourlyBuckets(agentId, day),
  ]);

  const workSeconds = sessionDetail.sessions.reduce((sum, s) => sum + (s.workSeconds || 0), 0);
  const breakSeconds = sessionDetail.sessions.reduce((sum, s) => sum + (s.breakSeconds || 0), 0);
  const loginCount = sessionDetail.sessions.length;
  const logoutCount = sessionDetail.sessions.filter((s) => s.logoutTime).length;
  const ticketsWorked = tickets.length;
  const ticketsResolved = tickets.filter((t) => t.resolvedThatDay).length;
  const ordersWorked = orders.length;
  const orderActions = orders.reduce((sum, o) => sum + (o.remarkCount || 0), 0);

  return {
    day,
    totals: {
      workSeconds,
      breakSeconds,
      loginCount,
      logoutCount,
      ticketsWorked,
      ticketsResolved,
      ordersWorked,
      orderActions,
    },
    hourly,
    sessions: sessionDetail.sessions,
    statusSegments: sessionDetail.statusSegments,
    tickets,
    orders,
  };
}

