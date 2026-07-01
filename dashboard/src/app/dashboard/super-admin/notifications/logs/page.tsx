"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type LogRow = { id: number; template_code: string | null; recipient_user_id: string; recipient_role: string; status: string; error_code: string | null; error_message: string | null; queued_at: string };

export default function LogsFailuresPage() {
  const { data, isLoading } = useSWR<{ items: LogRow[] }>(
    "/api/super-admin/notifications/logs?status=failed&limit=200",
    fetcher,
    { refreshInterval: 20_000 },
  );
  return (
    <div className="p-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-teal-700">Notifications</div>
      <h1 className="text-2xl font-semibold text-slate-900">Failures</h1>
      <p className="mt-1 text-sm text-slate-500">Latest delivery failures. Click a token error (DeviceNotRegistered) to purge stale tokens in Phase 7.</p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50 text-left font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Template</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Error code</th>
              <th className="px-3 py-2">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>
            ) : !data?.items?.length ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">🎉 No failures right now.</td></tr>
            ) : (
              data.items.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{new Date(r.queued_at).toLocaleString()}</td>
                  <td className="px-3 py-2 font-mono text-slate-800">{r.template_code ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-700">{r.recipient_user_id} <span className="text-[10px] text-slate-400">({r.recipient_role})</span></td>
                  <td className="px-3 py-2 font-mono text-rose-700">{r.error_code ?? ""}</td>
                  <td className="px-3 py-2 max-w-[420px] truncate text-rose-800">{r.error_message ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
