"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, Eye, Plus, Send, Square, X } from "lucide-react";

type Campaign = {
  id: number;
  name: string;
  description: string | null;
  template_code: string | null;
  status: string;
  sent_count: number;
  delivered_count: number;
  clicked_count: number;
  failed_count: number;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  created_by: string | null;
};

type Template = { code: string; role: string; title_template: string; body_template: string; category: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  scheduled: "bg-indigo-100 text-indigo-700",
  running: "bg-amber-100 text-amber-700 animate-pulse",
  completed: "bg-teal-100 text-teal-700",
  cancelled: "bg-slate-200 text-slate-600",
  failed: "bg-rose-100 text-rose-700",
};

export default function CampaignsPage() {
  const { data, mutate, isLoading } = useSWR<{ items: Campaign[] }>(
    "/api/super-admin/notifications/campaigns?limit=100",
    fetcher,
    { refreshInterval: 15_000 },
  );
  const [creating, setCreating] = useState(false);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-teal-700">Notifications</div>
          <h1 className="text-2xl font-semibold text-slate-900">Campaigns</h1>
          <p className="mt-1 text-sm text-slate-500">Broadcast or targeted sends. Save as draft, schedule, or run immediately.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" />
          New campaign
        </button>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Campaign</th>
              <th className="px-4 py-2">Template</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Sent</th>
              <th className="px-4 py-2 text-right">Delivered</th>
              <th className="px-4 py-2 text-right">Clicked</th>
              <th className="px-4 py-2 text-right">Failed</th>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
            ) : !data?.items?.length ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">No campaigns yet.</td></tr>
            ) : (
              data.items.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-900">{c.name}</div>
                    {c.description ? <div className="text-xs text-slate-500 line-clamp-1">{c.description}</div> : null}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-700">{c.template_code ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className={"rounded-md px-1.5 py-0.5 text-[11px] " + (STATUS_COLORS[c.status] ?? "bg-slate-100")}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.sent_count.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-teal-700">{c.delivered_count.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-amber-700">{c.clicked_count.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-rose-600">{c.failed_count.toLocaleString()}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : new Date(c.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {c.status === "scheduled" || c.status === "running" ? (
                      <button
                        onClick={async () => {
                          if (!confirm(`Cancel "${c.name}"?`)) return;
                          await fetch(`/api/super-admin/notifications/campaigns/${c.id}/cancel`, { method: "POST" });
                          mutate();
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                      >
                        <Square className="h-3 w-3" /> Cancel
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Need a scheduled send? Set <b>scheduledAt</b> to a future ISO timestamp. The backend poller (every 30 s) will fire it exactly once.
      </p>

      {creating ? <CreateCampaign onClose={() => setCreating(false)} onSaved={() => { setCreating(false); mutate(); }} /> : null}
    </div>
  );
}

function CreateCampaign({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: tpls } = useSWR<{ items: Template[] }>("/api/super-admin/notifications/templates", fetcher);
  const templates = tpls?.items ?? [];

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateCode, setTemplateCode] = useState("");
  const [targetMode, setTargetMode] = useState<"role" | "user_id" | "user_ids" | "all_customers" | "all_merchants" | "all_riders" | "topic" | "store_id">("role");
  const [targetRole, setTargetRole] = useState("customer");
  const [targetUserId, setTargetUserId] = useState("");
  const [targetUserIds, setTargetUserIds] = useState("");
  const [targetTopic, setTargetTopic] = useState("");
  const [targetStoreId, setTargetStoreId] = useState("");
  const [variablesRaw, setVariablesRaw] = useState("{}");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [preview, setPreview] = useState<{ title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = useMemo(() => {
    switch (targetMode) {
      case "role": return { role: targetRole };
      case "user_id": return { user_id: targetUserId };
      case "user_ids": return { user_ids: targetUserIds.split(",").map((s) => s.trim()).filter(Boolean) };
      case "all_customers": return { all_customers: true };
      case "all_merchants": return { all_merchants: true };
      case "all_riders": return { all_riders: true };
      case "topic": return { topic: targetTopic };
      case "store_id": return { store_id: Number(targetStoreId) };
    }
  }, [targetMode, targetRole, targetUserId, targetUserIds, targetTopic, targetStoreId]);

  const doPreview = async () => {
    setError(null);
    try {
      const vars = JSON.parse(variablesRaw || "{}");
      const res = await fetch("/api/super-admin/notifications/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateCode, variables: vars }),
      });
      if (!res.ok) throw new Error("preview failed");
      const j = await res.json();
      setPreview({ title: j.rendered.title, body: j.rendered.body });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = async (status: "draft" | "running" | "scheduled") => {
    setBusy(true);
    setError(null);
    try {
      const vars = JSON.parse(variablesRaw || "{}");
      const res = await fetch("/api/super-admin/notifications/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          templateCode,
          target,
          variables: vars,
          status: status === "scheduled" ? undefined : status,
          scheduledAt: status === "scheduled" ? new Date(scheduledAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-900/40">
      <div className="ml-auto h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="text-sm font-semibold text-slate-900">New campaign</div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Name</div>
              <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali flash offer" />
            </label>
            <label className="block">
              <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Description</div>
              <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </label>
          </div>

          <label className="block">
            <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Template</div>
            <select className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={templateCode} onChange={(e) => setTemplateCode(e.target.value)}>
              <option value="">Choose template…</option>
              {templates.map((t) => (
                <option key={t.code} value={t.code}>{t.code} · {t.role} · {t.category}</option>
              ))}
            </select>
          </label>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Target</legend>
            <div className="grid grid-cols-4 gap-2">
              {(["role", "user_id", "user_ids", "all_customers", "all_merchants", "all_riders", "topic", "store_id"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTargetMode(mode)}
                  className={"rounded-md border px-2 py-1 text-xs " + (targetMode === mode ? "border-teal-600 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
                >
                  {mode}
                </button>
              ))}
            </div>
            <div className="mt-3">
              {targetMode === "role" && (
                <select className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={targetRole} onChange={(e) => setTargetRole(e.target.value)}>
                  {["customer", "merchant", "rider", "admin"].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
              {targetMode === "user_id" && <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} placeholder="GMC-…" />}
              {targetMode === "user_ids" && <textarea rows={3} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={targetUserIds} onChange={(e) => setTargetUserIds(e.target.value)} placeholder="GMC-1, GMC-2, …" />}
              {targetMode === "topic" && <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={targetTopic} onChange={(e) => setTargetTopic(e.target.value)} placeholder="promo_kolkata" />}
              {targetMode === "store_id" && <input type="number" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={targetStoreId} onChange={(e) => setTargetStoreId(e.target.value)} placeholder="45" />}
              {(targetMode === "all_customers" || targetMode === "all_merchants" || targetMode === "all_riders") && (
                <p className="text-xs text-slate-500">Every {targetMode.replace("all_", "")} with an active push token.</p>
              )}
            </div>
          </fieldset>

          <label className="block">
            <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Variables (JSON)
            </div>
            <textarea rows={4} className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-xs" value={variablesRaw} onChange={(e) => setVariablesRaw(e.target.value)} />
          </label>

          <div className="flex items-center gap-2">
            <button onClick={doPreview} disabled={!templateCode} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <Eye className="h-4 w-4" /> Preview
            </button>
            {preview ? (
              <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs">
                <div className="font-semibold text-teal-900">{preview.title}</div>
                <div className="text-teal-800">{preview.body}</div>
              </div>
            ) : null}
          </div>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">When</legend>
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-1"><input type="radio" checked={when === "now"} onChange={() => setWhen("now")} /> Send now</label>
              <label className="flex items-center gap-1"><input type="radio" checked={when === "later"} onChange={() => setWhen("later")} /> Schedule</label>
              {when === "later" ? (
                <input type="datetime-local" className="rounded-md border border-slate-200 px-2 py-1 text-sm" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              ) : null}
            </div>
          </fieldset>

          {error ? <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</div> : null}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button onClick={onClose} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={() => save("draft")} disabled={busy || !name || !templateCode} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Save as draft
            </button>
            {when === "later" ? (
              <button onClick={() => save("scheduled")} disabled={busy || !name || !templateCode || !scheduledAt} className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                <CalendarClock className="h-4 w-4" /> Schedule
              </button>
            ) : (
              <button onClick={() => save("running")} disabled={busy || !name || !templateCode} className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
                <Send className="h-4 w-4" /> Send now
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-500">
            <Link href="/dashboard/super-admin/notifications/templates" className="text-teal-700 underline">Edit template</Link> to change title/body/deep-link without code changes.
          </p>
        </div>
      </div>
    </div>
  );
}
