"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Calendar } from "lucide-react";
import { TicketComposeAutomationSection } from "@/components/tickets/TicketComposeAutomationSection";
import { TicketNotificationAutomationSection } from "@/components/tickets/TicketNotificationAutomationSection";
import { loadClientSnapshot, saveClientSnapshot } from "@/lib/client-route-snapshot";

type Period = "today" | "week" | "month" | "custom";

interface ActivitySummary {
  onlineTimeMinutes: number;
  breakTimeMinutes: number;
  activeTimeMinutes: number;
  ticketsAssigned: number;
  ticketsResolved: number;
  ticketsClosed: number;
  ticketsReopened: number;
  ticketsUpdated: number;
  csatCount: number;
  dsatCount: number;
  avgRating: number | null;
}

interface AgentActivityRow {
  userId: number;
  name: string;
  email: string;
  onlineTimeMinutes: number;
  breakTimeMinutes: number;
  ticketsResolved: number;
  ticketsClosed: number;
  ticketsAssigned: number;
  ticketsUpdated: number;
  ticketsReopened: number;
}

type AgentActivityApiResponse = {
  success: boolean;
  data: {
    period: string;
    startDate: string;
    endDate: string;
    summary: ActivitySummary;
    profile: unknown;
    dailyBreakdown: unknown[];
    allAgents?: AgentActivityRow[];
  };
};

const AGENT_ACTIVITY_SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AgentActivityEmbed = "ticketSettingsActivity";

function StatMetricCard({
  label,
  value,
  sub,
  compact,
}: {
  label: string;
  value: string | number;
  sub?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white shadow-sm ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-2 font-bold tabular-nums text-gray-900 ${compact ? "text-2xl" : "text-3xl"}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-gray-500">{sub}</p> : null}
    </div>
  );
}

function WidgetShell({
  title,
  subtitle,
  action,
  children,
  compact,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[200px] flex-col rounded-lg border border-gray-200 bg-white shadow-sm ${
        compact ? "" : "min-h-[240px]"
      }`}
    >
      <div
        className={`flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 ${
          compact ? "px-4 py-3" : "px-5 py-4"
        }`}
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={`min-h-0 flex-1 ${compact ? "px-4 py-3" : "px-5 py-4"}`}>{children}</div>
    </div>
  );
}

function MetricTableRow({ label, value, valueClassName }: { label: string; value: ReactNode; valueClassName?: string }) {
  return (
    <tr className="border-b border-gray-100 last:border-b-0">
      <td className="py-2.5 pr-3 text-sm text-gray-600">{label}</td>
      <td className={`py-2.5 text-right text-sm font-semibold tabular-nums ${valueClassName ?? "text-gray-900"}`}>
        {value}
      </td>
    </tr>
  );
}

export function AgentActivityPageClient({ embed }: { embed?: AgentActivityEmbed }) {
  const searchParams = useSearchParams();
  const sectionFromUrl = searchParams.get("section") === "automation" ? "automation" : "activity";
  const section = embed === "ticketSettingsActivity" ? "activity" : sectionFromUrl;

  const [period, setPeriod] = useState<Period>("today");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const activitySnapshotKey = useMemo(() => {
    const suffix = period === "custom" ? `${startDate}|${endDate}` : period;
    return `dashboard_snapshot:agentActivity:v1:${suffix}`;
  }, [period, startDate, endDate]);

  const initialActivitySnapshot = useMemo(() => {
    const raw = loadClientSnapshot<AgentActivityApiResponse>(activitySnapshotKey, AGENT_ACTIVITY_SNAPSHOT_TTL_MS);
    if (!raw?.success || !raw.data?.summary) return undefined;
    return raw;
  }, [activitySnapshotKey]);

  const { data, error, isFetching, refetch } = useQuery<AgentActivityApiResponse>({
    queryKey: ["agentActivity", period, startDate, endDate],
    enabled: section === "activity",
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("period", period);
      if (period === "custom" && startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      }
      const res = await fetch(`/api/agents/activity?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch activity");
      return res.json();
    },
    staleTime: 60_000,
    gcTime: 24 * 60 * 60_000,
    initialData: initialActivitySnapshot,
    initialDataUpdatedAt: initialActivitySnapshot != null ? 0 : undefined,
  });

  useEffect(() => {
    if (!data?.success || !data.data) return;
    saveClientSnapshot(activitySnapshotKey, data);
  }, [data, activitySnapshotKey]);

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const summary = data?.data?.summary || {
    onlineTimeMinutes: 0,
    breakTimeMinutes: 0,
    activeTimeMinutes: 0,
    ticketsAssigned: 0,
    ticketsResolved: 0,
    ticketsClosed: 0,
    ticketsReopened: 0,
    ticketsUpdated: 0,
    csatCount: 0,
    dsatCount: 0,
    avgRating: null,
  };

  const isEmbeddedActivity = embed === "ticketSettingsActivity";
  const compact = isEmbeddedActivity;

  const rootClass = isEmbeddedActivity ? "min-w-0 space-y-4 py-2" : "min-w-0 space-y-5";

  return (
    <div className={rootClass}>
      {!isEmbeddedActivity && (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              {section === "automation" ? "Automation & settings" : "Agent Activity"}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {section === "automation"
                ? "Reply composer defaults and notification rules for your account."
                : "Performance metrics, CSAT, and time tracking for the selected period."}
            </p>
          </div>
          {section === "activity" && (
            <span className="text-xs font-medium text-blue-600">Summary</span>
          )}
        </header>
      )}

      {section === "automation" ? (
        <div className={isEmbeddedActivity ? "space-y-4" : "space-y-5"}>
          <div
            className={`rounded-lg border border-gray-200 bg-white shadow-sm ${isEmbeddedActivity ? "p-4" : "p-6"}`}
          >
            <TicketComposeAutomationSection variant="plain" />
          </div>
          <div
            className={`rounded-lg border border-gray-200 bg-white shadow-sm ${isEmbeddedActivity ? "p-4" : "p-6"}`}
          >
            <TicketNotificationAutomationSection variant="plain" />
          </div>
        </div>
      ) : (
        <>
          {/* Period toolbar — Freshdesk-style white bar */}
          <div
            className={`flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white shadow-sm ${
              compact ? "px-3 py-2.5" : "px-4 py-3"
            }`}
          >
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
              <span className="text-xs font-semibold text-gray-700">Period</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["today", "week", "month", "custom"] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    period === p
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            {period === "custom" && (
              <div className="flex flex-wrap items-center gap-2 border-l border-gray-200 pl-3">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 shadow-sm"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 shadow-sm"
                />
              </div>
            )}
          </div>

          {section === "activity" && error && !data ? (
            <div
              className={`rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 ${
                compact ? "" : ""
              }`}
            >
              Failed to load activity data.{" "}
              <button
                type="button"
                className="font-semibold text-red-900 underline"
                onClick={() => void refetch()}
              >
                Retry
              </button>
            </div>
          ) : null}
          {section === "activity" && isFetching ? (
            <p className={`text-xs text-gray-400 ${compact ? "px-0.5" : ""}`}>Updating metrics…</p>
          ) : null}

          {/* Row 1 — four KPI cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatMetricCard
                  compact={compact}
                  label="Online time"
                  value={formatMinutes(summary.onlineTimeMinutes)}
                />
                <StatMetricCard compact={compact} label="Tickets resolved" value={summary.ticketsResolved} />
                <StatMetricCard
                  compact={compact}
                  label="CSAT score"
                  value={summary.avgRating != null ? summary.avgRating.toFixed(1) : "—"}
                  sub={summary.csatCount > 0 ? `${summary.csatCount} rating${summary.csatCount === 1 ? "" : "s"}` : "No ratings yet"}
                />
                <StatMetricCard compact={compact} label="DSAT count" value={summary.dsatCount} />
              </div>

              {/* Row 2 — three widgets */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
                <WidgetShell
                  compact={compact}
                  title="Ticket metrics"
                  subtitle="Across the selected period"
                  action={
                    <a
                      href="#agent-activity-daily"
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      View details
                    </a>
                  }
                >
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="pb-2 text-left text-xs font-medium text-gray-500">Metric</th>
                        <th className="pb-2 text-right text-xs font-medium text-gray-500">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      <MetricTableRow label="Assigned" value={summary.ticketsAssigned} />
                      <MetricTableRow label="Resolved" value={summary.ticketsResolved} valueClassName="text-green-700" />
                      <MetricTableRow label="Closed" value={summary.ticketsClosed} />
                      <MetricTableRow label="Updated" value={summary.ticketsUpdated} />
                      <MetricTableRow label="Reopened" value={summary.ticketsReopened} valueClassName="text-orange-700" />
                    </tbody>
                  </table>
                </WidgetShell>

                <WidgetShell compact={compact} title="Time metrics" subtitle="Availability & breaks">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="pb-2 text-left text-xs font-medium text-gray-500">Metric</th>
                        <th className="pb-2 text-right text-xs font-medium text-gray-500">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      <MetricTableRow
                        label="Online"
                        value={formatMinutes(summary.onlineTimeMinutes)}
                        valueClassName="text-blue-700"
                      />
                      <MetricTableRow
                        label="Break"
                        value={formatMinutes(summary.breakTimeMinutes)}
                        valueClassName="text-amber-700"
                      />
                      <MetricTableRow
                        label="Active"
                        value={formatMinutes(summary.activeTimeMinutes)}
                        valueClassName="text-green-700"
                      />
                      <MetricTableRow
                        label="Net work time"
                        value={formatMinutes(Math.max(0, summary.onlineTimeMinutes - summary.breakTimeMinutes))}
                      />
                    </tbody>
                  </table>
                </WidgetShell>

                <WidgetShell compact={compact} title="CSAT & feedback" subtitle="Quality signals">
                  <div className="flex flex-col items-center justify-center py-4 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Average rating</p>
                    <p className="mt-2 text-4xl font-bold tabular-nums text-gray-900">
                      {summary.avgRating != null ? summary.avgRating.toFixed(1) : "—"}
                    </p>
                    <p className="mt-3 text-xs text-gray-500">
                      {summary.csatCount > 0
                        ? `Based on ${summary.csatCount} response${summary.csatCount === 1 ? "" : "s"}`
                        : "No CSAT responses in this period."}
                    </p>
                    {summary.dsatCount > 0 ? (
                      <p className="mt-2 text-xs font-medium text-red-700">{summary.dsatCount} DSAT</p>
                    ) : null}
                  </div>
                </WidgetShell>
              </div>

              {data?.data?.allAgents && data.data.allAgents.length > 0 && (
                <section
                  className={`rounded-lg border border-gray-200 bg-white shadow-sm ${
                    compact ? "p-4" : "p-5"
                  }`}
                >
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-gray-100 pb-3">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900">All agents</h2>
                      <p className="mt-0.5 text-xs text-gray-500">Activity for everyone in the selected period.</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Agent</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Email</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">Online</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">Break</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">Assigned</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">Resolved</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">Closed</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">Updated</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">Reopened</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.data.allAgents.map((agent) => (
                          <tr key={agent.userId} className="border-b border-gray-100 hover:bg-gray-50/80">
                            <td className="px-2 py-2.5 font-medium text-gray-900">{agent.name}</td>
                            <td className="px-2 py-2.5 text-gray-600">{agent.email}</td>
                            <td className="px-2 py-2.5 text-right text-gray-700">
                              {formatMinutes(agent.onlineTimeMinutes)}
                            </td>
                            <td className="px-2 py-2.5 text-right text-gray-700">
                              {formatMinutes(agent.breakTimeMinutes)}
                            </td>
                            <td className="px-2 py-2.5 text-right text-gray-700">{agent.ticketsAssigned}</td>
                            <td className="px-2 py-2.5 text-right font-medium text-green-700">{agent.ticketsResolved}</td>
                            <td className="px-2 py-2.5 text-right text-gray-700">{agent.ticketsClosed}</td>
                            <td className="px-2 py-2.5 text-right text-gray-700">{agent.ticketsUpdated}</td>
                            <td className="px-2 py-2.5 text-right text-orange-700">{agent.ticketsReopened}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {data?.data?.dailyBreakdown && data.data.dailyBreakdown.length > 0 && (
                <section
                  id="agent-activity-daily"
                  className={`scroll-mt-4 rounded-lg border border-gray-200 bg-white shadow-sm ${
                    compact ? "p-4" : "p-5"
                  }`}
                >
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-gray-100 pb-3">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900">Daily breakdown</h2>
                      <p className="mt-0.5 text-xs text-gray-500">Day-by-day totals in this range.</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">Online</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">Break</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">Resolved</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">CSAT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.data.dailyBreakdown.map((day: Record<string, unknown>, idx: number) => (
                          <tr key={idx} className="border-b border-gray-100">
                            <td className="px-2 py-2.5 text-gray-900">
                              {new Date(String(day.activity_date)).toLocaleDateString()}
                            </td>
                            <td className="px-2 py-2.5 text-right text-gray-700">
                              {formatMinutes(Number(day.online_time_minutes) || 0)}
                            </td>
                            <td className="px-2 py-2.5 text-right text-gray-700">
                              {formatMinutes(Number(day.break_time_minutes) || 0)}
                            </td>
                            <td className="px-2 py-2.5 text-right text-gray-700">{Number(day.tickets_resolved) || 0}</td>
                            <td className="px-2 py-2.5 text-right text-gray-700">
                              {day.csat_score != null && typeof day.csat_score === "number"
                                ? day.csat_score.toFixed(1)
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
        </>
      )}
    </div>
  );
}
