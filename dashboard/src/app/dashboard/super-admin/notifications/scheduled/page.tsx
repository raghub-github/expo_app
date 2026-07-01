"use client";

import useSWR from "swr";
import Link from "next/link";

type Campaign = { id: number; name: string; template_code: string | null; scheduled_at: string | null; status: string; sent_count: number; created_by: string | null };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ScheduledPage() {
  const { data, mutate, isLoading } = useSWR<{ items: Campaign[] }>(
    "/api/super-admin/notifications/campaigns?status=scheduled&limit=100",
    fetcher,
    { refreshInterval: 15_000 },
  );
  return (
    <div className="p-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-teal-700">Notifications</div>
      <h1 className="text-2xl font-semibold text-slate-900">Scheduled</h1>
      <p className="mt-1 text-sm text-slate-500">Campaigns waiting to fire. The backend poller sweeps every 30 s.</p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Template</th>
              <th className="px-4 py-2">Scheduled for</th>
              <th className="px-4 py-2">Created by</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
            ) : !data?.items?.length ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                No scheduled sends. Create one on the <Link href="/dashboard/super-admin/notifications/campaigns" className="text-teal-700 underline">Campaigns</Link> page.
              </td></tr>
            ) : (
              data.items.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-700">{c.template_code}</td>
                  <td className="px-4 py-2 text-slate-600">{c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : "—"}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{c.created_by ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={async () => {
                        if (!confirm(`Cancel "${c.name}"?`)) return;
                        await fetch(`/api/super-admin/notifications/campaigns/${c.id}/cancel`, { method: "POST" });
                        mutate();
                      }}
                      className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                    >Cancel</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
