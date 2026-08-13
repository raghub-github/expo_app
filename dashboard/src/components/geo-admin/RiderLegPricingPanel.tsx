"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ArrowRight } from "lucide-react";
import { parseDecimalOrZero } from "@/lib/pricing/slabInputUtils";

type Service = "food" | "parcel" | "ride";
type Leg = "pre" | "post";
type Vehicle = "2_wheeler" | "3_wheeler" | "4_wheeler_non_ac" | "4_wheeler_ac";
type Funding = "company" | "customer" | "shared";

const VEHICLES: { value: Vehicle; label: string }[] = [
  { value: "2_wheeler", label: "2 Wheeler" },
  { value: "3_wheeler", label: "3 Wheeler" },
  { value: "4_wheeler_non_ac", label: "4 Wheeler (non-AC)" },
  { value: "4_wheeler_ac", label: "4 Wheeler (AC)" },
];

/** Row as strings for the inputs; id 0 = unsaved new row. */
type Row = {
  id: number;
  leg: Leg;
  vehicleType: Vehicle | "all";
  weightMinKg: string;
  weightMaxKg: string;
  minKm: string;
  maxKm: string;
  baseAmount: string;
  ratePerKm: string;
  minAmount: string;
  maxAmount: string;
  funding: Funding;
  customerSharePct: string;
  priority: string;
  isActive: boolean;
};

function apiRowToRow(r: Record<string, unknown>): Row {
  const s = (v: unknown) => (v == null ? "" : String(v));
  return {
    id: Number(r.id),
    leg: String(r.leg) as Leg,
    vehicleType: (r.vehicleType == null ? "all" : String(r.vehicleType)) as Vehicle | "all",
    weightMinKg: s(r.weightMinKg),
    weightMaxKg: s(r.weightMaxKg),
    minKm: s(r.minKm),
    maxKm: s(r.maxKm),
    baseAmount: s(r.baseAmount),
    ratePerKm: s(r.ratePerKm),
    minAmount: s(r.minAmount),
    maxAmount: s(r.maxAmount),
    funding: (String(r.funding || "company")) as Funding,
    customerSharePct: s(r.customerSharePct),
    priority: r.priority == null ? "100" : String(r.priority),
    isActive: r.isActive === true,
  };
}

function blankRow(leg: Leg): Row {
  return {
    id: 0,
    leg,
    vehicleType: "all",
    weightMinKg: "",
    weightMaxKg: "",
    minKm: "0",
    maxKm: "",
    baseAmount: "",
    ratePerKm: "0",
    minAmount: "",
    maxAmount: "",
    funding: leg === "pre" ? "company" : "customer",
    customerSharePct: "0",
    priority: "100",
    isActive: true,
  };
}

const input =
  "w-full min-w-[3.5rem] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-mono text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400";
const numOrNull = (v: string) => (v.trim() === "" ? null : parseDecimalOrZero(v));

export function RiderLegPricingPanel(props: {
  level: string;
  refId: string;
  service: Service;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | "new-pre" | "new-post" | null>(null);

  const showVehicle = props.service === "ride" || props.service === "parcel";
  const showWeight = props.service === "parcel";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ level: props.level, refId: props.refId, service: props.service });
      const res = await fetch(`/api/super-admin/geo/rider-leg-pricing?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load leg rules");
      setRows((json.rules ?? []).map((r: Record<string, unknown>) => apiRowToRow(r)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load pre/post leg rules");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [props.level, props.refId, props.service]);

  useEffect(() => {
    void load();
  }, [load]);

  const setRow = (idx: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const addRow = (leg: Leg) => setRows((prev) => [...prev, blankRow(leg)]);

  async function save(idx: number) {
    const r = rows[idx];
    const key = r.id > 0 ? r.id : (`new-${r.leg}` as const);
    setBusyId(key);
    try {
      const body = {
        id: r.id > 0 ? r.id : undefined,
        leg: r.leg,
        level: props.level,
        refId: props.refId,
        service: props.service,
        vehicleType: showVehicle && r.vehicleType !== "all" ? r.vehicleType : null,
        weightMinKg: showWeight ? numOrNull(r.weightMinKg) : null,
        weightMaxKg: showWeight ? numOrNull(r.weightMaxKg) : null,
        minKm: parseDecimalOrZero(r.minKm),
        maxKm: numOrNull(r.maxKm),
        baseAmount: numOrNull(r.baseAmount),
        ratePerKm: parseDecimalOrZero(r.ratePerKm),
        minAmount: numOrNull(r.minAmount),
        maxAmount: numOrNull(r.maxAmount),
        funding: r.funding,
        customerSharePct: r.funding === "shared" ? parseDecimalOrZero(r.customerSharePct) : 0,
        priority: Math.round(parseDecimalOrZero(r.priority)),
        isActive: r.isActive,
      };
      const res = await fetch(`/api/super-admin/geo/rider-leg-pricing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      toast.success(`${r.leg === "pre" ? "Pre" : "Post"}-pickup slab saved`);
      await load();
      props.onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(idx: number) {
    const r = rows[idx];
    if (r.id <= 0) {
      setRows((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    setBusyId(r.id);
    try {
      const res = await fetch(`/api/super-admin/geo/rider-leg-pricing/${r.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      toast.success("Slab deleted");
      await load();
      props.onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  const pre = useMemo(() => rows.map((r, i) => ({ r, i })).filter((x) => x.r.leg === "pre"), [rows]);
  const post = useMemo(() => rows.map((r, i) => ({ r, i })).filter((x) => x.r.leg === "post"), [rows]);

  const renderLeg = (leg: Leg, list: { r: Row; i: number }[], title: string, hint: string) => (
    <div className="mt-3 rounded-xl border border-violet-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-violet-900">{title}</p>
          <p className="text-[11px] text-slate-500">{hint}</p>
        </div>
        <button
          type="button"
          onClick={() => addRow(leg)}
          className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-800 hover:bg-white"
        >
          <Plus className="h-3.5 w-3.5" /> Add slab
        </button>
      </div>
      {list.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          No {leg}-pickup rule at this node — {leg === "post" ? "post-pickup falls back to the pool remainder" : "first-mile is 0"}.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[880px] text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase text-slate-500">
                {showVehicle ? <th className="px-1 pb-1">Vehicle</th> : null}
                {showWeight ? <th className="px-1 pb-1">Wt min</th> : null}
                {showWeight ? <th className="px-1 pb-1">Wt max</th> : null}
                <th className="px-1 pb-1">Min km</th>
                <th className="px-1 pb-1">Max km</th>
                <th className="px-1 pb-1">Base ₹</th>
                <th className="px-1 pb-1">₹/km</th>
                <th className="px-1 pb-1">Min ₹</th>
                <th className="px-1 pb-1">Max ₹</th>
                <th className="px-1 pb-1">Funding</th>
                <th className="px-1 pb-1">Prio</th>
                <th className="px-1 pb-1">On</th>
                <th className="px-1 pb-1"></th>
              </tr>
            </thead>
            <tbody>
              {list.map(({ r, i }) => {
                const busy = busyId === r.id || (r.id <= 0 && busyId === `new-${leg}`);
                return (
                  <tr key={r.id > 0 ? r.id : `new-${i}`} className="align-top">
                    {showVehicle ? (
                      <td className="px-1 py-1">
                        <select className={input} value={r.vehicleType} onChange={(e) => setRow(i, { vehicleType: e.target.value as Vehicle | "all" })}>
                          <option value="all">All</option>
                          {VEHICLES.map((v) => (
                            <option key={v.value} value={v.value}>{v.label}</option>
                          ))}
                        </select>
                      </td>
                    ) : null}
                    {showWeight ? (
                      <td className="px-1 py-1"><input className={input} value={r.weightMinKg} onChange={(e) => setRow(i, { weightMinKg: e.target.value })} placeholder="—" /></td>
                    ) : null}
                    {showWeight ? (
                      <td className="px-1 py-1"><input className={input} value={r.weightMaxKg} onChange={(e) => setRow(i, { weightMaxKg: e.target.value })} placeholder="∞" /></td>
                    ) : null}
                    <td className="px-1 py-1"><input className={input} value={r.minKm} onChange={(e) => setRow(i, { minKm: e.target.value })} /></td>
                    <td className="px-1 py-1"><input className={input} value={r.maxKm} onChange={(e) => setRow(i, { maxKm: e.target.value })} placeholder="∞" /></td>
                    <td className="px-1 py-1"><input className={input} value={r.baseAmount} onChange={(e) => setRow(i, { baseAmount: e.target.value })} placeholder={r.minKm.trim() === "0" ? "0" : "—"} disabled={r.minKm.trim() !== "0"} /></td>
                    <td className="px-1 py-1"><input className={input} value={r.ratePerKm} onChange={(e) => setRow(i, { ratePerKm: e.target.value })} /></td>
                    <td className="px-1 py-1"><input className={input} value={r.minAmount} onChange={(e) => setRow(i, { minAmount: e.target.value })} placeholder="—" /></td>
                    <td className="px-1 py-1"><input className={input} value={r.maxAmount} onChange={(e) => setRow(i, { maxAmount: e.target.value })} placeholder="—" /></td>
                    <td className="px-1 py-1">
                      <select className={input} value={r.funding} onChange={(e) => setRow(i, { funding: e.target.value as Funding })}>
                        <option value="company">Company</option>
                        <option value="customer">Customer</option>
                        <option value="shared">Shared</option>
                      </select>
                      {r.funding === "shared" ? (
                        <input className={`${input} mt-1`} value={r.customerSharePct} onChange={(e) => setRow(i, { customerSharePct: e.target.value })} placeholder="cust %" />
                      ) : null}
                    </td>
                    <td className="px-1 py-1"><input className={input} value={r.priority} onChange={(e) => setRow(i, { priority: e.target.value })} /></td>
                    <td className="px-1 py-1 text-center">
                      <input type="checkbox" checked={r.isActive} onChange={(e) => setRow(i, { isActive: e.target.checked })} />
                    </td>
                    <td className="px-1 py-1">
                      <div className="flex items-center gap-1">
                        <button type="button" disabled={busy} onClick={() => save(i)} className="rounded-md border border-teal-200 bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-800 hover:bg-white disabled:opacity-50">
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                        </button>
                        <button type="button" disabled={busy} onClick={() => remove(i)} className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700 hover:bg-white disabled:opacity-50">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/30 px-5 py-4">
      <div className="flex items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-violet-800">
          Rider pre / post-pickup leg pricing — this location
        </p>
      </div>
      <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
        Independent ₹/km rules per leg. <b>Pre-pickup</b> <span className="inline-flex items-center gap-0.5">rider <ArrowRight className="h-3 w-3" /> pickup</span>, <b>Post-pickup</b> <span className="inline-flex items-center gap-0.5">pickup <ArrowRight className="h-3 w-3" /> drop</span>. Closest-ancestor-wins; the calculator above reflects these live.
      </p>
      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading leg rules…</p>
      ) : (
        <>
          {renderLeg("pre", pre, "Pre-pickup (rider → pickup)", "First-mile. Company-funded by default (paid on top).")}
          {renderLeg("post", post, "Post-pickup (pickup → drop)", "Delivery leg. Customer-funded by default (within the % pool).")}
        </>
      )}
    </div>
  );
}
