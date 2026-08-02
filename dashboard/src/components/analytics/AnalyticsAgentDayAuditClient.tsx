"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FormattedOrderId } from "@/components/FormattedOrderId";
import {
  ticketsNumFont as analyticsNumFont,
  ticketsTextFont as analyticsTextFont,
} from "@/lib/fonts/tickets-fonts";
import { formatAnalyticsDuration } from "@/lib/analytics/format-duration";
import type { AnalyticsCategory } from "@/lib/analytics/analytics-scope";

export type AuditView = "sessions" | "tickets" | "orders";

type HourlyBucket = {
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

type SessionItem = {
  id: number;
  loginTime: string | null;
  logoutTime: string | null;
  offlineAt: string | null;
  currentStatus: string;
  workSeconds: number;
  breakSeconds: number;
};

type StatusSegment = {
  id: number;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number;
  reason: string | null;
};

type TicketItem = {
  id: number;
  ticketId: string;
  subject: string;
  status: string;
  priority: string | null;
  assignedAt: string | null;
  updatedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolvedThatDay: boolean;
};

type OrderItem = {
  orderId: string;
  formattedOrderId: string | null;
  orderType: string | null;
  orderStatus: string | null;
  remarkCount: number;
  firstActionAt: string | null;
  lastActionAt: string | null;
};

type AuditPayload = {
  day: string;
  agent: {
    userId: number;
    systemUserId: string;
    fullName: string;
    email: string;
    primaryRole: string;
  };
  totals: {
    workSeconds: number;
    breakSeconds: number;
    loginCount: number;
    logoutCount: number;
    ticketsWorked: number;
    ticketsResolved: number;
    ordersWorked: number;
    orderActions: number;
  };
  hourly: HourlyBucket[];
  sessions: SessionItem[];
  statusSegments: StatusSegment[];
  tickets: TicketItem[];
  orders: OrderItem[];
};

function formatDayLabel(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function AnalyticsAgentDayAuditClient({
  category,
  agentId,
  day,
  view,
}: {
  category: AnalyticsCategory;
  agentId: number;
  day: string;
  view: AuditView;
}) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["analytics", "agent-day-audit", agentId, day],
    queryFn: async () => {
      const qs = new URLSearchParams({ day, type: "audit" });
      const res = await fetch(`/api/analytics/agents/${agentId}/day?${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        data?: AuditPayload;
      };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || "Failed to load day audit");
      }
      return json.data;
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  const pageTitle =
    view === "sessions"
      ? "Work & session audit"
      : view === "tickets"
        ? "Ticket work audit"
        : "Order work audit";
  return (
    <div
      className={`${analyticsTextFont.className} min-w-0 bg-[#f4f7fb] px-4 pb-4 pt-0 sm:px-6 sm:pb-6 sm:pt-0`}
    >
      {isLoading && <div className="h-72 animate-pulse rounded-2xl bg-white" />}

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : "Failed to load"}
          <button type="button" onClick={() => void refetch()} className="ml-3 underline">
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="space-y-5">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold uppercase text-slate-900">
                {data.agent.fullName}
              </h1>
              <p className={`${analyticsNumFont.className} mt-1 text-sm text-slate-500`}>
                {data.agent.primaryRole} · {data.agent.systemUserId} · {data.agent.email}
              </p>
              <p className={`${analyticsNumFont.className} mt-1 text-sm font-medium text-slate-700`}>
                {pageTitle} · {formatDayLabel(day)}
              </p>
            </div>
            <Link
              href={`/dashboard/analytics/${category}/${agentId}`}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to day table
            </Link>
          </header>

          {view === "sessions" ? (
            <LoginActivityChart hourly={data.hourly} />
          ) : (
            <HourlyMatrixTable
              title={view === "tickets" ? "Ticket count by hour" : "Order count by hour"}
              hourly={data.hourly}
              view={view}
            />
          )}

          {view === "sessions" && (
            <SessionsAudit sessions={data.sessions} segments={data.statusSegments} />
          )}
          {view === "tickets" && <TicketsAudit tickets={data.tickets} />}
          {view === "orders" && <OrdersAudit orders={data.orders} />}
        </div>
      )}
    </div>
  );
}

function LoginActivityChart({ hourly }: { hourly: HourlyBucket[] }) {
  const data = Array.from({ length: 24 }, (_, hour) => {
    const bucket = hourly[hour];
    return {
      hour: `${String(hour).padStart(2, "0")}:00`,
      workHours: Number(((bucket?.workSeconds ?? 0) / 3600).toFixed(2)),
      breakHours: Number(((bucket?.breakSeconds ?? 0) / 3600).toFixed(2)),
      logins: bucket?.logins ?? 0,
    };
  });
  const totalWorkSeconds = hourly.reduce((sum, bucket) => sum + bucket.workSeconds, 0);
  const totalLogins = hourly.reduce((sum, bucket) => sum + bucket.logins, 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-blue-50 via-white to-violet-50 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Hourly login & work activity</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Work hours, break hours and login events across the day
          </p>
        </div>
        <div className={`${analyticsNumFont.className} flex items-center gap-2 text-xs`}>
          <span className="rounded-full bg-blue-100 px-2.5 py-1 font-semibold text-blue-700">
            Work: {formatAnalyticsDuration(totalWorkSeconds)}
          </span>
          <span className="rounded-full bg-violet-100 px-2.5 py-1 font-semibold text-violet-700">
            Logins: {totalLogins}
          </span>
        </div>
      </div>

      <div className="h-[390px] w-full px-3 pb-3 pt-5 sm:px-5">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 20, bottom: 20, left: 6 }}>
            <defs>
              <linearGradient id="loginWorkArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.38} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id="loginBreakArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="hour"
              interval={1}
              stroke="#94a3b8"
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "#cbd5e1" }}
            />
            <YAxis
              yAxisId="hours"
              allowDecimals
              stroke="#94a3b8"
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              label={{
                value: "Hours",
                angle: -90,
                position: "insideLeft",
                fill: "#64748b",
                fontSize: 11,
              }}
            />
            <YAxis
              yAxisId="logins"
              orientation="right"
              allowDecimals={false}
              stroke="#8b5cf6"
              tick={{ fill: "#7c3aed", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              label={{
                value: "Logins",
                angle: 90,
                position: "insideRight",
                fill: "#7c3aed",
                fontSize: 11,
              }}
            />
            <Tooltip
              contentStyle={{
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                boxShadow: "0 10px 24px rgba(15, 23, 42, 0.10)",
              }}
              formatter={(value, name) => [
                name === "Login events" ? Number(value) : `${Number(value).toFixed(2)}h`,
                name,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Area
              yAxisId="hours"
              type="monotone"
              dataKey="workHours"
              name="Work hours"
              stroke="#2563eb"
              strokeWidth={2.5}
              fill="url(#loginWorkArea)"
              dot={{ r: 3, fill: "#ffffff", stroke: "#2563eb", strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            <Area
              yAxisId="hours"
              type="monotone"
              dataKey="breakHours"
              name="Break hours"
              stroke="#f59e0b"
              strokeWidth={2}
              fill="url(#loginBreakArea)"
              dot={false}
              isAnimationActive={false}
            />
            <Bar
              yAxisId="logins"
              dataKey="logins"
              name="Login events"
              fill="#8b5cf6"
              radius={[5, 5, 0, 0]}
              maxBarSize={18}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function HourlyMatrixTable({
  title,
  hourly,
  view,
}: {
  title: string;
  hourly: HourlyBucket[];
  view: AuditView;
}) {
  const counts = Array.from({ length: 24 }, (_, hour) => {
    const bucket = hourly[hour];
    if (!bucket) return 0;
    if (view === "sessions") return bucket.logins || 0;
    if (view === "tickets") return bucket.ticketsWorked || 0;
    return bucket.ordersWorked || 0;
  });
  const total = counts.reduce((sum, count) => sum + count, 0);
  const hourHeaderClass = (count: number) =>
    count < 10
      ? "bg-rose-100 text-rose-700"
      : count < 20
        ? "bg-amber-400 text-slate-900"
        : "bg-emerald-600 text-white";
  const hourValueClass = (count: number) =>
    count < 10
      ? "bg-rose-50 text-rose-700"
      : count < 20
        ? "bg-amber-50 text-amber-800"
        : "bg-emerald-50 text-emerald-800";
  const hourTotalClass = (count: number) =>
    count < 10
      ? "bg-rose-100 text-rose-700"
      : count < 20
        ? "bg-amber-400 text-slate-900"
        : "bg-emerald-700 text-white";
  const overallTotalClass =
    total < 80
      ? "bg-rose-100 text-rose-700"
      : total <= 100
        ? "bg-amber-400 text-slate-900"
        : "bg-emerald-600 text-white";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <span
          className={`${analyticsNumFont.className} rounded-full px-2.5 py-1 text-xs font-semibold ${overallTotalClass}`}
        >
          Total: {total}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse whitespace-nowrap text-[10px]">
          <thead>
            <tr className="text-center font-semibold">
              <th className="sticky left-0 z-10 w-12 border border-slate-200 bg-slate-200 px-1 py-1 text-slate-700">
                S.No
              </th>
              {counts.map((_, hour) => (
                <th
                  key={hour}
                  title={`${String(hour).padStart(2, "0")}:00 — ${counts[hour]} worked`}
                  className={`w-8 border border-white/30 px-1 py-1 ${hourHeaderClass(counts[hour])}`}
                >
                  {hour}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={analyticsNumFont.className}>
            {counts.map((_, rowIndex) => (
              <tr key={rowIndex} className="h-4 text-center">
                <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-1 py-0 font-semibold text-slate-700">
                  {rowIndex + 1}
                </td>
                {counts.map((count, hour) => (
                  <td
                    key={hour}
                    className={`border border-slate-200 px-1 py-0 ${
                      hour === rowIndex && count > 0
                        ? `${hourValueClass(count)} font-bold`
                        : "bg-white text-transparent"
                    }`}
                  >
                    {hour === rowIndex && count > 0 ? count : "0"}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="h-6 text-center font-bold">
              <td
                className={`sticky left-0 z-10 border border-white/30 px-1 py-1 ${overallTotalClass}`}
              >
                Total = {total}
              </td>
              {counts.map((count, hour) => (
                <td
                  key={hour}
                  className={`border border-white/30 px-1 py-1 ${hourTotalClass(count)}`}
                >
                  {count}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SessionsAudit({
  sessions,
  segments,
}: {
  sessions: SessionItem[];
  segments: StatusSegment[];
}) {
  return (
    <section className="space-y-4">
      <AuditHeading title="Complete session records" count={sessions.length} />
      <AuditTable
        headers={["Session", "Login", "Logout", "Status", "Work", "Break"]}
        empty={sessions.length === 0}
        emptyText="No sessions this day."
      >
        {sessions.map((session) => (
          <tr key={session.id} className="hover:bg-slate-50">
            <Cell>#{session.id}</Cell>
            <Cell>{formatWhen(session.loginTime)}</Cell>
            <Cell>{formatWhen(session.logoutTime)}</Cell>
            <Cell className="uppercase">{session.currentStatus || "—"}</Cell>
            <Cell>{formatAnalyticsDuration(session.workSeconds)}</Cell>
            <Cell>{formatAnalyticsDuration(session.breakSeconds)}</Cell>
          </tr>
        ))}
      </AuditTable>

      <AuditHeading title="Status timeline" count={segments.length} />
      <AuditTable
        headers={["Status", "Started", "Ended", "Duration", "Reason"]}
        empty={segments.length === 0}
        emptyText="No status changes this day."
      >
        {segments.map((segment) => (
          <tr key={segment.id} className="hover:bg-slate-50">
            <Cell className="uppercase">{segment.status}</Cell>
            <Cell>{formatWhen(segment.startedAt)}</Cell>
            <Cell>{formatWhen(segment.endedAt)}</Cell>
            <Cell>{segment.durationMinutes > 0 ? `${segment.durationMinutes}m` : "—"}</Cell>
            <Cell>{segment.reason || "—"}</Cell>
          </tr>
        ))}
      </AuditTable>
    </section>
  );
}

function TicketsAudit({ tickets }: { tickets: TicketItem[] }) {
  return (
    <section>
      <AuditHeading title="Complete ticket records" count={tickets.length} />
      <AuditTable
        headers={["Ticket ID", "Subject", "Status", "Priority", "Assigned", "Updated", "Resolved"]}
        empty={tickets.length === 0}
        emptyText="No tickets worked this day."
      >
        {tickets.map((ticket) => (
          <tr key={ticket.id} className="hover:bg-slate-50">
            <Cell className="font-semibold">{ticket.ticketId}</Cell>
            <Cell className="max-w-[300px] truncate">{ticket.subject}</Cell>
            <Cell>
              <StatusPill value={ticket.status} positive={ticket.resolvedThatDay} />
            </Cell>
            <Cell>{ticket.priority || "—"}</Cell>
            <Cell>{formatWhen(ticket.assignedAt)}</Cell>
            <Cell>{formatWhen(ticket.updatedAt)}</Cell>
            <Cell>{formatWhen(ticket.resolvedAt ?? ticket.closedAt)}</Cell>
          </tr>
        ))}
      </AuditTable>
    </section>
  );
}

function OrdersAudit({ orders }: { orders: OrderItem[] }) {
  return (
    <section>
      <AuditHeading title="Complete order records" count={orders.length} />
      <AuditTable
        headers={["Order ID", "First action", "Last action", "Status", "Type", "Actions"]}
        empty={orders.length === 0}
        emptyText="No orders worked this day."
      >
        {orders.map((order) => {
          const coreId = Number(order.orderId) || 0;
          const publicId = String(order.formattedOrderId ?? "").replace(/^#/, "");
          return (
            <tr key={order.orderId} className="hover:bg-slate-50">
              <Cell>
                {publicId ? (
                  <Link
                    href={`/order/${encodeURIComponent(publicId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    prefetch={false}
                    className="inline-flex cursor-pointer hover:underline"
                  >
                    <FormattedOrderId
                      formattedOrderId={order.formattedOrderId}
                      fallbackOrderId={coreId}
                      size="sm"
                    />
                  </Link>
                ) : (
                  <FormattedOrderId
                    formattedOrderId={order.formattedOrderId}
                    fallbackOrderId={coreId}
                    size="sm"
                  />
                )}
              </Cell>
              <Cell>{formatWhen(order.firstActionAt)}</Cell>
              <Cell>{formatWhen(order.lastActionAt)}</Cell>
              <Cell><StatusPill value={order.orderStatus || "—"} /></Cell>
              <Cell className="uppercase">{order.orderType || "—"}</Cell>
              <Cell>{String(order.remarkCount)}</Cell>
            </tr>
          );
        })}
      </AuditTable>
    </section>
  );
}

function AuditHeading({ title, count }: { title: string; count: number }) {
  return (
    <h2 className="mb-3 text-base font-semibold text-slate-900">
      {title} <span className={`${analyticsNumFont.className} text-slate-500`}>({count})</span>
    </h2>
  );
}

function AuditTable({
  headers,
  empty,
  emptyText,
  children,
}: {
  headers: string[];
  empty: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full border-collapse whitespace-nowrap text-sm">
        <thead>
          <tr className="bg-[#e8eef8] text-left text-xs uppercase tracking-wide text-slate-600">
            {headers.map((header) => (
              <th key={header} className="border border-slate-200 px-3 py-2">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={analyticsNumFont.className}>
          {children}
          {empty && (
            <tr>
              <td colSpan={headers.length} className="px-3 py-8 text-center text-slate-500">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={`border border-slate-200 px-3 py-2 ${className}`}>{children}</td>;
}

function StatusPill({ value, positive = false }: { value: string; positive?: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
        positive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {value}
    </span>
  );
}

