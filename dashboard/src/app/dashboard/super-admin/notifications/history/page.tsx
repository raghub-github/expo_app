"use client";

import useSWR from "swr";
import { useState } from "react";

type LogRow = {
  id: number;
  notification_id: string;
  campaign_id: number | null;
  template_code: string | null;
  recipient_user_id: string;
  recipient_role: string;
  platform: string | null;
  channel: string;
  title: string | null;
  body: string | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  queued_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  clicked_at: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const STATUS: Record<string, string> = {
  queued: "bg-slate-100 text-slate-700",
  sent: "bg-teal-100 text-teal-700",
  delivered: "bg-indigo-100 text-indigo-700",
  clicked: "bg-amber-100 text-amber-700",
  failed: "bg-rose-100 text-rose-700",
  expired: "bg-slate-200 text-slate-500",
};

export default function HistoryPage() {
  const [userId, setUserId] = useState("");
  const [template, setTemplate] = useState("");
  const [status, setStatus] = useState("");

  const qs = new URLSearchParams();
  qs.set("limit", "200");
  if (userId) qs.set("user_id", userId);
  if (template) qs.set("template", template);
  if (status) qs.set("status", status);

  const { data, isLoading } = useSWR<{ items: LogRow[] }>(
    "/api/super-admin/notifications/logs?" + qs.toString(),
    fetcher,
    { refreshInterval: 20_000 },
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-slate-50 px-3 pb-3 pt-1 sm:px-5 sm:pt-2 xl:px-6">
      <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-7xl flex-col">
        <div className="shrink-0">
          <p className="max-w-2xl text-sm text-slate-500">Per-recipient delivery log. Filter by user, template, or status.</p>
        </div>

        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
          <input placeholder="user_id (GMC-…)" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600" value={userId} onChange={(e) => setUserId(e.target.value)} />
          <input placeholder="template_code" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600" value={template} onChange={(e) => setTemplate(e.target.value)} />
          <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {["queued", "sent", "delivered", "clicked", "failed", "expired"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="mt-4 min-h-0 max-w-full flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[880px] divide-y divide-slate-200 text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
            <tr>
              <th className="px-3 py-3 sm:px-4">Queued</th>
              <th className="px-3 py-3">Template</th>
              <th className="px-3 py-3">Recipient</th>
              <th className="px-3 py-3">Channel</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Title</th>
              <th className="px-3 py-3">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>
            ) : !data?.items?.length ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No matches.</td></tr>
            ) : (
              data.items.map((r) => (
                <tr key={r.id} className="transition hover:bg-teal-50/40">
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600 sm:px-4">{new Date(r.queued_at).toLocaleString()}</td>
                  <td className="px-3 py-3 font-mono text-slate-800">{r.template_code ?? "—"}</td>
                  <td className="px-3 py-3 text-slate-700">
                    {r.recipient_user_id}
                    <div className="text-[10px] text-slate-400">{r.recipient_role} · {r.platform ?? "?"}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-500">{r.channel}</td>
                  <td className="px-3 py-3">
                    <span className={"rounded-md px-1.5 py-0.5 " + (STATUS[r.status] ?? "bg-slate-100")}>{r.status}</span>
                  </td>
                  <td className="max-w-[240px] truncate px-3 py-3 text-slate-800">{r.title}</td>
                  <td className="px-3 py-3 text-rose-600">{r.error_code ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
