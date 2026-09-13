"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldAlert, Save, CheckCircle2 } from "lucide-react";

type Service = "food" | "parcel" | "person_ride";
const SERVICE_LABELS: Record<Service, string> = {
  food: "Food",
  parcel: "Parcel",
  person_ride: "Person Ride",
};

type ConfigRow = {
  serviceType: Service;
  thresholdPct: number;
  minAccepted: number;
  enabled: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};

export default function RiderCancellationBlockPage() {
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/rider-cancellation-block-config", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load");
      setRows(json.config as ConfigRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (service: Service, next: Partial<ConfigRow>) =>
    setRows((prev) => prev.map((r) => (r.serviceType === service ? { ...r, ...next } : r)));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/rider-cancellation-block-config", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          config: rows.map((r) => ({
            serviceType: r.serviceType,
            thresholdPct: Number(r.thresholdPct),
            minAccepted: Math.trunc(Number(r.minAccepted)),
            enabled: Boolean(r.enabled),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to save");
      setRows(json.config as ConfigRow[]);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Cancellation-Rate Auto-Block</h1>
            <p className="max-w-2xl text-xs text-gray-500">
              Set a rider-fault cancellation-rate threshold per service. When a rider&apos;s
              rider-fault cancellation rate reaches the threshold (and they have at least the
              minimum accepted orders), they are auto-blocked for that service only. A blocked
              rider is released only when you change the threshold for that service — never
              manually, never on a timer.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Reload
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-rose-400 border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3 font-semibold">Service</th>
                  <th className="px-4 py-3 font-semibold">Enabled</th>
                  <th className="px-4 py-3 font-semibold">Rider-Fault Rate ≥</th>
                  <th className="px-4 py-3 font-semibold">Min Accepted Orders</th>
                  <th className="px-4 py-3 font-semibold">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.serviceType} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      {SERVICE_LABELS[r.serviceType]}
                    </td>
                    <td className="px-4 py-3">
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={r.enabled}
                          onChange={(e) => patch(r.serviceType, { enabled: e.target.checked })}
                          className="h-4 w-4 accent-rose-600"
                        />
                        <span className={`text-xs font-medium ${r.enabled ? "text-rose-700" : "text-gray-400"}`}>
                          {r.enabled ? "On" : "Off"}
                        </span>
                      </label>
                    </td>
                    <td className="px-4 py-3">
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={r.thresholdPct}
                          disabled={!r.enabled}
                          onChange={(e) =>
                            patch(r.serviceType, { thresholdPct: Number(e.target.value) })
                          }
                          className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm tabular-nums disabled:bg-gray-100 disabled:text-gray-400"
                        />
                        <span className="text-xs text-gray-500">%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={r.minAccepted}
                        disabled={!r.enabled}
                        onChange={(e) =>
                          patch(r.serviceType, { minAccepted: Math.max(0, Math.trunc(Number(e.target.value))) })
                        }
                        className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm tabular-nums disabled:bg-gray-100 disabled:text-gray-400"
                      />
                    </td>
                    <td className="px-4 py-3 text-[11px] text-gray-500">
                      {r.updatedAt ? (
                        <>
                          {new Date(r.updatedAt).toLocaleString()}
                          {r.updatedBy ? <div className="text-gray-400">by {r.updatedBy}</div> : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save thresholds
            </button>
            {savedAt ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Saved — blocks re-evaluate within ~60s.
              </span>
            ) : null}
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-gray-400">
            Only cancellations that are the rider&apos;s fault count toward the rate (customer,
            merchant, and system cancellations never do). Rate is lifetime rider-fault
            cancellations ÷ accepted orders for the service. Changing a threshold re-evaluates
            every affected rider: raising it releases riders now under it; lowering it blocks
            riders now at or above it.
          </p>
        </>
      )}
    </div>
  );
}
