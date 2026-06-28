"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Layers, Loader2 } from "lucide-react";
import { previewRiderPayoutBreakdown } from "@/lib/geo/riderPayoutPreview";
import type { PreviewSurgeDefinition, PreviewSurgeTimeSlot } from "@/lib/geo/riderSurgePreview";
import {
  fetchRiderPayoutSlabs,
  getRiderPayoutSlabsCache,
  invalidateRiderPayoutSlabsCache,
  riderPayoutSlabsCacheKey,
} from "@/lib/geo/riderPayoutSlabsCache";
import {
  buildSavedFingerprintMap,
  dropSlabFingerprint,
  isSlabRowDirty,
  pickupSlabFingerprint,
} from "@/lib/pricing/slabDirtyState";
import {
  blankDropSlabRow,
  blankPickupSlabRow,
  dropSlabFromApi,
  normalizeDropSlabRow,
  normalizePickupSlabRow,
  parseDropSlabForPreview,
  parseDropSlabForSave,
  parsePickupSlabForPreview,
  parsePickupSlabForSave,
  pickupSlabFromApi,
  type EditableDropSlabRow,
  type EditablePickupSlabRow,
} from "@/lib/pricing/slabEditableRows";
import { parseDecimalOrZero } from "@/lib/pricing/slabInputUtils";
import { SlabNumericInput } from "./SlabNumericInput";

type RiderService = "food" | "parcel" | "ride";
type RiderLeg = "pickup" | "drop";
type VehicleType = "2_wheeler" | "3_wheeler" | "4_wheeler_non_ac" | "4_wheeler_ac";

const VEHICLE_OPTIONS: { value: VehicleType; label: string }[] = [
  { value: "2_wheeler", label: "2 Wheeler" },
  { value: "3_wheeler", label: "3 Wheeler" },
  { value: "4_wheeler_non_ac", label: "4 Wheeler Non AC" },
  { value: "4_wheeler_ac", label: "4 Wheeler AC" },
];

type PickupRow = EditablePickupSlabRow;
type DropRow = EditableDropSlabRow;

const inputCls =
  "w-full min-w-[4rem] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-mono text-slate-900 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400";

const btnPrimary =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-teal-300 disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white disabled:opacity-50";

function mapPickupRows(rows: any[]): PickupRow[] {
  return rows.map((s) => pickupSlabFromApi(s));
}

function mapDropRows(rows: any[]): DropRow[] {
  return rows.map((s) => dropSlabFromApi(s));
}

function inferSurgeKind(name: string): PreviewSurgeDefinition["kind"] {
  const n = name.toLowerCase();
  if (n.includes("peak")) return "peak_hour";
  if (n.includes("rain")) return "rain";
  if (n.includes("festival")) return "festival";
  return "custom";
}

function vehicleScopeToFlags(vehicleType: string) {
  return {
    vehicle2Wheeler: vehicleType === "all" || vehicleType === "2_wheeler",
    vehicle3Wheeler: vehicleType === "all" || vehicleType === "3_wheeler",
    vehicle4WheelerAc: vehicleType === "all" || vehicleType === "4_wheeler_ac",
    vehicle4WheelerNonAc: vehicleType === "all" || vehicleType === "4_wheeler_non_ac",
  };
}

export function RiderPayoutSlabsPanel(props: {
  level: string;
  refId: string;
  service: RiderService;
  vehicleType: VehicleType;
  surgeRefreshKey?: number;
}) {
  const slabCacheKey = riderPayoutSlabsCacheKey({
    level: props.level,
    refId: props.refId,
    service: props.service,
    vehicleType: props.service === "ride" ? props.vehicleType : undefined,
  });
  const cachedSlabs = getRiderPayoutSlabsCache(slabCacheKey);

  const [leg, setLeg] = useState<RiderLeg>("pickup");
  const [loading, setLoading] = useState(!cachedSlabs);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const [rowBusyAction, setRowBusyAction] = useState<"save" | "delete" | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [pickupSlabs, setPickupSlabs] = useState<PickupRow[]>(() =>
    cachedSlabs ? mapPickupRows(cachedSlabs.pickupSlabs) : []
  );
  const [dropSlabs, setDropSlabs] = useState<DropRow[]>(() =>
    cachedSlabs ? mapDropRows(cachedSlabs.dropSlabs) : []
  );
  const [savedPickupFingerprints, setSavedPickupFingerprints] = useState<Map<number, string>>(() =>
    cachedSlabs
      ? buildSavedFingerprintMap(mapPickupRows(cachedSlabs.pickupSlabs), pickupSlabFingerprint)
      : new Map()
  );
  const [savedDropFingerprints, setSavedDropFingerprints] = useState<Map<number, string>>(() =>
    cachedSlabs
      ? buildSavedFingerprintMap(mapDropRows(cachedSlabs.dropSlabs), dropSlabFingerprint)
      : new Map()
  );
  const pickupSlabsRef = useRef(pickupSlabs);
  const dropSlabsRef = useRef(dropSlabs);
  const savedPickupFingerprintsRef = useRef(savedPickupFingerprints);
  const savedDropFingerprintsRef = useRef(savedDropFingerprints);
  const [previewPickupKm, setPreviewPickupKm] = useState("3");
  const [previewDropKm, setPreviewDropKm] = useState("5");
  const [previewWaitMin, setPreviewWaitMin] = useState("5");
  const [previewMaxRider, setPreviewMaxRider] = useState(false);
  const [surgeCatalog, setSurgeCatalog] = useState<{
    definitions: PreviewSurgeDefinition[];
    timeSlots: PreviewSurgeTimeSlot[];
    surgeWaitMaxOnly: boolean;
    maxTotalSurgeAmount: number | null;
  }>({ definitions: [], timeSlots: [], surgeWaitMaxOnly: false, maxTotalSurgeAmount: null });
  const [previewForceSurgeIds, setPreviewForceSurgeIds] = useState<number[]>([]);

  useLayoutEffect(() => {
    pickupSlabsRef.current = pickupSlabs;
  }, [pickupSlabs]);

  useLayoutEffect(() => {
    dropSlabsRef.current = dropSlabs;
  }, [dropSlabs]);

  useLayoutEffect(() => {
    savedPickupFingerprintsRef.current = savedPickupFingerprints;
  }, [savedPickupFingerprints]);

  useLayoutEffect(() => {
    savedDropFingerprintsRef.current = savedDropFingerprints;
  }, [savedDropFingerprints]);

  const rowBusyRef = useRef(rowBusyId);
  const savingAllRef = useRef(savingAll);

  useLayoutEffect(() => {
    rowBusyRef.current = rowBusyId;
  }, [rowBusyId]);

  useLayoutEffect(() => {
    savingAllRef.current = savingAll;
  }, [savingAll]);

  const clearCalculator = () => {
    setPreviewPickupKm("");
    setPreviewDropKm("");
    setPreviewWaitMin("");
    setPreviewMaxRider(false);
    setPreviewForceSurgeIds([]);
  };

  const loadSurgeCatalog = useCallback(async () => {
    try {
      if (props.level === "state") {
        const surgeRes = await fetch(
          `/api/super-admin/geo/state-surge-configs?stateId=${props.refId}`,
          { cache: "no-store" }
        );
        const surgeJson = await surgeRes.json();
        if (!surgeRes.ok) return;
        const vehicles = vehicleScopeToFlags;
        const stateMax = surgeJson.settings?.maxTotalSurgeAmount;
        setSurgeCatalog({
          definitions: (surgeJson.surges ?? []).map((s: Record<string, unknown>) => {
            const vt = String(s.vehicleType ?? "all");
            const flags = vehicles(vt);
            return {
              id: Number(s.id),
              name: String(s.name),
              kind: inferSurgeKind(String(s.name)),
              fixedAmount: s.surgeType === "percentage" ? 0 : Number(s.amount),
              priority: Number(s.priority ?? 100),
              isEnabled: s.enabled === true,
              gmitraMaxOnly: s.maxRidersOnly === true,
              appliesFood: s.appliesFood !== false,
              appliesParcel: s.appliesParcel !== false,
              appliesRide: s.appliesRide !== false,
              ...flags,
              manualActive: s.manualActive === true,
            };
          }),
          timeSlots: (surgeJson.timeSlots ?? []).map((s: Record<string, unknown>) => ({
            id: Number(s.id),
            surgeId: Number(s.stateSurgeId ?? s.state_surge_id),
            startTime: String(s.startTime ?? s.start_time).slice(0, 5),
            endTime: String(s.endTime ?? s.end_time).slice(0, 5),
            daysOfWeek: Array.isArray(s.daysOfWeek)
              ? s.daysOfWeek.map((x) => Number(x))
              : [0, 1, 2, 3, 4, 5, 6],
            isEnabled: s.isEnabled === true || s.is_enabled === true,
          })),
          surgeWaitMaxOnly: false,
          maxTotalSurgeAmount: stateMax == null ? null : Number(stateMax),
        });
        return;
      }
      setSurgeCatalog({
        definitions: [],
        timeSlots: [],
        surgeWaitMaxOnly: false,
        maxTotalSurgeAmount: null,
      });
    } catch {
      /* ignore */
    }
  }, [props.level, props.refId]);

  const refresh = useCallback(async (force = true) => {
    if (force) invalidateRiderPayoutSlabsCache(slabCacheKey);
    const hadCache = !force && getRiderPayoutSlabsCache(slabCacheKey) != null;
    if (!hadCache) setLoading(true);
    try {
      const payload = await fetchRiderPayoutSlabs({
        level: props.level,
        refId: props.refId,
        service: props.service,
        vehicleType: props.service === "ride" ? props.vehicleType : undefined,
        force,
      });
      setPickupSlabs(mapPickupRows(payload.pickupSlabs));
      setDropSlabs(mapDropRows(payload.dropSlabs));
      setSavedPickupFingerprints(
        buildSavedFingerprintMap(mapPickupRows(payload.pickupSlabs), pickupSlabFingerprint)
      );
      setSavedDropFingerprints(
        buildSavedFingerprintMap(mapDropRows(payload.dropSlabs), dropSlabFingerprint)
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load rider slabs");
    } finally {
      setLoading(false);
    }
  }, [props.level, props.refId, props.service, props.vehicleType, slabCacheKey]);

  useEffect(() => {
    void refresh();
    void loadSurgeCatalog();
  }, [refresh, loadSurgeCatalog, props.surgeRefreshKey]);

  const hasLocalPickupSlabs = pickupSlabs.some((s) => s.isActive);
  const hasLocalDropSlabs = dropSlabs.some((s) => s.isActive);
  const canPreview = hasLocalPickupSlabs || hasLocalDropSlabs;

  const previewBreakdown = useMemo(() => {
    if (!canPreview) return null;
    return previewRiderPayoutBreakdown({
      pickupKm: parseDecimalOrZero(previewPickupKm),
      dropKm: parseDecimalOrZero(previewDropKm),
      pickupSlabs: pickupSlabs.filter((s) => s.isActive).map((s) => parsePickupSlabForPreview(s)),
      dropSlabs: dropSlabs.filter((s) => s.isActive).map((s) => parseDropSlabForPreview(s)),
      waitingMinutes: parseDecimalOrZero(previewWaitMin),
      riderHasGmitraMax: previewMaxRider,
      service: props.service,
      vehicleType: props.service === "ride" ? props.vehicleType : null,
      surgeDefinitions: surgeCatalog.definitions,
      surgeTimeSlots: surgeCatalog.timeSlots,
      surgeWaitMaxOnly: surgeCatalog.surgeWaitMaxOnly,
      maxTotalSurgeAmount: surgeCatalog.maxTotalSurgeAmount,
      forceActiveSurgeIds: previewForceSurgeIds.length > 0 ? previewForceSurgeIds : undefined,
    });
  }, [
    pickupSlabs,
    dropSlabs,
    previewPickupKm,
    previewDropKm,
    previewWaitMin,
    previewMaxRider,
    canPreview,
    props.service,
    props.vehicleType,
    surgeCatalog,
    previewForceSurgeIds,
  ]);

  const missingSlabHint =
    !hasLocalPickupSlabs && !hasLocalDropSlabs
      ? "Add pickup and drop slabs at this node to preview payout."
      : !hasLocalPickupSlabs
        ? "Add pickup slabs for base fare and waiting in the preview."
        : !hasLocalDropSlabs
          ? "Add drop slabs for drop-distance payout in the preview."
          : null;

  const addBlank = () => {
    if (leg === "pickup") {
      setPickupSlabs((prev) => [...prev, blankPickupSlabRow(prev[prev.length - 1])]);
    } else {
      setDropSlabs((prev) => [...prev, blankDropSlabRow(prev[prev.length - 1])]);
    }
  };

  const persistPickup = async (r: PickupRow, opts?: { quiet?: boolean; skipRefresh?: boolean }) => {
    const normalized = normalizePickupSlabRow(r);
    const parsed = parsePickupSlabForSave(normalized);
    const body = {
      level: props.level,
      refId: props.refId,
      service: props.service,
      leg: "pickup" as const,
      vehicleType: props.service === "ride" ? props.vehicleType : null,
      ...parsed,
    };
    const res =
      normalized.id > 0
        ? await fetch(`/api/super-admin/geo/rider-payout-slabs/${normalized.id}`, {
            method: "PATCH",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/super-admin/geo/rider-payout-slabs`, {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
    if (!res.ok) throw new Error((await res.json())?.error ?? "Save failed");
    if (!opts?.quiet) toast.success("Saved");
    if (!opts?.skipRefresh) await refresh();
  };

  const persistDrop = async (r: DropRow, opts?: { quiet?: boolean; skipRefresh?: boolean }) => {
    const normalized = normalizeDropSlabRow(r);
    const body = {
      level: props.level,
      refId: props.refId,
      service: props.service,
      leg: "drop" as const,
      vehicleType: props.service === "ride" ? props.vehicleType : null,
      ...parseDropSlabForSave(normalized),
    };
    const res =
      normalized.id > 0
        ? await fetch(`/api/super-admin/geo/rider-payout-slabs/${normalized.id}`, {
            method: "PATCH",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/super-admin/geo/rider-payout-slabs`, {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
    if (!res.ok) throw new Error((await res.json())?.error ?? "Save failed");
    if (!opts?.quiet) toast.success("Saved");
    if (!opts?.skipRefresh) await refresh();
  };

  const savePickupById = async (id: number) => {
    if (rowBusyRef.current != null || savingAllRef.current) return;

    setRowBusyId(id);
    setRowBusyAction("save");
    rowBusyRef.current = id;

    try {
      const current = pickupSlabsRef.current.find((x) => x.id === id);
      if (!current) {
        toast.error("Row not found");
        return;
      }
      if (
        !isSlabRowDirty(id, pickupSlabFingerprint(current), savedPickupFingerprintsRef.current.get(id))
      ) {
        toast.message("No changes to save");
        return;
      }
      await persistPickup(current, { quiet: true, skipRefresh: true });
      toast.success("Saved");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      rowBusyRef.current = null;
      setRowBusyId(null);
      setRowBusyAction(null);
    }
  };

  const saveDropById = async (id: number) => {
    if (rowBusyRef.current != null || savingAllRef.current) return;

    setRowBusyId(id);
    setRowBusyAction("save");
    rowBusyRef.current = id;

    try {
      const current = dropSlabsRef.current.find((x) => x.id === id);
      if (!current) {
        toast.error("Row not found");
        return;
      }
      if (!isSlabRowDirty(id, dropSlabFingerprint(current), savedDropFingerprintsRef.current.get(id))) {
        toast.message("No changes to save");
        return;
      }
      await persistDrop(current, { quiet: true, skipRefresh: true });
      toast.success("Saved");
      await refresh();
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
      const rows =
        leg === "pickup"
          ? pickupSlabsRef.current.filter((r) =>
              isSlabRowDirty(r.id, pickupSlabFingerprint(r), savedPickupFingerprintsRef.current.get(r.id))
            )
          : dropSlabsRef.current.filter((r) =>
              isSlabRowDirty(r.id, dropSlabFingerprint(r), savedDropFingerprintsRef.current.get(r.id))
            );
      if (rows.length === 0) {
        toast.message("No changes to save");
        return;
      }
      for (const r of rows) {
        if (leg === "pickup") {
          await persistPickup(r as PickupRow, { quiet: true, skipRefresh: true });
        } else {
          await persistDrop(r as DropRow, { quiet: true, skipRefresh: true });
        }
      }
      toast.success(`Saved ${rows.length} slab${rows.length === 1 ? "" : "s"}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save all failed");
    } finally {
      savingAllRef.current = false;
      setSavingAll(false);
    }
  };

  const deleteSlab = async (id: number, l: RiderLeg) => {
    if (id <= 0) {
      if (l === "pickup") setPickupSlabs((p) => p.filter((x) => x.id !== id));
      else setDropSlabs((p) => p.filter((x) => x.id !== id));
      return;
    }
    if (!confirm("Delete this slab?")) return;
    if (rowBusyId != null || savingAll) return;
    setRowBusyId(id);
    setRowBusyAction("delete");
    try {
      const qs = new URLSearchParams({ service: props.service, leg: l });
      const res = await fetch(`/api/super-admin/geo/rider-payout-slabs/${id}?${qs}`, {
        method: "DELETE",
        cache: "no-store",
      });
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

  const actionBusy = rowBusyId != null || savingAll;

  return (
    <div className="mt-5 space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {(["pickup", "drop"] as const).map((l) => (
            <button
              key={l}
              type="button"
              disabled={actionBusy}
              onClick={() => setLeg(l)}
              className={
                "px-4 py-2.5 text-sm font-semibold capitalize transition " +
                (leg === l ? "bg-teal-700 text-white" : "text-slate-700 hover:bg-slate-50")
              }
            >
              {l} slabs
            </button>
          ))}
        </div>
        <div className="flex w-full flex-wrap justify-end gap-2 sm:ml-auto sm:w-auto">
          <button type="button" onClick={addBlank} disabled={actionBusy} className={btnPrimary}>
            <Layers className="h-4 w-4 text-teal-700" />
            Add slab
          </button>
          <button
            type="button"
            onClick={() => void saveAllRows()}
            disabled={actionBusy || (pickupSlabs.length === 0 && dropSlabs.length === 0)}
            className="inline-flex items-center gap-2 rounded-lg border border-teal-300 bg-teal-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
          >
            {savingAll ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving
              </span>
            ) : (
              "Save all"
            )}
          </button>
          <button type="button" onClick={() => void refresh(true)} disabled={actionBusy || loading} className={btnSecondary}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Refresh
          </button>
        </div>
      </div>

      {/* Payout preview — always uses slabs at this node (live table values) */}
      <div className="rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50/80 to-emerald-50/50 px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-teal-800">Payout preview</p>
            <p className="mt-0.5 text-[11px] text-teal-700/80">
              Uses pickup + drop slabs at this node (includes unsaved edits)
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-700">
              Pickup km
              <SlabNumericInput
                className="mt-1 block w-24 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-sm"
                kind="decimal"
                placeholder="0"
                value={previewPickupKm}
                onChange={setPreviewPickupKm}
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Drop km
              <SlabNumericInput
                className="mt-1 block w-24 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-sm"
                kind="decimal"
                placeholder="0"
                value={previewDropKm}
                onChange={setPreviewDropKm}
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Wait min
              <SlabNumericInput
                className="mt-1 block w-24 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-sm"
                kind="integer"
                placeholder="0"
                value={previewWaitMin}
                onChange={setPreviewWaitMin}
              />
            </label>
            <label className="flex items-center gap-2 pb-1.5 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={previewMaxRider}
                onChange={(e) => setPreviewMaxRider(e.target.checked)}
              />
              GMitra Max
            </label>
            <button
              type="button"
              onClick={clearCalculator}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Clear
            </button>
            <div className="min-w-[5.5rem] rounded-lg bg-white px-4 py-2 text-center shadow-sm ring-1 ring-teal-200">
              <span className="text-2xl font-bold text-teal-900">
                {previewBreakdown == null ? "—" : `₹${previewBreakdown.finalAmount.toFixed(2)}`}
              </span>
            </div>
          </div>
        </div>
        {previewBreakdown ? (
          <div className="mt-3 grid gap-2 rounded-lg border border-teal-100 bg-white/80 px-3 py-2 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
            <div>Base fare: <span className="font-mono font-semibold">₹{previewBreakdown.baseFare.toFixed(2)}</span></div>
            <div>Pickup: <span className="font-mono font-semibold">₹{previewBreakdown.pickupAmount.toFixed(2)}</span></div>
            <div>Drop: <span className="font-mono font-semibold">₹{previewBreakdown.dropAmount.toFixed(2)}</span></div>
            <div>Waiting: <span className="font-mono font-semibold">₹{previewBreakdown.waitingAmount.toFixed(2)}</span></div>
            {previewBreakdown.minChargeApplied > 0 ? (
              <div>
                Min charge adj.:{" "}
                <span className="font-mono font-semibold">₹{previewBreakdown.minChargeApplied.toFixed(2)}</span>
              </div>
            ) : null}
            <div className="sm:col-span-2 lg:col-span-4">
              Surges:{" "}
              {previewBreakdown.appliedSurges.length === 0 ? (
                <span className="text-slate-500">none active</span>
              ) : (
                previewBreakdown.appliedSurges.map((s) => (
                  <span key={s.surgeId} className="mr-2 inline-flex rounded bg-teal-50 px-1.5 py-0.5 font-mono text-teal-900">
                    {s.name} ₹{s.amount.toFixed(2)}
                  </span>
                ))
              )}
              {previewBreakdown.surgeCapped ? (
                <span className="ml-1 text-amber-700">
                  (raw ₹{previewBreakdown.rawSurgeTotal.toFixed(2)} → capped at ₹
                  {surgeCatalog.maxTotalSurgeAmount?.toFixed(2)})
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
        {surgeCatalog.definitions.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-[11px] font-semibold text-slate-600">Simulate surges:</span>
            {surgeCatalog.definitions
              .filter((d) => {
                if (props.service === "food") return d.appliesFood;
                if (props.service === "parcel") return d.appliesParcel;
                return d.appliesRide;
              })
              .map((d) => (
                <label key={d.id} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px]">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={previewForceSurgeIds.includes(d.id)}
                    onChange={(e) =>
                      setPreviewForceSurgeIds((prev) =>
                        e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id)
                      )
                    }
                  />
                  {d.name}
                </label>
              ))}
          </div>
        ) : null}
        {missingSlabHint ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
            {missingSlabHint}
          </p>
        ) : null}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {leg === "pickup" ? (
          <table className="min-w-[1200px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-3 py-3">Min km</th>
                <th className="whitespace-nowrap px-3 py-3">Max km</th>
                <th className="whitespace-nowrap px-3 py-3">Base fare</th>
                <th className="whitespace-nowrap px-3 py-3">Pickup/km</th>
                <th className="whitespace-nowrap px-3 py-3">Min charge</th>
                <th className="whitespace-nowrap px-3 py-3" title="Waiting charge per minute">Wait ₹/min</th>
                <th className="whitespace-nowrap px-3 py-3" title="Free waiting minutes">Free wait</th>
                <th className="whitespace-nowrap px-3 py-3">Priority</th>
                <th className="whitespace-nowrap px-3 py-3 text-center">Active</th>
                <th className="whitespace-nowrap px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pickupSlabs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500">
                    No pickup slabs at this node. Click &quot;Add slab&quot; to configure rider→merchant payout.
                  </td>
                </tr>
              ) : (
                pickupSlabs.map((s) => {
                  const dirty = isSlabRowDirty(
                    s.id,
                    pickupSlabFingerprint(s),
                    savedPickupFingerprints.get(s.id)
                  );
                  const rowSaving = rowBusyId === s.id && rowBusyAction === "save";
                  const saveDisabled =
                    actionBusy || (rowBusyId != null && rowBusyId !== s.id);

                  return (
                  <tr key={s.id} className={`border-t border-slate-100 hover:bg-slate-50/50 ${dirty ? "bg-amber-50/30" : ""}`}>
                    <td className="px-3 py-2.5"><SlabNumericInput className={inputCls} kind="decimal" value={s.minKm} onChange={(v) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, minKm: v } : x)))} /></td>
                    <td className="px-3 py-2.5"><SlabNumericInput className={inputCls} kind="decimal" placeholder="∞" value={s.maxKm} onChange={(v) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, maxKm: v } : x)))} /></td>
                    <td className="px-3 py-2.5"><SlabNumericInput className={inputCls} kind="decimal" disabled={parseDecimalOrZero(s.minKm) !== 0} placeholder={parseDecimalOrZero(s.minKm) !== 0 ? "—" : ""} value={parseDecimalOrZero(s.minKm) !== 0 ? "" : s.baseFare} onChange={(v) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, baseFare: v } : x)))} /></td>
                    <td className="px-3 py-2.5"><SlabNumericInput className={inputCls} kind="decimal" value={s.pickupPerKm} onChange={(v) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, pickupPerKm: v } : x)))} /></td>
                    <td className="px-3 py-2.5"><SlabNumericInput className={inputCls} kind="decimal" value={s.minCharge} onChange={(v) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, minCharge: v } : x)))} /></td>
                    <td className="px-3 py-2.5"><SlabNumericInput className={inputCls} kind="decimal" value={s.waitingChargePerMin} onChange={(v) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, waitingChargePerMin: v } : x)))} /></td>
                    <td className="px-3 py-2.5"><SlabNumericInput className={inputCls} kind="integer" value={s.waitingStartAfter} onChange={(v) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, waitingStartAfter: v } : x)))} /></td>
                    <td className="px-3 py-2.5"><SlabNumericInput className={inputCls} kind="integer" value={s.priority} onChange={(v) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, priority: v } : x)))} /></td>
                    <td className="px-3 py-2.5 text-center"><input type="checkbox" className="h-4 w-4" checked={s.isActive} onChange={(e) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, isActive: e.target.checked } : x)))} /></td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex gap-2">
                        <button type="button" disabled={saveDisabled} onClick={() => void savePickupById(s.id)} className="inline-flex min-w-[4.5rem] items-center justify-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50">
                          {rowBusyId === s.id && rowBusyAction === "save" ? (
                            <span className="inline-flex items-center gap-1">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Saving
                            </span>
                          ) : (
                            "Save"
                          )}
                        </button>
                        <button type="button" disabled={actionBusy} onClick={() => void deleteSlab(s.id, "pickup")} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50">
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
                  );
                })
              )}
            </tbody>
          </table>
        ) : (
          <table className="min-w-[640px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-4 py-3">Min km</th>
                <th className="whitespace-nowrap px-4 py-3">Max km</th>
                <th className="whitespace-nowrap px-4 py-3">Drop/km</th>
                <th className="whitespace-nowrap px-4 py-3">Priority</th>
                <th className="whitespace-nowrap px-4 py-3 text-center">Active</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {dropSlabs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    No drop slabs at this node. Click &quot;Add slab&quot; to configure merchant→customer payout.
                  </td>
                </tr>
              ) : (
                dropSlabs.map((s) => {
                  const dirty = isSlabRowDirty(
                    s.id,
                    dropSlabFingerprint(s),
                    savedDropFingerprints.get(s.id)
                  );
                  const saveDisabled =
                    actionBusy || (rowBusyId != null && rowBusyId !== s.id);

                  return (
                  <tr key={s.id} className={`border-t border-slate-100 hover:bg-slate-50/50 ${dirty ? "bg-amber-50/30" : ""}`}>
                    <td className="px-4 py-2.5"><SlabNumericInput className={inputCls} kind="decimal" value={s.minKm} onChange={(v) => setDropSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, minKm: v } : x)))} /></td>
                    <td className="px-4 py-2.5"><SlabNumericInput className={inputCls} kind="decimal" placeholder="∞" value={s.maxKm} onChange={(v) => setDropSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, maxKm: v } : x)))} /></td>
                    <td className="px-4 py-2.5"><SlabNumericInput className={inputCls} kind="decimal" value={s.dropPerKm} onChange={(v) => setDropSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, dropPerKm: v } : x)))} /></td>
                    <td className="px-4 py-2.5"><SlabNumericInput className={inputCls} kind="integer" value={s.priority} onChange={(v) => setDropSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, priority: v } : x)))} /></td>
                    <td className="px-4 py-2.5 text-center"><input type="checkbox" className="h-4 w-4" checked={s.isActive} onChange={(e) => setDropSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, isActive: e.target.checked } : x)))} /></td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex gap-2">
                        <button type="button" disabled={saveDisabled} onClick={() => void saveDropById(s.id)} className="inline-flex min-w-[4.5rem] items-center justify-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50">
                          {rowBusyId === s.id && rowBusyAction === "save" ? (
                            <span className="inline-flex items-center gap-1">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Saving
                            </span>
                          ) : (
                            "Save"
                          )}
                        </button>
                        <button type="button" disabled={actionBusy} onClick={() => void deleteSlab(s.id, "drop")} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50">
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
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-700">Pickup</span> = rider → merchant.
        <span className="mx-1 font-semibold text-slate-700">Drop</span> = merchant → customer.
        Waiting charge applies after free minutes on the first pickup slab.
      </p>
    </div>
  );
}

export { VEHICLE_OPTIONS };
export type { VehicleType, RiderService };
