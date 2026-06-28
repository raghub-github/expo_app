"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, Loader2, Shield, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  RIDE_VEHICLE_LIMIT_LABELS,
  RIDE_VEHICLE_LIMIT_TYPES,
  type RideVehiclePricingType,
} from "@/lib/geo/ride-state-config-shared";
import { calcCustomerPreviewBreakdown } from "@/lib/pricing/slabPricingEngine";
import {
  blankCustomerSlabRow,
  customerSlabFromApi,
  parseCustomerSlabForPreview,
  parseCustomerSlabForSave,
  type EditableCustomerSlabRow,
} from "@/lib/pricing/slabEditableRows";
import {
  formatDecimalField,
  formatIntegerField,
  parseDecimalOrZero,
  parseIntegerOrZero,
  parseOptionalDecimal,
  parseOptionalInteger,
} from "@/lib/pricing/slabInputUtils";
import { SLAB_INPUT_CLS, SlabNumericInput } from "./SlabNumericInput";

type FallbackService = "food" | "parcel" | "person_ride";

type EditableFallbackSlabRow = EditableCustomerSlabRow & {
  waitingChargePerMin: string;
  waitingStartAfter: string;
};

function fallbackSlabFromApi(s: Record<string, unknown>): EditableFallbackSlabRow {
  const base = customerSlabFromApi(s);
  return {
    ...base,
    waitingChargePerMin: formatDecimalField(
      s.waitingChargePerMin == null ? null : Number(s.waitingChargePerMin)
    ),
    waitingStartAfter: formatIntegerField(
      Number(s.waitingStartAfter ?? 0),
      "0"
    ),
  };
}

function blankFallbackSlabRow(prev?: EditableFallbackSlabRow): EditableFallbackSlabRow {
  const base = blankCustomerSlabRow(prev);
  return {
    ...base,
    waitingChargePerMin: prev?.waitingChargePerMin ?? "",
    waitingStartAfter: prev?.waitingStartAfter ?? "0",
  };
}

function parseFallbackSlabForSave(row: EditableFallbackSlabRow, service: FallbackService) {
  const core = parseCustomerSlabForSave(row);
  if (service !== "person_ride") return core;
  return {
    ...core,
    waitingChargePerMin: parseOptionalDecimal(row.waitingChargePerMin),
    waitingStartAfter: parseOptionalInteger(row.waitingStartAfter) ?? 0,
  };
}

const SERVICE_LABELS: Record<FallbackService, string> = {
  food: "Food",
  parcel: "Parcel",
  person_ride: "Ride",
};

export function DeliveryFallbackPanel() {
  const [service, setService] = useState<FallbackService>("food");
  const [vehicleType, setVehicleType] = useState<RideVehiclePricingType>("2_wheeler");
  const [loading, setLoading] = useState(true);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const [slabs, setSlabs] = useState<EditableFallbackSlabRow[]>([]);
  const [previewDistanceKm, setPreviewDistanceKm] = useState("5");
  const [previewWaitMin, setPreviewWaitMin] = useState("0");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ serviceType: service });
      if (service === "person_ride") qs.set("vehicleType", vehicleType);
      const res = await fetch(`/api/super-admin/fallback-pricing-slabs?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Load failed");
      const json = await res.json();
      setSlabs((json.slabs ?? []).map((s: Record<string, unknown>) => fallbackSlabFromApi(s)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load fallback slabs");
    } finally {
      setLoading(false);
    }
  }, [service, vehicleType]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const previewSlabs = useMemo(
    () => slabs.filter((s) => s.isActive).map((s) => parseCustomerSlabForPreview(s)),
    [slabs]
  );

  const customerPreview = useMemo(() => {
    if (previewSlabs.length === 0) return null;
    return calcCustomerPreviewBreakdown({
      distanceKm: parseDecimalOrZero(previewDistanceKm),
      slabs: previewSlabs,
    });
  }, [previewSlabs, previewDistanceKm]);

  const rideWaitPreview = useMemo(() => {
    if (service !== "person_ride" || previewSlabs.length === 0) return 0;
    const first = slabs.find((s) => s.isActive && parseDecimalOrZero(s.minKm) === 0);
    const rate = parseOptionalDecimal(first?.waitingChargePerMin ?? "") ?? 0;
    const free = parseIntegerOrZero(first?.waitingStartAfter ?? "0");
    const wait = parseDecimalOrZero(previewWaitMin);
    return Math.max(0, wait - free) * rate;
  }, [service, slabs, previewSlabs.length, previewWaitMin]);

  const previewTotal = customerPreview
    ? customerPreview.finalAmount + (service === "person_ride" ? rideWaitPreview : 0)
    : null;

  const addBlank = () => {
    setSlabs((prev) => [...prev, blankFallbackSlabRow(prev[prev.length - 1])]);
  };

  const save = async (r: EditableFallbackSlabRow) => {
    setRowBusyId(r.id);
    try {
      const payload = {
        serviceType: service,
        ...(service === "person_ride" ? { vehicleType } : {}),
        ...parseFallbackSlabForSave(r, service),
      };
      const res =
        r.id > 0
          ? await fetch(`/api/super-admin/fallback-pricing-slabs/${r.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/super-admin/fallback-pricing-slabs`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Save failed");
      toast.success("Fallback slab saved");
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
    if (!confirm("Delete this fallback slab?")) return;
    setRowBusyId(id);
    try {
      const res = await fetch(`/api/super-admin/fallback-pricing-slabs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Delete failed");
      toast.success("Deleted");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setRowBusyId(null);
    }
  };

  const showRideWaitCols = service === "person_ride";

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-md shadow-slate-200/30 sm:rounded-2xl sm:p-5">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600/10 text-teal-700 ring-1 ring-teal-600/15">
          <Truck className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Fallback slab pricing</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm">
            Backup slab pricing when geo delivery slabs are missing, invalid, or the drop pincode is unmapped.
            Uses the same cumulative slab engine as location-specific pricing. Configure per service
            {service === "person_ride" ? " and vehicle" : ""}.
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="block text-xs font-semibold text-slate-700">Service</span>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              {(["food", "parcel", "person_ride"] as FallbackService[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setService(s)}
                  className={
                    "px-3 py-2 text-sm font-semibold transition " +
                    (service === s ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50")
                  }
                >
                  {SERVICE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          {service === "person_ride" ? (
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-700">
              Vehicle
              <select
                className="block w-52 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal shadow-sm"
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as RideVehiclePricingType)}
              >
                {RIDE_VEHICLE_LIMIT_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {RIDE_VEHICLE_LIMIT_LABELS[v]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
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
      </div>

      <div className="mb-5 rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50/80 to-emerald-50/50 px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-teal-800">Fallback preview</p>
            <p className="mt-0.5 text-[11px] text-teal-700/80">Includes unsaved edits in the table below</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-700">
              Distance km
              <SlabNumericInput
                className={`mt-1 block w-28 ${SLAB_INPUT_CLS}`}
                kind="decimal"
                value={previewDistanceKm}
                onChange={setPreviewDistanceKm}
              />
            </label>
            {showRideWaitCols ? (
              <label className="text-xs font-semibold text-slate-700">
                Wait min
                <SlabNumericInput
                  className={`mt-1 block w-24 ${SLAB_INPUT_CLS}`}
                  kind="decimal"
                  value={previewWaitMin}
                  onChange={setPreviewWaitMin}
                />
              </label>
            ) : null}
            <div className="min-w-[5.5rem] rounded-lg bg-white px-4 py-2 text-center shadow-sm ring-1 ring-teal-200">
              <span className="text-2xl font-bold text-teal-900">
                {previewTotal == null ? "—" : `₹${previewTotal.toFixed(2)}`}
              </span>
            </div>
          </div>
        </div>
        {customerPreview ? (
          <div className="mt-3 grid gap-2 rounded-lg border border-teal-100 bg-white/80 px-3 py-2 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              Base: <span className="font-mono font-semibold">₹{customerPreview.baseFare.toFixed(2)}</span>
            </div>
            <div>
              Distance:{" "}
              <span className="font-mono font-semibold">₹{customerPreview.distanceAmount.toFixed(2)}</span>
            </div>
            {rideWaitPreview > 0 ? (
              <div>
                Waiting: <span className="font-mono font-semibold">₹{rideWaitPreview.toFixed(2)}</span>
              </div>
            ) : null}
            {customerPreview.minChargeAdjustment > 0 ? (
              <div>
                Min adj.:{" "}
                <span className="font-mono font-semibold">
                  ₹{customerPreview.minChargeAdjustment.toFixed(2)}
                </span>
              </div>
            ) : null}
            <div>
              Total: <span className="font-mono font-semibold">₹{(previewTotal ?? 0).toFixed(2)}</span>
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
            Add active slabs to preview fallback pricing.
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-[900px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Min km</th>
              <th className="px-3 py-3">Max km</th>
              <th className="px-3 py-3">Base fare</th>
              <th className="px-3 py-3">Per km</th>
              <th className="px-3 py-3">Min charge</th>
              {showRideWaitCols ? (
                <>
                  <th className="px-3 py-3">Wait ₹/min</th>
                  <th className="px-3 py-3">Free wait</th>
                </>
              ) : null}
              <th className="px-3 py-3">Priority</th>
              <th className="px-3 py-3 text-center">Active</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={showRideWaitCols ? 10 : 8} className="px-4 py-8 text-center text-slate-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : slabs.length === 0 ? (
              <tr>
                <td colSpan={showRideWaitCols ? 10 : 8} className="px-4 py-8 text-center text-sm text-slate-500">
                  No fallback slabs for {SERVICE_LABELS[service]}
                  {service === "person_ride" ? ` · ${RIDE_VEHICLE_LIMIT_LABELS[vehicleType]}` : ""}. Click Add slab.
                </td>
              </tr>
            ) : (
              slabs.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-3 py-2">
                    <SlabNumericInput
                      className={SLAB_INPUT_CLS}
                      kind="decimal"
                      value={s.minKm}
                      onChange={(v) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, minKm: v } : x)))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <SlabNumericInput
                      className={SLAB_INPUT_CLS}
                      kind="decimal"
                      placeholder="∞"
                      value={s.maxKm}
                      onChange={(v) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, maxKm: v } : x)))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <SlabNumericInput
                      className={SLAB_INPUT_CLS}
                      kind="decimal"
                      disabled={parseDecimalOrZero(s.minKm) !== 0}
                      value={parseDecimalOrZero(s.minKm) !== 0 ? "" : s.baseFare}
                      onChange={(v) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, baseFare: v } : x)))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <SlabNumericInput
                      className={SLAB_INPUT_CLS}
                      kind="decimal"
                      value={s.perKmRate}
                      onChange={(v) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, perKmRate: v } : x)))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <SlabNumericInput
                      className={SLAB_INPUT_CLS}
                      kind="decimal"
                      value={s.minCharge}
                      onChange={(v) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, minCharge: v } : x)))}
                    />
                  </td>
                  {showRideWaitCols ? (
                    <>
                      <td className="px-3 py-2">
                        <SlabNumericInput
                          className={SLAB_INPUT_CLS}
                          kind="decimal"
                          value={s.waitingChargePerMin}
                          onChange={(v) =>
                            setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, waitingChargePerMin: v } : x)))
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <SlabNumericInput
                          className={SLAB_INPUT_CLS}
                          kind="integer"
                          value={s.waitingStartAfter}
                          onChange={(v) =>
                            setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, waitingStartAfter: v } : x)))
                          }
                        />
                      </td>
                    </>
                  ) : null}
                  <td className="px-3 py-2">
                    <SlabNumericInput
                      className={`w-20 ${SLAB_INPUT_CLS}`}
                      kind="integer"
                      value={s.priority}
                      onChange={(v) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, priority: v } : x)))}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={s.isActive}
                      onChange={(e) =>
                        setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, isActive: e.target.checked } : x)))
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        disabled={rowBusyId != null}
                        onClick={() => void save(s)}
                        className="rounded-md bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                      >
                        {rowBusyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                      </button>
                      <button
                        type="button"
                        disabled={rowBusyId != null}
                        onClick={() => void del(s.id)}
                        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <p>
          Legacy flat formula (<code>base + km × rate</code>) in system_config is only used if no active fallback
          slabs exist. Migration 0366 bootstraps your previous base/per-km values into the first open-ended slab per
          service. Rider payout fallback can be added later via <code>pricing_side=rider</code>.
        </p>
      </div>
    </div>
  );
}
