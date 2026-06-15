"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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

type RiderService = "food" | "parcel" | "ride";
type RiderLeg = "pickup" | "drop";
type VehicleType = "2_wheeler" | "3_wheeler" | "4_wheeler_non_ac" | "4_wheeler_ac";

const VEHICLE_OPTIONS: { value: VehicleType; label: string }[] = [
  { value: "2_wheeler", label: "2 Wheeler" },
  { value: "3_wheeler", label: "3 Wheeler" },
  { value: "4_wheeler_non_ac", label: "4 Wheeler Non AC" },
  { value: "4_wheeler_ac", label: "4 Wheeler AC" },
];

type PickupRow = {
  id: number;
  minKm: number;
  maxKm: number | null;
  baseFare: number | null;
  pickupPerKm: number;
  minCharge: number | null;
  waitingChargePerMin: number | null;
  waitingStartAfter: number;
  priority: number;
  isActive: boolean;
};

type DropRow = {
  id: number;
  minKm: number;
  maxKm: number | null;
  dropPerKm: number;
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
  "w-full min-w-[4rem] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-mono text-slate-900 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400";

const btnPrimary =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-teal-300 disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white disabled:opacity-50";

function mapPickupRows(rows: any[]): PickupRow[] {
  return rows.map((s) => ({
    id: Number(s.id),
    minKm: Number(s.minKm),
    maxKm: s.maxKm == null ? null : Number(s.maxKm),
    baseFare: s.baseFare == null ? null : Number(s.baseFare),
    pickupPerKm: Number(s.pickupPerKm),
    minCharge: s.minCharge == null ? null : Number(s.minCharge),
    waitingChargePerMin: s.waitingChargePerMin == null ? null : Number(s.waitingChargePerMin),
    waitingStartAfter: Number(s.waitingStartAfter ?? 0),
    priority: Number(s.priority ?? 100),
    isActive: s.isActive === true,
  }));
}

function mapDropRows(rows: any[]): DropRow[] {
  return rows.map((s) => ({
    id: Number(s.id),
    minKm: Number(s.minKm),
    maxKm: s.maxKm == null ? null : Number(s.maxKm),
    dropPerKm: Number(s.dropPerKm),
    priority: Number(s.priority ?? 100),
    isActive: s.isActive === true,
  }));
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
  const [pickupSlabs, setPickupSlabs] = useState<PickupRow[]>(() =>
    cachedSlabs ? mapPickupRows(cachedSlabs.pickupSlabs) : []
  );
  const [dropSlabs, setDropSlabs] = useState<DropRow[]>(() =>
    cachedSlabs ? mapDropRows(cachedSlabs.dropSlabs) : []
  );
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
      pickupKm: numOr(previewPickupKm, 0),
      dropKm: numOr(previewDropKm, 0),
      pickupSlabs: pickupSlabs.filter((s) => s.isActive),
      dropSlabs: dropSlabs.filter((s) => s.isActive),
      waitingMinutes: numOr(previewWaitMin, 0),
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
      setPickupSlabs((prev) => [
        ...prev,
        {
          id: -Date.now(),
          minKm: prev.length === 0 ? 0 : prev[prev.length - 1]!.maxKm ?? prev[prev.length - 1]!.minKm + 1,
          maxKm: null,
          baseFare: prev.length === 0 ? 0 : null,
          pickupPerKm: 0,
          minCharge: null,
          waitingChargePerMin: prev.length === 0 ? 0 : null,
          waitingStartAfter: 0,
          priority: 100,
          isActive: true,
        },
      ]);
    } else {
      setDropSlabs((prev) => [
        ...prev,
        {
          id: -Date.now(),
          minKm: prev.length === 0 ? 0 : prev[prev.length - 1]!.maxKm ?? prev[prev.length - 1]!.minKm + 1,
          maxKm: null,
          dropPerKm: 0,
          priority: 100,
          isActive: true,
        },
      ]);
    }
  };

  const savePickup = async (r: PickupRow) => {
    setRowBusyId(r.id);
    try {
      const body = {
        level: props.level,
        refId: props.refId,
        service: props.service,
        leg: "pickup" as const,
        vehicleType: props.service === "ride" ? props.vehicleType : null,
        minKm: r.minKm,
        maxKm: r.maxKm,
        baseFare: r.minKm === 0 ? r.baseFare : null,
        pickupPerKm: r.pickupPerKm,
        minCharge: r.minCharge,
        waitingChargePerMin: r.waitingChargePerMin,
        waitingStartAfter: r.waitingStartAfter,
        priority: r.priority,
        isActive: r.isActive,
      };
      const res =
        r.id > 0
          ? await fetch(`/api/super-admin/geo/rider-payout-slabs/${r.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            })
          : await fetch(`/api/super-admin/geo/rider-payout-slabs`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
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

  const saveDrop = async (r: DropRow) => {
    setRowBusyId(r.id);
    try {
      const body = {
        level: props.level,
        refId: props.refId,
        service: props.service,
        leg: "drop" as const,
        vehicleType: props.service === "ride" ? props.vehicleType : null,
        minKm: r.minKm,
        maxKm: r.maxKm,
        dropPerKm: r.dropPerKm,
        priority: r.priority,
        isActive: r.isActive,
      };
      const res =
        r.id > 0
          ? await fetch(`/api/super-admin/geo/rider-payout-slabs/${r.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            })
          : await fetch(`/api/super-admin/geo/rider-payout-slabs`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
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

  const deleteSlab = async (id: number, l: RiderLeg) => {
    if (id <= 0) {
      if (l === "pickup") setPickupSlabs((p) => p.filter((x) => x.id !== id));
      else setDropSlabs((p) => p.filter((x) => x.id !== id));
      return;
    }
    if (!confirm("Delete this slab?")) return;
    setRowBusyId(id);
    try {
      const qs = new URLSearchParams({ service: props.service, leg: l });
      const res = await fetch(`/api/super-admin/geo/rider-payout-slabs/${id}?${qs}`, { method: "DELETE" });
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
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {(["pickup", "drop"] as const).map((l) => (
            <button
              key={l}
              type="button"
              disabled={loading || rowBusyId != null}
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
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={addBlank} disabled={loading || rowBusyId != null} className={btnPrimary}>
            <Layers className="h-4 w-4 text-teal-700" />
            Add slab
          </button>
          <button type="button" onClick={() => void refresh(true)} disabled={loading || rowBusyId != null} className={btnSecondary}>
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
              <input
                className="mt-1 block w-24 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-sm"
                placeholder="0"
                value={previewPickupKm}
                onChange={(e) => setPreviewPickupKm(e.target.value)}
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Drop km
              <input
                className="mt-1 block w-24 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-sm"
                placeholder="0"
                value={previewDropKm}
                onChange={(e) => setPreviewDropKm(e.target.value)}
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Wait min
              <input
                className="mt-1 block w-24 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-sm"
                placeholder="0"
                value={previewWaitMin}
                onChange={(e) => setPreviewWaitMin(e.target.value)}
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
                pickupSlabs.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-3 py-2.5"><input className={inputCls} value={String(s.minKm)} onChange={(e) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, minKm: numOr(e.target.value, s.minKm) } : x)))} /></td>
                    <td className="px-3 py-2.5"><input className={inputCls} placeholder="∞" value={s.maxKm == null ? "" : String(s.maxKm)} onChange={(e) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, maxKm: num(e.target.value) } : x)))} /></td>
                    <td className="px-3 py-2.5"><input className={inputCls} disabled={s.minKm !== 0} placeholder={s.minKm !== 0 ? "—" : ""} value={s.minKm !== 0 ? "" : s.baseFare == null ? "" : String(s.baseFare)} onChange={(e) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, baseFare: num(e.target.value) } : x)))} /></td>
                    <td className="px-3 py-2.5"><input className={inputCls} value={String(s.pickupPerKm)} onChange={(e) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, pickupPerKm: numOr(e.target.value, s.pickupPerKm) } : x)))} /></td>
                    <td className="px-3 py-2.5"><input className={inputCls} value={s.minCharge == null ? "" : String(s.minCharge)} onChange={(e) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, minCharge: num(e.target.value) } : x)))} /></td>
                    <td className="px-3 py-2.5"><input className={inputCls} value={s.waitingChargePerMin == null ? "" : String(s.waitingChargePerMin)} onChange={(e) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, waitingChargePerMin: num(e.target.value) } : x)))} /></td>
                    <td className="px-3 py-2.5"><input className={inputCls} value={String(s.waitingStartAfter)} onChange={(e) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, waitingStartAfter: Math.floor(numOr(e.target.value, s.waitingStartAfter)) } : x)))} /></td>
                    <td className="px-3 py-2.5"><input className={inputCls} value={String(s.priority)} onChange={(e) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, priority: Math.floor(numOr(e.target.value, s.priority)) } : x)))} /></td>
                    <td className="px-3 py-2.5 text-center"><input type="checkbox" className="h-4 w-4" checked={s.isActive} onChange={(e) => setPickupSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, isActive: e.target.checked } : x)))} /></td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="inline-flex gap-2">
                        <button type="button" disabled={rowBusyId != null} onClick={() => void savePickup(s)} className="rounded-md border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100 disabled:opacity-50">
                          {rowBusyId === s.id ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : "Save"}
                        </button>
                        <button type="button" disabled={rowBusyId != null} onClick={() => void deleteSlab(s.id, "pickup")} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
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
                dropSlabs.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5"><input className={inputCls} value={String(s.minKm)} onChange={(e) => setDropSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, minKm: numOr(e.target.value, s.minKm) } : x)))} /></td>
                    <td className="px-4 py-2.5"><input className={inputCls} placeholder="∞" value={s.maxKm == null ? "" : String(s.maxKm)} onChange={(e) => setDropSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, maxKm: num(e.target.value) } : x)))} /></td>
                    <td className="px-4 py-2.5"><input className={inputCls} value={String(s.dropPerKm)} onChange={(e) => setDropSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, dropPerKm: numOr(e.target.value, s.dropPerKm) } : x)))} /></td>
                    <td className="px-4 py-2.5"><input className={inputCls} value={String(s.priority)} onChange={(e) => setDropSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, priority: Math.floor(numOr(e.target.value, s.priority)) } : x)))} /></td>
                    <td className="px-4 py-2.5 text-center"><input type="checkbox" className="h-4 w-4" checked={s.isActive} onChange={(e) => setDropSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, isActive: e.target.checked } : x)))} /></td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex gap-2">
                        <button type="button" disabled={rowBusyId != null} onClick={() => void saveDrop(s)} className="rounded-md border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100 disabled:opacity-50">
                          {rowBusyId === s.id ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : "Save"}
                        </button>
                        <button type="button" disabled={rowBusyId != null} onClick={() => void deleteSlab(s.id, "drop")} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
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
