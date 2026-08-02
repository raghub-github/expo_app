"use client";

/**
 * Super Admin — Real-time Tracking & Geo-Scoping config.
 * Reads/writes the single tracking_config row via /api/admin/tracking-config
 * (proxied to the backend). Changes apply live (backend reads config per-fix).
 */
import { useEffect, useMemo, useState } from "react";

type Cfg = {
  trackingIntervalSeconds: number;
  gpsAccuracyThresholdM: number;
  speedThresholdKmh: number;
  etaRefreshSeconds: number;
  movementThresholdM: number;
  stationaryTimeoutSeconds: number;
  deviationDistanceM: number;
  wrongDirectionThresholdM: number;
  enableStationaryRule: boolean;
  enableDeviationRule: boolean;
  enableWrongDirectionRule: boolean;
  intervalOptions?: number[];
};

const NUM_GROUPS: { title: string; fields: { key: keyof Cfg; label: string; unit: string }[] }[] = [
  {
    title: "Collection",
    fields: [
      { key: "gpsAccuracyThresholdM", label: "GPS accuracy threshold", unit: "m" },
      { key: "speedThresholdKmh", label: "Impossible-speed guard", unit: "km/h" },
      { key: "etaRefreshSeconds", label: "ETA refresh interval", unit: "s" },
    ],
  },
  {
    title: "Geo-engine thresholds",
    fields: [
      { key: "movementThresholdM", label: "Movement threshold", unit: "m" },
      { key: "stationaryTimeoutSeconds", label: "Stationary timeout", unit: "s" },
      { key: "deviationDistanceM", label: "Route-deviation distance", unit: "m" },
      { key: "wrongDirectionThresholdM", label: "Wrong-direction threshold", unit: "m" },
    ],
  },
];

const TOGGLES: { key: keyof Cfg; label: string }[] = [
  { key: "enableStationaryRule", label: "Enable no-movement detection" },
  { key: "enableDeviationRule", label: "Enable route-deviation detection" },
  { key: "enableWrongDirectionRule", label: "Enable wrong-direction detection" },
];

export default function TrackingConfigPage() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const intervalOptions = useMemo(() => cfg?.intervalOptions ?? [30, 60, 90, 120], [cfg]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/tracking-config", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load config");
        setCfg(data as Cfg);
      } catch (e) {
        setMsg({ kind: "err", text: (e as Error).message });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setNum = (k: keyof Cfg, v: string) =>
    setCfg((c) => (c ? { ...c, [k]: Math.max(0, Math.round(Number(v) || 0)) } : c));
  const setBool = (k: keyof Cfg, v: boolean) => setCfg((c) => (c ? { ...c, [k]: v } : c));

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    setMsg(null);
    try {
      const { intervalOptions: _drop, ...payload } = cfg;
      const res = await fetch("/api/admin/tracking-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || "Save failed");
      setCfg(data as Cfg);
      setMsg({ kind: "ok", text: "Saved — changes are live." });
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-gray-500">Loading tracking config…</div>;
  if (!cfg) return <div className="p-6 text-red-600">{msg?.text ?? "Config unavailable."}</div>;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold text-gray-900">Real-time Tracking &amp; Geo-Scoping</h1>
      <p className="mt-1 text-sm text-gray-500">
        Global tunables for the rider tracking + geo-scoping engine. Distances in meters, durations
        in seconds. Changes apply live (no deploy).
      </p>
      <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Pickup/drop geofence radii (per milestone &amp; service) are managed on the{" "}
        <a href="/dashboard/super-admin/rider-status-geo-fence" className="font-semibold underline">
          Rider status geo-fence
        </a>{" "}
        page — they are enforced there, not here.
      </p>

      {/* Collection interval (select) */}
      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-600">Tracking interval</h2>
        <div className="mt-3 flex items-center gap-3">
          <select
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={cfg.trackingIntervalSeconds}
            onChange={(e) => setNum("trackingIntervalSeconds", e.target.value)}
          >
            {(intervalOptions.includes(cfg.trackingIntervalSeconds)
              ? intervalOptions
              : [cfg.trackingIntervalSeconds, ...intervalOptions]
            ).map((s) => (
              <option key={s} value={s}>
                {s} seconds
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-400">How often the rider app reports location.</span>
        </div>
      </section>

      {NUM_GROUPS.map((g) => (
        <section key={g.title} className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-600">{g.title}</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {g.fields.map((f) => (
              <label key={String(f.key)} className="block">
                <span className="text-sm text-gray-700">{f.label}</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={cfg[f.key] as number}
                    onChange={(e) => setNum(f.key, e.target.value)}
                  />
                  <span className="text-xs text-gray-400">{f.unit}</span>
                </div>
              </label>
            ))}
          </div>
        </section>
      ))}

      <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-600">Rules</h2>
        <div className="mt-3 space-y-2">
          {TOGGLES.map((t) => (
            <label key={String(t.key)} className="flex items-center gap-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={cfg[t.key] as boolean}
                onChange={(e) => setBool(t.key, e.target.checked)}
              />
              {t.label}
            </label>
          ))}
        </div>
      </section>

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded-md bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {msg && (
          <span className={msg.kind === "ok" ? "text-sm text-teal-600" : "text-sm text-red-600"}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
