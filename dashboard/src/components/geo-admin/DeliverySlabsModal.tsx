"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoChildRow } from "@/lib/geo/geo-shared";
import { toast } from "sonner";
import { Layers, Loader2, Plus, X } from "lucide-react";
import { RiderPayoutSlabsPanel, VEHICLE_OPTIONS, type VehicleType } from "./RiderPayoutSlabsPanel";
import { RideCustomerPricingPanel } from "./RideCustomerPricingPanel";
import { InlineVehicleRideLimitField } from "./InlineVehicleRideLimitField";
import { StateSurgeManagementSidesheet } from "./StateSurgeManagementSidesheet";
import { prefetchRiderPayoutSlabs } from "@/lib/geo/riderPayoutSlabsCache";

type ServiceType = "food" | "parcel" | "person_ride";
type ActorType = "customer" | "rider";

type SlabRow = {
  id: number;
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  perKmRate: number;
  minCharge: number | null;
  waitingChargePerMin?: number | null;
  surgeMultiplier?: number | null;
  priority: number;
  isActive: boolean;
};

function num(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function numOr(v: string, fallback: number): number {
  const n = num(v);
  return n == null ? fallback : n;
}

/** Keep modals inside the dashboard main column (right of fixed left sidebar). */
function useMainAreaLeftInset() {
  const [leftPx, setLeftPx] = useState(0);

  useEffect(() => {
    const measure = () => {
      const main = document.querySelector("main");
      if (!main) {
        setLeftPx(0);
        return;
      }
      setLeftPx(Math.max(0, Math.round(main.getBoundingClientRect().left)));
    };

    measure();
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    const main = document.querySelector("main");
    if (main?.parentElement) ro.observe(main.parentElement);
    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, []);

  return leftPx;
}

export const DeliverySlabsModal = React.memo(function DeliverySlabsModal(props: {
  row: GeoChildRow;
  onClose: () => void;
}) {
  const row = props.row;
  const level = row.kind as "state" | "region" | "district" | "division" | "post_office" | "pincode";

  const [serviceType, setServiceType] = useState<ServiceType>("food");
  const [pricingTab, setPricingTab] = useState<"customer" | "rider">("customer");
  const [rideVehicleType, setRideVehicleType] = useState<VehicleType>("2_wheeler");
  const [loading, setLoading] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const [rowBusyAction, setRowBusyAction] = useState<"save" | "delete" | null>(null);
  const [applied, setApplied] = useState<{ level: string; refId: string } | null>(null);
  const [effectiveSlabs, setEffectiveSlabs] = useState<SlabRow[]>([]);
  const [slabs, setSlabs] = useState<SlabRow[]>([]);
  const [surgeRefreshKey, setSurgeRefreshKey] = useState(0);
  const [surgeSheetOpen, setSurgeSheetOpen] = useState(false);
  const slabsRef = useRef<SlabRow[]>([]);
  const actorType: ActorType = pricingTab === "rider" ? "rider" : "customer";
  const riderService = serviceType === "person_ride" ? "ride" : serviceType;

  useEffect(() => {
    slabsRef.current = slabs;
  }, [slabs]);

  useEffect(() => {
    if (pricingTab !== "rider") return;
    prefetchRiderPayoutSlabs({
      level,
      refId: row.id,
      service: riderService,
      vehicleType: serviceType === "person_ride" ? rideVehicleType : undefined,
    });
  }, [pricingTab, level, row.id, riderService, serviceType, rideVehicleType]);

  const mapRows = useCallback((rows: any[] | undefined | null): SlabRow[] => {
    if (!Array.isArray(rows)) return [];
    return rows.map((s) => ({
      id: Number(s.id),
      minKm: Number(s.minKm),
      maxKm: s.maxKm == null ? null : Number(s.maxKm),
      baseFare: s.baseFare == null ? null : Number(s.baseFare),
      perKmRate: Number(s.perKmRate),
      minCharge: s.minCharge == null ? null : Number(s.minCharge),
      waitingChargePerMin: s.waitingChargePerMin == null ? null : Number(s.waitingChargePerMin),
      surgeMultiplier: s.surgeMultiplier == null ? null : Number(s.surgeMultiplier),
      priority: Number(s.priority ?? 100),
      isActive: s.isActive === true,
    }));
  }, []);

  const refresh = useCallback(async () => {
    if (pricingTab === "rider" || (pricingTab === "customer" && serviceType === "person_ride")) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        level,
        refId: row.id,
        serviceType,
        actorType,
      });
      const [ownRes, ctxRes] = await Promise.all([
        fetch(`/api/super-admin/geo/delivery-rate-slabs?${qs.toString()}`, { cache: "no-store" }),
        fetch(`/api/super-admin/geo/delivery-rate-slabs/context?${qs.toString()}`, { cache: "no-store" }),
      ]);
      if (!ownRes.ok) throw new Error((await ownRes.json())?.error ?? "Failed to load slabs");
      if (!ctxRes.ok) throw new Error((await ctxRes.json())?.error ?? "Failed to load effective slabs");

      const ownJson = (await ownRes.json()) as { slabs: any[] };
      const ctxJson = (await ctxRes.json()) as { applied: { level: string; refId: string } | null; slabs: any[] };

      setApplied(ctxJson.applied ?? null);
      setEffectiveSlabs(mapRows(ctxJson.slabs));
      setSlabs(mapRows(ownJson.slabs));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load slabs");
    } finally {
      setLoading(false);
    }
  }, [actorType, level, mapRows, pricingTab, row.id, serviceType]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const inheritedHint = useMemo(() => {
    if (!applied) return "No slabs configured on this chain.";
    const inherited = applied.level !== level || applied.refId !== row.id;
    return inherited
      ? `Effective slabs are inherited from ${applied.level.replaceAll("_", " ")}. Add slabs here to override for this node.`
      : "Effective slabs come from this node.";
  }, [applied, level, row.id]);

  const isInherited = applied != null && (applied.level !== level || applied.refId !== row.id);

  const patchRow = useCallback((id: number, patch: Partial<SlabRow>) => {
    setSlabs((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);

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
        waitingChargePerMin: prev.length === 0 ? 0 : null,
        surgeMultiplier: prev.length === 0 ? 1 : null,
        priority: 100,
        isActive: true,
      },
    ]);
  };

  const saveRow = async (r: SlabRow) => {
    if (rowBusyId != null) return;

    // Normalize: enforce rider-only + base-fare-only-on-first-slab at the UI boundary.
    // This prevents "looks saved but disappears after refresh" due to API validation rejection.
    const normalized: SlabRow = {
      ...r,
      baseFare: r.minKm === 0 ? r.baseFare : null,
      waitingChargePerMin: actorType === "rider" ? r.waitingChargePerMin ?? null : null,
      surgeMultiplier: actorType === "rider" ? r.surgeMultiplier ?? null : null,
    };

    if (normalized.maxKm != null && normalized.maxKm <= normalized.minKm) {
      toast.error("maxKm must be > minKm");
      return;
    }
    if ((normalized.baseFare ?? 0) > 0 && normalized.minKm !== 0) {
      toast.error("Base fare can be set only on the first slab (minKm=0)");
      return;
    }
    setRowBusyId(normalized.id);
    setRowBusyAction("save");
    try {
      if (normalized.id > 0) {
        const res = await fetch(`/api/super-admin/geo/delivery-rate-slabs/${normalized.id}`, {
          method: "PATCH",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            minKm: normalized.minKm,
            maxKm: normalized.maxKm,
            baseFare: normalized.baseFare,
            perKmRate: normalized.perKmRate,
            minCharge: normalized.minCharge,
            waitingChargePerMin: normalized.waitingChargePerMin,
            surgeMultiplier: normalized.surgeMultiplier,
            priority: normalized.priority,
            isActive: normalized.isActive,
          }),
        });
        if (!res.ok) throw new Error((await res.json())?.error ?? "Update failed");
      } else {
        const res = await fetch(`/api/super-admin/geo/delivery-rate-slabs`, {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            level,
            refId: row.id,
            serviceType,
            actorType,
            minKm: normalized.minKm,
            maxKm: normalized.maxKm,
            baseFare: normalized.baseFare,
            perKmRate: normalized.perKmRate,
            minCharge: normalized.minCharge,
            waitingChargePerMin: normalized.waitingChargePerMin,
            surgeMultiplier: normalized.surgeMultiplier,
            priority: normalized.priority,
            isActive: normalized.isActive,
          }),
        });
        if (!res.ok) throw new Error((await res.json())?.error ?? "Insert failed");
      }
      toast.success("Saved");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setRowBusyId(null);
      setRowBusyAction(null);
    }
  };

  const saveRowById = async (id: number) => {
    const current = slabsRef.current.find((x) => x.id === id);
    if (!current) {
      toast.error("Row not found");
      return;
    }
    await saveRow(current);
  };

  const deleteRow = async (id: number) => {
    if (id <= 0) {
      setSlabs((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    if (!confirm("Delete this slab?")) return;
    if (rowBusyId != null) return;
    setRowBusyId(id);
    setRowBusyAction("delete");
    try {
      const res = await fetch(`/api/super-admin/geo/delivery-rate-slabs/${id}`, { method: "DELETE", cache: "no-store" });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Delete failed");
      toast.success("Deleted");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setRowBusyId(null);
      setRowBusyAction(null);
    }
  };

  const showCustomerSlabActions =
    pricingTab === "customer" && serviceType !== "person_ride";
  const mainAreaLeft = useMainAreaLeftInset();

  return (
    <>
    <div
      className="fixed inset-y-0 right-0 z-[70] flex items-center justify-center bg-slate-950/50 p-2 sm:p-4 max-lg:left-0"
      style={{ left: mainAreaLeft > 0 ? mainAreaLeft : undefined }}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[92vh] w-full max-w-[min(100%,1100px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">Geo · Delivery slabs</p>
            <h2 className="mt-1 truncate text-lg font-semibold text-slate-900">
              {row.name} <span className="text-slate-400">({row.kind.replaceAll("_", " ")})</span>
            </h2>
            <p className="mt-1 text-xs text-slate-600">{inheritedHint}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={props.onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap items-end gap-4">
              <label className="block text-xs font-semibold text-slate-700">
                Service
                <select
                  className="mt-1.5 block w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value as ServiceType)}
                >
                  <option value="food">FOOD</option>
                  <option value="parcel">PARCEL</option>
                  <option value="person_ride">RIDE</option>
                </select>
              </label>
              <div className="block">
                <span className="text-xs font-semibold text-slate-700">Pricing</span>
                <div className="mt-1.5 inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                  <button
                    type="button"
                    disabled={loading || rowBusyId != null}
                    onClick={() => setPricingTab("customer")}
                    className={
                      "px-3 py-2 text-sm font-semibold transition " +
                      (pricingTab === "customer"
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-50")
                    }
                  >
                    Customer
                  </button>
                  <button
                    type="button"
                    disabled={loading || rowBusyId != null}
                    onClick={() => setPricingTab("rider")}
                    className={
                      "px-3 py-2 text-sm font-semibold transition " +
                      (pricingTab === "rider"
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-50")
                    }
                  >
                    Rider
                  </button>
                </div>
              </div>
              {serviceType === "person_ride" ? (
                <>
                  <label className="block text-xs font-semibold text-slate-700">
                    Vehicle
                    <select
                      className="mt-1.5 block w-52 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                      value={rideVehicleType}
                      onChange={(e) => setRideVehicleType(e.target.value as VehicleType)}
                    >
                      {VEHICLE_OPTIONS.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {level === "state" ? (
                    <InlineVehicleRideLimitField
                      stateId={row.id}
                      vehicleType={rideVehicleType}
                      stateLabel={row.name}
                    />
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {level === "state" && pricingTab === "rider" ? (
                <button
                  type="button"
                  onClick={() => setSurgeSheetOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700"
                >
                  <Plus className="h-4 w-4" />
                  Add surge
                </button>
              ) : null}
              {showCustomerSlabActions ? (
                <>
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
                </>
              ) : null}
            </div>
          </div>

          {level !== "state" && pricingTab === "rider" ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              State rider surge rules are configured at the <strong>state</strong> level only. Open the
              parent state node to manage surges for Food, Parcel &amp; Ride.
            </p>
          ) : null}

          {pricingTab === "rider" ? (
            <RiderPayoutSlabsPanel
              level={level}
              refId={row.id}
              service={riderService as "food" | "parcel" | "ride"}
              vehicleType={rideVehicleType}
              surgeRefreshKey={surgeRefreshKey}
            />
          ) : serviceType === "person_ride" ? (
            <RideCustomerPricingPanel level={level} refId={row.id} vehicleType={rideVehicleType} />
          ) : (
          <>
          {isInherited && effectiveSlabs.length > 0 ? (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-900">Effective slabs (inherited)</p>
                  <p className="text-[11px] text-amber-900/80">
                    These are coming from <span className="font-semibold">{applied!.level.replaceAll("_", " ")}</span>. To override, add slabs on this node.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-amber-50 text-[10px] font-bold uppercase tracking-wider text-amber-900/70">
                    <tr>
                      <th className="px-3 py-2">Min km</th>
                      <th className="px-3 py-2">Max km</th>
                      <th className="px-3 py-2">Base fare</th>
                      <th className="px-3 py-2">Per km</th>
                      <th className="px-3 py-2">Min charge</th>
                      <th className="px-3 py-2">Priority</th>
                      <th className="px-3 py-2">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {effectiveSlabs.map((s) => (
                      <tr key={`eff-${s.id}`} className="border-t border-amber-100">
                        <td className="px-3 py-2 font-mono">{s.minKm}</td>
                        <td className="px-3 py-2 font-mono">{s.maxKm ?? "∞"}</td>
                        <td className="px-3 py-2 font-mono">{s.baseFare ?? "—"}</td>
                        <td className="px-3 py-2 font-mono">{s.perKmRate}</td>
                        <td className="px-3 py-2 font-mono">{s.minCharge ?? "—"}</td>
                        <td className="px-3 py-2 font-mono">{s.priority}</td>
                        <td className="px-3 py-2">{s.isActive ? "✓" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-[800px] w-full text-left text-sm">
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
                    <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={8}>
                      No slabs stored at this node.
                    </td>
                  </tr>
                ) : (
                  slabs.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5">
                        <input
                          className="w-full min-w-[4rem] rounded-md border border-slate-200 px-2.5 py-1.5 font-mono text-sm"
                          value={String(s.minKm)}
                          onChange={(e) => patchRow(s.id, { minKm: numOr(e.target.value, s.minKm) })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          className="w-full min-w-[4rem] rounded-md border border-slate-200 px-2.5 py-1.5 font-mono text-sm"
                          placeholder="∞"
                          value={s.maxKm == null ? "" : String(s.maxKm)}
                          onChange={(e) => patchRow(s.id, { maxKm: num(e.target.value) })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          className="w-full min-w-[4rem] rounded-md border border-slate-200 px-2.5 py-1.5 font-mono text-sm"
                          disabled={s.minKm !== 0}
                          placeholder={s.minKm !== 0 ? "—" : ""}
                          value={s.minKm !== 0 ? "" : s.baseFare == null ? "" : String(s.baseFare)}
                          onChange={(e) => patchRow(s.id, { baseFare: num(e.target.value) })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          className="w-full min-w-[4rem] rounded-md border border-slate-200 px-2.5 py-1.5 font-mono text-sm"
                          value={String(s.perKmRate)}
                          onChange={(e) => patchRow(s.id, { perKmRate: numOr(e.target.value, s.perKmRate) })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          className="w-full min-w-[4rem] rounded-md border border-slate-200 px-2.5 py-1.5 font-mono text-sm"
                          value={s.minCharge == null ? "" : String(s.minCharge)}
                          onChange={(e) => patchRow(s.id, { minCharge: num(e.target.value) })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          className="w-full min-w-[4rem] rounded-md border border-slate-200 px-2.5 py-1.5 font-mono text-sm"
                          value={String(s.priority)}
                          onChange={(e) => patchRow(s.id, { priority: Math.floor(numOr(e.target.value, s.priority)) })}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={s.isActive}
                          onChange={(e) => patchRow(s.id, { isActive: e.target.checked })}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            disabled={rowBusyId != null}
                            onClick={() => void saveRowById(s.id)}
                            className="rounded-md border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100 disabled:opacity-50"
                          >
                            {rowBusyId === s.id && rowBusyAction === "save" ? (
                              <span className="inline-flex items-center gap-1">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Saving
                              </span>
                            ) : (
                              "Save"
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={rowBusyId != null}
                            onClick={() => void deleteRow(s.id)}
                            className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                          >
                            {rowBusyId === s.id && rowBusyAction === "delete" ? (
                              <span className="inline-flex items-center gap-1">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Deleting
                              </span>
                            ) : (
                              "Delete"
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-1 pb-2 text-[11px] text-slate-600">
            <p>
              <span className="font-semibold text-slate-800">Base fare</span> is added <span className="font-semibold">once</span> (only slab with minKm=0).
              <span className="ml-1 font-semibold text-slate-800">Min charge</span> is a floor applied to the final total after base + per-km.
            </p>
            <p className="text-slate-500">
              Validation: slabs start at 0 km, ranges are contiguous with no overlaps or gaps, base fare only on the first slab. Leave max km empty on the last row to cover longer distances.
            </p>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
    {level === "state" ? (
      <StateSurgeManagementSidesheet
        open={surgeSheetOpen}
        onClose={() => setSurgeSheetOpen(false)}
        stateId={row.id}
        stateLabel={row.name}
        onChange={() => setSurgeRefreshKey((k) => k + 1)}
      />
    ) : null}
    </>
  );
});

