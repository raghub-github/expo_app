"use client";

import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Pencil } from "lucide-react";

type Campaign = {
  id: number;
  name: string;
  template_code: string | null;
  scheduled_at: string | null;
  status: string;
  sent_count: number;
  created_by: string | null;
  override_body?: string | null;
  variables?: Record<string, unknown> | null;
};

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

function bodyPreview(c: Campaign): string {
  if (typeof c.override_body === "string" && c.override_body.trim()) return c.override_body.trim();
  const vars = c.variables && typeof c.variables === "object" ? c.variables : {};
  if (typeof vars.body === "string" && vars.body.trim()) return vars.body.trim();
  if (typeof vars.message === "string" && vars.message.trim()) return vars.message.trim();
  return "";
}

export default function ScheduledPage() {
  const { data, mutate, isLoading } = useSWR<{ items: Campaign[] }>(
    "/api/super-admin/notifications/campaigns?status=scheduled&limit=100",
    fetcher,
    { refreshInterval: 15_000, errorRetryCount: 2, dedupingInterval: 8_000 },
  );
  const [cancelTarget, setCancelTarget] = useState<Campaign | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const runCancelConfirmed = async () => {
    if (!cancelTarget) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/super-admin/notifications/campaigns/${cancelTarget.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCancelError(
          typeof j.message === "string"
            ? j.message
            : typeof j.error === "string"
              ? j.error
              : "Could not cancel campaign.",
        );
        return;
      }
      setCancelTarget(null);
      mutate();
    } finally {
      setCancelBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-slate-50 px-3 pb-3 pt-1 sm:px-5 sm:pt-2 xl:px-6">
      <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-7xl flex-col">
        <div className="shrink-0">
          <p className="max-w-2xl text-sm text-slate-500">
            Campaigns waiting to fire. Edit them anytime before push. The backend poller sweeps every 30 s.
          </p>
        </div>

        {cancelError ? (
          <div className="mt-3 shrink-0 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {cancelError}
          </div>
        ) : null}

        <div className="mt-4 min-h-0 max-w-full flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
              <tr>
                <th className="px-3 py-3 sm:px-4">Name</th>
                <th className="px-3 py-3">Template</th>
                <th className="px-3 py-3">Scheduled for</th>
                <th className="px-3 py-3">Created by</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              ) : !data?.items?.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    No scheduled sends. Create one on the{" "}
                    <Link
                      href="/dashboard/super-admin/notifications/campaigns"
                      className="text-teal-700 underline"
                    >
                      Campaigns
                    </Link>{" "}
                    page.
                  </td>
                </tr>
              ) : (
                data.items.map((c) => {
                  const preview = bodyPreview(c);
                  return (
                    <tr key={c.id} className="transition hover:bg-teal-50/40">
                      <td className="px-3 py-3 sm:px-4">
                        <div className="font-medium text-slate-900">{c.name}</div>
                        {preview ? (
                          <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{preview}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-700">
                        {c.template_code}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500">{c.created_by ?? "—"}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/dashboard/super-admin/notifications/campaigns?edit=${c.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-indigo-200 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50"
                          >
                            <Pencil className="h-3 w-3" /> Edit
                          </Link>
                          <button
                            onClick={() => {
                              setCancelError(null);
                              setCancelTarget(c);
                            }}
                            className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={cancelTarget != null}
        title="Cancel scheduled campaign?"
        description={
          cancelTarget ? (
            <p>
              Cancel <strong>{cancelTarget.name}</strong>? It will not be sent at the scheduled time.
            </p>
          ) : null
        }
        confirmLabel="Cancel campaign"
        cancelLabel="Keep scheduled"
        variant="danger"
        confirmBusy={cancelBusy}
        onClose={() => {
          if (!cancelBusy) setCancelTarget(null);
        }}
        onConfirm={runCancelConfirmed}
      />
    </div>
  );
}
