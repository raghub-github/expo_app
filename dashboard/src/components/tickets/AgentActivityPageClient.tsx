"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar } from "lucide-react";
import { loadClientSnapshot, saveClientSnapshot } from "@/lib/client-route-snapshot";
import { AgentActivityAgentSearch } from "@/components/tickets/AgentActivityAgentSearch";
import { AGENT_ACTIVITY_PATH } from "@/lib/tickets/ticket-path-utils";

type Period = "today" | "week" | "month" | "custom";

interface ActivitySummary {
  onlineTimeMinutes: number;
  breakTimeMinutes: number;
  busyTimeMinutes: number;
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
  busyTimeMinutes?: number;
  workingTimeMinutes?: number;
  ticketsResolved: number;
  ticketsClosed: number;
  ticketsAssigned: number;
  ticketsUpdated: number;
  ticketsReopened: number;
  ticketsReassignedFromAgent?: number;
  ticketsSnoozed?: number;
  privateNotes?: number;
  responses?: number;
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
    statusSegments?: unknown[];
    dailyTransitions?: unknown[];
    allAgents?: AgentActivityRow[];
  };
};

const AGENT_ACTIVITY_SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function formatLocalDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
      className={`rounded-md border border-gray-200 bg-white ${
        compact ? "p-3.5" : "p-4"
      }`}
    >
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <p
        className={`mt-2 font-semibold tabular-nums text-slate-800 ${compact ? "text-2xl" : "text-[34px]"}`}
        suppressHydrationWarning
      >
        {value}
      </p>
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
      className={`flex min-h-[200px] flex-col rounded-md border border-gray-200 bg-white ${
        compact ? "" : "min-h-[240px]"
      }`}
    >
      <div
        className={`flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 ${
          compact ? "px-4 py-3" : "px-5 py-4"
        }`}
      >
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={`${compact ? "px-4 py-3" : "px-5 py-4"}`}>{children}</div>
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
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useAppSearchParams();
  const sectionFromUrl = searchParams.get("section") === "automation" ? "automation" : "activity";
  const activityQueryEnabled = embed === "ticketSettingsActivity" || sectionFromUrl !== "automation";

  const [period, setPeriod] = useState<Period>("today");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  /** Avoid SSR vs client mismatch for blocks that depend on client-only query/snapshot data. */
  const [activityUiMounted, setActivityUiMounted] = useState(false);
  useEffect(() => {
    setActivityUiMounted(true);
  }, []);

  const selectedAgentUserIdRaw = searchParams.get("agentUserId");
  const parsedSelectedAgentUserId = selectedAgentUserIdRaw ? Number(selectedAgentUserIdRaw) : NaN;
  const selectedAgentUserId =
    Number.isFinite(parsedSelectedAgentUserId) && parsedSelectedAgentUserId > 0 ? parsedSelectedAgentUserId : null;
  const selectedAgentSuffix = selectedAgentUserId != null ? String(selectedAgentUserId) : "all";

  // NOTE: Do NOT strip `agentUserId` from the URL here. A previous effect always deleted it
  // whenever it was present, which cleared the agent picker ~0.5s after every selection.
  // Default remains "All agents" when the param is absent.

  const activitySnapshotKey = useMemo(() => {
    const suffix = period === "custom" ? `${startDate}|${endDate}` : period;
    return `dashboard_snapshot:agentActivity:v1:${selectedAgentSuffix}:${suffix}`;
  }, [period, startDate, endDate, selectedAgentSuffix]);

  const activityQueryKey = useMemo(
    () => ["agentActivity", period, startDate, endDate, selectedAgentSuffix] as const,
    [period, startDate, endDate, selectedAgentSuffix]
  );

  const customRangeReady = period !== "custom" || (Boolean(startDate) && Boolean(endDate));
  const activityFetchEnabled = activityQueryEnabled && customRangeReady;

  const { data, error, isFetching, refetch } = useQuery<AgentActivityApiResponse>({
    queryKey: activityQueryKey,
    enabled: activityFetchEnabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("period", period);
      if (selectedAgentUserId != null && Number.isFinite(selectedAgentUserId) && selectedAgentUserId > 0) {
        params.set("agentUserId", String(selectedAgentUserId));
      }
      if (period === "custom" && startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      }
      const res = await fetch(`/api/agents/activity?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch activity");
      return res.json();
    },
    staleTime: 60_000,
    gcTime: 24 * 60 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });

  /** localStorage is unavailable on the server — never use snapshot as initialData or SSR and first paint diverge. */
  useEffect(() => {
    if (!activityUiMounted) return;
    const snap = loadClientSnapshot<AgentActivityApiResponse>(activitySnapshotKey, AGENT_ACTIVITY_SNAPSHOT_TTL_MS);
    if (!snap?.success || !snap.data?.summary) return;
    const existing = queryClient.getQueryData<AgentActivityApiResponse>(activityQueryKey);
    if (existing === undefined) {
      queryClient.setQueryData(activityQueryKey, snap);
    }
  }, [activityUiMounted, activitySnapshotKey, activityQueryKey, queryClient]);

  useEffect(() => {
    if (!data?.success || !data.data) return;
    saveClientSnapshot(activitySnapshotKey, data);
  }, [data, activitySnapshotKey]);

  useEffect(() => {
    if (embed === "ticketSettingsActivity") return;
    if (sectionFromUrl === "automation") {
      router.replace("/dashboard/tickets/queue/manager");
    }
  }, [embed, router, sectionFromUrl]);

  const applyPeriod = (p: Period) => {
    setPeriod(p);
    if (p === "custom") {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 1);
      setEndDate(formatLocalDateInput(end));
      setStartDate(formatLocalDateInput(start));
    }
  };

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const formatStatusLabel = (s: string) =>
    s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "—";

  type TransitionTotals = { toOnline: number; toOffline: number; toBreak: number; toBusy: number };

  const transitionTotals = useMemo((): TransitionTotals => {
    const rows = (data?.data?.dailyTransitions as Array<Record<string, unknown>> | undefined) ?? [];
    const init: TransitionTotals = { toOnline: 0, toOffline: 0, toBreak: 0, toBusy: 0 };
    return rows.reduce<TransitionTotals>(
      (acc, row) => ({
        toOnline: acc.toOnline + (Number(row.to_online) || 0),
        toOffline: acc.toOffline + (Number(row.to_offline) || 0),
        toBreak: acc.toBreak + (Number(row.to_break) || 0),
        toBusy: acc.toBusy + (Number(row.to_busy) || 0),
      }),
      init
    );
  }, [data?.data?.dailyTransitions]);

  const dailyTransitionsRows = data?.data?.dailyTransitions as Array<Record<string, unknown>> | undefined;
  const statusSegmentsRows = data?.data?.statusSegments as Array<Record<string, unknown>> | undefined;

  const summary = data?.data?.summary || {
    onlineTimeMinutes: 0,
    breakTimeMinutes: 0,
    busyTimeMinutes: 0,
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

  const rootClass = isEmbeddedActivity ? "min-w-0 space-y-4 py-2" : "min-w-0 space-y-4 rounded-md bg-[#f5f6f8] p-3";

  if (sectionFromUrl === "automation" && embed !== "ticketSettingsActivity") {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-gray-500">
        Opening Manager…
      </div>
    );
  }

  return (
    <div className={rootClass}>
      <>
          {/* Period toolbar — Freshdesk-style white bar */}
          <div
            className={`flex flex-wrap items-center gap-3 rounded-md border border-gray-200 bg-white ${
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
                  onClick={() => applyPeriod(p)}
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
              <div className="flex flex-col gap-1 border-l border-gray-200 pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={startDate}
                    max={endDate || undefined}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 shadow-sm"
                  />
                  <span className="text-xs text-gray-400">to</span>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-800 shadow-sm"
                  />
                </div>
                {!customRangeReady ? (
                  <p className="text-[11px] text-amber-800">Select both dates to load metrics.</p>
                ) : null}
              </div>
            )}
            {!isEmbeddedActivity ? (
              <div className="ml-auto w-full sm:w-[320px]">
                <AgentActivityAgentSearch />
              </div>
            ) : null}
          </div>

          {error && !data ? (
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

          <div
            className={`space-y-4 transition-opacity duration-200 ease-out ${
              isFetching && data?.success ? "opacity-[0.88]" : "opacity-100"
            }`}
          >
          {/* Row 1 — four KPI cards */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <WidgetShell
                  compact={compact}
                  title="Ticket metrics"
                  subtitle="Across the selected period"
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
                        label="Busy"
                        value={formatMinutes(summary.busyTimeMinutes ?? 0)}
                        valueClassName="text-purple-700"
                      />
                      <MetricTableRow
                        label="Active"
                        value={formatMinutes(summary.activeTimeMinutes)}
                        valueClassName="text-green-700"
                      />
                      <MetricTableRow
                        label="Working presence (online + busy)"
                        value={formatMinutes(summary.onlineTimeMinutes + (summary.busyTimeMinutes ?? 0))}
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

              {activityUiMounted &&
                selectedAgentUserId == null &&
                data?.data?.allAgents &&
                data.data.allAgents.length > 0 && (
                <section
                  className={`rounded-md border border-gray-200 bg-white ${
                    compact ? "p-4" : "p-5"
                  }`}
                >
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-gray-100 pb-3">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900">All agents</h2>
                      <p className="mt-0.5 text-xs text-gray-500">Activity for everyone in the selected period.</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-md border border-gray-200">
                    <table className="w-full min-w-[860px] text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-500">Agent name</th>
                          <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-500">Online</th>
                          <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-500">Break</th>
                          <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-500">Busy</th>
                          <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-500">Working</th>
                          <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-500">Tickets assigned to agent</th>
                          <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-500">Tickets resolved</th>
                          <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-500">Tickets reopened</th>
                          <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-500">Tickets reassigned from agent</th>
                          <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-500">Tickets snoozed</th>
                          <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-500">Private notes</th>
                          <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-500">Responses</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.data.allAgents.map((agent) => (
                          <tr key={agent.userId} className="hover:bg-gray-50/80">
                            <td className="border border-gray-200 px-3 py-2.5 font-medium text-gray-900">{agent.name}</td>
                            <td className="border border-gray-200 px-3 py-2.5 text-right text-gray-700">{formatMinutes(agent.onlineTimeMinutes)}</td>
                            <td className="border border-gray-200 px-3 py-2.5 text-right text-gray-700">{formatMinutes(agent.breakTimeMinutes)}</td>
                            <td className="border border-gray-200 px-3 py-2.5 text-right text-gray-700">{formatMinutes(agent.busyTimeMinutes ?? 0)}</td>
                            <td className="border border-gray-200 px-3 py-2.5 text-right text-gray-700">
                              {formatMinutes(agent.workingTimeMinutes ?? (agent.onlineTimeMinutes + (agent.busyTimeMinutes ?? 0)))}
                            </td>
                            <td className="border border-gray-200 px-3 py-2.5 text-right text-gray-700">{agent.ticketsAssigned}</td>
                            <td className="border border-gray-200 px-3 py-2.5 text-right text-gray-700">{agent.ticketsResolved}</td>
                            <td className="border border-gray-200 px-3 py-2.5 text-right text-gray-700">{agent.ticketsReopened}</td>
                            <td className="border border-gray-200 px-3 py-2.5 text-right text-gray-700">{agent.ticketsReassignedFromAgent ?? 0}</td>
                            <td className="border border-gray-200 px-3 py-2.5 text-right text-gray-700">{agent.ticketsSnoozed ?? 0}</td>
                            <td className="border border-gray-200 px-3 py-2.5 text-right text-gray-700">{agent.privateNotes ?? 0}</td>
                            <td className="border border-gray-200 px-3 py-2.5 text-right text-gray-700">{agent.responses ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {selectedAgentUserId != null &&
                data?.data?.dailyBreakdown &&
                data.data.dailyBreakdown.length > 0 && (
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
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">Busy</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">Resolved</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">CSAT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.data.dailyBreakdown as Array<Record<string, unknown>>).map((day, idx) => (
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
                            <td className="px-2 py-2.5 text-right text-gray-700">
                              {formatMinutes(Number(day.busy_time_minutes) || 0)}
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

              {selectedAgentUserId != null && dailyTransitionsRows && dailyTransitionsRows.length > 0 ? (
                <section
                  className={`rounded-lg border border-gray-200 bg-white shadow-sm ${
                    compact ? "p-4" : "p-5"
                  }`}
                >
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-gray-100 pb-3">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900">Status transitions</h2>
                      <p className="mt-0.5 text-xs text-gray-500">
                        How often you switched state (from availability logs), per UTC day. Period totals: Online{" "}
                        <span className="font-semibold tabular-nums text-gray-800">{transitionTotals.toOnline}</span>
                        , Offline{" "}
                        <span className="font-semibold tabular-nums text-gray-800">{transitionTotals.toOffline}</span>
                        , Break <span className="font-semibold tabular-nums text-gray-800">{transitionTotals.toBreak}</span>
                        , Busy{" "}
                        <span className="font-semibold tabular-nums text-gray-800">{transitionTotals.toBusy}</span>.
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Date (UTC)</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">→ Online</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">→ Offline</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">→ Break</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">→ Busy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyTransitionsRows.map((row, idx: number) => (
                          <tr key={idx} className="border-b border-gray-100">
                            <td className="px-2 py-2.5 text-gray-900">
                              {row.day != null ? String(row.day) : "—"}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">
                              {Number(row.to_online) || 0}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">
                              {Number(row.to_offline) || 0}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">
                              {Number(row.to_break) || 0}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">
                              {Number(row.to_busy) || 0}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              {selectedAgentUserId != null && statusSegmentsRows && statusSegmentsRows.length > 0 ? (
                <section
                  className={`rounded-lg border border-gray-200 bg-white shadow-sm ${
                    compact ? "p-4" : "p-5"
                  }`}
                >
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-gray-100 pb-3">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900">Completed status intervals</h2>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Each row is a finished period in one state (start → end). Up to 500 intervals in this range.
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[840px] text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Started</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Ended</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-gray-500">Duration</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Source</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statusSegmentsRows.map((row, idx: number) => (
                          <tr key={idx} className="border-b border-gray-100">
                            <td className="px-2 py-2.5 font-medium text-gray-900">
                              {formatStatusLabel(String(row.status ?? ""))}
                            </td>
                            <td className="px-2 py-2.5 text-gray-600">
                              {row.started_at != null
                                ? new Date(String(row.started_at)).toLocaleString(undefined, {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })
                                : "—"}
                            </td>
                            <td className="px-2 py-2.5 text-gray-600">
                              {row.ended_at != null
                                ? new Date(String(row.ended_at)).toLocaleString(undefined, {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })
                                : "—"}
                            </td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">
                              {formatMinutes(Number(row.duration_minutes) || 0)}
                            </td>
                            <td className="px-2 py-2.5 text-gray-600">
                              {row.change_source != null && String(row.change_source).length > 0
                                ? formatStatusLabel(String(row.change_source))
                                : "—"}
                            </td>
                            <td className="max-w-[200px] truncate px-2 py-2.5 text-gray-600" title={row.reason != null ? String(row.reason) : undefined}>
                              {row.reason != null && String(row.reason).length > 0 ? String(row.reason) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
          </div>
        </>
    </div>
  );
}
