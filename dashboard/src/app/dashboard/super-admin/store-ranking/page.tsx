"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Play, RefreshCw, Save, ListOrdered } from "lucide-react";

type Weights = {
  distance: number; deliverySpeed: number; rating: number; etaReliability: number;
  kptReliability: number; velocity: number; availability: number;
};
type PenaltyCaps = { cancellation: number; refund: number; complaint: number; oos: number };
type BoostCaps = { subscription: number; newMerchant: number; admin: number };
type Refs = {
  distanceRefKm: number; etaFastMin: number; etaSlowMin: number; ratingPriorMean: number;
  ratingMinVotes: number; velocityRefOrders: number;
  penaltyRateRef: { cancellation: number; refund: number; complaint: number; oos: number };
};
type Config = {
  profile: string; enabled: boolean; version: string; revision: number;
  weights: Weights; offerWeight: number; penaltyCaps: PenaltyCaps; boostCaps: BoostCaps;
  references: Refs; minSample: number; subscriptionPlanBoosts: Record<string, number>;
  updatedBy: string | null; updatedAt: string | null;
};
type PreviewRow = {
  rank: number; storeId: number; storeName: string | null; score: number; reliability: number;
  distanceKm: number; etaMin: number | null; subscriptionBoosted: boolean;
  breakdown: { signals: Record<string, number>; boosts: Record<string, number>; penalties: Record<string, number> };
};

const WEIGHT_KEYS: (keyof Weights)[] = ["distance", "deliverySpeed", "rating", "etaReliability", "kptReliability", "velocity", "availability"];
const WEIGHT_LABELS: Record<keyof Weights, string> = {
  distance: "Distance", deliverySpeed: "Delivery speed", rating: "Rating (Bayesian)",
  etaReliability: "ETA reliability", kptReliability: "KPT reliability", velocity: "Order velocity", availability: "Availability",
};
const PLAN_CODES = ["BASIC", "PREMIUM", "ENTERPRISE", "PRO"];

function NumberField({ label, value, onChange, step = 1, min, hint }: {
  label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input
        type="number" value={value} step={step} min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-mono text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
      {hint ? <span className="mt-0.5 block text-[10px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

export default function StoreRankingAdminPage() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [draft, setDraft] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ revision: number; enabled: boolean; updatedBy: string | null; createdAt: string }>>([]);

  const [lat, setLat] = useState("29.3406");
  const [lng, setLng] = useState("76.9828");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewMeta, setPreviewMeta] = useState<{ candidateCount: number; version: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [cRes, hRes] = await Promise.all([
        fetch("/api/super-admin/store-ranking/config?profile=HOME_FOOD", { cache: "no-store" }),
        fetch("/api/super-admin/store-ranking/history?profile=HOME_FOOD", { cache: "no-store" }),
      ]);
      const cJson = await cRes.json();
      if (!cRes.ok || !cJson.success) throw new Error(cJson.error || `Load failed (${cRes.status})`);
      setCfg(cJson.config); setDraft(cJson.config);
      const hJson = await hRes.json().catch(() => ({}));
      if (hRes.ok && hJson.success) setHistory(hJson.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(() => JSON.stringify(cfg) !== JSON.stringify(draft), [cfg, draft]);

  const patch = (next: Partial<Config>) => setDraft((d) => (d ? { ...d, ...next } : d));
  const patchWeight = (k: keyof Weights, v: number) => setDraft((d) => (d ? { ...d, weights: { ...d.weights, [k]: v } } : d));
  const patchRef = (k: keyof Omit<Refs, "penaltyRateRef">, v: number) => setDraft((d) => (d ? { ...d, references: { ...d.references, [k]: v } } : d));
  const patchRateRef = (k: keyof Refs["penaltyRateRef"], v: number) => setDraft((d) => (d ? { ...d, references: { ...d.references, penaltyRateRef: { ...d.references.penaltyRateRef, [k]: v } } } : d));
  const patchPenaltyCap = (k: keyof PenaltyCaps, v: number) => setDraft((d) => (d ? { ...d, penaltyCaps: { ...d.penaltyCaps, [k]: v } } : d));
  const patchBoostCap = (k: keyof BoostCaps, v: number) => setDraft((d) => (d ? { ...d, boostCaps: { ...d.boostCaps, [k]: v } } : d));
  const patchPlanBoost = (code: string, v: number) => setDraft((d) => (d ? { ...d, subscriptionPlanBoosts: { ...d.subscriptionPlanBoosts, [code]: v } } : d));

  const save = async () => {
    if (!draft) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/super-admin/store-ranking/config", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: "HOME_FOOD", enabled: draft.enabled, weights: draft.weights, offerWeight: draft.offerWeight,
          penaltyCaps: draft.penaltyCaps, boostCaps: draft.boostCaps, references: draft.references,
          minSample: draft.minSample, subscriptionPlanBoosts: draft.subscriptionPlanBoosts,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || json.error || `Save failed (${res.status})`);
      setCfg(json.config); setDraft(json.config); setSavedAt(Date.now());
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async () => {
    setPreviewLoading(true); setPreviewError(null);
    try {
      const res = await fetch("/api/super-admin/store-ranking/preview", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat: Number(lat), lng: Number(lng), profile: "HOME_FOOD", limit: 20, configOverride: draft ?? undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Preview failed (${res.status})`);
      setPreviewRows(json.results ?? []);
      setPreviewMeta({ candidateCount: json.candidateCount ?? 0, version: json.version ?? "" });
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/super-admin" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Super admin
          </Link>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Food store ranking</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Tune how the customer app orders food stores near each customer. Eligibility/serviceability is a hard
            filter applied first — this only re-orders already-serviceable stores. Changes take effect within ~30s.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Reload
        </button>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      {loading || !draft ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-indigo-500" /></div>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">HOME_FOOD policy</h2>
                <p className="text-xs text-slate-500">Version {draft.version} · revision {draft.revision}
                  {draft.updatedAt ? ` · updated ${new Date(draft.updatedAt).toLocaleString()}${draft.updatedBy ? ` by ${draft.updatedBy}` : ""}` : ""}</p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={draft.enabled} onChange={(e) => patch({ enabled: e.target.checked })} className="h-5 w-5 accent-emerald-600" />
                <span className={`text-sm font-bold ${draft.enabled ? "text-emerald-700" : "text-slate-400"}`}>{draft.enabled ? "ENABLED (live)" : "Disabled"}</span>
              </label>
            </div>

            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Signal weights (max points each)</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {WEIGHT_KEYS.map((k) => (
                <NumberField key={k} label={WEIGHT_LABELS[k]} value={draft.weights[k]} step={0.5} min={0} onChange={(v) => patchWeight(k, v)} />
              ))}
              <NumberField label="Offer value" value={draft.offerWeight} step={0.5} min={0} onChange={(v) => patch({ offerWeight: v })} />
            </div>

            <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Penalty caps (max points subtracted)</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <NumberField label="Cancellation" value={draft.penaltyCaps.cancellation} step={0.5} min={0} onChange={(v) => patchPenaltyCap("cancellation", v)} />
              <NumberField label="Refund" value={draft.penaltyCaps.refund} step={0.5} min={0} onChange={(v) => patchPenaltyCap("refund", v)} />
              <NumberField label="Complaint" value={draft.penaltyCaps.complaint} step={0.5} min={0} onChange={(v) => patchPenaltyCap("complaint", v)} />
              <NumberField label="Out-of-stock" value={draft.penaltyCaps.oos} step={0.5} min={0} onChange={(v) => patchPenaltyCap("oos", v)} />
            </div>

            <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Boost caps (max points added — bounded so paid/exploration can nudge, never dominate)</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <NumberField label="Subscription" value={draft.boostCaps.subscription} step={0.5} min={0} onChange={(v) => patchBoostCap("subscription", v)} />
              <NumberField label="New merchant" value={draft.boostCaps.newMerchant} step={0.5} min={0} onChange={(v) => patchBoostCap("newMerchant", v)} />
              <NumberField label="Admin" value={draft.boostCaps.admin} step={0.5} min={0} onChange={(v) => patchBoostCap("admin", v)} />
            </div>

            <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">References & windows</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <NumberField label="Distance ref (km)" hint="score 0 at this km" value={draft.references.distanceRefKm} step={0.5} min={0.5} onChange={(v) => patchRef("distanceRefKm", v)} />
              <NumberField label="ETA fast (min)" hint="speed=1 at/below" value={draft.references.etaFastMin} step={1} min={1} onChange={(v) => patchRef("etaFastMin", v)} />
              <NumberField label="ETA slow (min)" hint="speed=0 at/above" value={draft.references.etaSlowMin} step={1} min={2} onChange={(v) => patchRef("etaSlowMin", v)} />
              <NumberField label="Rating prior (C)" value={draft.references.ratingPriorMean} step={0.1} min={0} onChange={(v) => patchRef("ratingPriorMean", v)} />
              <NumberField label="Rating min votes (m)" value={draft.references.ratingMinVotes} step={1} min={0} onChange={(v) => patchRef("ratingMinVotes", v)} />
              <NumberField label="Velocity ref (orders)" value={draft.references.velocityRefOrders} step={10} min={1} onChange={(v) => patchRef("velocityRefOrders", v)} />
              <NumberField label="Min sample" hint="below this, rates/velocity neutral" value={draft.minSample} step={1} min={0} onChange={(v) => patch({ minSample: v })} />
            </div>

            <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Penalty rate references (rate at which a penalty reaches its cap)</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <NumberField label="Cancellation" value={draft.references.penaltyRateRef.cancellation} step={0.01} min={0.01} onChange={(v) => patchRateRef("cancellation", v)} />
              <NumberField label="Refund" value={draft.references.penaltyRateRef.refund} step={0.01} min={0.01} onChange={(v) => patchRateRef("refund", v)} />
              <NumberField label="Complaint" value={draft.references.penaltyRateRef.complaint} step={0.01} min={0.01} onChange={(v) => patchRateRef("complaint", v)} />
              <NumberField label="Out-of-stock" value={draft.references.penaltyRateRef.oos} step={0.01} min={0.01} onChange={(v) => patchRateRef("oos", v)} />
            </div>

            <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Subscription plan boosts (raw points, capped by the subscription boost cap)</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {PLAN_CODES.map((code) => (
                <NumberField key={code} label={code} value={draft.subscriptionPlanBoosts[code] ?? 0} step={0.5} min={0} onChange={(v) => patchPlanBoost(code, v)} />
              ))}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              {savedAt ? <span className="mr-auto inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><Check className="h-3.5 w-3.5" /> Saved</span> : null}
              <button type="button" onClick={() => cfg && setDraft(cfg)} disabled={!dirty || saving}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Reset</button>
              <button type="button" onClick={() => void save()} disabled={!dirty || saving}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save policy
              </button>
            </div>
          </section>

          {/* Preview simulator */}
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-6 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <ListOrdered className="h-5 w-5 text-indigo-700" />
              <h2 className="text-lg font-bold text-slate-900">Preview — rank at a location</h2>
            </div>
            <p className="mb-3 text-xs text-slate-500">Simulates the ranking (as-if-enabled) with your unsaved edits, using live metrics + subscriptions. Distances are straight-line for the preview.</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs"><span className="mb-1 block text-slate-500">Latitude</span>
                <input value={lat} onChange={(e) => setLat(e.target.value)} className="w-32 rounded-md border border-slate-200 px-2 py-1.5 font-mono text-sm" /></label>
              <label className="text-xs"><span className="mb-1 block text-slate-500">Longitude</span>
                <input value={lng} onChange={(e) => setLng(e.target.value)} className="w-32 rounded-md border border-slate-200 px-2 py-1.5 font-mono text-sm" /></label>
              <button type="button" onClick={() => void runPreview()} disabled={previewLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run preview
              </button>
              {previewMeta ? <span className="text-xs text-slate-500">{previewMeta.candidateCount} eligible candidates · {previewMeta.version}</span> : null}
            </div>
            {previewError ? <p className="mt-2 text-xs font-semibold text-red-600">{previewError}</p> : null}
            {previewRows.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-1">#</th><th className="px-2 py-1">Store</th><th className="px-2 py-1">Score</th>
                      <th className="px-2 py-1">Dist</th><th className="px-2 py-1">ETA</th><th className="px-2 py-1">Top signals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r) => {
                      const sig = Object.entries(r.breakdown.signals).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 3);
                      const pen = Object.entries(r.breakdown.penalties);
                      return (
                        <tr key={r.storeId} className="border-t border-slate-100">
                          <td className="px-2 py-1.5 font-mono text-slate-700">{r.rank}</td>
                          <td className="px-2 py-1.5 font-medium text-slate-800">{r.storeName ?? `#${r.storeId}`}{r.subscriptionBoosted ? <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700">SUB</span> : null}</td>
                          <td className="px-2 py-1.5 font-mono font-semibold text-slate-900">{r.score}</td>
                          <td className="px-2 py-1.5 font-mono text-slate-600">{r.distanceKm}km</td>
                          <td className="px-2 py-1.5 font-mono text-slate-600">{r.etaMin != null ? `${Math.round(r.etaMin)}m` : "—"}</td>
                          <td className="px-2 py-1.5 text-[11px] text-slate-500">
                            {sig.map(([k, v]) => `${k} ${v}`).join(" · ")}
                            {pen.length > 0 ? <span className="text-red-600"> · {pen.map(([k, v]) => `${k} ${v}`).join(" ")}</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          {history.length > 0 ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-lg font-bold text-slate-900">Change history</h2>
              <ul className="space-y-1 text-xs text-slate-600">
                {history.slice(0, 15).map((h) => (
                  <li key={h.revision} className="flex items-center gap-2">
                    <span className="font-mono text-slate-800">rev {h.revision}</span>
                    <span className={h.enabled ? "text-emerald-600" : "text-slate-400"}>{h.enabled ? "enabled" : "disabled"}</span>
                    <span>{new Date(h.createdAt).toLocaleString()}</span>
                    {h.updatedBy ? <span className="text-slate-400">by {h.updatedBy}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
