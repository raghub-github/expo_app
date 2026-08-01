"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import {
  ticketsNumFont as analyticsNumFont,
  ticketsTextFont as analyticsTextFont,
} from "@/lib/fonts/tickets-fonts";
import { formatAnalyticsDuration } from "@/lib/analytics/format-duration";
import type { AnalyticsCategory } from "@/lib/analytics/analytics-scope";

type DayRow = {
  day: string;
  workSeconds: number;
  loginCount: number;
  logoutCount: number;
  ticketsWorked: number;
  ticketsResolved: number;
  ticketsAssigned: number;
  ordersWorked: number;
};

type FocusSection = "sessions" | "tickets" | "orders";
type RangePreset = "today" | "7d" | "15d" | "30d" | "3m" | "6m" | "1y" | "custom";

function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { start: toInputDate(start), end: toInputDate(end) };
}

function rangeForPreset(preset: Exclude<RangePreset, "custom">): {
  start: string;
  end: string;
} {
  const end = new Date();
  const start = new Date();
  if (preset === "7d") start.setDate(start.getDate() - 6);
  if (preset === "15d") start.setDate(start.getDate() - 14);
  if (preset === "30d") start.setDate(start.getDate() - 29);
  if (preset === "3m") start.setMonth(start.getMonth() - 3);
  if (preset === "6m") start.setMonth(start.getMonth() - 6);
  if (preset === "1y") start.setFullYear(start.getFullYear() - 1);
  return { start: toInputDate(start), end: toInputDate(end) };
}

function formatDayLabel(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function heatClass(value: number) {
  if (value <= 0) return "bg-rose-50 text-rose-700";
  return "bg-emerald-50 text-emerald-800";
}

export function AnalyticsAgentDetailClient({
  category,
  agentId,
}: {
  category: AnalyticsCategory;
  agentId: number;
}) {
  const router = useRouter();
  const defaults = useMemo(() => defaultRange(), []);
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [appliedStart, setAppliedStart] = useState(defaults.start);
  const [appliedEnd, setAppliedEnd] = useState(defaults.end);
  const [rangePreset, setRangePreset] = useState<RangePreset>("30d");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const customStartRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["analytics", "agent", agentId, appliedStart, appliedEnd],
    queryFn: async () => {
      const qs = new URLSearchParams({
        period: "custom",
        startDate: appliedStart,
        endDate: appliedEnd,
      });
      const res = await fetch(`/api/analytics/agents/${agentId}?${qs}`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        data?: {
          agent: {
            userId: number;
            systemUserId: string;
            fullName: string;
            email: string;
            primaryRole: string;
          };
          summary: {
            workSeconds: number;
            loginCount: number;
            logoutCount: number;
            ticketsWorked: number;
            ticketsResolved: number;
            ordersWorked: number;
          };
          days: DayRow[];
        };
      };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || "Failed to load agent analytics");
      }
      return json.data;
    },
    staleTime: 60_000,
  });

  const days = data?.days ?? [];
  const totalPages = Math.max(1, Math.ceil(days.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = days.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    if (rangePreset !== "custom") return;
    const frame = requestAnimationFrame(() => {
      try {
        customStartRef.current?.showPicker();
      } catch {
        customStartRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [rangePreset]);

  const applyRange = () => {
    if (!startDate || !endDate) return;
    if (startDate > endDate) {
      setPage(1);
      setAppliedStart(endDate);
      setAppliedEnd(startDate);
      setStartDate(endDate);
      setEndDate(startDate);
      return;
    }
    setPage(1);
    setAppliedStart(startDate);
    setAppliedEnd(endDate);
  };

  const applyPreset = (preset: RangePreset) => {
    setRangePreset(preset);
    if (preset === "custom") return;
    const next = rangeForPreset(preset);
    setPage(1);
    setStartDate(next.start);
    setEndDate(next.end);
    setAppliedStart(next.start);
    setAppliedEnd(next.end);
  };

  const openDayAudit = (day: string, focus: FocusSection) => {
    router.push(`/dashboard/analytics/${category}/${agentId}/${day}/${focus}`);
  };

  return (
    <div className={`${analyticsTextFont.className} min-w-0 bg-[#f4f7fb] p-4 sm:p-6`}>
      {isLoading && <div className="h-64 animate-pulse rounded-2xl bg-white" />}

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : "Failed to load"}
          <button type="button" onClick={() => void refetch()} className="ml-3 underline">
            Retry
          </button>
        </div>
      )}

      {data && (
        <>
          <div className="mb-4 overflow-x-auto">
            <div className="flex min-w-max items-end justify-between gap-6">
              <div>
                <h1 className="text-2xl font-semibold uppercase text-slate-900">{data.agent.fullName}</h1>
                <p className={`${analyticsNumFont.className} mt-1 whitespace-nowrap text-sm text-slate-500`}>
                  {data.agent.primaryRole} · {data.agent.systemUserId} · {data.agent.email}
                </p>
                <p className="mt-2 whitespace-nowrap text-xs italic text-slate-400">
                  Includes day-wise login time, ticket work, order-page work, and logout counts for strategic planning.
                </p>
              </div>

              <div className="flex shrink-0 items-end gap-2">
                <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Date range
                  <select
                    value={rangePreset}
                    onChange={(e) => applyPreset(e.target.value as RangePreset)}
                    className={`${analyticsNumFont.className} cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-center text-sm text-slate-800 outline-none`}
                  >
                    <option value="today">Today</option>
                    <option value="7d">7 days</option>
                    <option value="15d">15 days</option>
                    <option value="30d">30 days</option>
                    <option value="3m">3 months</option>
                    <option value="6m">6 months</option>
                    <option value="1y">1 year</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>

                {rangePreset === "custom" && (
                  <>
                    <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      From
                      <input
                        ref={customStartRef}
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className={`${analyticsNumFont.className} cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none`}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      To
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className={`${analyticsNumFont.className} cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none`}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={applyRange}
                      className="cursor-pointer rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Apply
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mb-4 overflow-x-auto">
            <div className="grid min-w-[780px] grid-cols-5 gap-3">
              <Stat label="Work time" value={formatAnalyticsDuration(data.summary.workSeconds)} />
              <Stat label="Logins" value={String(data.summary.loginCount)} />
              <Stat label="Logouts" value={String(data.summary.logoutCount)} />
              <Stat
                label="Tickets worked"
                value={`${data.summary.ticketsWorked} (${data.summary.ticketsResolved} resolved)`}
              />
              <Stat label="Orders worked" value={String(data.summary.ordersWorked)} />
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full border-collapse whitespace-nowrap text-sm">
              <thead>
                <tr className="bg-[#e8eef8] text-left text-xs uppercase tracking-wide text-slate-600">
                  <th className="border border-slate-200 px-3 py-2.5">S.No</th>
                  <th className="border border-slate-200 px-3 py-2.5">Day</th>
                  <th className="border border-slate-200 px-3 py-2.5" colSpan={3}>
                    Performance metrics
                  </th>
                </tr>
                <tr className="bg-[#f3f6fb] text-left text-[11px] text-slate-500">
                  <th className="border border-slate-200 px-3 py-2" />
                  <th className="border border-slate-200 px-3 py-2" />
                  <th className="border border-slate-200 px-3 py-2">Login duration</th>
                  <th className="border border-slate-200 px-3 py-2">Tickets worked</th>
                  <th className="border border-slate-200 px-3 py-2">Orders worked</th>
                </tr>
              </thead>
              <tbody className={analyticsNumFont.className}>
                {pageRows.map((row, index) => (
                  <tr key={row.day} className="hover:bg-slate-50">
                    <td className="border border-slate-200 px-3 py-2 text-slate-600">
                      {(safePage - 1) * pageSize + index + 1}
                    </td>
                    <td className="border border-slate-200 px-3 py-2 font-medium text-slate-800">
                      {formatDayLabel(row.day)}
                      <span className="ml-2 text-[10px] text-slate-400">
                        {row.loginCount} login · {row.logoutCount} logout
                      </span>
                    </td>
                    <td className={`border border-slate-200 px-1 py-1 ${heatClass(row.workSeconds)}`}>
                      <button
                        type="button"
                        onClick={() => openDayAudit(row.day, "sessions")}
                        className="w-full cursor-pointer px-2 py-1.5 text-left outline-none"
                        title="Open day audit — sessions"
                      >
                        {formatAnalyticsDuration(row.workSeconds)}
                      </button>
                    </td>
                    <td className={`border border-slate-200 px-1 py-1 ${heatClass(row.ticketsWorked)}`}>
                      <button
                        type="button"
                        onClick={() => openDayAudit(row.day, "tickets")}
                        className="w-full cursor-pointer px-2 py-1.5 text-left outline-none"
                        title="Open day audit — tickets"
                      >
                        {row.ticketsWorked}
                        <span className="ml-1 text-[10px] text-slate-500">
                          ({row.ticketsResolved} resolved)
                        </span>
                      </button>
                    </td>
                    <td className={`border border-slate-200 px-1 py-1 ${heatClass(row.ordersWorked)}`}>
                      <button
                        type="button"
                        onClick={() => openDayAudit(row.day, "orders")}
                        className="w-full cursor-pointer px-2 py-1.5 text-left outline-none"
                        title="Open day audit — orders"
                      >
                        {row.ordersWorked}
                      </button>
                    </td>
                  </tr>
                ))}
                {days.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                      No day-wise activity in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {days.length > 0 && (
            <div className="mt-3 flex items-center justify-end gap-5 whitespace-nowrap text-sm text-slate-600">
              <label className="flex items-center gap-2">
                Show rows:
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className={`${analyticsNumFont.className} cursor-pointer appearance-none border-0 border-b border-slate-200 bg-transparent px-2 py-1 text-center outline-none`}
                >
                  {[5, 10, 15, 30, 50].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <p className={analyticsNumFont.className}>
                {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, days.length)} of{" "}
                {days.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="First page"
                  disabled={safePage <= 1}
                  onClick={() => setPage(1)}
                  className="cursor-pointer p-1.5 disabled:cursor-default disabled:opacity-35"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="cursor-pointer p-1.5 disabled:cursor-default disabled:opacity-35"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="cursor-pointer p-1.5 disabled:cursor-default disabled:opacity-35"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Last page"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(totalPages)}
                  className="cursor-pointer p-1.5 disabled:cursor-default disabled:opacity-35"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 whitespace-nowrap">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`${analyticsNumFont.className} mt-1 text-base font-semibold text-slate-800`}>
        {value}
      </p>
    </div>
  );
}
