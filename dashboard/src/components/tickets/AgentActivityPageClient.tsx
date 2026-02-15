"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, Ticket, TrendingUp, Star, AlertCircle, BarChart3 } from "lucide-react";

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

export function AgentActivityPageClient() {
  const [period, setPeriod] = useState<Period>("today");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

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

  const { data, isLoading, error } = useQuery<{
    success: boolean;
    data: {
      period: string;
      startDate: string;
      endDate: string;
      summary: ActivitySummary;
      profile: any;
      dailyBreakdown: any[];
      allAgents?: AgentActivityRow[];
    };
  }>({
    queryKey: ["agentActivity", period, startDate, endDate],
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
  });

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

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Failed to load activity data. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agent Activity & Performance</h1>
          <p className="text-sm text-gray-600 mt-1">Track your tickets, CSAT/DSAT, and online time</p>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Period:</span>
        </div>
        <div className="flex gap-2">
          {(["today", "week", "month", "custom"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex items-center gap-2 ml-4">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-300 rounded-md"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-300 rounded-md"
            />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Online Time */}
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">Online Time</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {formatMinutes(summary.onlineTimeMinutes)}
                  </p>
                </div>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </div>

            {/* Tickets Resolved */}
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">Tickets Resolved</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {summary.ticketsResolved}
                  </p>
                </div>
                <div className="p-2 bg-green-100 rounded-lg">
                  <Ticket className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </div>

            {/* CSAT Score */}
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">CSAT Score</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {summary.avgRating ? summary.avgRating.toFixed(1) : "N/A"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {summary.csatCount} ratings
                  </p>
                </div>
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Star className="h-5 w-5 text-yellow-600" />
                </div>
              </div>
            </div>

            {/* DSAT Count */}
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">DSAT Count</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {summary.dsatCount}
                  </p>
                </div>
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ticket Metrics */}
            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Ticket Metrics
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Assigned</span>
                  <span className="text-sm font-semibold text-gray-900">{summary.ticketsAssigned}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Resolved</span>
                  <span className="text-sm font-semibold text-green-600">{summary.ticketsResolved}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Closed</span>
                  <span className="text-sm font-semibold text-gray-900">{summary.ticketsClosed}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Updated</span>
                  <span className="text-sm font-semibold text-gray-900">{summary.ticketsUpdated}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Reopened</span>
                  <span className="text-sm font-semibold text-orange-600">{summary.ticketsReopened}</span>
                </div>
              </div>
            </div>

            {/* Time Metrics */}
            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Time Metrics
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Online Time</span>
                  <span className="text-sm font-semibold text-blue-600">
                    {formatMinutes(summary.onlineTimeMinutes)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Break Time</span>
                  <span className="text-sm font-semibold text-yellow-600">
                    {formatMinutes(summary.breakTimeMinutes)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Active Time</span>
                  <span className="text-sm font-semibold text-green-600">
                    {formatMinutes(summary.activeTimeMinutes)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                  <span className="text-sm font-medium text-gray-700">Total Work Time</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatMinutes(summary.onlineTimeMinutes - summary.breakTimeMinutes)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* All agents activity table */}
          {data?.data?.allAgents && data.data.allAgents.length > 0 && (
            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">All Agents Activity</h2>
              <p className="text-sm text-gray-600 mb-4">Activity for the selected period across all agents.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-gray-600 font-medium">Agent</th>
                      <th className="text-left py-2 px-3 text-gray-600 font-medium">Email</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-medium">Online</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-medium">Break</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-medium">Assigned</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-medium">Resolved</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-medium">Closed</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-medium">Updated</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-medium">Reopened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.allAgents.map((agent) => (
                      <tr key={agent.userId} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="py-2 px-3 text-gray-900 font-medium">{agent.name}</td>
                        <td className="py-2 px-3 text-gray-600">{agent.email}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{formatMinutes(agent.onlineTimeMinutes)}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{formatMinutes(agent.breakTimeMinutes)}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{agent.ticketsAssigned}</td>
                        <td className="py-2 px-3 text-right text-green-600 font-medium">{agent.ticketsResolved}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{agent.ticketsClosed}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{agent.ticketsUpdated}</td>
                        <td className="py-2 px-3 text-right text-orange-600">{agent.ticketsReopened}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Daily Breakdown Table */}
          {data?.data?.dailyBreakdown && data.data.dailyBreakdown.length > 0 && (
            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Breakdown</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-gray-600 font-medium">Date</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-medium">Online</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-medium">Break</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-medium">Resolved</th>
                      <th className="text-right py-2 px-3 text-gray-600 font-medium">CSAT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.dailyBreakdown.map((day: any, idx: number) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-2 px-3 text-gray-900">
                          {new Date(day.activity_date).toLocaleDateString()}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-700">
                          {formatMinutes(day.online_time_minutes || 0)}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-700">
                          {formatMinutes(day.break_time_minutes || 0)}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-700">
                          {day.tickets_resolved || 0}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-700">
                          {day.csat_score ? day.csat_score.toFixed(1) : "N/A"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
