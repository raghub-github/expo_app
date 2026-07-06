"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { UserCheck, ExternalLink, Clock } from "lucide-react";

type Row = {
  review_id: number;
  request_id: number;
  reason: string;
  state: "queued" | "in_review" | "resolved" | "escalated" | "expired";
  assigned_to: number | null;
  created_at: string;
  verification_id: string;
  document_kind: string;
  subject_id: number;
  subject_type: string;
  status: string;
  status_reason: string | null;
  confidence: string | null;
  business_identifier: string | null;
  verified_data: unknown;
  provider: string;
  provider_reference: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Shared queue table for rider + merchant verification manual reviews.
 * The page-level wrappers just pass different `subjectType` and header text.
 */
export default function VerificationQueuePage(props: {
  title: string;
  intro: string;
  subjectType: "rider" | "merchant_store";
  detailHref: (subjectId: number) => string;
}) {
  const url = `/api/super-admin/verification/queue?subjectType=${props.subjectType}`;
  const { data, isLoading } = useSWR<{ rows: Row[] }>(url, fetcher, { refreshInterval: 15_000 });
  const [busy, setBusy] = useState<number | null>(null);
  const [openRow, setOpenRow] = useState<Row | null>(null);
  const [notes, setNotes] = useState("");

  async function assign(row: Row): Promise<void> {
    setBusy(row.review_id);
    try {
      await fetch("/api/super-admin/verification/queue", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "assign", reviewId: row.review_id }),
      });
      await mutate(url);
    } finally { setBusy(null); }
  }

  async function resolve(row: Row, decision: "verified" | "rejected" | "overridden"): Promise<void> {
    if (!confirm(`Mark verification ${row.verification_id} as ${decision}?`)) return;
    setBusy(row.review_id);
    try {
      const res = await fetch("/api/super-admin/verification/queue", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "resolve", reviewId: row.review_id, decision, notes: notes.trim() || null }),
      });
      if (!res.ok) alert("Resolve failed");
      else { setOpenRow(null); setNotes(""); await mutate(url); }
    } finally { setBusy(null); }
  }

  return (
    <div className="p-6">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-teal-700">
        <UserCheck className="h-3.5 w-3.5" /> Verification queue
      </div>
      <h1 className="text-2xl font-semibold text-slate-900">{props.title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">{props.intro}</p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Subject</th>
              <th className="px-4 py-2">Document</th>
              <th className="px-4 py-2">Source</th>
              <th className="px-4 py-2">Reason</th>
              <th className="px-4 py-2">Waiting</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(data?.rows ?? []).map((r) => (
              <tr key={r.review_id} className={openRow?.review_id === r.review_id ? "bg-teal-50/40" : ""}>
                <td className="px-4 py-2.5">
                  <a href={props.detailHref(r.subject_id)} className="inline-flex items-center gap-1 text-teal-700 hover:underline">
                    #{r.subject_id} <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
                <td className="px-4 py-2.5 font-mono text-slate-800">{r.document_kind}</td>
                <td className="px-4 py-2.5">
                  {r.reason === "policy_requires_review" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">Manual</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">Auto → review</span>
                  )}
                  <div className="mt-0.5 font-mono text-[10px] text-slate-400">{r.provider}</div>
                </td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">{r.reason}</span>
                </td>
                <td className="px-4 py-2.5 text-slate-500">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{ago(r.created_at)}</span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {r.state === "queued" ? (
                    <button
                      disabled={busy === r.review_id}
                      onClick={() => assign(r)}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >Take</button>
                  ) : null}
                  <button
                    onClick={() => { setOpenRow(r); setNotes(""); }}
                    className="ml-1 rounded-md bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800"
                  >Review</button>
                </td>
              </tr>
            ))}
            {!isLoading && (data?.rows ?? []).length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">Queue is empty. All caught up.</td></tr>
            ) : null}
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">Loading…</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Review drawer */}
      {openRow ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 md:items-center">
          <div className="w-full max-w-2xl rounded-t-xl bg-white p-5 shadow-xl md:rounded-xl">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Review</div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {openRow.document_kind} · subject #{openRow.subject_id}
                </h3>
              </div>
              <button onClick={() => setOpenRow(null)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-md border border-slate-100 bg-slate-50 p-3 text-xs">
              <div>
                <div className="text-slate-500">Verification ID</div>
                <div className="font-mono text-slate-800">{openRow.verification_id}</div>
              </div>
              <div>
                <div className="text-slate-500">Provider</div>
                <div className="font-mono text-slate-800">{openRow.provider}</div>
              </div>
              <div>
                <div className="text-slate-500">Status</div>
                <div className="text-slate-800">{openRow.status}</div>
              </div>
              <div>
                <div className="text-slate-500">Confidence</div>
                <div className="text-slate-800">{openRow.confidence ?? "—"}</div>
              </div>
              {openRow.business_identifier ? (
                <div className="col-span-2">
                  <div className="text-slate-500">Business identifier</div>
                  <div className="font-mono text-slate-800">{openRow.business_identifier}</div>
                </div>
              ) : null}
              {openRow.status_reason ? (
                <div className="col-span-2">
                  <div className="text-slate-500">Reason</div>
                  <div className="text-rose-700">{openRow.status_reason}</div>
                </div>
              ) : null}
            </div>

            {openRow.verified_data ? (
              <details className="mt-3 rounded-md border border-slate-100 p-3">
                <summary className="cursor-pointer text-xs font-medium text-slate-700">Provider payload</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">
                  {JSON.stringify(openRow.verified_data, null, 2)}
                </pre>
              </details>
            ) : null}

            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-slate-600">Notes (visible in audit log & timeline)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-200 p-2 text-sm"
                placeholder="e.g. Matches uploaded document; PAN format valid."
              />
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <a
                href={props.detailHref(openRow.subject_id)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >Open profile</a>
              <button
                onClick={() => resolve(openRow, "rejected")}
                disabled={busy === openRow.review_id}
                className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              >Reject</button>
              <button
                onClick={() => resolve(openRow, "overridden")}
                disabled={busy === openRow.review_id}
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >Override</button>
              <button
                onClick={() => resolve(openRow, "verified")}
                disabled={busy === openRow.review_id}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >Verify</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
