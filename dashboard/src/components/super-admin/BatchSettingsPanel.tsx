"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save, Check, Layers } from "lucide-react";

type Service = "food" | "parcel" | "person_ride";
const LABELS: Record<Service, string> = { food: "Food", parcel: "Parcel", person_ride: "Person Ride" };

type Row = {
  service_type: Service;
  enabled: boolean;
  max_pickup_detour_km: number;
  max_pickup_detour_min: number;
  max_extra_drop_delay_min: number;
  avg_speed_kmph: number;
  pickup_service_min: number;
  drop_service_min: number;
  same_store_bonus: number;
  batch_window_sec: number;
  updated_by?: string | null;
  updated_at?: string | null;
};

const NUM_FIELDS: Array<{ key: keyof Row; label: string; step?: number }> = [
  { key: "max_pickup_detour_km", label: "Max pickup detour (km)", step: 0.5 },
  { key: "max_pickup_detour_min", label: "Max pickup detour (min)", step: 1 },
  { key: "max_extra_drop_delay_min", label: "Max extra drop delay (min)", step: 1 },
  { key: "avg_speed_kmph", label: "Avg speed (km/h)", step: 1 },
  { key: "pickup_service_min", label: "Pickup wait (min)", step: 0.5 },
  { key: "drop_service_min", label: "Drop handover (min)", step: 0.5 },
  { key: "same_store_bonus", label: "Same-store bonus", step: 0.5 },
  { key: "batch_window_sec", label: "Batch window (sec)", step: 1 },
];

export function BatchSettingsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/dispatch-batch-config", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Load failed (${res.status})`);
      setRows(json.config);
      setDraft(JSON.parse(JSON.stringify(json.config)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(() => JSON.stringify(rows) !== JSON.stringify(draft), [rows, draft]);
  const patch = (svc: Service, next: Partial<Row>) =>
    setDraft((d) => d.map((r) => (r.service_type === svc ? { ...r, ...next } : r)));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/dispatch-batch-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          config: draft.map((r) => ({
            serviceType: r.service_type,
            enabled: Boolean(r.enabled),
            maxPickupDetourKm: Number(r.max_pickup_detour_km),
            maxPickupDetourMin: Number(r.max_pickup_detour_min),
            maxExtraDropDelayMin: Number(r.max_extra_drop_delay_min),
            avgSpeedKmph: Number(r.avg_speed_kmph),
            pickupServiceMin: Number(r.pickup_service_min),
            dropServiceMin: Number(r.drop_service_min),
            sameStoreBonus: Number(r.same_store_bonus),
            batchWindowSec: Math.trunc(Number(r.batch_window_sec)),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Save failed (${res.status})`);
      setRows(json.config);
      setDraft(JSON.parse(JSON.stringify(json.config)));
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700"><Layers className="h-5 w-5" /></div>
        <div>
          <h3 className="text-sm font-bold text-gray-900">Multi-order batching</h3>
          <p className="max-w-2xl text-xs text-gray-500">
            When enabled for a service, a rider who already has a pre-pickup order may be offered a
            second one only if the route stays feasible — SLA always wins (a batch that would make any
            delivery late is rejected), pickup detour and extra-drop-delay are capped, and Person Ride
            is never batched. Enforced by the batch engine; changes apply within ~30s.
          </p>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {draft.map((r) => {
          const disabledService = r.service_type === "person_ride";
          return (
            <div key={r.service_type} className={`rounded-xl border p-4 ${r.enabled && !disabledService ? "border-violet-200 bg-violet-50/30" : "border-gray-200 bg-gray-50/40"}`}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">{LABELS[r.service_type]}</span>
                {disabledService ? (
                  <span className="text-[11px] font-semibold uppercase text-gray-400">Never batched</span>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={r.enabled} onChange={(e) => patch(r.service_type, { enabled: e.target.checked })} className="h-4 w-4 accent-violet-600" />
                    <span className={`text-[11px] font-semibold uppercase ${r.enabled ? "text-violet-700" : "text-gray-400"}`}>{r.enabled ? "On" : "Off"}</span>
                  </label>
                )}
              </div>
              {!disabledService && (
                <div className="grid grid-cols-2 gap-2">
                  {NUM_FIELDS.map((f) => (
                    <label key={String(f.key)} className="block">
                      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">{f.label}</span>
                      <input
                        type="number" step={f.step ?? 1} min={0}
                        value={Number(r[f.key] ?? 0)}
                        onChange={(e) => patch(r.service_type, { [f.key]: Number(e.target.value) } as Partial<Row>)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm tabular-nums"
                      />
                    </label>
                  ))}
                </div>
              )}
              {r.updated_at ? <p className="mt-2 text-[10px] text-gray-400">Updated {new Date(r.updated_at).toLocaleString()}{r.updated_by ? ` by ${r.updated_by}` : ""}</p> : null}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-3">
        {savedAt ? <span className="mr-auto inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><Check className="h-3.5 w-3.5" /> Saved — applies within ~30s</span> : null}
        <button type="button" onClick={() => setDraft(JSON.parse(JSON.stringify(rows)))} disabled={!dirty || saving} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40">Reset</button>
        <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save batch settings
        </button>
      </div>
    </div>
  );
}
