"use client";

import useSWR from "swr";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  CalendarClock,
  ChevronDown,
  CircleX,
  Eye,
  EyeOff,
  Plus,
  RotateCw,
  Search,
  Send,
  Trash2,
  Users,
  User,
  Store,
  Bell,
  Info,
  X,
  AlertCircle,
  CheckCircle2,
  MapPin,
} from "lucide-react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { toast } from "sonner";

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

type Template = {
  code: string;
  role: string;
  title_template: string;
  body_template: string;
  category: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function campaignCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function apiErrorMessage(body: { message?: unknown; error?: unknown }, fallback: string): string {
  if (typeof body?.message === "string" && body.message) return body.message;
  if (typeof body?.error === "string" && body.error) return body.error;
  return fallback;
}

const STATUS_STYLES: Record<string, { label: string; classes: string }> = {
  draft:     { label: "Draft",     classes: "bg-slate-100 text-slate-700 border-slate-200" },
  scheduled: { label: "Scheduled", classes: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  running:   { label: "Sending…",  classes: "bg-amber-50 text-amber-700 border-amber-200 animate-pulse" },
  completed: { label: "Sent",      classes: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled: { label: "Cancelled", classes: "bg-slate-100 text-slate-600 border-slate-200" },
  failed:    { label: "Failed",    classes: "bg-rose-50 text-rose-700 border-rose-200" },
};

/** Pull unique {{variable}} tokens from a template string, in order of appearance. */
function extractVariables(...tpls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  for (const t of tpls) {
    if (!t) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) != null) {
      const k = m[1];
      if (k && !seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    }
  }
  return out;
}

/** Very light heuristic — used only to pick an input hint (number vs text). */
function inputKindFor(name: string): "text" | "number" | "textarea" {
  const n = name.toLowerCase();
  if (/(count|number|amount|total|qty|quantity|price|rupees|order_id)$/.test(n)) return "number";
  if (/(body|message|description|reason|note)$/.test(n)) return "textarea";
  return "text";
}

export default function CampaignsPage() {
  const { data, mutate, isLoading } = useSWR<{ items: Campaign[] }>(
    "/api/super-admin/notifications/campaigns?limit=100",
    fetcher,
    { refreshInterval: 15_000 },
  );
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Campaign | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Campaign | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [resendBusyId, setResendBusyId] = useState<number | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Campaign | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  /** Block = hide an already-delivered campaign from every recipient's inbox. */
  const runRevokeConfirmed = async () => {
    if (!revokeTarget) return;
    setRevokeBusy(true);
    const toastId = toast.loading(`Blocking “${revokeTarget.name}”…`);
    try {
      const res = await fetch(`/api/super-admin/notifications/campaigns/${revokeTarget.id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(apiErrorMessage(j, `Block failed (HTTP ${res.status})`), { id: toastId });
        return;
      }
      const revoked = Number(j.revoked ?? 0);
      toast.success(
        revoked > 0
          ? `Blocked — removed from ${revoked} inbox row${revoked === 1 ? "" : "s"}.`
          : "Nothing left to block for this campaign.",
        { id: toastId },
      );
      setRevokeTarget(null);
      if (detail?.id === revokeTarget.id) setDetail(null);
      mutate();
    } catch (e) {
      toast.error(`Block failed — ${(e as Error).message}`, { id: toastId });
    } finally {
      setRevokeBusy(false);
    }
  };

  /** Delete = permanently remove campaign + its dispatch log rows from the DB. */
  const runDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    const toastId = toast.loading(`Deleting “${deleteTarget.name}”…`);
    try {
      const res = await fetch(`/api/super-admin/notifications/campaigns/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(apiErrorMessage(j, `Delete failed (HTTP ${res.status})`), { id: toastId });
        return;
      }
      const deletedLogs = Number(j.deletedLogs ?? 0);
      toast.success(
        deletedLogs > 0
          ? `Deleted “${deleteTarget.name}” and ${deletedLogs} inbox row${deletedLogs === 1 ? "" : "s"}.`
          : `Deleted “${deleteTarget.name}”.`,
        { id: toastId },
      );
      setDeleteTarget(null);
      if (detail?.id === deleteTarget.id) setDetail(null);
      mutate();
    } catch (e) {
      toast.error(`Delete failed — ${(e as Error).message}`, { id: toastId });
    } finally {
      setDeleteBusy(false);
    }
  };

  const runCancelConfirmed = async () => {
    if (!cancelTarget) return;
    setCancelBusy(true);
    const toastId = toast.loading(`Cancelling “${cancelTarget.name}”…`);
    try {
      const res = await fetch(`/api/super-admin/notifications/campaigns/${cancelTarget.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(apiErrorMessage(j, `Cancel failed (HTTP ${res.status})`), { id: toastId });
        return;
      }
      toast.success(`Cancelled “${cancelTarget.name}”.`, { id: toastId });
      setCancelTarget(null);
      if (detail?.id === cancelTarget.id) setDetail(null);
      mutate();
    } catch (e) {
      toast.error(`Cancel failed — ${(e as Error).message}`, { id: toastId });
    } finally {
      setCancelBusy(false);
    }
  };

  const runResend = async (campaign: Campaign) => {
    setResendBusyId(campaign.id);
    // Fan-out can take 10s+, so acknowledge the click immediately and swap this
    // toast in place for the outcome.
    const toastId = toast.loading(`Resending “${campaign.name}”…`);
    try {
      const res = await fetch(`/api/super-admin/notifications/campaigns/${campaign.id}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(apiErrorMessage(j, `Resend failed (HTTP ${res.status})`), { id: toastId });
        return;
      }
      const queued = typeof j.queued === "number" ? j.queued : Number(j.queued);
      if (!Number.isFinite(queued) || queued <= 0) {
        // Soft outcome — not an API failure (Expo Go / no registered devices).
        toast.warning(
          typeof j.warning === "string"
            ? j.warning
            : "Push token unavailable. Skipping notification — no registered devices for this target (common in Expo Go). Campaign recorded.",
          { id: toastId },
        );
      } else {
        toast.success(`Resent “${campaign.name}” — ${queued} queued.`, { id: toastId });
      }
      mutate();
    } catch (e) {
      toast.error(`Resend failed — ${(e as Error).message}`, { id: toastId });
    } finally {
      setResendBusyId(null);
    }
  };

  const items = data?.items ?? [];

  const totals = useMemo(() => {
    return items.reduce(
      (acc, c) => {
        acc.sent += campaignCount(c.sent_count);
        acc.delivered += campaignCount(c.delivered_count);
        acc.clicked += campaignCount(c.clicked_count);
        acc.failed += campaignCount(c.failed_count);
        return acc;
      },
      { sent: 0, delivered: 0, clicked: 0, failed: 0 },
    );
  }, [items]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-slate-50 px-3 pb-3 pt-1 sm:px-5 sm:pt-2 xl:px-6">
      <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-7xl flex-col">
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="max-w-2xl text-sm text-slate-500">
              Broadcast to a role or a single store. Save as a draft, schedule for later,
              or send right now — with a live preview of the rendered message.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" /> New campaign
          </button>
        </div>

        {/* KPI strip */}
        <div className="mt-3 grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Sent"      value={totals.sent}      accent="text-slate-900" />
          <Kpi label="Delivered" value={totals.delivered} accent="text-teal-700" />
          <Kpi label="Clicked"   value={totals.clicked}   accent="text-amber-700" />
          <Kpi label="Failed"    value={totals.failed}    accent="text-rose-600" />
        </div>

        {/* Table */}
        <div className="mt-4 min-h-0 max-w-full flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] table-fixed divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
              <tr>
                <th className="w-36 px-3 py-3 sm:px-4">Campaign</th>
                <th className="w-40 px-3 py-3">Template</th>
                <th className="w-20 px-3 py-3">Status</th>
                <th className="w-14 px-2 py-3 text-right">Sent</th>
                <th className="w-20 px-2 py-3 text-right">Delivered</th>
                <th className="hidden w-[9%] px-2 py-3 text-right 2xl:table-cell">Clicked</th>
                <th className="hidden w-[9%] px-2 py-3 text-right 2xl:table-cell">Failed</th>
                <th className="w-32 px-3 py-3">When</th>
                <th className="w-40 px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">Loading…</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    No campaigns yet. Click <b>New campaign</b> to send your first message.
                  </td>
                </tr>
              ) : (
                items.map((c) => {
                  const s = STATUS_STYLES[c.status] ?? { label: c.status, classes: "bg-slate-100 text-slate-700 border-slate-200" };
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setDetail(c)}
                      className="cursor-pointer transition hover:bg-teal-50/40"
                    >
                      <td className="px-3 py-3 sm:px-4">
                        <div className="font-medium text-slate-900">{c.name}</div>
                        {c.description ? (
                          <div className="text-xs text-slate-500 line-clamp-1">{c.description}</div>
                        ) : null}
                      </td>
                      <td className="truncate px-3 py-3 font-mono text-[11px] text-slate-700">{c.template_code ?? "—"}</td>
                      <td className="px-3 py-3">
                        <span className={"inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium " + s.classes}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums">{campaignCount(c.sent_count).toLocaleString()}</td>
                      <td className="px-2 py-3 text-right tabular-nums text-teal-700">{campaignCount(c.delivered_count).toLocaleString()}</td>
                      <td className="hidden px-2 py-3 text-right tabular-nums text-amber-700 2xl:table-cell">{campaignCount(c.clicked_count).toLocaleString()}</td>
                      <td className="hidden px-2 py-3 text-right tabular-nums text-rose-600 2xl:table-cell">{campaignCount(c.failed_count).toLocaleString()}</td>
                      <td className="px-3 py-3 text-[11px] leading-4 text-slate-500">
                        {c.scheduled_at
                          ? new Date(c.scheduled_at).toLocaleString()
                          : new Date(c.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setDetail(c)}
                            title="View campaign"
                            aria-label="View campaign"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          {c.status !== "scheduled" && c.status !== "running" ? (
                            <button
                              type="button"
                              onClick={() => {
                                void runResend(c);
                              }}
                              disabled={resendBusyId === c.id}
                              title="Resend campaign"
                              aria-label="Resend campaign"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-teal-200 bg-white text-teal-700 hover:bg-teal-50 disabled:opacity-50"
                            >
                              <RotateCw
                                className={`h-3.5 w-3.5 ${resendBusyId === c.id ? "animate-spin" : ""}`}
                                aria-hidden
                              />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setCancelTarget(c)}
                              title="Cancel campaign"
                              aria-label="Cancel campaign"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                            >
                              <CircleX className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setRevokeTarget(c)}
                            title="Block from recipient inboxes"
                            aria-label="Block from recipient inboxes"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          >
                            <EyeOff className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          {c.status !== "running" ? (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(c)}
                              title="Delete permanently"
                              aria-label="Delete permanently"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-2 shrink-0 text-xs text-slate-500">
          Tip: <Link href="/dashboard/super-admin/notifications/templates" className="text-teal-700 underline">edit templates</Link>
          {" "}to change wording, images or deep links without a code deploy.
        </p>
      </div>

      {creating ? (
        <CreateCampaign
          onClose={() => setCreating(false)}
          onSaved={() => { mutate(); }}
        />
      ) : null}
      {detail ? (
        <CampaignDetail
          campaign={detail}
          onClose={() => setDetail(null)}
          onRequestCancel={() => setCancelTarget(detail)}
          onRequestDelete={() => setDeleteTarget(detail)}
          onRequestRevoke={() => setRevokeTarget(detail)}
          onResend={() => {
            void runResend(detail);
          }}
          resendBusy={resendBusyId === detail.id}
        />
      ) : null}

      <ConfirmModal
        open={cancelTarget != null}
        title="Cancel campaign?"
        description={
          cancelTarget ? (
            <p>
              Stop <strong>{cancelTarget.name}</strong> and mark it as cancelled. Scheduled sends will not run;
              in-progress sends stop accepting new recipients.
            </p>
          ) : null
        }
        confirmLabel="Cancel campaign"
        cancelLabel="Keep running"
        variant="danger"
        confirmBusy={cancelBusy}
        onClose={() => {
          if (!cancelBusy) setCancelTarget(null);
        }}
        onConfirm={runCancelConfirmed}
      />

      <ConfirmModal
        open={revokeTarget != null}
        title="Block this notification?"
        description={
          revokeTarget ? (
            <p>
              Remove <strong>{revokeTarget.name}</strong> from every recipient&apos;s in-app inbox.
              Already-shown OS notifications stay on the device, but the message disappears from the
              app&apos;s notification list and unread count. Delivery history is kept for audit.
            </p>
          ) : null
        }
        confirmLabel="Block everywhere"
        cancelLabel="Keep it"
        variant="danger"
        confirmBusy={revokeBusy}
        onClose={() => {
          if (!revokeBusy) setRevokeTarget(null);
        }}
        onConfirm={runRevokeConfirmed}
      />

      <ConfirmModal
        open={deleteTarget != null}
        title="Delete campaign from database?"
        description={
          deleteTarget ? (
            <p>
              Permanently delete <strong>{deleteTarget.name}</strong> and every related inbox /
              delivery row. This cannot be undone — recipients will no longer see it in the app, and
              analytics for this campaign will be gone.
            </p>
          ) : null
        }
        confirmLabel="Delete forever"
        cancelLabel="Keep it"
        variant="danger"
        confirmBusy={deleteBusy}
        onClose={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
        onConfirm={runDeleteConfirmed}
      />
    </div>
  );
}

/* ============================================================================
 *  Campaign detail — opened by clicking a row in the list
 * ==========================================================================*/

function CampaignDetail({
  campaign,
  onClose,
  onRequestCancel,
  onRequestDelete,
  onRequestRevoke,
  onResend,
  resendBusy,
}: {
  campaign: Campaign;
  onClose: () => void;
  onRequestCancel: () => void;
  onRequestDelete: () => void;
  onRequestRevoke: () => void;
  onResend: () => void;
  resendBusy: boolean;
}) {
  const { data: meta } = useSWR<{
    target_filter?: Record<string, unknown>;
    recipient_estimate?: number;
    token_stats?: { expo_tokens?: number; merchant_store_tokens?: number };
  }>(`/api/super-admin/notifications/campaigns/${campaign.id}`, fetcher);

  const { data: logs } = useSWR<{ items: Array<{
    id: number;
    recipient_user_id: string;
    recipient_role: string;
    platform: string | null;
    status: string;
    error_code: string | null;
    error_message: string | null;
    queued_at: string;
    delivered_at: string | null;
    clicked_at: string | null;
  }> }>(
    `/api/super-admin/notifications/logs?campaign=${campaign.id}&limit=100`,
    fetcher,
  );
  const items = logs?.items ?? [];
  const s = STATUS_STYLES[campaign.status] ?? { label: campaign.status, classes: "bg-slate-100 text-slate-700 border-slate-200" };
  const sent = campaignCount(campaign.sent_count);
  const delivered = campaignCount(campaign.delivered_count);
  const clicked = campaignCount(campaign.clicked_count);
  const failed = campaignCount(campaign.failed_count);
  const deliveredRate = sent > 0 ? Math.round((delivered / sent) * 100) : 0;
  const clickRate = delivered > 0 ? Math.round((clicked / delivered) * 100) : 0;
  const targetLabel = formatTargetFilter(meta?.target_filter);
  const recipientEstimate = campaignCount(meta?.recipient_estimate);
  const noTokensInSystem =
    campaignCount(meta?.token_stats?.expo_tokens) +
      campaignCount(meta?.token_stats?.merchant_store_tokens) ===
    0;

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-900/40 backdrop-blur-sm">
      <div className="ml-auto flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">Campaign</div>
              <span className={"inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium " + s.classes}>{s.label}</span>
            </div>
            <div className="mt-1 truncate text-base font-semibold text-slate-900">{campaign.name}</div>
            {campaign.description ? (
              <div className="mt-0.5 text-xs text-slate-500">{campaign.description}</div>
            ) : null}
            <div className="mt-1 text-[11px] text-slate-500">
              Template <span className="font-mono">{campaign.template_code ?? "—"}</span>
              {campaign.created_by ? <> · Created by <span className="font-mono">{campaign.created_by}</span></> : null}
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniKpi label="Sent" value={sent} accent="text-slate-900" />
            <MiniKpi label="Delivered" value={delivered} accent="text-teal-700" sub={sent > 0 ? `${deliveredRate}% of sent` : undefined} />
            <MiniKpi label="Clicked" value={clicked} accent="text-amber-700" sub={delivered > 0 ? `${clickRate}% CTR` : undefined} />
            <MiniKpi label="Failed" value={failed} accent="text-rose-600" />
          </div>

          {(sent === 0 && (recipientEstimate === 0 || noTokensInSystem)) ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">No devices received this notification</div>
                <div className="mt-1 text-xs text-amber-800/90">
                  Target: {targetLabel}. Registered push tokens in the system:{" "}
                  {campaignCount(meta?.token_stats?.merchant_store_tokens)} merchant store,{" "}
                  {campaignCount(meta?.token_stats?.expo_tokens)} expo,{" "}
                  {campaignCount((meta?.token_stats as { native_fcm_tokens?: number } | undefined)?.native_fcm_tokens)}{" "}
                  native/web FCM.
                  Open the merchant app on a phone (logged into the target store) with notifications enabled, then Resend.
                </div>
              </div>
            </div>
          ) : null}

          {/* Timeline */}
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Timeline</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-sm sm:grid-cols-4">
              <TimelineRow label="Created" ts={campaign.created_at} />
              <TimelineRow label="Scheduled" ts={campaign.scheduled_at} />
              <TimelineRow label="Started" ts={campaign.started_at} />
              <TimelineRow label="Finished" ts={campaign.finished_at} />
            </dl>
          </div>

          {/* Delivery breakdown */}
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Per-recipient log</div>
              <div className="text-[11px] text-slate-500">{items.length} row{items.length === 1 ? "" : "s"}</div>
            </div>
            {items.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500">
                No deliveries yet. This campaign hasn't fanned out to any recipients — usually because the
                target had no active push tokens.
              </div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto">
                <table className="min-w-full divide-y divide-slate-100 text-xs">
                  <thead className="bg-slate-50 text-left font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Queued</th>
                      <th className="px-3 py-2">Recipient</th>
                      <th className="px-3 py-2">Platform</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{new Date(r.queued_at).toLocaleString()}</td>
                        <td className="px-3 py-2">
                          <div className="text-slate-800">{r.recipient_user_id}</div>
                          <div className="text-[10px] text-slate-400">{r.recipient_role}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{r.platform ?? "—"}</td>
                        <td className="px-3 py-2">
                          <span className={"inline-flex rounded-md px-1.5 py-0.5 " + (STATUS_STYLES[r.status]?.classes ?? "bg-slate-100 text-slate-700 border-slate-200")}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 max-w-[280px] truncate text-rose-700">
                          {r.error_code ? <span className="font-mono">{r.error_code}</span> : ""}
                          {r.error_message ? <div className="text-[10px] text-rose-600">{r.error_message}</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1 text-[11px] text-slate-500">
            Recipients on iOS / Android receive via FCM. Web-push is delivered via the browser push protocol.
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Close</button>
            <button
              onClick={onRequestRevoke}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <EyeOff className="h-3.5 w-3.5" aria-hidden /> Block
            </button>
            {campaign.status !== "scheduled" && campaign.status !== "running" ? (
              <button
                onClick={onResend}
                disabled={resendBusy}
                className="inline-flex items-center gap-1 rounded-md border border-teal-200 px-3 py-2 text-sm text-teal-700 hover:bg-teal-50 disabled:opacity-50"
              >
                <RotateCw className={"h-3.5 w-3.5 " + (resendBusy ? "animate-spin" : "")} aria-hidden />
                {resendBusy ? "Sending…" : "Resend"}
              </button>
            ) : null}
            {campaign.status === "scheduled" || campaign.status === "running" ? (
              <button
                onClick={onRequestCancel}
                className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
              >
                <CircleX className="h-3.5 w-3.5" aria-hidden /> Cancel campaign
              </button>
            ) : null}
            {campaign.status !== "running" ? (
              <button
                onClick={onRequestDelete}
                className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 hover:bg-rose-100"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniKpi({ label, value, accent, sub }: { label: string; value: number; accent: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={"mt-0.5 text-xl font-semibold tabular-nums " + accent}>{value.toLocaleString()}</div>
      {sub ? <div className="text-[10px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function TimelineRow({ label, ts }: { label: string; ts: string | null }) {
  return (
    <>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-xs text-slate-700">{ts ? new Date(ts).toLocaleString() : <span className="text-slate-400">—</span>}</dd>
    </>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={"mt-1 text-2xl font-semibold tabular-nums " + accent}>{value.toLocaleString()}</div>
    </div>
  );
}

/* ============================================================================
 *  Create Campaign — redesigned
 * ==========================================================================*/

type TargetMode =
  | "role"
  | "user_ids"
  | "rider_ids"
  | "all_customers"
  | "all_merchants"
  | "all_riders"
  | "topic"
  | "store_ids"
  | "city";

const TARGET_OPTIONS: Array<{ mode: TargetMode; label: string; sub: string; Icon: typeof Users }> = [
  { mode: "all_customers", label: "All customers", sub: "Every customer with an active app", Icon: Users },
  { mode: "all_merchants", label: "All merchants", sub: "Every merchant with an active app", Icon: Store },
  { mode: "all_riders",    label: "All riders",    sub: "Every rider with an active app",    Icon: Users },
  { mode: "role",          label: "By role",       sub: "Pick a single role bucket",         Icon: Users },
  { mode: "store_ids",     label: "Store(s)",      sub: "One or more GMMC codes (e.g. 1025 or 1025, 1026)", Icon: Store },
  { mode: "user_ids",      label: "User(s)",       sub: "One or more GM / GMMP ids (comma-separated)",     Icon: User },
  { mode: "rider_ids",     label: "Rider(s)",      sub: "One or more GMR ids (e.g. GMR12 or GMR12, 45)", Icon: Users },
  { mode: "city",          label: "By city / location", sub: "Optional city name and/or lat & lng", Icon: MapPin },
  { mode: "topic",         label: "FCM topic",     sub: "Anyone subscribed to a topic name", Icon: Bell },
];

function splitCsvTokens(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function CreateCampaign({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    setPortalReady(true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const { data: tpls, error: tplsError } = useSWR<{ items: Template[] }>(
    "/api/super-admin/notifications/templates",
    fetcher,
  );
  const templates = tpls?.items ?? [];

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateCode, setTemplateCode] = useState("");
  const [targetMode, setTargetMode] = useState<TargetMode | null>(null);
  const [targetRole, setTargetRole] = useState("customer");
  const [targetUserIds, setTargetUserIds] = useState("");
  const [targetRiderIds, setTargetRiderIds] = useState("");
  const [resolvedUserIds, setResolvedUserIds] = useState<string[]>([]);
  const [targetTopic, setTargetTopic] = useState("");
  const [targetStoreIds, setTargetStoreIds] = useState("");
  const [resolvedStoreInternalIds, setResolvedStoreInternalIds] = useState<number[]>([]);
  const [targetCity, setTargetCity] = useState("");
  const [targetLat, setTargetLat] = useState("");
  const [targetLng, setTargetLng] = useState("");
  const [targetRadiusKm, setTargetRadiusKm] = useState("25");
  const [targetGeoRole, setTargetGeoRole] = useState<"all" | "customer" | "merchant" | "rider">("all");
  const [cityHits, setCityHits] = useState<
    Array<{
      city: string | null;
      place_name: string | null;
      text: string | null;
      state: string | null;
      latitude: number;
      longitude: number;
    }>
  >([]);
  const [citySearching, setCitySearching] = useState(false);
  const [cityMenuOpen, setCityMenuOpen] = useState(false);
  const cityBoxRef = useRef<HTMLDivElement>(null);
  const skipCitySearchRef = useRef(false);
  const [targetLookup, setTargetLookup] = useState<{
    name: string;
    subtitle: string | null;
    role?: string;
  } | null>(null);
  const [multiLookupSummary, setMultiLookupSummary] = useState<string | null>(null);
  const [targetLookupLoading, setTargetLookupLoading] = useState(false);
  const [targetLookupError, setTargetLookupError] = useState<string | null>(null);

  // ─── typed variable inputs (extracted from the selected template) ───────
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.code === templateCode) ?? null,
    [templates, templateCode],
  );
  const templateVars = useMemo(
    () => (selectedTemplate ? extractVariables(selectedTemplate.title_template, selectedTemplate.body_template) : []),
    [selectedTemplate],
  );
  // When the template changes, reset the variable form
  useEffect(() => {
    setVarValues({});
  }, [templateCode]);

  useEffect(() => {
    if (targetMode !== "city") {
      setCityHits([]);
      setCityMenuOpen(false);
      return;
    }
    if (skipCitySearchRef.current) {
      skipCitySearchRef.current = false;
      return;
    }
    const q = targetCity.trim();
    if (q.length < 2) {
      setCityHits([]);
      setCitySearching(false);
      return;
    }
    const t = setTimeout(async () => {
      setCitySearching(true);
      try {
        const res = await fetch("/api/merchant/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q, types: "place,locality,district", limit: 8 }),
        });
        const data = await res.json().catch(() => null);
        const results = Array.isArray(data?.results) ? data.results : [];
        setCityHits(results);
        setCityMenuOpen(results.length > 0);
      } catch {
        setCityHits([]);
      } finally {
        setCitySearching(false);
      }
    }, 320);
    return () => clearTimeout(t);
  }, [targetCity, targetMode]);

  useEffect(() => {
    if (!cityMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!cityBoxRef.current?.contains(e.target as Node)) {
        setCityMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [cityMenuOpen]);

  const pickCitySuggestion = (hit: {
    city: string | null;
    place_name: string | null;
    text: string | null;
    latitude: number;
    longitude: number;
  }) => {
    const label =
      (hit.city && hit.city.trim()) ||
      (hit.text && hit.text.trim()) ||
      (hit.place_name ? hit.place_name.split(",")[0]?.trim() : "") ||
      "";
    skipCitySearchRef.current = true;
    setTargetCity(label);
    setTargetLat(String(hit.latitude));
    setTargetLng(String(hit.longitude));
    setCityHits([]);
    setCityMenuOpen(false);
  };

  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [preview, setPreview] = useState<{ title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const target = useMemo(() => {
    if (!targetMode) return null;
    switch (targetMode) {
      case "role":
        return { role: targetRole };
      case "user_ids":
        return {
          user_ids:
            resolvedUserIds.length > 0
              ? resolvedUserIds
              : splitCsvTokens(targetUserIds),
        };
      case "rider_ids":
        return {
          user_ids:
            resolvedUserIds.length > 0
              ? resolvedUserIds
              : splitCsvTokens(targetRiderIds),
        };
      case "all_customers":
        return { all_customers: true };
      case "all_merchants":
        return { all_merchants: true };
      case "all_riders":
        return { all_riders: true };
      case "topic":
        return { topic: targetTopic.trim() };
      case "store_ids": {
        const ids =
          resolvedStoreInternalIds.length > 0
            ? resolvedStoreInternalIds
            : [];
        if (ids.length === 1) return { store_id: ids[0]! };
        return { store_ids: ids };
      }
      case "city": {
        const city = targetCity.trim();
        const lat = Number(targetLat);
        const lng = Number(targetLng);
        const radius = Number(targetRadiusKm);
        const hasCity = city.length > 0;
        const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
        if (!hasCity && !hasCoords) return { geo: true as const };
        return {
          geo: true as const,
          ...(hasCity ? { city } : {}),
          ...(hasCoords
            ? {
                lat,
                lng,
                radius_km:
                  Number.isFinite(radius) && radius > 0 ? radius : 25,
              }
            : {}),
          ...(targetGeoRole !== "all" ? { role: targetGeoRole } : {}),
        };
      }
    }
  }, [
    targetMode,
    targetRole,
    targetUserIds,
    targetRiderIds,
    resolvedUserIds,
    targetTopic,
    resolvedStoreInternalIds,
    targetCity,
    targetLat,
    targetLng,
    targetRadiusKm,
    targetGeoRole,
  ]);

  const varsPayload = useMemo(() => {
    const out: Record<string, string | number> = {};
    for (const k of templateVars) {
      const v = varValues[k] ?? "";
      const kind = inputKindFor(k);
      if (kind === "number" && v !== "" && !Number.isNaN(Number(v))) out[k] = Number(v);
      else if (v !== "") out[k] = v;
    }
    return out;
  }, [templateVars, varValues]);

  const targetValid = useMemo(() => {
    if (!targetMode) return false;
    switch (targetMode) {
      case "user_ids":
        return (
          splitCsvTokens(targetUserIds).length > 0 &&
          resolvedUserIds.length > 0 &&
          !targetLookupLoading
        );
      case "rider_ids":
        return (
          splitCsvTokens(targetRiderIds).length > 0 &&
          resolvedUserIds.length > 0 &&
          !targetLookupLoading
        );
      case "topic":
        return targetTopic.trim().length > 0;
      case "store_ids":
        // 1 store is enough — multi is optional. Don't gate on a stale lookup error
        // once we already have resolved internal id(s).
        return (
          splitCsvTokens(targetStoreIds).length > 0 &&
          resolvedStoreInternalIds.length > 0 &&
          !targetLookupLoading
        );
      case "city": {
        const city = targetCity.trim();
        const lat = Number(targetLat);
        const lng = Number(targetLng);
        const hasCity = city.length > 0;
        const hasLat = targetLat.trim() !== "";
        const hasLng = targetLng.trim() !== "";
        if (!hasCity && !hasLat && !hasLng) return false;
        if (hasLat !== hasLng) return false;
        if (hasLat && (!Number.isFinite(lat) || !Number.isFinite(lng))) return false;
        if (hasLat && (lat < -90 || lat > 90 || lng < -180 || lng > 180)) return false;
        return true;
      }
      default:
        return true;
    }
  }, [
    targetMode,
    targetUserIds,
    targetRiderIds,
    resolvedUserIds,
    targetTopic,
    targetStoreIds,
    resolvedStoreInternalIds,
    targetLookupLoading,
    targetCity,
    targetLat,
    targetLng,
  ]);

  useEffect(() => {
    if (
      targetMode !== "store_ids" &&
      targetMode !== "user_ids" &&
      targetMode !== "rider_ids"
    ) {
      setTargetLookup(null);
      setMultiLookupSummary(null);
      setResolvedStoreInternalIds([]);
      setResolvedUserIds([]);
      setTargetLookupLoading(false);
      setTargetLookupError(null);
      return;
    }

    const raw =
      targetMode === "store_ids"
        ? targetStoreIds.trim()
        : targetMode === "rider_ids"
          ? targetRiderIds.trim()
          : targetUserIds.trim();
    const tokens = splitCsvTokens(raw);
    if (tokens.length === 0) {
      setTargetLookup(null);
      setMultiLookupSummary(null);
      setResolvedStoreInternalIds([]);
      setResolvedUserIds([]);
      setTargetLookupLoading(false);
      setTargetLookupError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setTargetLookupLoading(true);
    setTargetLookupError(null);
    setResolvedStoreInternalIds([]);
    setResolvedUserIds([]);
    setTargetLookup(null);
    setMultiLookupSummary(null);

    const timer = setTimeout(() => {
      const qs =
        targetMode === "store_ids"
          ? `store_ids=${encodeURIComponent(tokens.join(","))}`
          : `user_ids=${encodeURIComponent(tokens.join(","))}`;
      void fetch(`/api/super-admin/notifications/resolve-target?${qs}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (cancelled) return;
          const j = await res.json().catch(() => ({}));
          if (cancelled) return;
          const list = Array.isArray(j.resolved)
            ? (j.resolved as Array<{
                kind?: string;
                id?: number | string;
                userId?: string;
                name?: string;
                subtitle?: string | null;
                role?: string;
              }>)
            : j.resolved
              ? [j.resolved]
              : [];
          const missing: string[] = Array.isArray(j.missing) ? j.missing : [];

          if (!res.ok || list.length === 0) {
            setTargetLookup(null);
            setMultiLookupSummary(null);
            setResolvedStoreInternalIds([]);
            setResolvedUserIds([]);
            setTargetLookupError(
              targetMode === "store_ids"
                ? "No matching stores found"
                : targetMode === "rider_ids"
                  ? "No matching riders found"
                  : "No matching users found",
            );
            return;
          }

          if (targetMode === "store_ids") {
            const ids: number[] = [];
            for (const item of list) {
              const internalId = Number(item.id);
              if (Number.isFinite(internalId) && internalId > 0) ids.push(internalId);
            }
            if (ids.length === 0) {
              setTargetLookup(null);
              setResolvedStoreInternalIds([]);
              setTargetLookupError("Stores found but ids could not be read");
              return;
            }
            setResolvedStoreInternalIds(ids);
            setTargetLookupError(null);
            if (list.length === 1) {
              setTargetLookup({
                name: list[0]!.name ?? tokens[0]!,
                subtitle: list[0]!.subtitle ?? null,
              });
              setMultiLookupSummary(null);
            } else {
              setTargetLookup(null);
              setMultiLookupSummary(
                `${ids.length} stores resolved` +
                  (missing.length ? ` · ${missing.length} not found` : ""),
              );
            }
          } else {
            // Rider mode: keep only rider-role hits when the resolver tagged them.
            const filtered =
              targetMode === "rider_ids"
                ? list.filter((item) => !item.role || item.role === "rider")
                : list;
            const finalIds = filtered
              .map((item) => item.userId)
              .filter((id): id is string => typeof id === "string" && id.length > 0);
            if (finalIds.length === 0) {
              setTargetLookup(null);
              setResolvedUserIds([]);
              setTargetLookupError(
                targetMode === "rider_ids"
                  ? "No riders matched those ids"
                  : "No users matched those ids",
              );
              return;
            }
            setResolvedUserIds(finalIds);
            setTargetLookupError(null);
            if (filtered.length === 1) {
              setTargetLookup({
                name: filtered[0]!.name ?? tokens[0]!,
                subtitle: filtered[0]!.subtitle ?? null,
                role: filtered[0]!.role,
              });
              setMultiLookupSummary(null);
            } else {
              setTargetLookup(null);
              setMultiLookupSummary(
                `${finalIds.length} accounts resolved` +
                  (missing.length ? ` · ${missing.length} not found` : ""),
              );
            }
          }

          if (missing.length && list.length > 0) {
            // Soft warning — still allow send with the resolved subset.
            setMultiLookupSummary((prev) =>
              (prev ? `${prev} · ` : "") +
                `skipped ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`,
            );
          }
        })
        .catch((err: unknown) => {
          if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
          setTargetLookup(null);
          setMultiLookupSummary(null);
          setResolvedStoreInternalIds([]);
          setResolvedUserIds([]);
          setTargetLookupError("Could not look up targets");
        })
        .finally(() => {
          if (!cancelled) setTargetLookupLoading(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [targetMode, targetStoreIds, targetUserIds, targetRiderIds]);

  const doPreview = async () => {
    try {
      const res = await fetch("/api/super-admin/notifications/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateCode, variables: varsPayload }),
      });
      if (!res.ok) throw new Error("preview failed");
      const j = await res.json();
      setPreview({ title: j.rendered.title, body: j.rendered.body });
    } catch {
      // Preview is best-effort — don't block the form.
      setPreview(null);
    }
  };

  // Auto-preview when variable values change (debounced)
  useEffect(() => {
    if (!templateCode) return;
    const timer = setTimeout(() => { void doPreview(); }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateCode, JSON.stringify(varsPayload)]);

  const save = async (status: "draft" | "running" | "scheduled") => {
    setBusy(true);
    try {
      const res = await fetch("/api/super-admin/notifications/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          templateCode,
          target,
          variables: varsPayload,
          status: status === "scheduled" ? undefined : status,
          scheduledAt: status === "scheduled" ? new Date(scheduledAt).toISOString() : undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (typeof j.message === "string" && j.message) ||
            (typeof j.error === "string" && j.error) ||
            `HTTP ${res.status}`,
        );
      }
      onSaved();
      if (status === "running") {
        toast.success(`Campaign “${name}” is sending.`);
        onClose();
        return;
      }
      if (status === "scheduled") {
        toast.success(`Campaign “${name}” scheduled.`);
        onClose();
        return;
      }
      toast.success("Saved as draft.");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = !!name && !!templateCode && targetValid && !busy;

  /** Why the submit buttons are disabled — otherwise a valid-looking form looks broken. */
  const blockedReason = useMemo(() => {
    if (busy) return null;
    if (!name.trim()) return "Enter a campaign name under Basics.";
    if (!templateCode) return "Choose a template.";
    if (!targetMode) return "Pick who receives this notification.";
    if (targetLookupLoading) return "Looking up the target…";
    // Only surface lookup errors when nothing resolved yet (1 id is enough to send).
    if (targetLookupError && !targetValid) return targetLookupError;
    if (!targetValid) {
      if (targetMode === "store_ids") return "Enter at least one store that resolves (e.g. 1025).";
      if (targetMode === "user_ids") return "Enter at least one user id that resolves.";
      if (targetMode === "rider_ids") return "Enter at least one rider id (GMR…) that resolves.";
      if (targetMode === "city") {
        if (
          (targetLat.trim() !== "" && targetLng.trim() === "") ||
          (targetLat.trim() === "" && targetLng.trim() !== "")
        ) {
          return "Provide both latitude and longitude, or leave both empty.";
        }
        return "Enter a city name and/or a latitude & longitude pair.";
      }
      if (targetMode === "topic") return "Enter an FCM topic name.";
      return "Complete the target details.";
    }
    if (when === "later" && !scheduledAt) return "Pick a date and time to schedule.";
    return null;
  }, [
    busy,
    name,
    templateCode,
    targetMode,
    targetValid,
    targetLookupLoading,
    targetLookupError,
    when,
    scheduledAt,
    targetLat,
    targetLng,
  ]);

  if (!portalReady) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex bg-slate-900/40 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div
        className="ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-campaign-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">Notifications</div>
            <div id="create-campaign-title" className="text-base font-semibold text-slate-900">New campaign</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => e.preventDefault()}
        >
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* Basics */}
          <Section title="Basics" desc="A short internal name so you can find this campaign later.">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" required>
                <input
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Diwali flash offer"
                />
              </Field>
              <Field label="Description">
                <input
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
            </div>
          </Section>

          {/* Template */}
          <Section title="Template" desc="Choose any notification template from the full list.">
            {tplsError || (tpls && templates.length === 0) ? (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
                <div>
                  Templates could not be loaded, so this list is empty. Check that the notification
                  backend is running, then reopen this form.
                </div>
              </div>
            ) : null}
            <Field label="Template" required>
              <SearchableSelect
                value={templateCode}
                onChange={setTemplateCode}
                placeholder="Search or choose a template…"
                options={templates.map((t) => ({
                  value: t.code,
                  label: `${t.code} · ${t.role} · ${t.category}`,
                }))}
              />
            </Field>

            {selectedTemplate ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="font-semibold text-slate-700">{selectedTemplate.title_template}</div>
                <div className="mt-0.5 text-slate-600">{selectedTemplate.body_template}</div>
              </div>
            ) : null}
          </Section>

          {/* Variables — typed inputs derived from template */}
          {templateCode && templateVars.length > 0 ? (
            <Section
              title={`Variables (${templateVars.length})`}
              desc="These fill the {{placeholders}} in the template."
            >
              <div className="grid grid-cols-1 gap-3">
                {templateVars.map((v) => {
                  const kind = inputKindFor(v);
                  return (
                    <Field key={v} label={v} mono>
                      {kind === "textarea" ? (
                        <textarea
                          rows={3}
                          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                          value={varValues[v] ?? ""}
                          onChange={(e) => setVarValues((prev) => ({ ...prev, [v]: e.target.value }))}
                          placeholder={`Enter ${v}`}
                        />
                      ) : (
                        <input
                          type={kind === "number" ? "number" : "text"}
                          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                          value={varValues[v] ?? ""}
                          onChange={(e) => setVarValues((prev) => ({ ...prev, [v]: e.target.value }))}
                          placeholder={`Enter ${v}`}
                        />
                      )}
                    </Field>
                  );
                })}
              </div>
            </Section>
          ) : templateCode ? (
            <Section title="Variables" desc="This template has no {{variables}} — nothing to fill in.">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <Info className="mr-1 -mt-0.5 inline h-3.5 w-3.5" />
                Ready to send as-is.
              </div>
            </Section>
          ) : null}

          {/* Preview */}
          {templateCode ? (
            <Section title="Preview" desc="Rendered with your inputs. Updates as you type.">
              {preview ? (
                <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-3">
                  <div className="flex items-start gap-3">
                    <Bell className="mt-0.5 h-4 w-4 text-teal-700" />
                    <div className="min-w-0">
                      <div className="font-semibold text-teal-900">{preview.title}</div>
                      <div className="mt-0.5 text-sm text-teal-900/80">{preview.body}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={doPreview}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Eye className="h-4 w-4" /> Preview
                </button>
              )}
            </Section>
          ) : null}

          {/* Target */}
          <Section title="Target" desc="Who receives this notification?">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TARGET_OPTIONS.map(({ mode, label, sub, Icon }) => {
                const active = targetMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setTargetMode(mode)}
                    className={
                      "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition " +
                      (active
                        ? "border-teal-600 bg-teal-50/60 ring-1 ring-teal-600"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50")
                    }
                  >
                    <Icon className={"mt-0.5 h-4 w-4 " + (active ? "text-teal-700" : "text-slate-500")} />
                    <div>
                      <div className={"text-sm font-medium " + (active ? "text-teal-900" : "text-slate-900")}>{label}</div>
                      <div className="text-[11px] text-slate-500">{sub}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3">
              {targetMode === "role" && (
                <select
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                >
                  {["customer", "merchant", "rider", "admin"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              )}
              {targetMode === "user_ids" && (
                <>
                  <textarea
                    rows={3}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                    value={targetUserIds}
                    onChange={(e) => setTargetUserIds(e.target.value)}
                    placeholder="GM100001, GMMP55, 100002"
                  />
                  <TargetLookupHint
                    loading={targetLookupLoading}
                    lookup={targetLookup}
                    summary={multiLookupSummary}
                    error={targetLookupError}
                  />
                </>
              )}
              {targetMode === "rider_ids" && (
                <>
                  <textarea
                    rows={3}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                    value={targetRiderIds}
                    onChange={(e) => setTargetRiderIds(e.target.value)}
                    placeholder="GMR12, GMR45, 88"
                  />
                  <TargetLookupHint
                    loading={targetLookupLoading}
                    lookup={targetLookup}
                    summary={multiLookupSummary}
                    error={targetLookupError}
                  />
                </>
              )}
              {targetMode === "topic" && (
                <input
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  value={targetTopic}
                  onChange={(e) => setTargetTopic(e.target.value)}
                  placeholder="e.g. promo_kolkata"
                />
              )}
              {targetMode === "store_ids" && (
                <>
                  <textarea
                    rows={3}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                    value={targetStoreIds}
                    onChange={(e) => setTargetStoreIds(e.target.value)}
                    placeholder="GMMC1025, 1026, GMMC1030"
                  />
                  <TargetLookupHint
                    loading={targetLookupLoading}
                    lookup={targetLookup}
                    summary={multiLookupSummary}
                    error={targetLookupError}
                  />
                </>
              )}
              {targetMode === "city" && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  <p className="text-[11px] text-slate-500">
                    Optional geo filter — pick a city suggestion to auto-fill latitude &amp; longitude,
                    or enter coordinates manually.
                  </p>
                  <Field label="City name">
                    <div ref={cityBoxRef} className="relative">
                      <input
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                        value={targetCity}
                        onChange={(e) => {
                          setTargetCity(e.target.value);
                          // Typing a new city invalidates previous auto-filled coords.
                          setTargetLat("");
                          setTargetLng("");
                          setCityMenuOpen(true);
                        }}
                        onFocus={() => {
                          if (cityHits.length > 0) setCityMenuOpen(true);
                        }}
                        placeholder="Start typing a city…"
                        autoComplete="off"
                      />
                      {citySearching && (
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                          Searching…
                        </span>
                      )}
                      {cityMenuOpen && cityHits.length > 0 && (
                        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                          {cityHits.map((hit, idx) => {
                            const title =
                              (hit.city && hit.city.trim()) ||
                              (hit.text && hit.text.trim()) ||
                              (hit.place_name ? hit.place_name.split(",")[0]?.trim() : "") ||
                              "Unknown";
                            const subtitle = hit.place_name || [hit.state].filter(Boolean).join(", ");
                            return (
                              <li key={`${hit.latitude}-${hit.longitude}-${idx}`}>
                                <button
                                  type="button"
                                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-teal-50"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => pickCitySuggestion(hit)}
                                >
                                  <span className="text-sm font-medium text-slate-800">{title}</span>
                                  {subtitle ? (
                                    <span className="text-[11px] text-slate-500">{subtitle}</span>
                                  ) : null}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Latitude">
                      <input
                        type="number"
                        step="any"
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                        value={targetLat}
                        onChange={(e) => setTargetLat(e.target.value)}
                        placeholder="Auto from city"
                      />
                    </Field>
                    <Field label="Longitude">
                      <input
                        type="number"
                        step="any"
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                        value={targetLng}
                        onChange={(e) => setTargetLng(e.target.value)}
                        placeholder="Auto from city"
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Radius (km)">
                      <input
                        type="number"
                        min={1}
                        step="1"
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                        value={targetRadiusKm}
                        onChange={(e) => setTargetRadiusKm(e.target.value)}
                        placeholder="25"
                      />
                    </Field>
                    <Field label="Audience role">
                      <select
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                        value={targetGeoRole}
                        onChange={(e) =>
                          setTargetGeoRole(
                            e.target.value as "all" | "customer" | "merchant" | "rider",
                          )
                        }
                      >
                        <option value="all">All roles</option>
                        <option value="customer">Customers</option>
                        <option value="merchant">Merchants</option>
                        <option value="rider">Riders</option>
                      </select>
                    </Field>
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* When */}
          <Section title="When" desc="Send right away or queue for later.">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={when === "now"} onChange={() => setWhen("now")} />
                Send now
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={when === "later"} onChange={() => setWhen("later")} />
                Schedule
              </label>
              {when === "later" ? (
                <input
                  type="datetime-local"
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              ) : null}
            </div>
          </Section>

        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
          {blockedReason ? (
            <div className="mr-auto flex items-center gap-1.5 text-xs text-slate-500">
              <Info className="h-3.5 w-3.5" />
              <span>{blockedReason}</span>
            </div>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => save("draft")}
            disabled={!canSubmit}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Save as draft
          </button>
          {when === "later" ? (
            <button
              type="button"
              onClick={() => save("scheduled")}
              disabled={!canSubmit || !scheduledAt}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <CalendarClock className="h-4 w-4" /> Schedule
            </button>
          ) : (
            <button
              type="button"
              onClick={() => save("running")}
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> Send now
            </button>
          )}
        </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function formatTargetFilter(target: Record<string, unknown> | undefined): string {
  if (!target) return "—";
  if (target.all_merchants === true) return "All merchants";
  if (target.all_customers === true) return "All customers";
  if (target.all_riders === true) return "All riders";
  if (typeof target.role === "string" && !target.geo) return `Role: ${target.role}`;
  if (Array.isArray(target.store_ids)) {
    return `Stores (${target.store_ids.length})`;
  }
  if (typeof target.store_id === "number") return `Store #${target.store_id}`;
  if (Array.isArray(target.user_ids)) {
    return `Users (${target.user_ids.length})`;
  }
  if (typeof target.user_id === "string") return `User ${target.user_id}`;
  if (target.geo === true) {
    const parts: string[] = [];
    if (typeof target.city === "string" && target.city.trim()) parts.push(target.city.trim());
    if (typeof target.lat === "number" && typeof target.lng === "number") {
      parts.push(`${target.lat}, ${target.lng}`);
      if (typeof target.radius_km === "number") parts.push(`${target.radius_km} km`);
    }
    if (typeof target.role === "string") parts.push(target.role);
    return parts.length ? `Geo: ${parts.join(" · ")}` : "Geo target";
  }
  if (typeof target.topic === "string") return `Topic ${target.topic}`;
  return JSON.stringify(target);
}

function TargetLookupHint({
  loading,
  lookup,
  summary,
  error,
}: {
  loading: boolean;
  lookup: { name: string; subtitle: string | null; role?: string } | null;
  summary?: string | null;
  error: string | null;
}) {
  if (loading) {
    return <p className="mt-1.5 text-xs text-slate-500">Looking up…</p>;
  }
  if (lookup) {
    const meta = [lookup.role, lookup.subtitle].filter(Boolean).join(" · ");
    return (
      <div className="mt-1.5 flex items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50/70 px-2.5 py-2 text-sm text-teal-900">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <div className="min-w-0 flex flex-1 items-center gap-2 overflow-hidden whitespace-nowrap">
          <span className="truncate font-medium">{lookup.name}</span>
          {meta ? (
            <>
              <span className="shrink-0 text-teal-800/50">·</span>
              <span className="shrink-0 font-mono text-[11px] text-teal-800/80">{meta}</span>
            </>
          ) : null}
        </div>
      </div>
    );
  }
  if (summary) {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50/70 px-2.5 py-2 text-sm text-teal-900">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">{summary}</span>
      </div>
    );
  }
  if (error) {
    return <p className="mt-1.5 text-xs text-amber-700">{error}</p>;
  }
  return null;
}

function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm outline-none hover:border-slate-300 focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? "text-slate-800" : "text-slate-400"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 bg-slate-50/80 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type to search…"
                className="w-full rounded-md border border-slate-200 bg-white py-2 pl-8 pr-2.5 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  if (e.key === "Enter" && filtered[0]) {
                    e.preventDefault();
                    onChange(filtered[0].value);
                    setOpen(false);
                  }
                }}
              />
            </div>
          </div>
          <ul className="max-h-56 overflow-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2.5 text-center text-sm text-slate-500">No templates found</li>
            ) : (
              filtered.map((opt) => {
                const active = opt.value === value;
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      className={`flex w-full px-3 py-2 text-left text-sm hover:bg-teal-50 ${
                        active ? "bg-teal-50 font-medium text-teal-900" : "text-slate-800"
                      }`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                    >
                      <span className="truncate">{opt.label}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2">
        <div className="text-[13px] font-semibold text-slate-900">{title}</div>
        {desc ? <div className="text-[11px] text-slate-500">{desc}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  mono,
  children,
}: {
  label: string;
  required?: boolean;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className={"mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 " + (mono ? "font-mono normal-case" : "")}>
        {label}
        {required ? <span className="ml-0.5 text-rose-600">*</span> : null}
      </div>
      {children}
    </label>
  );
}
