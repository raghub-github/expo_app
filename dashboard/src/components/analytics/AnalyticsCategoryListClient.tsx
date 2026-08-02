"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import {
  ticketsNumFont as analyticsNumFont,
  ticketsTextFont as analyticsTextFont,
} from "@/lib/fonts/tickets-fonts";
import type { AnalyticsCategory } from "@/lib/analytics/analytics-scope";
import { formatAnalyticsDuration } from "@/lib/analytics/format-duration";

type AgentRow = {
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

function initial(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "A";
}

function subtitleFor(category: AnalyticsCategory, agent: AgentRow) {
  if (category === "tickets") {
    return `${agent.ticketsWorked} tickets · ${agent.ticketsResolved} resolved`;
  }
  if (category === "orders") {
    return `${agent.ordersWorked} orders worked`;
  }
  if (category === "sessions") {
    return `${agent.loginCount} logins · ${agent.logoutCount} logouts · ${formatAnalyticsDuration(agent.workSeconds)}`;
  }
  return `# ${agent.systemUserId}`;
}

export function AnalyticsCategoryListClient({ category }: { category: AnalyticsCategory }) {
  const [q, setQ] = useState("");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["analytics", "agents", category, "month"],
    queryFn: async () => {
      const res = await fetch(
        `/api/analytics/agents?category=${category}&period=month`,
        { credentials: "include" }
      );
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        data?: { agents: AgentRow[]; count: number; scope: string };
      };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || "Failed to load agents");
      }
      return json.data;
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const agents = data?.agents ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return agents;
    return agents.filter(
      (a) =>
        a.fullName.toLowerCase().includes(needle) ||
        a.email.toLowerCase().includes(needle) ||
        a.systemUserId.toLowerCase().includes(needle)
    );
  }, [data?.agents, q]);

  return (
    <div className={`${analyticsTextFont.className} min-w-0 bg-[#f4f7fb] p-4 sm:p-6`}>
      <div className="mb-4 flex justify-end">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none ring-blue-200 focus:ring-2"
          />
        </div>
      </div>

      {isLoading && (
        <div className="grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-white" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : "Failed to load"}
          <button type="button" onClick={() => void refetch()} className="ml-3 underline">
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((agent) => (
            <Link
              key={agent.userId}
              href={`/dashboard/analytics/${category}/${agent.userId}`}
              className="flex items-center gap-3 rounded-xl bg-white px-4 py-4 shadow-[0_1px_8px_rgba(15,23,42,0.04)] transition hover:bg-blue-50/60"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#e8f0ff] text-sm font-semibold text-[#2f6fed]">
                {initial(agent.fullName)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold uppercase text-slate-900">
                  {agent.fullName}
                </p>
                <p className={`${analyticsNumFont.className} mt-0.5 truncate text-xs text-slate-500`}>
                  {subtitleFor(category, agent)}
                </p>
              </div>
            </Link>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-slate-500">
              No agents found for this view.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
