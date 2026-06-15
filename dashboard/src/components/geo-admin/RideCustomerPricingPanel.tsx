"use client";

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Layers, Loader2 } from "lucide-react";
import type { VehicleType } from "./RiderPayoutSlabsPanel";

type Row = {
  id: number;
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  perKmRate: number;
  minCharge: number | null;
  priority: number;
  isActive: boolean;
};

function num(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function numOr(v: string, fallback: number) {
  const n = num(v);
  return n == null ? fallback : n;
}

const inputCls =
  "w-full min-w-[4.5rem] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-mono text-slate-900 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400";

export function RideCustomerPricingPanel(props: {
  level: string;
  refId: string;
  vehicleType: VehicleType;
}) {
  const [loading, setLoading] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const [slabs, setSlabs] = useState<Row[]>([]);

  const mapRows = (rows: any[]): Row[] =>
    rows.map((s) => ({
      id: Number(s.id),
      minKm: Number(s.minKm),
      maxKm: s.maxKm == null ? null : Number(s.maxKm),
      baseFare: s.baseFare == null ? null : Number(s.baseFare),
      perKmRate: Number(s.perKmRate),
      minCharge: s.minCharge == null ? null : Number(s.minCharge),
      priority: Number(s.priority ?? 100),
      isActive: s.isActive === true,
    }));

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        level: props.level,
        refId: props.refId,
        vehicleType: props.vehicleType,
      });
      const res = await fetch(`/api/super-admin/geo/ride-customer-pricing?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Failed");
      const json = await res.json();
      setSlabs(mapRows(json.slabs ?? []));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load ride pricing");
    } finally {
      setLoading(false);
    }
  }, [props.level, props.refId, props.vehicleType]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addBlank = () => {
    setSlabs((prev) => [
      ...prev,
      {
        id: -Date.now(),
        minKm: prev.length === 0 ? 0 : prev[prev.length - 1]!.maxKm ?? prev[prev.length - 1]!.minKm + 1,
        maxKm: null,
        baseFare: prev.length === 0 ? 0 : null,
        perKmRate: 0,
        minCharge: null,
        priority: 100,
        isActive: true,
      },
    ]);
  };

  const save = async (r: Row) => {
    setRowBusyId(r.id);
    try {
      const payload = {
        level: props.level,
        refId: props.refId,
        vehicleType: props.vehicleType,
        minKm: r.minKm,
        maxKm: r.maxKm,
        baseFare: r.minKm === 0 ? r.baseFare : null,
        perKmRate: r.perKmRate,
        minCharge: r.minCharge,
        priority: r.priority,
        isActive: r.isActive,
      };
      const res =
        r.id > 0
          ? await fetch(`/api/super-admin/geo/ride-customer-pricing/${r.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/super-admin/geo/ride-customer-pricing`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Save failed");
      toast.success("Saved");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setRowBusyId(null);
    }
  };

  const del = async (id: number) => {
    if (id <= 0) {
      setSlabs((p) => p.filter((x) => x.id !== id));
      return;
    }
    if (!confirm("Delete this slab?")) return;
    setRowBusyId(id);
    try {
      const res = await fetch(`/api/super-admin/geo/ride-customer-pricing/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Delete failed");
      toast.success("Deleted");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setRowBusyId(null);
    }
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addBlank}
          disabled={loading || rowBusyId != null}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-teal-300"
        >
          <Layers className="h-4 w-4 text-teal-700" />
          Add slab
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || rowBusyId != null}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="whitespace-nowrap px-4 py-3">Min km</th>
              <th className="whitespace-nowrap px-4 py-3">Max km</th>
              <th className="whitespace-nowrap px-4 py-3">Base fare</th>
              <th className="whitespace-nowrap px-4 py-3">Per km</th>
              <th className="whitespace-nowrap px-4 py-3">Min charge</th>
              <th className="whitespace-nowrap px-4 py-3">Priority</th>
              <th className="whitespace-nowrap px-4 py-3 text-center">Active</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {slabs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                  No ride customer slabs for this vehicle at this node. Click &quot;Add slab&quot; to configure.
                </td>
              </tr>
            ) : (
              slabs.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5">
                    <input className={inputCls} value={String(s.minKm)} onChange={(e) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, minKm: numOr(e.target.value, s.minKm) } : x)))} />
                  </td>
                  <td className="px-4 py-2.5">
                    <input className={inputCls} placeholder="∞" value={s.maxKm == null ? "" : String(s.maxKm)} onChange={(e) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, maxKm: num(e.target.value) } : x)))} />
                  </td>
                  <td className="px-4 py-2.5">
                    <input className={inputCls} disabled={s.minKm !== 0} placeholder={s.minKm !== 0 ? "—" : ""} value={s.minKm !== 0 ? "" : s.baseFare == null ? "" : String(s.baseFare)} onChange={(e) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, baseFare: num(e.target.value) } : x)))} />
                  </td>
                  <td className="px-4 py-2.5">
                    <input className={inputCls} value={String(s.perKmRate)} onChange={(e) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, perKmRate: numOr(e.target.value, s.perKmRate) } : x)))} />
                  </td>
                  <td className="px-4 py-2.5">
                    <input className={inputCls} value={s.minCharge == null ? "" : String(s.minCharge)} onChange={(e) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, minCharge: num(e.target.value) } : x)))} />
                  </td>
                  <td className="px-4 py-2.5">
                    <input className={inputCls} value={String(s.priority)} onChange={(e) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, priority: Math.floor(numOr(e.target.value, s.priority)) } : x)))} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <input type="checkbox" className="h-4 w-4" checked={s.isActive} onChange={(e) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, isActive: e.target.checked } : x)))} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex gap-2">
                      <button type="button" disabled={rowBusyId != null} onClick={() => void save(s)} className="rounded-md border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100 disabled:opacity-50">
                        {rowBusyId === s.id ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : "Save"}
                      </button>
                      <button type="button" disabled={rowBusyId != null} onClick={() => void del(s.id)} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50">
                        Delete
                      </button>
                    </div>
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
