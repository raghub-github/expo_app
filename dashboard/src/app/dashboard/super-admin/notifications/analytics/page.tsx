"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function AnalyticsPage() {
  const { data } = useSWR("/api/super-admin/notifications/analytics/summary", fetcher, { refreshInterval: 30_000 });
  return (
    <div className="p-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-teal-700">Notifications</div>
      <h1 className="text-2xl font-semibold text-slate-900">Analytics</h1>
      <p className="mt-1 text-sm text-slate-500">Today's counts + top templates + top campaigns. Auto-refreshes every 30 s.</p>
      <pre className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-700">{JSON.stringify(data, null, 2)}</pre>
      <p className="mt-3 text-xs text-slate-500">Detailed per-day / per-city / per-platform charts arrive in Phase 7 (needs the fingerprint-safe log aggregation view).</p>
    </div>
  );
}
