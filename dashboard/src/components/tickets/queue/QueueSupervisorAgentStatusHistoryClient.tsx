"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Briefcase, CalendarOff, ChevronRight, Clock, LogOut, Timer, X, Zap } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { TICKETS_QUEUE_SUPERVISOR_PATH } from "@/lib/tickets/ticket-path-utils";

type Period = "today" | "week" | "month" | "custom";

const KOLKATA_TZ = "Asia/Kolkata";

function toYmdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(s: string): Date | null {
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [yy, mm, dd] = t.split("-").map(Number);
  const d = new Date(yy, mm - 1, dd);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatMinutes(m: number): string {
  if (!m || m <= 0) return "0m";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm}m`;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

function formatRangeLabel(isoStart: string, isoEnd: string): string {
  try {
    const a = new Date(isoStart);
    const b = new Date(isoEnd);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "";
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
    return `${a.toLocaleDateString(undefined, opts)} – ${b.toLocaleDateString(undefined, opts)}`;
  } catch {
    return "";
  }
}

/** Display timestamps in Asia/Kolkata for supervisors. */
function formatDtKolkata(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: KOLKATA_TZ,
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(d);
  } catch {
    return iso;
  }
}

function normStatus(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

function statusLabel(status: string): string {
  const s = normStatus(status);
  if (s === "online") return "Available (online)";
  if (s === "offline") return "Offline";
  if (s === "break") return "Break";
  if (s === "busy") return "Busy";
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "—";
}

function logoutReasonKeyFromEvent(reason: string | null | undefined): string {
  const t = (reason ?? "").trim();
  return t === "" ? "(no reason)" : t;
}

type SegmentInterval = {
  id: number;
  status: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  reason: string | null;
};

type AvailabilityEvent = {
  changedAt: string;
  status: string;
  previousStatus: string | null;
  reason: string | null;
};

type StatusHistoryResponse = {
  success: boolean;
  error?: string;
  data?: {
    agent: { id: number; name: string; email: string };
    period: string;
    startDate: string;
    endDate: string;
    statusSegments: Array<{ status: string; segmentCount: number; totalMinutes: number }>;
    transitionsToStatus: Array<{ status: string; count: number }>;
    logoutReasons: Array<{ reason: string; count: number }>;
    activityRollup: {
      availableMinutes: number;
      busyMinutes: number;
      breakMinutes: number;
      workingMinutes: number;
    };
    segmentIntervals: SegmentInterval[];
    availabilityEvents: AvailabilityEvent[];
    detailCaps?: {
      segmentIntervalsReturned: number;
      segmentIntervalsTotal: number;
      segmentIntervalsTruncated: boolean;
      availabilityEventsReturned: number;
      availabilityEventsTotal: number;
      availabilityEventsTruncated: boolean;
      rowCap: number;
    };
  };
};

type DetailModalState =
  | { kind: "segments"; status: string }
  | { kind: "switches"; status: string }
  | { kind: "logout"; reasonKey: string };

function DataPanel({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.03] ${className}`}
    >
      <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/90 px-3 py-2">
        {icon ? <span className="text-slate-500 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span> : null}
        <h2 className="text-xs font-semibold tracking-tight text-slate-900">{title}</h2>
      </div>
      <div className="min-h-0 flex-1 p-2.5 sm:p-3">{children}</div>
    </div>
  );
}

function DataTable({
  headers,
  rows,
  dense,
  onRowClick,
}: {
  headers: [string, string, string?];
  rows: Array<{ key: string; cols: ReactNode[] }>;
  dense?: boolean;
  onRowClick?: (key: string) => void;
}) {
  const cellPad = dense ? "py-1.5" : "py-2";
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-100">
      <table className="w-full min-w-[240px] text-left text-xs sm:text-sm">
        <thead>
          <tr className="bg-slate-100/90 text-[10px] font-semibold uppercase tracking-wide text-slate-600 sm:text-[11px]">
            <th className={`${cellPad} pl-2.5 pr-2 sm:pl-3`}>{headers[0]}</th>
            <th className={`${cellPad} pr-2 text-right tabular-nums`}>{headers[1]}</th>
            {headers[2] ? (
              <th className={`${cellPad} pr-2.5 text-right tabular-nums sm:pr-3`}>{headers[2]}</th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={headers[2] ? 3 : 2}
                className={`${cellPad} px-3 text-center text-slate-500`}
              >
                No records in this range.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr
                key={r.key}
                onClick={onRowClick ? () => onRowClick(r.key) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(r.key);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "button" : undefined}
                className={`bg-white transition-colors ${
                  onRowClick
                    ? "cursor-pointer hover:bg-indigo-50/60 focus-visible:bg-indigo-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
                    : "hover:bg-slate-50/80"
                }`}
              >
                {r.cols.map((c, i) => (
                  <td
                    key={i}
                    className={`${cellPad} ${
                      i === 0
                        ? "pl-2.5 pr-2 font-medium text-slate-800 sm:pl-3"
                        : "pr-2.5 text-right tabular-nums text-slate-900 sm:pr-3"
                    } ${i === 1 && headers[2] ? "pr-2" : ""}`}
                  >
                    <span className="inline-flex w-full items-center justify-between gap-1">
                      <span className="min-w-0">{c}</span>
                      {onRowClick && i === 0 ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                      ) : null}
                    </span>
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function RollupStat({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  accent: "violet" | "emerald" | "amber" | "sky";
}) {
  const accentRing = {
    violet: "from-violet-500/10 to-fuchsia-500/6 ring-violet-200/50",
    emerald: "from-emerald-500/10 to-teal-500/6 ring-emerald-200/50",
    amber: "from-amber-500/10 to-orange-500/6 ring-amber-200/50",
    sky: "from-sky-500/10 to-blue-500/6 ring-sky-200/50",
  }[accent];
  return (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br p-3 ring-1 ${accentRing} shadow-sm sm:p-3.5`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px]">{label}</p>
          <p className="mt-1 text-lg font-bold tabular-nums tracking-tight text-slate-900 sm:text-xl">{value}</p>
        </div>
        <div className="rounded-lg bg-white/75 p-1.5 text-slate-600 shadow-sm ring-1 ring-slate-200/50 [&>svg]:h-4 [&>svg]:w-4 sm:[&>svg]:h-[1.15rem] sm:[&>svg]:w-[1.15rem]">
          {icon}
        </div>
      </div>
    </div>
  );
}

function DetailModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        aria-label="Close"        
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-history-detail-title"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h3 id="status-history-detail-title" className="min-w-0 text-sm font-semibold text-slate-900">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

const CUSTOM_RANGE_MAX_DAYS = 366;

export function QueueSupervisorAgentStatusHistoryClient() {
  const searchParams = useSearchParams();
  const agentIdRaw = (searchParams.get("agentId") ?? "").trim();
  const agentIdNum = agentIdRaw ? Number(agentIdRaw) : NaN;
  const validAgent = Number.isFinite(agentIdNum) && agentIdNum > 0;

  const defaultCustomRange = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return { start: toYmdLocal(start), end: toYmdLocal(end) };
  }, []);

  const [periodState, setPeriodState] = useState<Period>("week");
  const [customStart, setCustomStart] = useState(defaultCustomRange.start);
  const [customEnd, setCustomEnd] = useState(defaultCustomRange.end);
  const [detail, setDetail] = useState<DetailModalState | null>(null);

  const customError = useMemo(() => {
    if (periodState !== "custom") return null;
    const a = parseYmd(customStart);
    const b = parseYmd(customEnd);
    if (!a || !b) return "Enter a valid start and end date.";
    if (a > b) return "End date must be on or after the start date.";
    const days = Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (days > CUSTOM_RANGE_MAX_DAYS) return `Range cannot exceed ${CUSTOM_RANGE_MAX_DAYS} days.`;
    return null;
  }, [periodState, customStart, customEnd]);

  const customValid = periodState !== "custom" || customError === null;

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("agentUserId", agentIdRaw);
    if (periodState === "custom") {
      p.set("period", "custom");
      p.set("startDate", customStart);
      p.set("endDate", customEnd);
    } else {
      p.set("period", periodState);
    }
    return p.toString();
  }, [agentIdRaw, periodState, customStart, customEnd]);

  const { data, isFetching, error } = useQuery<StatusHistoryResponse>({
    queryKey: ["agentStatusHistory", agentIdRaw, periodState, periodState === "custom" ? customStart : "", periodState === "custom" ? customEnd : ""],
    enabled: validAgent && (periodState !== "custom" || customValid),
    queryFn: async () => {
      const res = await fetch(`/api/agents/status-history?${queryParams}`, { credentials: "include" });
      const json = (await res.json()) as StatusHistoryResponse;
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load history");
      }
      return json;
    },
    staleTime: 60_000,
  });

  const historicPayload = data?.success ? data.data : undefined;

  /** API returns DESC for cap efficiency; supervisors read chronological lists. */
  const segments = useMemo(() => {
    if (!historicPayload?.segmentIntervals?.length) return [];
    return [...historicPayload.segmentIntervals].reverse();
  }, [historicPayload?.segmentIntervals]);

  const events = useMemo(() => {
    if (!historicPayload?.availabilityEvents?.length) return [];
    return [...historicPayload.availabilityEvents].reverse();
  }, [historicPayload?.availabilityEvents]);

  const segmentRowsForStatus = (status: string) =>
    segments.filter((s) => normStatus(s.status) === normStatus(status));

  const switchEventsForStatus = (status: string) =>
    events.filter((e) => normStatus(e.status) === normStatus(status));

  const logoutEventsForReason = (reasonKey: string) =>
    events.filter(
      (e) =>
        normStatus(e.status) === "offline" &&
        logoutReasonKeyFromEvent(e.reason) === reasonKey
    );

  if (!validAgent) {
    return (
      <div className="flex min-h-[min(420px,50vh)] flex-col items-center justify-center gap-3 bg-gradient-to-b from-slate-50 to-white p-4">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm leading-relaxed text-slate-600">
            Add <span className="font-mono text-xs">?agentId=…</span> to the URL or open{" "}
            <strong className="text-slate-800">Supervisor → Status history</strong> after selecting an agent on Updated
            agents.
          </p>
          <Link
            href={`${TICKETS_QUEUE_SUPERVISOR_PATH}?section=updated-agents`}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Updated agents
          </Link>
        </div>
      </div>
    );
  }

  const d = historicPayload;
  const errMsg = !data?.success && data && "error" in data ? String((data as { error?: string }).error) : null;

  const rangeChip = d ? formatRangeLabel(d.startDate, d.endDate) : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-gradient-to-b from-slate-50 via-white to-slate-50/80">
      {detail ? (
        <DetailModal
          title={
            detail.kind === "segments"
              ? `${statusLabel(detail.status)} — intervals`
              : detail.kind === "switches"
                ? `Switched to ${statusLabel(detail.status)}`
                : `Logout: ${detail.reasonKey}`
          }
          onClose={() => setDetail(null)}
        >
          {detail.kind === "segments" ? (
            segmentRowsForStatus(detail.status).length === 0 ? (
              <p className="text-sm text-slate-500">
                {d?.detailCaps?.segmentIntervalsTruncated
                  ? `Detail lists are capped at ${d.detailCaps.rowCap.toLocaleString()} rows; oldest intervals may be omitted. Narrow the date range.`
                  : "No intervals in this range."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full min-w-[320px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-semibold uppercase text-slate-600">
                      <th className="px-2 py-2">Start (IST)</th>
                      <th className="px-2 py-2">End (IST)</th>
                      <th className="px-2 py-2 text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {segmentRowsForStatus(detail.status).map((row, idx) => (
                      <tr key={`${row.startedAt}-${idx}`} className="bg-white">
                        <td className="whitespace-nowrap px-2 py-2 text-slate-800">{formatDtKolkata(row.startedAt)}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-slate-800">{formatDtKolkata(row.endedAt)}</td>
                        <td className="px-2 py-2 text-right font-medium tabular-nums text-slate-900">
                          {formatMinutes(row.durationMinutes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : detail.kind === "switches" ? (
            switchEventsForStatus(detail.status).length === 0 ? (
              <p className="text-sm text-slate-500">
                {d?.detailCaps?.availabilityEventsTruncated
                  ? `Detail lists are capped at ${d.detailCaps.rowCap.toLocaleString()} rows; oldest availability events may be omitted. Narrow the date range.`
                  : "No events in this range."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full min-w-[300px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-semibold uppercase text-slate-600">
                      <th className="px-2 py-2">When (IST)</th>
                      <th className="px-2 py-2">From</th>
                      <th className="px-2 py-2">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {switchEventsForStatus(detail.status).map((row, idx) => (
                      <tr key={`${row.changedAt}-${idx}`} className="bg-white">
                        <td className="whitespace-nowrap px-2 py-2 text-slate-800">{formatDtKolkata(row.changedAt)}</td>
                        <td className="px-2 py-2 text-slate-700">
                          {row.previousStatus ? statusLabel(row.previousStatus) : "—"}
                        </td>
                        <td className="max-w-[140px] truncate px-2 py-2 text-slate-600" title={row.reason ?? ""}>
                          {row.reason?.trim() ? row.reason : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : logoutEventsForReason(detail.reasonKey).length === 0 ? (
            <p className="text-sm text-slate-500">
              {d?.detailCaps?.availabilityEventsTruncated
                ? `Detail lists are capped at ${d.detailCaps.rowCap.toLocaleString()} rows; some offline events may be omitted. Narrow the date range.`
                : "No logout events in this range."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="w-full min-w-[280px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-semibold uppercase text-slate-600">
                    <th className="px-2 py-2">Logged offline (IST)</th>
                    <th className="px-2 py-2">Was</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logoutEventsForReason(detail.reasonKey).map((row, idx) => (
                    <tr key={`${row.changedAt}-${idx}`} className="bg-white">
                      <td className="whitespace-nowrap px-2 py-2 text-slate-800">{formatDtKolkata(row.changedAt)}</td>
                      <td className="px-2 py-2 text-slate-700">
                        {row.previousStatus ? statusLabel(row.previousStatus) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DetailModal>
      ) : null}

      <div className="w-full min-w-0 max-w-none flex-1 px-2 py-3 sm:px-4 lg:px-6">
        <div className="mb-3 flex flex-col gap-3 sm:mb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            {d ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                    <span className="text-slate-900">{d.agent.name}</span>
                  </p>
                  {rangeChip ? (
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm">
                      <Clock className="mr-1 h-3 w-3 text-slate-400" aria-hidden />
                      {rangeChip}
                    </span>
                  ) : null}
                </div>
                {d.agent.email ? (
                  <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{d.agent.email}</p>
                ) : null}
              </>
            ) : (
              rangeChip ? (
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm">
                  <Clock className="mr-1 h-3 w-3 text-slate-400" aria-hidden />
                  {rangeChip}
                </span>
              ) : null
            )}
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[280px]">
            <div className="flex flex-wrap gap-0.5 rounded-lg border border-slate-200/90 bg-white p-0.5 shadow-sm">
              {(
                [
                  ["today", "Today"],
                  ["week", "7 days"],
                  ["month", "30 days"],
                  ["custom", "Custom"],
                ] as const
              ).map(([p, label]) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriodState(p)}
                  className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold sm:text-xs ${
                    periodState === p
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {periodState === "custom" ? (
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">From</span>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">To</span>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </label>
                </div>
                {customError ? (
                  <p className="mt-1.5 text-[11px] font-medium text-red-600">{customError}</p>
                ) : (
                  <p className="mt-1.5 text-[10px] text-slate-400">Up to {CUSTOM_RANGE_MAX_DAYS} days.</p>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {error || errMsg ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 sm:text-sm">
            {errMsg || (error instanceof Error ? error.message : "Could not load history")}
          </div>
        ) : null}

        {d?.detailCaps &&
        (d.detailCaps.segmentIntervalsTruncated || d.detailCaps.availabilityEventsTruncated) ? (
          <div
            className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950 sm:text-xs"
            role="status"
          >
            {d.detailCaps.availabilityEventsTruncated ? (
              <span>
                Availability log: showing {d.detailCaps.availabilityEventsReturned.toLocaleString()} of{" "}
                {d.detailCaps.availabilityEventsTotal.toLocaleString()} events (max {d.detailCaps.rowCap.toLocaleString()}
                ).{" "}
              </span>
            ) : null}
            {d.detailCaps.segmentIntervalsTruncated ? (
              <span>
                Status intervals: showing {d.detailCaps.segmentIntervalsReturned.toLocaleString()} of{" "}
                {d.detailCaps.segmentIntervalsTotal.toLocaleString()} (max {d.detailCaps.rowCap.toLocaleString()}).{" "}
              </span>
            ) : null}
            Narrow the date range if drill-down rows look incomplete.
          </div>
        ) : null}

        {isFetching && !d ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : d ? (
          <>
            <section className="mb-4">
              <h2 className="sr-only">Summary</h2>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <RollupStat
                  label="Working"
                  value={formatMinutes(d.activityRollup.workingMinutes)}
                  icon={<Zap className="h-4 w-4" aria-hidden />}
                  accent="violet"
                />
                <RollupStat
                  label="Available"
                  value={formatMinutes(d.activityRollup.availableMinutes)}
                  icon={<Timer className="h-4 w-4" aria-hidden />}
                  accent="sky"
                />
                <RollupStat
                  label="Busy"
                  value={formatMinutes(d.activityRollup.busyMinutes)}
                  icon={<Briefcase className="h-4 w-4" aria-hidden />}
                  accent="amber"
                />
                <RollupStat
                  label="Break"
                  value={formatMinutes(d.activityRollup.breakMinutes)}
                  icon={<CalendarOff className="h-4 w-4" aria-hidden />}
                  accent="emerald"
                />
              </div>
            </section>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <DataPanel title="Time in each status" icon={<Clock className="h-3.5 w-3.5" />}>
                <DataTable
                  headers={["Status", "Times", "Total time"]}
                  rows={d.statusSegments.map((r) => ({
                    key: r.status,
                    cols: [statusLabel(r.status), r.segmentCount, formatMinutes(r.totalMinutes)],
                  }))}
                  onRowClick={(key) => setDetail({ kind: "segments", status: key })}
                />
              </DataPanel>

              <DataPanel title="Status switches" icon={<Zap className="h-3.5 w-3.5" />}>
                <DataTable
                  headers={["Switched to", "Times"]}
                  dense
                  rows={d.transitionsToStatus.map((r) => ({
                    key: r.status,
                    cols: [statusLabel(r.status), r.count],
                  }))}
                  onRowClick={(key) => setDetail({ kind: "switches", status: key })}
                />
              </DataPanel>

              <DataPanel className="xl:col-span-2" title="Logout reasons" icon={<LogOut className="h-3.5 w-3.5" />}>
                <DataTable
                  headers={["Reason", "Times"]}
                  dense
                  rows={d.logoutReasons.map((r) => ({
                    key: r.reason,
                    cols: [r.reason, r.count],
                  }))}
                  onRowClick={(key) => setDetail({ kind: "logout", reasonKey: key })}
                />
              </DataPanel>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
