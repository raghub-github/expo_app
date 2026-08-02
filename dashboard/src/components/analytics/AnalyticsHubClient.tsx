"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  Headphones,
  LogIn,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  ticketsNumFont as analyticsNumFont,
  ticketsTextFont as analyticsTextFont,
} from "@/lib/fonts/tickets-fonts";
import type { AnalyticsCategory } from "@/lib/analytics/analytics-scope";

type HubResponse = {
  success: boolean;
  error?: string;
  data?: {
    scope: "OWN" | "OVERALL";
    period: string;
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
  };
};

const ICONS: Record<AnalyticsCategory, LucideIcon> = {
  agents: Users,
  tickets: Headphones,
  orders: ClipboardList,
  sessions: LogIn,
};

async function fetchHub(): Promise<HubResponse["data"]> {
  const res = await fetch("/api/analytics/hub?period=month", { credentials: "include" });
  const json = (await res.json()) as HubResponse;
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Failed to load analytics");
  }
  return json.data;
}

export function AnalyticsHubClient() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["analytics", "hub", "month"],
    queryFn: fetchHub,
    staleTime: 60_000,
  });

  return (
    <div className={`${analyticsTextFont.className} min-w-0 bg-[#f4f7fb] p-3 sm:p-4`}>
      {data && (
        <div className="mb-3 flex justify-end">
          <span className="inline-flex w-fit rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
            {data.scope === "OVERALL" ? "Overall user record" : "Own record"}
          </span>
        </div>
      )}

      {isLoading && (
        <div className="grid animate-pulse gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-white" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
          <p>{error instanceof Error ? error.message : "Failed to load"}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white"
          >
            Try again
          </button>
        </div>
      )}

      {data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.categories.map((cat) => {
            const Icon = ICONS[cat.key];
            return (
              <Link
                key={cat.key}
                href={`/dashboard/analytics/${cat.key}`}
                className="group flex min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-4 shadow-[0_2px_12px_rgba(15,23,42,0.04)] transition hover:border-blue-300 hover:shadow-[0_8px_24px_rgba(37,99,235,0.08)]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e8f0ff] text-[#2f6fed] transition group-hover:bg-[#2f6fed] group-hover:text-white">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-slate-900">{cat.label}</p>
                  <p className={`${analyticsNumFont.className} mt-0.5 text-xs text-slate-500`}>
                    {cat.count.toLocaleString("en-IN")} {cat.unit}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-400">{cat.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
