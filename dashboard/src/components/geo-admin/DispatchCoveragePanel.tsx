"use client";

/**
 * Dispatch Coverage panel (Dispatch Engine Phase 1 UI).
 *
 * Two sections:
 *  1. Global defaults per service (platform_rider_dispatch_strategy_config +
 *     platform_rider_service_radius) — service radius, ordering strategy, auto-retry,
 *     pre-pickup first-mile rate + funding.
 *  2. Per-location coverage overrides (geo_coverage) — self-pickup / delivery /
 *     internal-rider / 3PL toggles + optional radius/strategy overrides, matched
 *     pincode > city > state > country. Service enable/disable (food/parcel/ride)
 *     is NOT here — that stays the Geo hierarchy (tree/flat views).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Save, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ServiceType = "food" | "parcel" | "person_ride";
type Strategy = "nearest" | "score" | "balanced" | "hybrid";
type Funding = "company" | "customer" | "shared";
type MatchType = "pincode" | "city" | "state" | "country";

const SERVICES: { code: ServiceType; label: string }[] = [
  { code: "food", label: "Food" },
  { code: "parcel", label: "Parcel" },
  { code: "person_ride", label: "Ride" },
];
const STRATEGIES: Strategy[] = ["nearest", "score", "balanced", "hybrid"];
const FUNDING: Funding[] = ["company", "customer", "shared"];
const MATCH_TYPES: MatchType[] = ["pincode", "city", "state", "country"];

type GlobalConfig = {
  service_type: ServiceType;
  service_radius_meters: number;
  strategy: Strategy;
  retry_interval_seconds: number;
  max_retry_duration_seconds: number;
  pre_pickup_rate_per_km: number;
  pre_pickup_funding: Funding;
  enabled: boolean;
};

type CoverageRow = {
  id: number;
  service_type: ServiceType;
  match_type: MatchType;
  match_value: string;
  enabled: boolean;
  self_pickup_enabled: boolean;
  delivery_enabled: boolean;
  internal_rider_enabled: boolean;
  tpl_enabled: boolean;
  service_radius_meters: number | null;
  dispatch_radius_meters: number | null;
  max_retry_duration_seconds: number | null;
  strategy: Strategy | null;
  notes: string | null;
};

type NewCoverage = {
  service_type: ServiceType;
  match_type: MatchType;
  match_value: string;
  enabled: boolean;
  self_pickup_enabled: boolean;
  delivery_enabled: boolean;
  internal_rider_enabled: boolean;
  tpl_enabled: boolean;
  service_radius_meters: string;
  dispatch_radius_meters: string;
  strategy: Strategy | "";
};

const EMPTY_NEW: NewCoverage = {
  service_type: "food",
  match_type: "pincode",
  match_value: "",
  enabled: true,
  self_pickup_enabled: true,
  delivery_enabled: true,
  internal_rider_enabled: true,
  tpl_enabled: false,
  service_radius_meters: "",
  dispatch_radius_meters: "",
  strategy: "",
};

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";
const labelCls = "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-left"
    >
      <span
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition",
          checked ? "bg-teal-600" : "bg-slate-300"
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition",
            checked ? "translate-x-4" : "translate-x-0.5"
          )}
        />
      </span>
      <span className="text-xs font-medium text-slate-700">{label}</span>
    </button>
  );
}

export function DispatchCoveragePanel() {
  const [globals, setGlobals] = useState<GlobalConfig[]>([]);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingService, setSavingService] = useState<ServiceType | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<NewCoverage>(EMPTY_NEW);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, covRes] = await Promise.all([
        fetch("/api/super-admin/dispatch-strategy-config"),
        fetch("/api/super-admin/geo-coverage"),
      ]);
      const cfg = await cfgRes.json();
      const cov = await covRes.json();
      if (!cfgRes.ok) throw new Error(cfg?.error ?? "Failed to load config");
      if (!covRes.ok) throw new Error(cov?.error ?? "Failed to load coverage");

      const radii: Record<string, number> = {};
      for (const r of cfg.service_radii ?? []) radii[r.service_type] = Number(r.radius_meters);
      const merged: GlobalConfig[] = SERVICES.map(({ code }) => {
        const sc = (cfg.strategy_configs ?? []).find(
          (s: { service_type: string }) => s.service_type === code
        );
        return {
          service_type: code,
          service_radius_meters: radii[code] ?? 0,
          strategy: (sc?.strategy as Strategy) ?? "nearest",
          retry_interval_seconds: Number(sc?.retry_interval_seconds ?? 300),
          max_retry_duration_seconds: Number(sc?.max_retry_duration_seconds ?? 1200),
          pre_pickup_rate_per_km: Number(sc?.pre_pickup_rate_per_km ?? 0),
          pre_pickup_funding: (sc?.pre_pickup_funding as Funding) ?? "company",
          enabled: sc?.enabled !== false,
        };
      });
      setGlobals(merged);
      setCoverage(cov.coverage ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load dispatch coverage");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateGlobal = useCallback(
    (service: ServiceType, patch: Partial<GlobalConfig>) => {
      setGlobals((prev) =>
        prev.map((g) => (g.service_type === service ? { ...g, ...patch } : g))
      );
    },
    []
  );

  const saveGlobal = useCallback(async (g: GlobalConfig) => {
    setSavingService(g.service_type);
    try {
      const res = await fetch("/api/super-admin/dispatch-strategy-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          service_type: g.service_type,
          service_radius_meters: Math.round(g.service_radius_meters),
          strategy: g.strategy,
          retry_interval_seconds: Math.round(g.retry_interval_seconds),
          max_retry_duration_seconds: Math.round(g.max_retry_duration_seconds),
          pre_pickup_rate_per_km: g.pre_pickup_rate_per_km,
          pre_pickup_funding: g.pre_pickup_funding,
          enabled: g.enabled,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Save failed");
      toast.success(`${g.service_type} defaults saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingService(null);
    }
  }, []);

  const saveCoverage = useCallback(async () => {
    if (!form.match_value.trim()) {
      toast.error("Enter a pincode / city / state / country value");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/super-admin/geo-coverage", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          service_type: form.service_type,
          match_type: form.match_type,
          match_value: form.match_value.trim(),
          enabled: form.enabled,
          self_pickup_enabled: form.self_pickup_enabled,
          delivery_enabled: form.delivery_enabled,
          internal_rider_enabled: form.internal_rider_enabled,
          tpl_enabled: form.tpl_enabled,
          service_radius_meters: form.service_radius_meters
            ? Number(form.service_radius_meters)
            : null,
          dispatch_radius_meters: form.dispatch_radius_meters
            ? Number(form.dispatch_radius_meters)
            : null,
          strategy: form.strategy || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Save failed");
      toast.success("Coverage rule saved");
      setForm(EMPTY_NEW);
      setAddOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setAdding(false);
    }
  }, [form, load]);

  const deleteCoverage = useCallback(
    async (id: number) => {
      try {
        const res = await fetch(`/api/super-admin/geo-coverage?id=${id}`, {
          method: "DELETE",
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error ?? "Delete failed");
        toast.success("Coverage rule removed");
        setCoverage((prev) => prev.filter((r) => r.id !== id));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    },
    []
  );

  const grouped = useMemo(() => {
    const by: Record<ServiceType, CoverageRow[]> = { food: [], parcel: [], person_ride: [] };
    for (const r of coverage) by[r.service_type]?.push(r);
    return by;
  }, [coverage]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Global defaults */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm sm:p-5">
        <div className="mb-1 flex items-center gap-2">
          <Truck className="h-4 w-4 text-teal-700" aria-hidden />
          <h2 className="text-sm font-bold text-slate-900">Global dispatch defaults</h2>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Applied everywhere unless a location override below says otherwise. Service
          radius = how far a customer may place a delivery order (separate from the wave
          search radius). Pre-pickup rate pays the rider ₹/km of pickup distance; the
          customer price never changes.
        </p>
        <div className="grid gap-3 lg:grid-cols-3">
          {globals.map((g) => (
            <div key={g.service_type} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold capitalize text-slate-800">
                  {g.service_type.replace("person_ride", "Ride")}
                </span>
                <Toggle
                  checked={g.enabled}
                  onChange={(v) => updateGlobal(g.service_type, { enabled: v })}
                  label="Enabled"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2 flex flex-col gap-1">
                  <span className={labelCls}>Service radius (m)</span>
                  <input
                    type="number"
                    className={inputCls}
                    value={g.service_radius_meters}
                    onChange={(e) =>
                      updateGlobal(g.service_type, {
                        service_radius_meters: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Strategy</span>
                  <select
                    className={inputCls}
                    value={g.strategy}
                    onChange={(e) =>
                      updateGlobal(g.service_type, { strategy: e.target.value as Strategy })
                    }
                  >
                    {STRATEGIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Pre-pickup ₹/km</span>
                  <input
                    type="number"
                    step="0.5"
                    className={inputCls}
                    value={g.pre_pickup_rate_per_km}
                    onChange={(e) =>
                      updateGlobal(g.service_type, {
                        pre_pickup_rate_per_km: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Funding</span>
                  <select
                    className={inputCls}
                    value={g.pre_pickup_funding}
                    onChange={(e) =>
                      updateGlobal(g.service_type, {
                        pre_pickup_funding: e.target.value as Funding,
                      })
                    }
                  >
                    {FUNDING.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Retry every (s)</span>
                  <input
                    type="number"
                    className={inputCls}
                    value={g.retry_interval_seconds}
                    onChange={(e) =>
                      updateGlobal(g.service_type, {
                        retry_interval_seconds: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelCls}>Max retry (s)</span>
                  <input
                    type="number"
                    className={inputCls}
                    value={g.max_retry_duration_seconds}
                    onChange={(e) =>
                      updateGlobal(g.service_type, {
                        max_retry_duration_seconds: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => void saveGlobal(g)}
                disabled={savingService === g.service_type}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {savingService === g.service_type ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save {g.service_type.replace("person_ride", "ride")}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Location overrides */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Location overrides</h2>
            <p className="text-xs text-slate-500">
              Self-pickup / delivery / internal-rider / 3PL per location. Matched
              pincode &gt; city &gt; state &gt; country. Blank radius/strategy inherit the
              global defaults above.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700"
            >
              <Plus className="h-3.5 w-3.5" /> Add rule
            </button>
          </div>
        </div>

        {addOpen ? (
          <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50/40 p-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Service</span>
                <select
                  className={inputCls}
                  value={form.service_type}
                  onChange={(e) => setForm({ ...form, service_type: e.target.value as ServiceType })}
                >
                  {SERVICES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Match type</span>
                <select
                  className={inputCls}
                  value={form.match_type}
                  onChange={(e) => setForm({ ...form, match_type: e.target.value as MatchType })}
                >
                  {MATCH_TYPES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Value ({form.match_type})</span>
                <input
                  className={inputCls}
                  placeholder={form.match_type === "pincode" ? "700001" : "kolkata"}
                  value={form.match_value}
                  onChange={(e) => setForm({ ...form, match_value: e.target.value })}
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-4">
              <Toggle checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label="Enabled" />
              <Toggle
                checked={form.self_pickup_enabled}
                onChange={(v) => setForm({ ...form, self_pickup_enabled: v })}
                label="Self-pickup"
              />
              <Toggle
                checked={form.delivery_enabled}
                onChange={(v) => setForm({ ...form, delivery_enabled: v })}
                label="Delivery"
              />
              <Toggle
                checked={form.internal_rider_enabled}
                onChange={(v) => setForm({ ...form, internal_rider_enabled: v })}
                label="Internal rider"
              />
              <Toggle
                checked={form.tpl_enabled}
                onChange={(v) => setForm({ ...form, tpl_enabled: v })}
                label="3PL"
              />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Service radius (m) — optional</span>
                <input
                  type="number"
                  className={inputCls}
                  placeholder="inherit"
                  value={form.service_radius_meters}
                  onChange={(e) => setForm({ ...form, service_radius_meters: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Dispatch radius (m) — optional</span>
                <input
                  type="number"
                  className={inputCls}
                  placeholder="inherit"
                  value={form.dispatch_radius_meters}
                  onChange={(e) => setForm({ ...form, dispatch_radius_meters: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Strategy — optional</span>
                <select
                  className={inputCls}
                  value={form.strategy}
                  onChange={(e) => setForm({ ...form, strategy: e.target.value as Strategy | "" })}
                >
                  <option value="">inherit</option>
                  {STRATEGIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => void saveCoverage()}
                disabled={adding}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save rule
              </button>
            </div>
          </div>
        ) : null}

        {coverage.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-700">No location overrides</p>
            <p className="mt-1 text-xs text-slate-500">
              Global defaults apply everywhere. Add a rule to enable 3PL, disable a
              service, or change radius for a specific pincode/city/state.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {SERVICES.map(({ code, label }) =>
              grouped[code].length ? (
                <div key={code}>
                  <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {label}
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left">Location</th>
                          <th className="px-2 py-2">Enabled</th>
                          <th className="px-2 py-2">Self-pickup</th>
                          <th className="px-2 py-2">Delivery</th>
                          <th className="px-2 py-2">Internal</th>
                          <th className="px-2 py-2">3PL</th>
                          <th className="px-2 py-2">Svc / Disp (m)</th>
                          <th className="px-2 py-2">Strategy</th>
                          <th className="px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {grouped[code].map((r) => (
                          <tr key={r.id} className="text-slate-700">
                            <td className="px-3 py-2 text-left">
                              <span className="font-medium text-slate-900">{r.match_value}</span>
                              <span className="ml-1 text-[10px] uppercase text-slate-400">
                                {r.match_type}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-center">{r.enabled ? "✓" : "—"}</td>
                            <td className="px-2 py-2 text-center">{r.self_pickup_enabled ? "✓" : "—"}</td>
                            <td className="px-2 py-2 text-center">{r.delivery_enabled ? "✓" : "—"}</td>
                            <td className="px-2 py-2 text-center">{r.internal_rider_enabled ? "✓" : "—"}</td>
                            <td className="px-2 py-2 text-center">
                              {r.tpl_enabled ? (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                  3PL
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-2 py-2 text-center text-xs">
                              {r.service_radius_meters ?? "—"} / {r.dispatch_radius_meters ?? "—"}
                            </td>
                            <td className="px-2 py-2 text-center text-xs">{r.strategy ?? "—"}</td>
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => void deleteCoverage(r.id)}
                                className="text-slate-400 hover:text-red-600"
                                aria-label="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>
    </div>
  );
}
