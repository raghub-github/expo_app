"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Layers, Loader2, Plus } from "lucide-react";
import { RiderPayoutRulesPanel } from "./RiderPayoutRulesPanel";
import { PrePickupCompensationPanel } from "./PrePickupCompensationPanel";
import { DynamicPricingPanel } from "./DynamicPricingPanel";
import { VEHICLE_OPTIONS, PARCEL_VEHICLE_OPTIONS, type VehicleType } from "./rideVehicleTypes";
import { RideCustomerPricingPanel } from "./RideCustomerPricingPanel";
import { ParcelCustomerPricingPanel } from "./ParcelCustomerPricingPanel";
import { InlineVehicleRideLimitField } from "./InlineVehicleRideLimitField";
import { StateSurgeManagementSidesheet } from "./StateSurgeManagementSidesheet";
import { prefetchServicePayoutRules } from "@/lib/geo/servicePayoutRulesCache";
import {
  deliveryRateSlabsCacheKey,
  fetchDeliveryRateSlabs,
  getDeliveryRateSlabsCache,
  invalidateDeliveryRateSlabsCache,
  invalidateDeliveryRateSlabsForNode,
  prefetchDeliveryRateSlabs,
  type DeliveryRateSlabsPayload,
} from "@/lib/geo/deliveryRateSlabsCache";
import { calcCustomerPreviewBreakdown } from "@/lib/pricing/slabPricingEngine";
import {
  blankCustomerSlabRow,
  customerSlabFromApi,
  normalizeCustomerSlabRow,
  parseCustomerSlabForPreview,
  parseCustomerSlabForSave,
  type EditableCustomerSlabRow,
} from "@/lib/pricing/slabEditableRows";
import {
  buildSavedFingerprintMap,
  customerSlabFingerprint,
  isSlabRowDirty,
} from "@/lib/pricing/slabDirtyState";
import { parseDecimalOrZero } from "@/lib/pricing/slabInputUtils";
import { applyCustomerSlabSaveResponse } from "@/lib/pricing/slabSaveResponse";
import { SlabNumericInput } from "./SlabNumericInput";

export type GeoNodeLevel = "state" | "region" | "district" | "division" | "post_office" | "pincode";

type ServiceType = "food" | "parcel" | "person_ride";
type ActorType = "customer" | "rider";

type SlabRow = EditableCustomerSlabRow;

type DisplaySlabRow = {
  id: number;
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  perKmRate: number;
  minCharge: number | null;
  priority: number;
  isActive: boolean;
};

/** Geo & Delivery Slabs pricing editor for one geo node — full-page content (no overlay/portal). */
export function GeoNodePricingContent(props: { level: GeoNodeLevel; refId: string; name: string }) {
  const { level, refId, name } = props;

  const [serviceType, setServiceType] = useState<ServiceType>("food");
  const [pricingTab, setPricingTab] = useState<"customer" | "rider">("customer");
  const [rideVehicleType, setRideVehicleType] = useState<VehicleType>("2_wheeler");
  const [loading, setLoading] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const [rowBusyAction, setRowBusyAction] = useState<"save" | "delete" | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [applied, setApplied] = useState<{ level: string; refId: string } | null>(null);
  const [effectiveSlabs, setEffectiveSlabs] = useState<DisplaySlabRow[]>([]);
  const [slabs, setSlabs] = useState<SlabRow[]>([]);
  const [savedFingerprints, setSavedFingerprints] = useState<Map<number, string>>(new Map());
  const [surgeRefreshKey, setSurgeRefreshKey] = useState(0);
  const [surgeSheetOpen, setSurgeSheetOpen] = useState(false);
  const [previewDistanceKm, setPreviewDistanceKm] = useState("3");
  const slabsRef = useRef<SlabRow[]>([]);
  const savedFingerprintsRef = useRef(savedFingerprints);
  const actorType: ActorType = pricingTab === "rider" ? "rider" : "customer";
  const riderService = serviceType === "person_ride" ? "ride" : serviceType;

  // Parcel never uses 4 Wheeler AC — reset if leftover from Ride selection.
  useEffect(() => {
    if (serviceType === "parcel" && rideVehicleType === "4_wheeler_ac") {
      setRideVehicleType("2_wheeler");
    }
  }, [serviceType, rideVehicleType]);

  useLayoutEffect(() => {
    slabsRef.current = slabs;
  }, [slabs]);

  useLayoutEffect(() => {
    savedFingerprintsRef.current = savedFingerprints;
  }, [savedFingerprints]);

  const rowBusyRef = useRef(rowBusyId);
  const savingAllRef = useRef(savingAll);

  useLayoutEffect(() => {
    rowBusyRef.current = rowBusyId;
  }, [rowBusyId]);

  useLayoutEffect(() => {
    savingAllRef.current = savingAll;
  }, [savingAll]);

  useEffect(() => {
    if (pricingTab === "rider" || serviceType === "person_ride" || serviceType === "parcel") return;
    prefetchDeliveryRateSlabs({
      level,
      refId,
      serviceType,
      actorType,
    });
  }, [actorType, level, pricingTab, refId, serviceType]);

  useEffect(() => {
    if (pricingTab !== "rider") return;
    prefetchServicePayoutRules({
      level,
      refId,
      service: riderService,
    });
  }, [pricingTab, level, refId, riderService]);

  const mapRows = useCallback((rows: any[] | undefined | null): SlabRow[] => {
    if (!Array.isArray(rows)) return [];
    return rows.map((s) => customerSlabFromApi(s));
  }, []);

  const mapDisplayRows = useCallback((rows: any[] | undefined | null): DisplaySlabRow[] => {
    if (!Array.isArray(rows)) return [];
    return rows.map((s) => ({
      id: Number(s.id),
      minKm: Number(s.minKm),
      maxKm: s.maxKm == null ? null : Number(s.maxKm),
      baseFare: s.baseFare == null ? null : Number(s.baseFare),
      perKmRate: Number(s.perKmRate),
      minCharge: s.minCharge == null ? null : Number(s.minCharge),
      priority: Number(s.priority ?? 100),
      isActive: s.isActive === true,
    }));
  }, []);

  const applyDeliveryPayload = useCallback(
    (payload: DeliveryRateSlabsPayload) => {
      setApplied(payload.applied);
      setEffectiveSlabs(mapDisplayRows(payload.effectiveSlabs));
      const mapped = mapRows(payload.ownSlabs);
      setSlabs(mapped);
      setSavedFingerprints(buildSavedFingerprintMap(mapped, customerSlabFingerprint));
    },
    [mapDisplayRows, mapRows]
  );

  const refresh = useCallback(
    async (opts?: { force?: boolean; showLoading?: boolean }) => {
      if (
        pricingTab === "rider" ||
        (pricingTab === "customer" && (serviceType === "person_ride" || serviceType === "parcel"))
      )
        return;

      const cacheKey = deliveryRateSlabsCacheKey({
        level,
        refId,
        serviceType,
        actorType,
      });
      const cached = !opts?.force ? getDeliveryRateSlabsCache(cacheKey) : null;
      if (cached) applyDeliveryPayload(cached);

      const showLoading = opts?.showLoading ?? !cached;
      if (showLoading) setLoading(true);

      try {
        const payload = await fetchDeliveryRateSlabs({
          level,
          refId,
          serviceType,
          actorType,
          force: opts?.force,
        });
        applyDeliveryPayload(payload);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load slabs");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [actorType, applyDeliveryPayload, level, pricingTab, refId, serviceType]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const inheritedHint = useMemo(() => {
    if (!applied) return "No slabs configured on this chain.";
    const inherited = applied.level !== level || applied.refId !== refId;
    return inherited
      ? `Effective slabs are inherited from ${applied.level.replaceAll("_", " ")}. Add slabs here to override for this node.`
      : "Effective slabs come from this node.";
  }, [applied, level, refId]);

  const isInherited = applied != null && (applied.level !== level || applied.refId !== refId);

  const patchRow = useCallback((id: number, patch: Partial<SlabRow>) => {
    setSlabs((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);

  const addBlank = () => {
    setSlabs((prev) => [...prev, blankCustomerSlabRow(prev[prev.length - 1])]);
  };

  const saveRow = async (r: SlabRow, opts?: { quiet?: boolean; skipRefresh?: boolean }) => {
    if (rowBusyId != null && !opts?.quiet) return;
    if (savingAll && !opts?.quiet) return;

    const normalized = normalizeCustomerSlabRow(r);
    const parsed = parseCustomerSlabForSave(normalized);
    const normalizedPayload = {
      ...parsed,
      waitingChargePerMin: actorType === "rider" ? parsed.waitingChargePerMin : null,
      surgeMultiplier: actorType === "rider" ? parsed.surgeMultiplier : null,
    };

    if (normalizedPayload.maxKm != null && normalizedPayload.maxKm <= normalizedPayload.minKm) {
      throw new Error("maxKm must be > minKm");
    }
    if ((normalizedPayload.baseFare ?? 0) > 0 && normalizedPayload.minKm !== 0) {
      throw new Error("Base fare can be set only on the first slab (minKm=0)");
    }

    if (!opts?.quiet) {
      setRowBusyId(normalized.id);
      setRowBusyAction("save");
    }

    try {
      let savedSlab: Record<string, unknown> | undefined;
      if (normalized.id > 0) {
        const res = await fetch(`/api/super-admin/geo/delivery-rate-slabs/${normalized.id}`, {
          method: "PATCH",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            minKm: normalizedPayload.minKm,
            maxKm: normalizedPayload.maxKm,
            baseFare: normalizedPayload.baseFare,
            perKmRate: normalizedPayload.perKmRate,
            minCharge: normalizedPayload.minCharge,
            waitingChargePerMin: normalizedPayload.waitingChargePerMin,
            surgeMultiplier: normalizedPayload.surgeMultiplier,
            priority: normalizedPayload.priority,
            isActive: normalizedPayload.isActive,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string; slab?: Record<string, unknown> };
        if (!res.ok) throw new Error(json.error ?? "Update failed");
        savedSlab = json.slab;
      } else {
        const res = await fetch(`/api/super-admin/geo/delivery-rate-slabs`, {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            level,
            refId,
            serviceType,
            actorType,
            minKm: normalizedPayload.minKm,
            maxKm: normalizedPayload.maxKm,
            baseFare: normalizedPayload.baseFare,
            perKmRate: normalizedPayload.perKmRate,
            minCharge: normalizedPayload.minCharge,
            waitingChargePerMin: normalizedPayload.waitingChargePerMin,
            surgeMultiplier: normalizedPayload.surgeMultiplier,
            priority: normalizedPayload.priority,
            isActive: normalizedPayload.isActive,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string; slab?: Record<string, unknown> };
        if (!res.ok) throw new Error(json.error ?? "Insert failed");
        savedSlab = json.slab;
      }
      if (savedSlab) {
        applyCustomerSlabSaveResponse({
          previousId: normalized.id,
          slab: savedSlab,
          setSlabs,
          setSavedFingerprints,
        });
      }
      invalidateDeliveryRateSlabsCache(
        deliveryRateSlabsCacheKey({ level, refId, serviceType, actorType })
      );
      if (!opts?.quiet) toast.success("Saved");
      if (!opts?.skipRefresh) {
        void refresh({ force: true, showLoading: false });
      }
    } finally {
      if (!opts?.quiet) {
        setRowBusyId(null);
        setRowBusyAction(null);
      }
    }
  };

  const saveRowById = async (id: number) => {
    if (rowBusyRef.current != null || savingAllRef.current) return;

    setRowBusyId(id);
    setRowBusyAction("save");
    rowBusyRef.current = id;

    try {
      const current = slabsRef.current.find((x) => x.id === id);
      if (!current) {
        toast.error("Row not found");
        return;
      }
      if (
        !isSlabRowDirty(id, customerSlabFingerprint(current), savedFingerprintsRef.current.get(id))
      ) {
        toast.message("No changes to save");
        return;
      }

      await saveRow(current, { quiet: true, skipRefresh: true });
      toast.success("Saved");
      invalidateDeliveryRateSlabsForNode(level, refId);
      void refresh({ force: true, showLoading: false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      rowBusyRef.current = null;
      setRowBusyId(null);
      setRowBusyAction(null);
    }
  };

  const saveAllRows = async () => {
    if (rowBusyRef.current != null || savingAllRef.current) return;

    setSavingAll(true);
    savingAllRef.current = true;

    try {
      const rows = slabsRef.current.filter((r) =>
        isSlabRowDirty(r.id, customerSlabFingerprint(r), savedFingerprintsRef.current.get(r.id))
      );
      if (rows.length === 0) {
        toast.message("No changes to save");
        return;
      }

      for (const r of rows) {
        await saveRow(r, { quiet: true, skipRefresh: true });
      }
      toast.success(`Saved ${rows.length} slab${rows.length === 1 ? "" : "s"}`);
      invalidateDeliveryRateSlabsForNode(level, refId);
      void refresh({ force: true, showLoading: false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save all failed");
    } finally {
      savingAllRef.current = false;
      setSavingAll(false);
    }
  };

  const deleteRow = async (id: number) => {
    if (id <= 0) {
      setSlabs((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    if (!confirm("Delete this slab?")) return;
    if (rowBusyId != null || savingAll) return;
    setRowBusyId(id);
    setRowBusyAction("delete");
    try {
      const res = await fetch(`/api/super-admin/geo/delivery-rate-slabs/${id}`, { method: "DELETE", cache: "no-store" });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Delete failed");
      toast.success("Deleted");
      invalidateDeliveryRateSlabsForNode(level, refId);
      void refresh({ force: true, showLoading: false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setRowBusyId(null);
      setRowBusyAction(null);
    }
  };

  const showCustomerSlabActions = pricingTab === "customer" && serviceType === "food";

  const actionBusy = rowBusyId != null || savingAll;

  const customerPreviewSlabs = useMemo(
    () => slabs.filter((s) => s.isActive).map((s) => parseCustomerSlabForPreview(s)),
    [slabs]
  );

  const customerPreviewBreakdown = useMemo(() => {
    if (!showCustomerSlabActions || customerPreviewSlabs.length === 0) return null;
    return calcCustomerPreviewBreakdown({
      distanceKm: parseDecimalOrZero(previewDistanceKm),
      slabs: customerPreviewSlabs,
    });
  }, [showCustomerSlabActions, customerPreviewSlabs, previewDistanceKm]);

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-6 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">Geo · Delivery slabs</p>
            <h2 className="mt-0.5 truncate text-lg font-semibold text-slate-900">
              {name} <span className="text-slate-400">({level.replaceAll("_", " ")})</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">{inheritedHint}</p>
          </div>

          <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
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
                  disabled={actionBusy}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-teal-300"
                >
                  <Layers className="h-4 w-4 text-teal-700" />
                  Add slab
                </button>
                <button
                  type="button"
                  onClick={() => void saveAllRows()}
                  disabled={actionBusy || slabs.length === 0}
                  className="inline-flex min-w-[6.5rem] items-center justify-center gap-2 rounded-lg border border-teal-300 bg-teal-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
                >
                  {savingAll ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving
                    </>
                  ) : (
                    "Save all"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void refresh({ force: true, showLoading: true })}
                  disabled={actionBusy || loading}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Refresh
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="px-6 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-xs font-semibold text-slate-700">
              Service
              <select
                className="mt-1 block w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
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
              <div className="mt-1 inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  disabled={actionBusy}
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
                  disabled={actionBusy}
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
            {serviceType === "person_ride" || serviceType === "parcel" ? (
              <>
                <label className="block text-xs font-semibold text-slate-700">
                  Vehicle
                  <select
                    className="mt-1 block w-52 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                    value={
                      serviceType === "parcel" && rideVehicleType === "4_wheeler_ac"
                        ? "2_wheeler"
                        : rideVehicleType
                    }
                    onChange={(e) => setRideVehicleType(e.target.value as VehicleType)}
                  >
                    {(serviceType === "parcel" ? PARCEL_VEHICLE_OPTIONS : VEHICLE_OPTIONS).map(
                      (v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      )
                    )}
                  </select>
                </label>
                {level === "state" && serviceType === "person_ride" ? (
                  <InlineVehicleRideLimitField
                    stateId={refId}
                    vehicleType={rideVehicleType}
                    stateLabel={name}
                  />
                ) : null}
              </>
            ) : null}
          </div>

          {level !== "state" && pricingTab === "rider" ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
              State rider surge rules are configured at the <strong>state</strong> level only. Open the
              parent state node to manage surges for Food, Parcel &amp; Ride.
            </p>
          ) : null}

          {pricingTab === "rider" ? (
            <>
              <RiderPayoutRulesPanel
                level={level}
                refId={refId}
                service={riderService as "food" | "parcel" | "ride"}
                surgeRefreshKey={surgeRefreshKey}
              />
              <PrePickupCompensationPanel
                level={level}
                refId={refId}
                service={riderService as "food" | "parcel" | "ride"}
              />
            </>
          ) : serviceType === "person_ride" ? (
            <RideCustomerPricingPanel level={level} refId={refId} vehicleType={rideVehicleType} />
          ) : serviceType === "parcel" ? (
            <ParcelCustomerPricingPanel level={level} refId={refId} vehicleType={rideVehicleType} />
          ) : (
            <>
              {showCustomerSlabActions ? (
                <div className="mt-4 rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50/80 to-emerald-50/50 px-4 py-2">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-teal-800">Customer price preview</p>
                      <p className="mt-0.5 text-[11px] text-teal-700/80">
                        Uses slabs at this node (includes unsaved edits)
                      </p>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs font-semibold text-slate-700">
                        Distance km
                        <SlabNumericInput
                          className="mt-1 block w-28 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-sm"
                          kind="decimal"
                          placeholder="0"
                          value={previewDistanceKm}
                          onChange={setPreviewDistanceKm}
                        />
                      </label>
                      <div className="min-w-[5.5rem] rounded-lg bg-white px-4 py-2 text-center shadow-sm ring-1 ring-teal-200">
                        <span className="text-2xl font-bold text-teal-900">
                          {customerPreviewBreakdown == null
                            ? "—"
                            : `₹${customerPreviewBreakdown.finalAmount.toFixed(2)}`}
                        </span>
                      </div>
                    </div>
                  </div>
                  {customerPreviewBreakdown ? (
                    <div className="mt-2 grid gap-2 rounded-lg border border-teal-100 bg-white/80 px-3 py-2 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        Base fare:{" "}
                        <span className="font-mono font-semibold">
                          ₹{customerPreviewBreakdown.baseFare.toFixed(2)}
                        </span>
                      </div>
                      <div>
                        Distance:{" "}
                        <span className="font-mono font-semibold">
                          ₹{customerPreviewBreakdown.distanceAmount.toFixed(2)}
                        </span>
                      </div>
                      {customerPreviewBreakdown.minChargeAdjustment > 0 ? (
                        <div>
                          Min charge adj.:{" "}
                          <span className="font-mono font-semibold">
                            ₹{customerPreviewBreakdown.minChargeAdjustment.toFixed(2)}
                          </span>
                        </div>
                      ) : null}
                      <div>
                        Total:{" "}
                        <span className="font-mono font-semibold">
                          ₹{customerPreviewBreakdown.finalAmount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
                      Add active slabs at this node to preview customer pricing.
                    </p>
                  )}
                </div>
              ) : null}

              {isInherited && effectiveSlabs.length > 0 ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
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

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="max-h-[264px] overflow-auto">
                <table className="min-w-[800px] w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-2">Min km</th>
                      <th className="whitespace-nowrap px-4 py-2">Max km</th>
                      <th className="whitespace-nowrap px-4 py-2">Base fare</th>
                      <th className="whitespace-nowrap px-4 py-2">Per km</th>
                      <th className="whitespace-nowrap px-4 py-2">Min charge</th>
                      <th className="whitespace-nowrap px-4 py-2">Priority</th>
                      <th className="whitespace-nowrap px-4 py-2 text-center">Active</th>
                      <th className="whitespace-nowrap px-4 py-2 text-right">Actions</th>
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
                      slabs.map((s) => {
                        const dirty = isSlabRowDirty(
                          s.id,
                          customerSlabFingerprint(s),
                          savedFingerprints.get(s.id)
                        );
                        const rowSaving = rowBusyId === s.id && rowBusyAction === "save";
                        const rowDeleting = rowBusyId === s.id && rowBusyAction === "delete";
                        const saveDisabled =
                          actionBusy || (rowBusyId != null && rowBusyId !== s.id);

                        return (
                          <tr key={s.id} className={`border-t border-slate-100 hover:bg-slate-50/50 ${dirty ? "bg-amber-50/30" : ""}`}>
                            <td className="px-4 py-2">
                              <SlabNumericInput
                                kind="decimal"
                                value={s.minKm}
                                onChange={(v) => patchRow(s.id, { minKm: v })}
                              />
                            </td>
                            <td className="px-4 py-2">
                              <SlabNumericInput
                                kind="decimal"
                                placeholder="∞"
                                value={s.maxKm}
                                onChange={(v) => patchRow(s.id, { maxKm: v })}
                              />
                            </td>
                            <td className="px-4 py-2">
                              <SlabNumericInput
                                kind="decimal"
                                disabled={parseDecimalOrZero(s.minKm) !== 0}
                                placeholder={parseDecimalOrZero(s.minKm) !== 0 ? "—" : ""}
                                value={parseDecimalOrZero(s.minKm) !== 0 ? "" : s.baseFare}
                                onChange={(v) => patchRow(s.id, { baseFare: v })}
                              />
                            </td>
                            <td className="px-4 py-2">
                              <SlabNumericInput
                                kind="decimal"
                                value={s.perKmRate}
                                onChange={(v) => patchRow(s.id, { perKmRate: v })}
                              />
                            </td>
                            <td className="px-4 py-2">
                              <SlabNumericInput
                                kind="decimal"
                                value={s.minCharge}
                                onChange={(v) => patchRow(s.id, { minCharge: v })}
                              />
                            </td>
                            <td className="px-4 py-2">
                              <SlabNumericInput
                                kind="integer"
                                value={s.priority}
                                onChange={(v) => patchRow(s.id, { priority: v })}
                              />
                            </td>
                            <td className="px-4 py-2 text-center">
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={s.isActive}
                                onChange={(e) => patchRow(s.id, { isActive: e.target.checked })}
                              />
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={saveDisabled}
                                  onClick={() => void saveRowById(s.id)}
                                  className="inline-flex min-w-[4.5rem] items-center justify-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {rowSaving ? (
                                    <>
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      Saving
                                    </>
                                  ) : (
                                    "Save"
                                  )}
                                </button>
                                <button
                                  type="button"
                                  disabled={actionBusy}
                                  onClick={() => void deleteRow(s.id)}
                                  className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                                >
                                  {rowDeleting ? (
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
                        );
                      })
                    )}
                  </tbody>
                </table>
                </div>
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

          {pricingTab !== "rider" ? (
            <DynamicPricingPanel
              level={level}
              refId={refId}
              service={riderService as "food" | "parcel" | "ride"}
            />
          ) : null}
        </div>
      </div>
      {level === "state" ? (
        <StateSurgeManagementSidesheet
          open={surgeSheetOpen}
          onClose={() => setSurgeSheetOpen(false)}
          stateId={refId}
          stateLabel={name}
          onChange={() => setSurgeRefreshKey((k) => k + 1)}
        />
      ) : null}
    </>
  );
}
