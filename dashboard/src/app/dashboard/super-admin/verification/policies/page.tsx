"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { ShieldCheck, Power, RefreshCw } from "lucide-react";

type Policy = {
  id: number;
  subject_type: string;
  document_kind: string;
  mode: "auto" | "manual" | "hybrid" | "disabled";
};

type Switch = {
  id: number;
  provider: string;
  document_kind: string | null;
  state: "enabled" | "disabled" | "force_manual" | "force_hybrid";
  reason: string | null;
};

const MODES: Policy["mode"][] = ["auto", "manual", "hybrid", "disabled"];
const STATES: Switch["state"][] = ["enabled", "disabled", "force_manual", "force_hybrid"];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Human-friendly mode name for the pill. */
function modeLabel(m: Policy["mode"]): string {
  switch (m) {
    case "auto": return "Auto";
    case "manual": return "Manual";
    case "hybrid": return "Hybrid";
    case "disabled": return "Disabled";
  }
}

function modePillClass(m: Policy["mode"]): string {
  switch (m) {
    case "auto": return "bg-emerald-50 text-emerald-700";
    case "manual": return "bg-slate-100 text-slate-700";
    case "hybrid": return "bg-violet-50 text-violet-700";
    case "disabled": return "bg-rose-50 text-rose-700";
  }
}

function stateBadge(s: Switch["state"]): string {
  switch (s) {
    case "enabled": return "bg-emerald-50 text-emerald-700";
    case "disabled": return "bg-rose-50 text-rose-700";
    case "force_manual": return "bg-amber-50 text-amber-700";
    case "force_hybrid": return "bg-indigo-50 text-indigo-700";
  }
}

export default function VerificationPolicyCenterPage() {
  const { data, isLoading, error } = useSWR<{ policies: Policy[]; switches: Switch[] }>(
    "/api/super-admin/verification/policies",
    fetcher,
    { refreshInterval: 15_000 },
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [bulkSubject, setBulkSubject] = useState<"rider" | "merchant_store" | "">("");
  const [bulkMode, setBulkMode] = useState<Policy["mode"]>("manual");
  // Until the admin picks a mode themselves, the dropdown mirrors the CURRENT
  // dominant mode of the selected subject's policies (so "Hybrid everywhere"
  // shows Hybrid, not a stale "Manual" default).
  const [bulkModeTouched, setBulkModeTouched] = useState(false);
  const [reason, setReason] = useState("");

  const grouped = useMemo(() => {
    const g: Record<string, Policy[]> = {};
    for (const p of data?.policies ?? []) {
      (g[p.subject_type] ??= []).push(p);
    }
    return g;
  }, [data]);

  /** Dominant (most common) current mode across the policies in scope. */
  const currentDominantMode = useMemo<Policy["mode"] | null>(() => {
    const scoped = (data?.policies ?? []).filter(
      (p) => !bulkSubject || p.subject_type === bulkSubject,
    );
    if (scoped.length === 0) return null;
    const counts = new Map<Policy["mode"], number>();
    for (const p of scoped) counts.set(p.mode, (counts.get(p.mode) ?? 0) + 1);
    let best: Policy["mode"] = scoped[0]!.mode;
    let bestCount = 0;
    for (const [m, c] of counts) {
      if (c > bestCount) { best = m; bestCount = c; }
    }
    return best;
  }, [data, bulkSubject]);

  const scopedModesMixed = useMemo(() => {
    const scoped = (data?.policies ?? []).filter(
      (p) => !bulkSubject || p.subject_type === bulkSubject,
    );
    return new Set(scoped.map((p) => p.mode)).size > 1;
  }, [data, bulkSubject]);

  useEffect(() => {
    if (!bulkModeTouched && currentDominantMode) setBulkMode(currentDominantMode);
  }, [bulkModeTouched, currentDominantMode]);

  async function patch(body: Record<string, unknown>): Promise<void> {
    setBusy(JSON.stringify(body));
    try {
      const res = await fetch("/api/super-admin/verification/policies", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, reason: reason.trim() || null }),
      });
      if (!res.ok) {
        const text = await res.text();
        alert(`Update failed: ${text}`);
        return;
      }
      await mutate("/api/super-admin/verification/policies");
    } finally { setBusy(null); }
  }

  async function applyBulk(): Promise<void> {
    if (!confirm(`Set ${bulkSubject || "all subjects"} → ${modeLabel(bulkMode)}?`)) return;
    await patch({
      kind: "bulk",
      subjectType: bulkSubject || undefined,
      mode: bulkMode,
    });
    // Re-sync the dropdown with the refreshed policies.
    setBulkModeTouched(false);
  }

  return (
    <div className="p-6">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-teal-700">
        <ShieldCheck className="h-3.5 w-3.5" /> Verification
      </div>
      <h1 className="text-2xl font-semibold text-slate-900">Policy Center</h1>
      <div className="mt-1 flex gap-3 text-xs text-slate-500">
        <a href="/dashboard/super-admin/verification/analytics" className="text-teal-700 hover:underline">Analytics ↗</a>
        <a href="/dashboard/super-admin/verification/rider-queue" className="text-teal-700 hover:underline">Rider queue ↗</a>
        <a href="/dashboard/super-admin/verification/merchant-queue" className="text-teal-700 hover:underline">Merchant queue ↗</a>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">
        Control how each document type is verified. <b>Manual</b> is the safe fallback — an
        agent checks by hand. <b>Auto</b> sends the doc to Cashfree; a failure falls back to a
        manual review row for the agent queue. <b>Hybrid</b> auto-verifies then routes
        low-confidence hits to an agent. <b>Disabled</b> stops accepting this doc entirely.
        Kill-switches below cut all Cashfree traffic instantly if the provider goes bad.
      </p>

      {error ? (
        <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Could not load policies.
        </div>
      ) : null}

      {/* Bulk quick actions — app-wide switch */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Bulk apply</h2>
          <button
            onClick={() => mutate("/api/super-admin/verification/policies")}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">App / subject</label>
            <select
              value={bulkSubject}
              onChange={(e) => {
                setBulkSubject(e.target.value as "rider" | "merchant_store" | "");
                // Re-sync the mode dropdown to the newly selected subject's
                // current mode.
                setBulkModeTouched(false);
              }}
              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="">All subjects</option>
              <option value="rider">Rider only</option>
              <option value="merchant_store">Merchant only</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Set mode to</label>
            <select
              value={bulkMode}
              onChange={(e) => {
                setBulkMode(e.target.value as Policy["mode"]);
                setBulkModeTouched(true);
              }}
              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            >
              {MODES.map((m) => <option key={m} value={m}>{modeLabel(m)}</option>)}
            </select>
            {currentDominantMode ? (
              <p className="mt-1 text-[11px] text-slate-500">
                Current: <span className="font-semibold">{modeLabel(currentDominantMode)}</span>
                {scopedModesMixed ? " (mixed — most common shown)" : ""}
              </p>
            ) : null}
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">Reason (audit log)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Rolling out auto PAN to riders"
              className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={applyBulk}
            disabled={busy !== null}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >Apply</button>
        </div>
      </div>

      {/* Per-doc grid */}
      <div className="mt-6 space-y-6">
        {Object.entries(grouped).map(([subject, rows]) => (
          <div key={subject} className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-900">
                {subject === "rider" ? "Rider onboarding" :
                 subject === "merchant_store" ? "Merchant onboarding" :
                 subject.replace(/_/g, " ")}
              </h3>
              <div className="mt-0.5 text-xs text-slate-500">{rows.length} documents</div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2">Document</th>
                  <th className="px-5 py-2">Current</th>
                  <th className="px-5 py-2 text-right">Change to</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.sort((a, b) => a.document_kind.localeCompare(b.document_kind)).map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-2.5 font-mono text-slate-800">{p.document_kind}</td>
                    <td className="px-5 py-2.5">
                      <span className={"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " + modePillClass(p.mode)}>
                        {modeLabel(p.mode)}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <div className="inline-flex overflow-hidden rounded-md border border-slate-200">
                        {MODES.map((m) => (
                          <button
                            key={m}
                            disabled={busy !== null || m === p.mode}
                            onClick={() =>
                              patch({
                                kind: "single",
                                policyId: Number(p.id),
                                mode: m,
                              })
                            }
                            className={
                              "px-2 py-1 text-xs " +
                              (m === p.mode
                                ? "bg-slate-900 text-white cursor-default"
                                : "bg-white text-slate-600 hover:bg-slate-50")
                            }
                          >{modeLabel(m).split(" ")[0]}</button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading…</div>
        ) : null}
      </div>

      {/* Kill switches */}
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Power className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Provider kill switches</h2>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Cuts Cashfree traffic without touching per-doc policy. `disabled` and `force_manual`
          both route every doc straight to the agent queue; `force_hybrid` keeps auto-verify on
          but flags results for agent review.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Document</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2 text-right">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.switches ?? []).map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 font-mono text-slate-800">{s.provider}</td>
                  <td className="px-3 py-2 font-mono text-slate-600">{s.document_kind ?? "(all)"}</td>
                  <td className="px-3 py-2">
                    <span className={"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " + stateBadge(s.state)}>
                      {s.state}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex overflow-hidden rounded-md border border-slate-200">
                      {STATES.map((st) => (
                        <button
                          key={st}
                          disabled={busy !== null || st === s.state}
                          onClick={() =>
                            patch({
                              kind: "switch",
                              switchId: Number(s.id),
                              state: st,
                            })
                          }
                          className={
                            "px-2 py-1 text-xs " +
                            (st === s.state
                              ? "bg-slate-900 text-white cursor-default"
                              : "bg-white text-slate-600 hover:bg-slate-50")
                          }
                        >{st}</button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
