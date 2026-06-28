"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GeoChildRow } from "@/lib/geo/geo-shared";
import { toast } from "sonner";
import { Layers, Loader2, Plus, X } from "lucide-react";
import { RiderPayoutSlabsPanel, VEHICLE_OPTIONS, type VehicleType } from "./RiderPayoutSlabsPanel";
import { RideCustomerPricingPanel } from "./RideCustomerPricingPanel";
import { InlineVehicleRideLimitField } from "./InlineVehicleRideLimitField";
import { StateSurgeManagementSidesheet } from "./StateSurgeManagementSidesheet";
import { prefetchRiderPayoutSlabs } from "@/lib/geo/riderPayoutSlabsCache";
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
  const [savingAll, setSavingAll] = useState(false);
  const [applied, setApplied] = useState<{ level: string; refId: string } | null>(null);
  const [effectiveSlabs, setEffectiveSlabs] = useState<DisplaySlabRow[]>([]);
  const [slabs, setSlabs] = useState<SlabRow[]>([]);
  const [savedFingerprints, setSavedFingerprints] = useState<Map<number, string>>(new Map());
  const [surgeRefreshKey, setSurgeRefreshKey] = useState(0);
  const [surgeSheetOpen, setSurgeSheetOpen] = useState(false);
  const [previewDistanceKm, setPreviewDistanceKm] = useState("3");
  const [portalReady, setPortalReady] = useState(false);
  const slabsRef = useRef<SlabRow[]>([]);
  const savedFingerprintsRef = useRef(savedFingerprints);
  const actorType: ActorType = pricingTab === "rider" ? "rider" : "customer";
  const riderService = serviceType === "person_ride" ? "ride" : serviceType;

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

  useLayoutEffect(() => {
    setPortalReady(true);
  }, []);

  /** Only the X button may close — block Escape and backdrop dismiss. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (pricingTab === "rider" || serviceType === "person_ride") return;
    prefetchDeliveryRateSlabs({
      level,
      refId: row.id,
      serviceType,
      actorType,
    });
  }, [actorType, level, pricingTab, row.id, serviceType]);

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
      if (pricingTab === "rider" || (pricingTab === "customer" && serviceType === "person_ride")) return;

      const cacheKey = deliveryRateSlabsCacheKey({
        level,
        refId: row.id,
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
          refId: row.id,
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
    [actorType, applyDeliveryPayload, level, pricingTab, row.id, serviceType]
  );

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
            refId: row.id,
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
        deliveryRateSlabsCacheKey({ level, refId: row.id, serviceType, actorType })
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
      invalidateDeliveryRateSlabsForNode(level, row.id);
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
      invalidateDeliveryRateSlabsForNode(level, row.id);
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
      invalidateDeliveryRateSlabsForNode(level, row.id);
      void refresh({ force: true, showLoading: false });
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

  const modalUi = (
    <>
    <div
      className="fixed inset-y-0 right-0 z-[70] flex items-center justify-center bg-slate-950/50 p-2 sm:p-4 max-lg:left-0"
      style={{ left: mainAreaLeft > 0 ? mainAreaLeft : undefined }}
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[min(100%,1100px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
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

            <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 lg:w-auto">
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
          {showCustomerSlabActions ? (
            <div className="mt-5 rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50/80 to-emerald-50/50 px-5 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
                <div className="mt-3 grid gap-2 rounded-lg border border-teal-100 bg-white/80 px-3 py-2 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
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
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
                  Add active slabs at this node to preview customer pricing.
                </p>
              )}
            </div>
          ) : null}

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
                      <td className="px-4 py-2.5">
                        <SlabNumericInput
                          kind="decimal"
                          value={s.minKm}
                          onChange={(v) => patchRow(s.id, { minKm: v })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <SlabNumericInput
                          kind="decimal"
                          placeholder="∞"
                          value={s.maxKm}
                          onChange={(v) => patchRow(s.id, { maxKm: v })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <SlabNumericInput
                          kind="decimal"
                          disabled={parseDecimalOrZero(s.minKm) !== 0}
                          placeholder={parseDecimalOrZero(s.minKm) !== 0 ? "—" : ""}
                          value={parseDecimalOrZero(s.minKm) !== 0 ? "" : s.baseFare}
                          onChange={(v) => patchRow(s.id, { baseFare: v })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <SlabNumericInput
                          kind="decimal"
                          value={s.perKmRate}
                          onChange={(v) => patchRow(s.id, { perKmRate: v })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <SlabNumericInput
                          kind="decimal"
                          value={s.minCharge}
                          onChange={(v) => patchRow(s.id, { minCharge: v })}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <SlabNumericInput
                          kind="integer"
                          value={s.priority}
                          onChange={(v) => patchRow(s.id, { priority: v })}
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

  if (!portalReady) return null;
  return createPortal(modalUi, document.body);
});

