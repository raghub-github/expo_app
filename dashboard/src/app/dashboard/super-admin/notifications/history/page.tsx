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
    <div className="p-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-teal-700">Notifications</div>
      <h1 className="text-2xl font-semibold text-slate-900">History</h1>
      <p className="mt-1 text-sm text-slate-500">Per-recipient delivery log. Filter by user, template, or status.</p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input placeholder="user_id (GMC-…)" className="rounded-md border border-slate-200 px-3 py-2 text-sm" value={userId} onChange={(e) => setUserId(e.target.value)} />
        <input placeholder="template_code" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-mono" value={template} onChange={(e) => setTemplate(e.target.value)} />
        <select className="rounded-md border border-slate-200 px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          {["queued", "sent", "delivered", "clicked", "failed", "expired"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50 text-left font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Queued</th>
              <th className="px-3 py-2">Template</th>
              <th className="px-3 py-2">Recipient</th>
              <th className="px-3 py-2">Channel</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>
            ) : !data?.items?.length ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No matches.</td></tr>
            ) : (
              data.items.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{new Date(r.queued_at).toLocaleString()}</td>
                  <td className="px-3 py-2 font-mono text-slate-800">{r.template_code ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.recipient_user_id}
                    <div className="text-[10px] text-slate-400">{r.recipient_role} · {r.platform ?? "?"}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{r.channel}</td>
                  <td className="px-3 py-2">
                    <span className={"rounded-md px-1.5 py-0.5 " + (STATUS[r.status] ?? "bg-slate-100")}>{r.status}</span>
                  </td>
                  <td className="px-3 py-2 max-w-[240px] truncate text-slate-800">{r.title}</td>
                  <td className="px-3 py-2 text-rose-600">{r.error_code ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
