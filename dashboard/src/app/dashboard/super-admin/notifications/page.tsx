"use client";

import useSWR from "swr";
import { ArrowUpRight, Bell, CheckCircle2, Eye, MousePointerClick, XCircle } from "lucide-react";

type Summary = {
  today: {
    total: number;
    sent: number;
    delivered: number;
    clicked: number;
    failed: number;
    read_rate: number;
    ctr: number;
  };
  top_templates_7d: Array<{ template_code: string; n: string }>;
  top_campaigns_30d: Array<{ id: number; name: string; clicked_count: number; sent_count: number }>;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function Stat({
  Icon,
  label,
  value,
  hint,
  accent,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  hint?: string;
  accent: "teal" | "indigo" | "amber" | "rose" | "slate";
}) {
  const accents: Record<string, string> = {
    teal: "bg-teal-50 text-teal-700",
    indigo: "bg-indigo-50 text-indigo-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className={"grid h-9 w-9 place-items-center rounded-lg " + accents[accent]}>
          <Icon className="h-4 w-4" />
        </div>
        <ArrowUpRight className="h-4 w-4 text-slate-300" />
      </div>
      <div className="mt-3 text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div> : null}
    </div>
  );
}

export default function NotificationsDashboardPage() {
  const { data, isLoading, error } = useSWR<Summary>(
    "/api/super-admin/notifications/analytics/summary",
    fetcher,
    { refreshInterval: 30_000 },
  );

  const t = data?.today;
  const pct = (n: number) => (Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—");

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-slate-50 px-3 pb-3 pt-1 sm:px-5 sm:pt-2 xl:px-6">
      <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-7xl flex-col">
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-slate-500">Today's notification activity across customers, merchants and riders.</p>
        </div>

        {error ? (
          <div className="mt-3 shrink-0 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
            Could not load summary. Check that the backend route is reachable.
          </div>
        ) : null}

        <div className="mt-3 grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat Icon={Bell} accent="slate" label="Total today" value={isLoading ? "…" : (t?.total ?? 0).toLocaleString()} />
          <Stat Icon={CheckCircle2} accent="teal" label="Sent" value={isLoading ? "…" : (t?.sent ?? 0).toLocaleString()} />
          <Stat Icon={Eye} accent="indigo" label="Delivered" value={isLoading ? "…" : (t?.delivered ?? 0).toLocaleString()} hint={`Read rate ${pct(t?.read_rate ?? 0)}`} />
          <Stat Icon={MousePointerClick} accent="amber" label="Clicked" value={isLoading ? "…" : (t?.clicked ?? 0).toLocaleString()} hint={`CTR ${pct(t?.ctr ?? 0)}`} />
          <Stat Icon={XCircle} accent="rose" label="Failed" value={isLoading ? "…" : (t?.failed ?? 0).toLocaleString()} />
        </div>

        <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto lg:grid-cols-2">
          <div className="min-h-0 overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Top templates · last 7 days</h2>
            </div>
            {data?.top_templates_7d && data.top_templates_7d.length > 0 ? (
              <ul className="space-y-2">
                {data.top_templates_7d.map((r) => (
                  <li key={r.template_code} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm transition hover:bg-teal-50/40">
                    <span className="font-mono text-slate-800">{r.template_code}</span>
                    <span className="tabular-nums text-slate-500">{Number(r.n).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">{isLoading ? "Loading…" : "No data yet."}</p>
            )}
          </div>

          <div className="min-h-0 overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Top campaigns · last 30 days</h2>
            </div>
            {data?.top_campaigns_30d && data.top_campaigns_30d.length > 0 ? (
              <ul className="space-y-2">
                {data.top_campaigns_30d.map((c) => (
                  <li key={c.id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm transition hover:bg-teal-50/40">
                    <span className="text-slate-800">{c.name}</span>
                    <span className="tabular-nums text-slate-500">
                      {c.clicked_count.toLocaleString()} / {c.sent_count.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">{isLoading ? "Loading…" : "No data yet."}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
