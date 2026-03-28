"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Star, AlertCircle, BarChart3, ArrowRight } from "lucide-react";

type Period = "today" | "week" | "month" | "custom";

interface ActivitySummary {
  csatCount: number;
  dsatCount: number;
  avgRating: number | null;
  ticketsResolved: number;
  ticketsClosed: number;
}

export function CsatPageClient() {
  const [period, setPeriod] = useState<Period>("month");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data, isLoading, error } = useQuery<{
    success: boolean;
    data: {
      period: string;
      startDate: string;
      endDate: string;
      summary: ActivitySummary;
    };
  }>({
    queryKey: ["agentActivity", "csat", period, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("period", period);
      if (period === "custom" && startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      }
      const res = await fetch(`/api/agents/activity?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load C&D-SAT data");
      return res.json();
    },
  });

  const summary = data?.data?.summary ?? {
    csatCount: 0,
    dsatCount: 0,
    avgRating: null,
    ticketsResolved: 0,
    ticketsClosed: 0,
  };

  const resolvedOrClosed = summary.ticketsResolved + summary.ticketsClosed;

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-800">
            Could not load {"C&D-SAT"} data. You may not have ticket permissions, or try again later.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
          <p className="mt-1 text-sm text-gray-600">
            Period summary for ratings on tickets you resolved or closed.
          </p>
        </div>
      </div>

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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">Average rating</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">
                    {summary.avgRating != null ? summary.avgRating.toFixed(1) : "N/A"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">Across rated tickets in range</p>
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
          </div>

          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 p-4 text-sm text-gray-600">
            <p>
              Context: <span className="font-medium text-gray-800">{resolvedOrClosed}</span> tickets resolved or closed for you in this window
              (combined view; ratings only appear when customers submit feedback).
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">View per-day breakdown and ticket outcomes.</p>
            <Link
              href="/dashboard/tickets/csat/details"
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              C&D-SAT — Daily breakdown
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
