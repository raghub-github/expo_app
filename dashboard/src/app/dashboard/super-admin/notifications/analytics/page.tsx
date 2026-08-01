"use client";

import useSWR from "swr";
import Link from "next/link";
import { Bell, TrendingUp, Send, CheckCircle2, MousePointerClick, AlertCircle, FileText, Megaphone } from "lucide-react";

type AnalyticsSummary = {
  today: {
    total: number;
    sent: number;
    delivered: number;
    clicked: number;
    failed: number;
    read_rate: number;
    ctr: number;
  };
  top_templates_7d: Array<{ template_code: string; n: string | number }>;
  top_campaigns_30d: Array<{ id: number; name: string; clicked_count: number; sent_count: number }>;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AnalyticsPage() {
  const { data, isLoading } = useSWR<AnalyticsSummary>(
    "/api/super-admin/notifications/analytics/summary",
    fetcher,
    { refreshInterval: 30_000 },
  );

  const today = data?.today ?? { total: 0, sent: 0, delivered: 0, clicked: 0, failed: 0, read_rate: 0, ctr: 0 };
  const topTemplates = data?.top_templates_7d ?? [];
  const topCampaigns = data?.top_campaigns_30d ?? [];

  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-slate-50 px-3 pb-3 pt-1 sm:px-5 sm:pt-2 xl:px-6">
      <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-7xl flex-col">
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-slate-500">
            Today's delivery snapshot plus the templates and campaigns doing the heavy lifting.
            Auto-refreshes every 30 seconds.
          </p>
        </div>

        {/* Today's counts */}
        <div className="mt-3 shrink-0">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <TrendingUp className="h-3.5 w-3.5" /> Today (midnight → now)
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard Icon={Bell}                label="Total"      value={today.total}     accent="text-slate-900" />
            <StatCard Icon={Send}                label="Sent"       value={today.sent}      accent="text-slate-900" />
            <StatCard Icon={CheckCircle2}        label="Delivered"  value={today.delivered} accent="text-teal-700"  sub={today.sent > 0 ? `${pct(today.read_rate)} of sent` : undefined} />
            <StatCard Icon={MousePointerClick}   label="Clicked"    value={today.clicked}   accent="text-amber-700" sub={today.sent > 0 ? `CTR ${pct(today.ctr)}` : undefined} />
            <StatCard Icon={AlertCircle}         label="Failed"     value={today.failed}    accent="text-rose-600" />
          </div>
        </div>

        {/* Top templates + campaigns */}
        <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto lg:grid-cols-2">
          {/* Templates */}
          <div className="min-h-0 overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-teal-700" />
              <div className="font-semibold text-slate-900">Top templates · last 7 days</div>
            </div>
            {isLoading ? (
              <div className="py-6 text-center text-sm text-slate-500">Loading…</div>
            ) : topTemplates.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">No data yet.</div>
            ) : (
              <TopBarList
                items={topTemplates.map((t) => ({
                  key: t.template_code,
                  primary: t.template_code,
                  value: Number(t.n ?? 0),
                }))}
                mono
              />
            )}
          </div>

          {/* Campaigns */}
          <div className="min-h-0 overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-teal-700" />
              <div className="font-semibold text-slate-900">Top campaigns · last 30 days</div>
              <Link
                href="/dashboard/super-admin/notifications/campaigns"
                className="ml-auto text-[11px] text-teal-700 underline hover:text-teal-800"
              >
                View all
              </Link>
            </div>
            {isLoading ? (
              <div className="py-6 text-center text-sm text-slate-500">Loading…</div>
            ) : topCampaigns.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">No campaigns in the last 30 days.</div>
            ) : (
              <TopBarList
                items={topCampaigns.map((c) => ({
                  key: String(c.id),
                  primary: c.name,
                  value: c.clicked_count,
                  sub: `${c.clicked_count.toLocaleString()} clicks · ${c.sent_count.toLocaleString()} sent`,
                }))}
              />
            )}
          </div>
        </div>

        <p className="mt-2 shrink-0 text-xs text-slate-500">
          Per-day breakdowns and click-through funnels will land alongside the log aggregation view.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  Icon,
  label,
  value,
  accent,
  sub,
}: {
  Icon: typeof Bell;
  label: string;
  value: number;
  accent: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          <div className={"mt-1 text-2xl font-semibold tabular-nums " + accent}>{value.toLocaleString()}</div>
        </div>
        <div className="rounded-md bg-slate-50 p-1.5">
          <Icon className="h-4 w-4 text-slate-500" />
        </div>
      </div>
      {sub ? <div className="mt-1 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function TopBarList({
  items,
  mono,
}: {
  items: Array<{ key: string; primary: string; value: number; sub?: string }>;
  mono?: boolean;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2.5">
      {items.map((i) => {
        const pct = Math.max(3, Math.round((i.value / max) * 100));
        return (
          <div key={i.key}>
            <div className="flex items-center justify-between text-xs">
              <div className={"truncate " + (mono ? "font-mono text-slate-800" : "text-slate-800")}>{i.primary}</div>
              <div className="text-slate-600 tabular-nums">{i.value.toLocaleString()}</div>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-teal-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {i.sub ? <div className="mt-0.5 text-[10px] text-slate-500">{i.sub}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
