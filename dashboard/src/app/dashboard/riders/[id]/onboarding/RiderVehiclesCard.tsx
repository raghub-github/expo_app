"use client";

/**
 * Agent/super-admin view of a rider's VEHICLES (§46): each vehicle with its per-vehicle
 * service eligibility (+ blocking reasons), verification + fuel/commercial, which one is
 * active, and a compact DL/RC verification attempt history. Backend-authoritative.
 */
import React, { useEffect, useState } from "react";

type Decision = { eligible: boolean; blocking: { code: string; reason: string }[]; missingDocuments: string[] };
type Vehicle = {
  id: number;
  registrationMasked: string;
  vehicleClass: string | null;
  vehicleType: string | null;
  fuelKind: string | null;
  ownership: string;
  commercial: boolean;
  verified: boolean;
  status: string;
  isActiveVehicle: boolean;
  services: Record<string, Decision>;
};
type HistoryRow = {
  document_kind: string;
  status: string;
  status_reason: string | null;
  attempt_number: number;
  created_at: string;
};
type Payload = {
  vehicles: Vehicle[];
  activeVehicleId: number | null;
  verificationHistory?: HistoryRow[];
};

const SERVICE_LABEL: Record<string, string> = { food: "Food", parcel: "Parcel", person_ride: "Person Ride" };
const SERVICES = ["food", "parcel", "person_ride"];
const human = (s: string | null | undefined) => (s ?? "").replace(/_/g, " ");
const classLabel = (c: string | null) =>
  c === "2_wheeler" ? "2 Wheeler" : c === "3_wheeler" ? "3 Wheeler" : c === "4_wheeler" ? "4 Wheeler" : "Vehicle";

export function RiderVehiclesCard({ riderId }: { riderId: number }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/riders/${riderId}/vehicles-eligibility`, { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(json?.error || "Failed to load vehicles");
        else setData(json as Payload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load vehicles");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [riderId]);

  if (loading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading vehicles…</div>;
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        Vehicles unavailable: {error ?? "no data"}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-white">
      <div className="border-b border-blue-100 px-5 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">Vehicles ({data.vehicles.length}/2)</p>
        <p className="text-xs text-slate-500">Per-vehicle service eligibility · approved RC counts as ownership proof</p>
      </div>

      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
        {data.vehicles.length === 0 ? (
          <p className="text-sm text-slate-400">No vehicles on file.</p>
        ) : (
          data.vehicles.map((v) => (
            <div key={v.id} className={`rounded-lg border p-3 ${v.isActiveVehicle ? "border-teal-300 bg-teal-50/40" : "border-slate-200 bg-white"}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{classLabel(v.vehicleClass)}</p>
                  <p className="font-mono text-xs text-slate-500">{v.registrationMasked}</p>
                </div>
                {v.isActiveVehicle ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Active</span>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                {v.fuelKind ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{human(v.fuelKind)}</span> : null}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{v.commercial ? "Commercial" : "Non-commercial"}</span>
                <span className={`rounded px-1.5 py-0.5 font-semibold ${v.verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                  {v.verified ? "Verified" : "Pending"}
                </span>
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {SERVICES.map((s) => {
                  const d = v.services[s];
                  return (
                    <li key={s} className="flex items-start gap-1.5">
                      <span className={d?.eligible ? "text-emerald-600" : "text-rose-600"}>{d?.eligible ? "✓" : "✕"}</span>
                      <span>
                        {SERVICE_LABEL[s] ?? s}
                        {!d?.eligible ? (
                          <span className="text-slate-500">
                            {" — "}
                            {d?.missingDocuments?.length
                              ? `needs ${d.missingDocuments.map(human).join(", ")}`
                              : d?.blocking?.[0]?.reason ?? "not eligible"}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      {data.verificationHistory && data.verificationHistory.length > 0 ? (
        <div className="border-t border-blue-100 px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Verification history (DL / RC)</p>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-[10px] uppercase text-slate-400">
                <tr>
                  <th className="px-2 py-1">Document</th>
                  <th className="px-2 py-1">Attempt</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">When</th>
                </tr>
              </thead>
              <tbody>
                {data.verificationHistory.map((h, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1">{h.document_kind === "vehicle_rc" ? "RC" : "DL"}</td>
                    <td className="px-2 py-1">#{h.attempt_number}</td>
                    <td className={`px-2 py-1 font-semibold ${h.status === "verified" ? "text-emerald-700" : h.status === "rejected" ? "text-rose-700" : "text-amber-700"}`}>
                      {human(h.status)}
                      {h.status_reason ? <span className="font-normal text-slate-400"> · {h.status_reason}</span> : null}
                    </td>
                    <td className="px-2 py-1 text-slate-500">{new Date(h.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
