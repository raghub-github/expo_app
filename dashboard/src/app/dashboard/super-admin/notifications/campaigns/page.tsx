"use client";

import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  CalendarClock,
  CircleX,
  Eye,
  Plus,
  RotateCw,
  Send,
  Users,
  User,
  Store,
  Bell,
  Info,
  X,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

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
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Campaign | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [resendBusyId, setResendBusyId] = useState<number | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

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
        const msg =
          typeof j.message === "string"
            ? j.message
            : typeof j.error === "string"
              ? j.error
              : `Cancel failed (HTTP ${res.status})`;
        setCancelError(msg);
        return;
      }
      setCancelTarget(null);
      if (detail?.id === cancelTarget.id) setDetail(null);
      mutate();
    } finally {
      setCancelBusy(false);
    }
  };

  const runResend = async (campaign: Campaign) => {
    setResendBusyId(campaign.id);
    setResendError(null);
    try {
      const res = await fetch(`/api/super-admin/notifications/campaigns/${campaign.id}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof j.message === "string"
            ? j.message
            : typeof j.error === "string"
              ? j.error
              : `Resend failed (HTTP ${res.status})`;
        setResendError(msg);
        return;
      }
      const queued = typeof j.queued === "number" ? j.queued : Number(j.queued);
      if (!Number.isFinite(queued) || queued <= 0) {
        setResendError(
          "No recipients with a registered push token for this target. Open the merchant app on a device (logged in) and try again.",
        );
      }
      mutate();
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
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-teal-700">
              <Bell className="h-3 w-3" /> Notifications
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Campaigns</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
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
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Sent"      value={totals.sent}      accent="text-slate-900" />
          <Kpi label="Delivered" value={totals.delivered} accent="text-teal-700" />
          <Kpi label="Clicked"   value={totals.clicked}   accent="text-amber-700" />
          <Kpi label="Failed"    value={totals.failed}    accent="text-rose-600" />
        </div>

        {cancelError ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{cancelError}</div>
          </div>
        ) : null}
        {resendError ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{resendError}</div>
          </div>
        ) : null}

        {/* Table */}
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Sent</th>
                <th className="px-4 py-3 text-right">Delivered</th>
                <th className="px-4 py-3 text-right">Clicked</th>
                <th className="px-4 py-3 text-right">Failed</th>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3"></th>
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
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{c.name}</div>
                        {c.description ? (
                          <div className="text-xs text-slate-500 line-clamp-1">{c.description}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-700">{c.template_code ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={"inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium " + s.classes}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{campaignCount(c.sent_count).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-teal-700">{campaignCount(c.delivered_count).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-700">{campaignCount(c.clicked_count).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-rose-600">{campaignCount(c.failed_count).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {c.scheduled_at
                          ? new Date(c.scheduled_at).toLocaleString()
                          : new Date(c.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {c.status !== "scheduled" && c.status !== "running" ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setResendError(null);
                                void runResend(c);
                              }}
                              disabled={resendBusyId === c.id}
                              className="inline-flex items-center gap-1 rounded-md border border-teal-200 px-2 py-1 text-xs text-teal-700 hover:bg-teal-50 disabled:opacity-50"
                            >
                              <RotateCw
                                className={"h-3 w-3 " + (resendBusyId === c.id ? "animate-spin" : "")}
                                aria-hidden
                              />
                              {resendBusyId === c.id ? "Sending…" : "Resend"}
                            </button>
                          ) : null}
                          {c.status === "scheduled" || c.status === "running" ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setCancelError(null);
                                setCancelTarget(c);
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                            >
                              <CircleX className="h-3 w-3" aria-hidden /> Cancel
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

        <p className="mt-4 text-xs text-slate-500">
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
          onRequestCancel={() => {
            setCancelError(null);
            setCancelTarget(detail);
          }}
          onResend={() => {
            setResendError(null);
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
  onResend,
  resendBusy,
}: {
  campaign: Campaign;
  onClose: () => void;
  onRequestCancel: () => void;
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

        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          <div className="text-[11px] text-slate-500">
            Recipients on iOS / Android receive via FCM. Web-push is delivered via the browser push protocol.
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Close</button>
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
  | "user_id"
  | "user_ids"
  | "all_customers"
  | "all_merchants"
  | "all_riders"
  | "topic"
  | "store_id";

const TARGET_OPTIONS: Array<{ mode: TargetMode; label: string; sub: string; Icon: typeof Users }> = [
  { mode: "all_customers", label: "All customers", sub: "Every customer with an active app", Icon: Users },
  { mode: "all_merchants", label: "All merchants", sub: "Every merchant with an active app", Icon: Store },
  { mode: "all_riders",    label: "All riders",    sub: "Every rider with an active app",    Icon: Users },
  { mode: "role",          label: "By role",       sub: "Pick a single role bucket",         Icon: Users },
  { mode: "store_id",      label: "Single store",  sub: "GMMC code or number (e.g. 1025)",   Icon: Store },
  { mode: "user_id",       label: "Single user",   sub: "GM code or number (e.g. 100001)",  Icon: User },
  { mode: "user_ids",      label: "Many users",    sub: "Comma-separated list of user_ids",  Icon: Users },
  { mode: "topic",         label: "FCM topic",     sub: "Anyone subscribed to a topic name", Icon: Bell },
];

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

  const { data: tpls } = useSWR<{ items: Template[] }>(
    "/api/super-admin/notifications/templates",
    fetcher,
  );
  const templates = tpls?.items ?? [];

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateCode, setTemplateCode] = useState("");
  const [targetMode, setTargetMode] = useState<TargetMode>("all_merchants");
  const [targetRole, setTargetRole] = useState("customer");
  const [targetUserId, setTargetUserId] = useState("");
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [targetUserIds, setTargetUserIds] = useState("");
  const [targetTopic, setTargetTopic] = useState("");
  const [targetStoreId, setTargetStoreId] = useState("");
  const [resolvedStoreInternalId, setResolvedStoreInternalId] = useState<number | null>(null);
  const [targetLookup, setTargetLookup] = useState<{
    name: string;
    subtitle: string | null;
    role?: string;
  } | null>(null);
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

  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [preview, setPreview] = useState<{ title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const target = useMemo(() => {
    switch (targetMode) {
      case "role":           return { role: targetRole };
      case "user_id":
        return resolvedUserId != null
          ? { user_id: resolvedUserId }
          : { user_id: targetUserId.trim() };
      case "user_ids":       return { user_ids: targetUserIds.split(",").map((s) => s.trim()).filter(Boolean) };
      case "all_customers":  return { all_customers: true };
      case "all_merchants":  return { all_merchants: true };
      case "all_riders":     return { all_riders: true };
      case "topic":          return { topic: targetTopic.trim() };
      case "store_id":
        return resolvedStoreInternalId != null
          ? { store_id: resolvedStoreInternalId }
          : { store_id: 0 };
    }
  }, [targetMode, targetRole, targetUserId, targetUserIds, targetTopic, resolvedStoreInternalId, resolvedUserId]);

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
    switch (targetMode) {
      case "user_id":
        return (
          targetUserId.trim() !== "" &&
          resolvedUserId != null &&
          !targetLookupLoading &&
          !targetLookupError
        );
      case "user_ids": return targetUserIds.split(",").map((s) => s.trim()).filter(Boolean).length > 0;
      case "topic":    return targetTopic.trim().length > 0;
      case "store_id":
        return (
          targetStoreId.trim() !== "" &&
          resolvedStoreInternalId != null &&
          !targetLookupLoading &&
          !targetLookupError
        );
      default:         return true;
    }
  }, [
    targetMode,
    targetUserId,
    resolvedUserId,
    targetUserIds,
    targetTopic,
    targetStoreId,
    resolvedStoreInternalId,
    targetLookupLoading,
    targetLookupError,
  ]);

  useEffect(() => {
    if (targetMode !== "store_id" && targetMode !== "user_id") {
      setTargetLookup(null);
      setResolvedStoreInternalId(null);
      setResolvedUserId(null);
      setTargetLookupLoading(false);
      setTargetLookupError(null);
      return;
    }

    const raw =
      targetMode === "store_id" ? targetStoreId.trim() : targetUserId.trim();
    if (!raw) {
      setTargetLookup(null);
      setResolvedStoreInternalId(null);
      setResolvedUserId(null);
      setTargetLookupLoading(false);
      setTargetLookupError(null);
      return;
    }

    setTargetLookupLoading(true);
    setTargetLookupError(null);
    setResolvedStoreInternalId(null);
    setResolvedUserId(null);

    const timer = setTimeout(() => {
      const qs =
        targetMode === "store_id"
          ? `store_id=${encodeURIComponent(raw)}`
          : `user_id=${encodeURIComponent(raw)}`;
      void fetch(`/api/super-admin/notifications/resolve-target?${qs}`)
        .then(async (res) => {
          const j = await res.json().catch(() => ({}));
          if (!res.ok || !j.found || !j.resolved) {
            setTargetLookup(null);
            setResolvedStoreInternalId(null);
            setResolvedUserId(null);
            setTargetLookupError(
              targetMode === "store_id" ? "Store not found" : "User not found",
            );
            return;
          }
          const resolved = j.resolved as {
            id?: number;
            userId?: string;
            name?: string;
            subtitle?: string | null;
            role?: string;
          };
          setTargetLookup({
            name: resolved.name ?? raw,
            subtitle: resolved.subtitle ?? null,
            role: resolved.role,
          });
          if (targetMode === "store_id" && typeof resolved.id === "number") {
            setResolvedStoreInternalId(resolved.id);
          }
          if (targetMode === "user_id" && typeof resolved.userId === "string") {
            setResolvedUserId(resolved.userId);
          }
          setTargetLookupError(null);
        })
        .catch(() => {
          setTargetLookup(null);
          setResolvedStoreInternalId(null);
          setResolvedUserId(null);
          setTargetLookupError("Could not look up target");
        })
        .finally(() => setTargetLookupLoading(false));
    }, 350);

    return () => clearTimeout(timer);
  }, [targetMode, targetStoreId, targetUserId]);

  const doPreview = async () => {
    setError(null);
    try {
      const res = await fetch("/api/super-admin/notifications/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateCode, variables: varsPayload }),
      });
      if (!res.ok) throw new Error("preview failed");
      const j = await res.json();
      setPreview({ title: j.rendered.title, body: j.rendered.body });
    } catch (e) {
      setError((e as Error).message);
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
    setError(null);
    setSuccess(null);
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
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await res.json().catch(() => ({}));
      onSaved();
      if (status === "running" || status === "scheduled") {
        onClose();
        return;
      }
      setSuccess("Saved as draft.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = !!name && !!templateCode && targetValid && !busy;

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
          <Section title="Template" desc="Pick a template. Its variables show up as inputs below.">
            <Field label="Template" required>
              <select
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                value={templateCode}
                onChange={(e) => setTemplateCode(e.target.value)}
              >
                <option value="">Choose a template…</option>
                {templates.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.code} · {t.role} · {t.category}
                  </option>
                ))}
              </select>
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
              {targetMode === "user_id" && (
                <>
                  <input
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.preventDefault();
                    }}
                    placeholder="e.g. GM100001 or 100001"
                  />
                  <TargetLookupHint
                    loading={targetLookupLoading}
                    lookup={targetLookup}
                    error={targetLookupError}
                  />
                </>
              )}
              {targetMode === "user_ids" && (
                <textarea
                  rows={3}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  value={targetUserIds}
                  onChange={(e) => setTargetUserIds(e.target.value)}
                  placeholder="GMC-1, GMC-2, GMC-3"
                />
              )}
              {targetMode === "topic" && (
                <input
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  value={targetTopic}
                  onChange={(e) => setTargetTopic(e.target.value)}
                  placeholder="e.g. promo_kolkata"
                />
              )}
              {targetMode === "store_id" && (
                <>
                  <input
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                    value={targetStoreId}
                    onChange={(e) => setTargetStoreId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.preventDefault();
                    }}
                    placeholder="e.g. GMMC1025 or 1025"
                  />
                  <TargetLookupHint
                    loading={targetLookupLoading}
                    lookup={targetLookup}
                    error={targetLookupError}
                  />
                </>
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

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <div>{error}</div>
            </div>
          ) : null}
          {success ? (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4" />
              <div>{success}</div>
            </div>
          ) : null}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
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
  if (typeof target.role === "string") return `Role: ${target.role}`;
  if (typeof target.store_id === "number") return `Store #${target.store_id}`;
  if (typeof target.user_id === "string") return `User ${target.user_id}`;
  if (typeof target.topic === "string") return `Topic ${target.topic}`;
  return JSON.stringify(target);
}

function TargetLookupHint({
  loading,
  lookup,
  error,
}: {
  loading: boolean;
  lookup: { name: string; subtitle: string | null; role?: string } | null;
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
  if (error) {
    return <p className="mt-1.5 text-xs text-amber-700">{error}</p>;
  }
  return null;
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
