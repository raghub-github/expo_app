"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Star, AlertCircle, BarChart3, Ticket } from "lucide-react";

type Period = "today" | "week" | "month" | "custom";

interface DailyRow {
  activity_date: string;
  tickets_resolved?: number | null;
  tickets_closed?: number | null;
  csat_score?: number | null;
  csat_count?: number | null;
  dsat_count?: number | null;
}

interface PeriodSummary {
  ticketsResolved: number;
  ticketsClosed: number;
  csatCount: number;
  dsatCount: number;
  avgRating: number | null;
}

export function CsatDetailsPageClient() {
  const [period, setPeriod] = useState<Period>("month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data, isLoading, error } = useQuery<{
    success: boolean;
    data: {
      dailyBreakdown: DailyRow[];
      summary: PeriodSummary;
    };
  }>({
    queryKey: ["agentActivity", "csat-details", period, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("period", period);
      if (period === "custom" && startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      }
      const res = await fetch(`/api/agents/activity?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load C&D-SAT breakdown");
      return res.json();
    },
  });

  const summary: PeriodSummary = data?.data?.summary ?? {
    ticketsResolved: 0,
    ticketsClosed: 0,
    csatCount: 0,
    dsatCount: 0,
    avgRating: null,
  };

  const rows = (data?.data?.dailyBreakdown ?? []) as DailyRow[];

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-800">
            Could not load daily breakdown. You may not have ticket permissions, or try again later.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Match AgentActivityPageClient: title block */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Daily breakdown</h2>
          <p className="mt-1 text-sm text-gray-600">
            Per-day scores and ticket counts from your activity log.
          </p>
        </div>
      </div>

      {/* Period selector — same pattern as AgentActivityPageClient */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Period:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["today", "week", "month", "custom"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="ml-0 flex flex-wrap items-center gap-2 sm:ml-4">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs"
            />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {/* Summary cards — aligned with Agent activity top grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">Average rating</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">
                    {summary.avgRating != null ? summary.avgRating.toFixed(1) : "N/A"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">Period (ticket ratings)</p>
                </div>
                <div className="rounded-lg bg-yellow-100 p-2">
                  <Star className="h-5 w-5 text-yellow-600" />
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">CSAT (4–5★)</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{summary.csatCount}</p>
                  <p className="mt-1 text-xs text-gray-500">Positive ratings</p>
                </div>
                <div className="rounded-lg bg-green-100 p-2">
                  <BarChart3 className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">DSAT (1–2★)</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{summary.dsatCount}</p>
                  <p className="mt-1 text-xs text-gray-500">Needs attention</p>
                </div>
                <div className="rounded-lg bg-red-100 p-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">Tickets resolved / closed</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">
                    {summary.ticketsResolved + summary.ticketsClosed}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {summary.ticketsResolved} resolved · {summary.ticketsClosed} closed
                  </p>
                </div>
                <div className="rounded-lg bg-green-100 p-2">
                  <Ticket className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Two columns — mirror Ticket metrics / Time metrics style */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <BarChart3 className="h-5 w-5" />
                C&D-SAT (period totals)
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Average rating</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {summary.avgRating != null ? summary.avgRating.toFixed(1) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">CSAT count</span>
                  <span className="text-sm font-semibold text-green-600">{summary.csatCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">DSAT count</span>
                  <span className="text-sm font-semibold text-red-600">{summary.dsatCount}</span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 pt-2">
                  <span className="text-sm font-medium text-gray-700">CSAT + DSAT tallies</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {summary.csatCount + summary.dsatCount}
                  </span>
                </div>
                <p className="text-xs text-gray-500">Sum of high / low buckets only (neutral 3★ not included).</p>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Ticket className="h-5 w-5" />
                Ticket outcomes
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Resolved</span>
                  <span className="text-sm font-semibold text-green-600">{summary.ticketsResolved}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Closed</span>
                  <span className="text-sm font-semibold text-gray-900">{summary.ticketsClosed}</span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 pt-2">
                  <span className="text-sm font-medium text-gray-700">Resolved + closed</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {summary.ticketsResolved + summary.ticketsClosed}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Daily table — same shell as Agent activity Daily Breakdown */}
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Daily Breakdown</h3>
            {rows.length === 0 ? (
              <p className="text-center text-sm text-gray-600">
                No activity log rows in this period. Daily scores appear when agent activity is recorded for those dates.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Date</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Resolved</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Closed</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Avg score</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">CSAT (4–5★)</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">DSAT (1–2★)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((day) => (
                      <tr key={day.activity_date} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="px-3 py-2 text-gray-900">
                          {new Date(day.activity_date).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">{day.tickets_resolved ?? 0}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{day.tickets_closed ?? 0}</td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {day.csat_score != null ? Number(day.csat_score).toFixed(1) : "N/A"}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-green-700">{day.csat_count ?? 0}</td>
                        <td className="px-3 py-2 text-right font-medium text-red-700">{day.dsat_count ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
              Daily columns come from agent activity logs. Period summary totals may aggregate ticket-level ratings slightly
              differently; use this table for per-day trends.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
