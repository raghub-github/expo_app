"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type LogRow = {
  id: number;
  notification_id?: string;
  template_code: string | null;
  recipient_user_id: string;
  recipient_role: string;
  status: string;
  error_code: string | null;
  error_message: string | null;
  retry_attempts?: number;
  queued_at: string;
};

export default function LogsFailuresPage() {
  const { data, isLoading, mutate } = useSWR<{ items: LogRow[] }>(
    "/api/super-admin/notifications/logs?status=failed&limit=200",
    fetcher,
    { refreshInterval: 20_000 },
  );
  const [busyId, setBusyId] = useState<number | null>(null);

  async function retryRow(r: LogRow) {
    setBusyId(r.id);
    try {
      const id = r.notification_id || String(r.id);
      await fetch(`/api/super-admin/notifications/logs/${encodeURIComponent(id)}/retry`, {
        method: "POST",
      });
      await mutate();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-slate-50 px-3 pb-3 pt-1 sm:px-5 sm:pt-2 xl:px-6">
      <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-7xl flex-col">
        <div className="shrink-0">
          <p className="max-w-2xl text-sm text-slate-500">
            Latest delivery failures. Use Retry to re-queue through the backend engine (30s / 2m / 5m / 15m backoff).
          </p>
        </div>

        <div className="mt-4 min-h-0 max-w-full flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[860px] divide-y divide-slate-200 text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
            <tr>
              <th className="px-3 py-3 sm:px-4">Time</th>
              <th className="px-3 py-3">Template</th>
              <th className="px-3 py-3">User</th>
              <th className="px-3 py-3">Error code</th>
              <th className="px-3 py-3">Message</th>
              <th className="px-3 py-3">Retries</th>
              <th className="px-3 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>
            ) : !data?.items?.length ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No failures right now.</td></tr>
            ) : (
              data.items.map((r) => (
                <tr key={r.id} className="transition hover:bg-teal-50/40">
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600 sm:px-4">{new Date(r.queued_at).toLocaleString()}</td>
                  <td className="px-3 py-3 font-mono text-slate-800">{r.template_code ?? "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{r.recipient_user_id} <span className="text-[10px] text-slate-400">({r.recipient_role})</span></td>
                  <td className="px-3 py-3 font-mono text-rose-700">{r.error_code ?? ""}</td>
                  <td className="max-w-[320px] truncate px-3 py-3 text-rose-800">{r.error_message ?? ""}</td>
                  <td className="px-3 py-3 text-slate-600">{r.retry_attempts ?? 0}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => void retryRow(r)}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-50"
                    >
                      {busyId === r.id ? "…" : "Retry"}
                    </button>
                  </td>
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
