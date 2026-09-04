"use client";

/**
 * Super Admin — Hot Zone Engine.
 * Reads/writes the rider_hot_zone_config singleton and inspects the live persisted zone
 * state (with a full "why is this zone hot" breakdown) via /api/admin/hot-zones/*.
 * Config changes apply on the next reconcile tick; "Reconcile now" forces one immediately.
 */
import { useCallback, useEffect, useState } from "react";

type Cfg = {
  enabled: boolean;
  h3Resolution: number;
  neighborhoodRings: number;
  supplyRadiusMeters: number;
  visibilityRadiusMeters: number;
  demandWindowSeconds: number;
  demandHalfLifeSeconds: number;
  minWeightedDemand: number;
  demandAssignedWeight: number;
  supplyRingDecay: number;
  minSupplyFloor: number;
  locationFreshnessMaxAgeMinutes: number;
  warmAt: number;
  hotAt: number;
  criticalAt: number;
  hysteresisMargin: number;
  reconcileIntervalSeconds: number;
  validitySeconds: number;
};

type Zone = {
  h3Index: string;
  service: string;
  status: "WARM" | "HOT" | "CRITICAL";
  center: { lat: number; lng: number };
  weightedDemand: number;
  effectiveSupply: number;
  pressure: number;
  unassignedDemand: number;
  assignedDemand: number;
  orderCount: number;
  supplyCount: number;
  computedAt: string;
};

type Field = { key: keyof Cfg; label: string; unit: string; step?: number };

const GROUPS: { title: string; hint: string; fields: Field[] }[] = [
  {
    title: "Spatial",
    hint: "How zones are shaped and how far the rider sees them.",
    fields: [
      { key: "h3Resolution", label: "H3 resolution", unit: "0–15" },
      { key: "neighborhoodRings", label: "Supply neighbourhood rings", unit: "rings" },
      { key: "supplyRadiusMeters", label: "Supply query radius", unit: "m" },
      { key: "visibilityRadiusMeters", label: "Rider visibility radius", unit: "m" },
    ],
  },
  {
    title: "Demand",
    hint: "Only real orders create demand — never a store being online. Unassigned = backlog.",
    fields: [
      { key: "demandWindowSeconds", label: "Demand window", unit: "s" },
      { key: "demandHalfLifeSeconds", label: "Time-decay half-life", unit: "s" },
      { key: "minWeightedDemand", label: "Min-demand gate", unit: "≥", step: 0.5 },
      { key: "demandAssignedWeight", label: "Assigned-order weight", unit: "0–1", step: 0.05 },
    ],
  },
  {
    title: "Supply",
    hint: "Effective available supply (remaining capacity), not head-count of online riders.",
    fields: [
      { key: "supplyRingDecay", label: "Ring decay", unit: "0–1", step: 0.05 },
      { key: "minSupplyFloor", label: "Supply floor (denominator)", unit: "≥", step: 0.1 },
      { key: "locationFreshnessMaxAgeMinutes", label: "Location freshness", unit: "min" },
    ],
  },
  {
    title: "Pressure & hysteresis",
    hint: "Enter thresholds (ascending). Hysteresis margin stops WARM/HOT flapping.",
    fields: [
      { key: "warmAt", label: "Warm at pressure ≥", unit: "", step: 0.1 },
      { key: "hotAt", label: "Hot at pressure ≥", unit: "", step: 0.1 },
      { key: "criticalAt", label: "Critical at pressure ≥", unit: "", step: 0.1 },
      { key: "hysteresisMargin", label: "Hysteresis margin", unit: "", step: 0.05 },
    ],
  },
  {
    title: "Lifecycle",
    hint: "How often the engine recomputes and how long a computed zone stays valid.",
    fields: [
      { key: "reconcileIntervalSeconds", label: "Reconcile interval", unit: "s" },
      { key: "validitySeconds", label: "Zone validity", unit: "s" },
    ],
  },
];

const STATUS_STYLE: Record<Zone["status"], string> = {
  WARM: "bg-amber-100 text-amber-800",
  HOT: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

const SERVICE_LABEL: Record<string, string> = {
  food: "Food",
  parcel: "Parcel",
  person_ride: "Ride",
};

export default function HotZonesPage() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [zones, setZones] = useState<Zone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [serviceFilter, setServiceFilter] = useState<string>("");

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/hot-zones/config", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load config");
      setCfg(data.config as Cfg);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadZones = useCallback(async () => {
    setZonesLoading(true);
    try {
      const qs = serviceFilter ? `?service=${serviceFilter}` : "";
      const res = await fetch(`/api/admin/hot-zones/zones${qs}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setZones((data.zones ?? []) as Zone[]);
    } catch {
      /* leave prior zones */
    } finally {
      setZonesLoading(false);
    }
  }, [serviceFilter]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);
  useEffect(() => {
    void loadZones();
  }, [loadZones]);

  const setNum = (k: keyof Cfg, v: string) =>
    setCfg((c) => (c ? { ...c, [k]: Number(v) || 0 } : c));
  const setBool = (k: keyof Cfg, v: boolean) => setCfg((c) => (c ? { ...c, [k]: v } : c));

  const save = async () => {
    if (!cfg) return;
    if (!(cfg.warmAt <= cfg.hotAt && cfg.hotAt <= cfg.criticalAt)) {
      setMsg({ kind: "err", text: "Thresholds must be ascending: warm ≤ hot ≤ critical." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/hot-zones/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || "Save failed");
      setCfg(data.config as Cfg);
      setMsg({ kind: "ok", text: "Saved — applies on the next reconcile tick." });
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const reconcileNow = async () => {
    setReconciling(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/hot-zones/reconcile", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Reconcile failed");
      setMsg({ kind: "ok", text: `Reconciled — ${data.elevated ?? 0} elevated cell(s).` });
      await loadZones();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setReconciling(false);
    }
  };

  if (loading) return <div className="p-6 text-gray-500">Loading hot-zone config…</div>;
  if (!cfg) return <div className="p-6 text-red-600">{msg?.text ?? "Config unavailable."}</div>;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hot Zone Engine</h1>
          <p className="mt-1 text-sm text-gray-500">
            Demand/supply pressure over H3 cells. A zone is hot only with real order demand and
            low effective (capacity-aware) supply — never because a merchant is online.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => setBool("enabled", e.target.checked)}
          />
          <span className="font-semibold text-gray-700">Engine enabled</span>
        </label>
      </div>

      {GROUPS.map((g) => (
        <section key={g.title} className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-600">{g.title}</h2>
          <p className="mt-0.5 text-xs text-gray-400">{g.hint}</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {g.fields.map((f) => (
              <label key={String(f.key)} className="block">
                <span className="text-xs text-gray-700">{f.label}</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    step={f.step ?? 1}
                    min={0}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={cfg[f.key] as number}
                    onChange={(e) => setNum(f.key, e.target.value)}
                  />
                  {f.unit ? <span className="text-xs text-gray-400">{f.unit}</span> : null}
                </div>
              </label>
            ))}
          </div>
        </section>
      ))}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded-md bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          onClick={() => void reconcileNow()}
          disabled={reconciling}
          className="rounded-md border border-teal-600 px-5 py-2.5 text-sm font-semibold text-teal-700 disabled:opacity-60"
        >
          {reconciling ? "Reconciling…" : "Reconcile now"}
        </button>
        {msg && (
          <span className={msg.kind === "ok" ? "text-sm text-teal-600" : "text-sm text-red-600"}>
            {msg.text}
          </span>
        )}
      </div>

      {/* ── Live zone inspector — explainability ── */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-gray-900">
            Live zones{" "}
            <span className="text-sm font-normal text-gray-400">
              ({zones.length} elevated{zonesLoading ? " · refreshing…" : ""})
            </span>
          </h2>
          <div className="flex items-center gap-2">
            <select
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
            >
              <option value="">All services</option>
              <option value="food">Food</option>
              <option value="parcel">Parcel</option>
              <option value="person_ride">Ride</option>
            </select>
            <button
              onClick={() => void loadZones()}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Cell (H3)</th>
                <th className="px-3 py-2">Service</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Pressure</th>
                <th className="px-3 py-2 text-right">Demand</th>
                <th className="px-3 py-2 text-right">Supply</th>
                <th className="px-3 py-2 text-right">Unassigned</th>
                <th className="px-3 py-2 text-right">Assigned</th>
                <th className="px-3 py-2 text-right">Orders</th>
                <th className="px-3 py-2 text-right">Riders</th>
                <th className="px-3 py-2">Centre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {zones.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-gray-400">
                    No elevated zones right now.
                  </td>
                </tr>
              ) : (
                zones.map((z) => (
                  <tr key={`${z.h3Index}:${z.service}`} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{z.h3Index}</td>
                    <td className="px-3 py-2">{SERVICE_LABEL[z.service] ?? z.service}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[z.status]}`}
                      >
                        {z.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{z.pressure}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{z.weightedDemand}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{z.effectiveSupply}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{z.unassignedDemand}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{z.assignedDemand}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{z.orderCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{z.supplyCount}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-400">
                      {z.center.lat.toFixed(4)}, {z.center.lng.toFixed(4)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Pressure = weighted demand ÷ max(effective supply, floor). A row is elevated only when
          demand clears the min-demand gate. &quot;Unassigned&quot; is the searching backlog;
          &quot;Assigned&quot; orders are already being served (they reduce supply, not raise demand).
        </p>
      </section>
    </div>
  );
}
