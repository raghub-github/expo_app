"use client";

/**
 * Super Admin — Geo-engine violations review.
 * Lists tracking_violations (long stop / route deviation / opposite direction)
 * and lets an admin mark them reviewed / penalized / dismissed. Flipping to
 * "penalized" marks the violation for the existing penalty flow — this screen
 * never deducts the wallet directly (modular Violation → Penalty boundary).
 */
import { useCallback, useEffect, useState } from "react";

type Violation = {
  id: number;
  orderId: string;
  riderId: number | null;
  sessionId: number | null;
  serviceType: string | null;
  violationType: string;
  level: number;
  status: string;
  distanceM: number | null;
  durationSeconds: number | null;
  message: string | null;
  at: string | null;
};

const STATUSES = ["open", "reviewed", "penalized", "dismissed"] as const;
const TYPE_LABEL: Record<string, string> = {
  long_stop: "No movement",
  route_deviation: "Route deviation",
  opposite_direction: "Wrong direction",
};

export default function TrackingViolationsPage() {
  const [rows, setRows] = useState<Violation[]>([]);
  const [status, setStatus] = useState<string>("open");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = status ? `?status=${status}&limit=200` : "?limit=200";
      const res = await fetch(`/api/admin/tracking/violations${qs}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load");
      setRows((data.items as Violation[]) ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: number, next: "reviewed" | "penalized" | "dismissed") => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/tracking/violations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "Update failed");
      }
      setRows((prev) => (status === "open" ? prev.filter((r) => r.id !== id) : prev.map((r) => (r.id === id ? { ...r, status: next } : r))));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-bold text-gray-900">Geo-engine violations</h1>
      <p className="mt-1 text-sm text-gray-500">
        No-movement, route-deviation and wrong-direction signals raised by the backend tracking
        engine. Marking a violation <b>penalized</b> flags it for the penalty flow — it does not
        deduct the wallet here.
      </p>

      <div className="mt-4 flex items-center gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
              status === s ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s}
          </button>
        ))}
        <button onClick={() => void load()} className="ml-auto text-xs text-teal-600 underline">
          Refresh
        </button>
      </div>

      {err && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}

      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Rider</th>
              <th className="px-3 py-2">Detail</th>
              <th className="px-3 py-2">Lvl</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                  No {status} violations.
                </td>
              </tr>
            ) : (
              rows.map((v) => (
                <tr key={v.id}>
                  <td className="px-3 py-2 text-gray-500">
                    {v.at ? new Date(v.at).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-800">
                    {TYPE_LABEL[v.violationType] ?? v.violationType}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{v.orderId}</td>
                  <td className="px-3 py-2 text-gray-600">{v.riderId ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {v.durationSeconds != null ? `${v.durationSeconds}s ` : ""}
                    {v.distanceM != null ? `${v.distanceM}m` : ""}
                    {v.message ? <span className="block text-xs text-gray-400">{v.message}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{v.level}</td>
                  <td className="px-3 py-2">
                    {v.status === "open" ? (
                      <div className="flex gap-2">
                        <button
                          disabled={busyId === v.id}
                          onClick={() => void act(v.id, "penalized")}
                          className="rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Penalize
                        </button>
                        <button
                          disabled={busyId === v.id}
                          onClick={() => void act(v.id, "reviewed")}
                          className="rounded bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 disabled:opacity-50"
                        >
                          Reviewed
                        </button>
                        <button
                          disabled={busyId === v.id}
                          onClick={() => void act(v.id, "dismissed")}
                          className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-500 disabled:opacity-50"
                        >
                          Dismiss
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs capitalize text-gray-400">{v.status}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
