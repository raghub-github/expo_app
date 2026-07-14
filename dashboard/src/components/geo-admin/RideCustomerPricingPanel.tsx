"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Layers, Loader2 } from "lucide-react";
import type { VehicleType } from "./rideVehicleTypes";
import { calcRidePreviewBreakdown } from "@/lib/pricing/slabPricingEngine";
import {
  buildSavedFingerprintMap,
  isSlabRowDirty,
  rideCustomerSlabFingerprint,
} from "@/lib/pricing/slabDirtyState";
import {
  blankRideCustomerSlabRow,
  normalizeRideCustomerSlabRow,
  parseRideCustomerSlabForPreview,
  parseRideCustomerSlabForSave,
  rideCustomerSlabFromApi,
  type EditableRideCustomerSlabRow,
} from "@/lib/pricing/slabEditableRows";
import { parseDecimalOrZero } from "@/lib/pricing/slabInputUtils";
import { applyRideCustomerSlabSaveResponse } from "@/lib/pricing/slabSaveResponse";
import {
  fetchRideCustomerPricing,
  getRideCustomerPricingCache,
  invalidateRideCustomerPricingCache,
  rideCustomerPricingCacheKey,
  type RideCustomerPricingPayload,
} from "@/lib/geo/rideCustomerPricingCache";
import { SLAB_INPUT_CLS, SlabNumericInput } from "./SlabNumericInput";

export function RideCustomerPricingPanel(props: {
  level: string;
  refId: string;
  vehicleType: VehicleType;
}) {
  const [loading, setLoading] = useState(false);
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const [rowBusyAction, setRowBusyAction] = useState<"save" | "delete" | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [slabs, setSlabs] = useState<EditableRideCustomerSlabRow[]>([]);
  const [savedFingerprints, setSavedFingerprints] = useState<Map<number, string>>(new Map());
  const [previewTripKm, setPreviewTripKm] = useState("5");
  const slabsRef = useRef(slabs);
  const savedFingerprintsRef = useRef(savedFingerprints);

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

  const isRowDirtyById = useCallback(
    (id: number, row?: EditableRideCustomerSlabRow) => {
      const current = row ?? slabsRef.current.find((x) => x.id === id);
      if (!current) return false;
      return isSlabRowDirty(
        id,
        rideCustomerSlabFingerprint(current),
        savedFingerprintsRef.current.get(id)
      );
    },
    [savedFingerprints]
  );

  const applyPricingPayload = useCallback((payload: RideCustomerPricingPayload) => {
    const mapped = (payload.slabs ?? []).map((s: Record<string, unknown>) => rideCustomerSlabFromApi(s));
    setSlabs(mapped);
    setSavedFingerprints(buildSavedFingerprintMap(mapped, rideCustomerSlabFingerprint));
  }, []);

  const refresh = useCallback(
    async (opts?: { force?: boolean; showLoading?: boolean }) => {
      const cacheKey = rideCustomerPricingCacheKey({
        level: props.level,
        refId: props.refId,
        vehicleType: props.vehicleType,
      });
      const cached = !opts?.force ? getRideCustomerPricingCache(cacheKey) : null;
      if (cached) applyPricingPayload(cached);

      const showLoading = opts?.showLoading ?? !cached;
      if (showLoading) setLoading(true);

      try {
        const payload = await fetchRideCustomerPricing({
          level: props.level,
          refId: props.refId,
          vehicleType: props.vehicleType,
          force: opts?.force,
        });
        applyPricingPayload(payload);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load ride pricing");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [applyPricingPayload, props.level, props.refId, props.vehicleType]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isRowDirty = useCallback(
    (r: EditableRideCustomerSlabRow) => isRowDirtyById(r.id, r),
    [isRowDirtyById]
  );

  const actionBusy = rowBusyId != null || savingAll;

  const previewBreakdown = useMemo(() => {
    const active = slabs.filter((s) => s.isActive).map((s) => parseRideCustomerSlabForPreview(s));
    if (active.length === 0) return null;
    return calcRidePreviewBreakdown({
      mode: "customer",
      tripKm: parseDecimalOrZero(previewTripKm),
      slabs: active,
    });
  }, [slabs, previewTripKm]);

  const addBlank = () => {
    setSlabs((prev) => [...prev, blankRideCustomerSlabRow(prev[prev.length - 1])]);
  };

  const persistRow = async (
    r: EditableRideCustomerSlabRow,
    opts?: { quiet?: boolean; skipRefresh?: boolean }
  ) => {
    const normalized = normalizeRideCustomerSlabRow(r);
    const parsed = parseRideCustomerSlabForSave(normalized);

    if (parsed.maxKm != null && parsed.maxKm <= parsed.minKm) {
      throw new Error("maxKm must be > minKm");
    }
    if ((parsed.baseFare ?? 0) > 0 && parsed.minKm !== 0) {
      throw new Error("Base fare can be set only on the first slab (minKm=0)");
    }

    const patchBody = {
      minKm: parsed.minKm,
      maxKm: parsed.maxKm,
      baseFare: parsed.baseFare,
      perKmRate: parsed.perKmRate,
      minCharge: parsed.minCharge,
      priority: parsed.priority,
      isActive: parsed.isActive,
    };

    const res =
      normalized.id > 0
        ? await fetch(`/api/super-admin/geo/ride-customer-pricing/${normalized.id}`, {
            method: "PATCH",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchBody),
          })
        : await fetch(`/api/super-admin/geo/ride-customer-pricing`, {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              level: props.level,
              refId: props.refId,
              vehicleType: props.vehicleType,
              ...patchBody,
            }),
          });
    const json = (await res.json().catch(() => ({}))) as { error?: string; slab?: Record<string, unknown> };
    if (!res.ok) {
      throw new Error(json.error ?? "Save failed");
    }
    if (json.slab) {
      applyRideCustomerSlabSaveResponse({
        previousId: normalized.id,
        slab: json.slab,
        setSlabs,
        setSavedFingerprints,
      });
    }
    invalidateRideCustomerPricingCache(
      rideCustomerPricingCacheKey({
        level: props.level,
        refId: props.refId,
        vehicleType: props.vehicleType,
      })
    );
    if (!opts?.quiet) toast.success("Saved");
    if (!opts?.skipRefresh) {
      void refresh({ force: true, showLoading: false });
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
      if (!isRowDirtyById(id, current)) {
        toast.message("No changes to save");
        return;
      }

      await persistRow(current, { quiet: true, skipRefresh: true });
      toast.success("Saved");
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
      const rows = slabsRef.current.filter((r) => isRowDirtyById(r.id, r));
      if (rows.length === 0) {
        toast.message("No changes to save");
        return;
      }

      for (const r of rows) {
        await persistRow(r, { quiet: true, skipRefresh: true });
      }
      toast.success(`Saved ${rows.length} slab${rows.length === 1 ? "" : "s"}`);
      void refresh({ force: true, showLoading: false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save all failed");
    } finally {
      savingAllRef.current = false;
      setSavingAll(false);
    }
  };

  const del = async (id: number) => {
    if (id <= 0) {
      setSlabs((p) => p.filter((x) => x.id !== id));
      return;
    }
    if (!confirm("Delete this slab?")) return;
    if (actionBusy) return;
    setRowBusyId(id);
    setRowBusyAction("delete");
    try {
      const res = await fetch(`/api/super-admin/geo/ride-customer-pricing/${id}`, {
        method: "DELETE",
        cache: "no-store",
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Delete failed");
      toast.success("Deleted");
      void refresh({ force: true, showLoading: false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setRowBusyId(null);
      setRowBusyAction(null);
    }
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="flex w-full flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={addBlank}
          disabled={actionBusy}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:border-teal-300 disabled:opacity-50"
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
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-white disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50/80 to-emerald-50/50 px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-teal-800">Ride fare preview</p>
            <p className="mt-0.5 text-[11px] text-teal-700/80">
              Uses customer slabs at this node (includes unsaved edits)
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-700">
              Trip km
              <SlabNumericInput
                className={`mt-1 block w-28 ${SLAB_INPUT_CLS}`}
                kind="decimal"
                placeholder="0"
                value={previewTripKm}
                onChange={setPreviewTripKm}
              />
            </label>
            <div className="min-w-[5.5rem] rounded-lg bg-white px-4 py-2 text-center shadow-sm ring-1 ring-teal-200">
              <span className="text-2xl font-bold text-teal-900">
                {previewBreakdown == null || previewBreakdown.mode !== "customer"
                  ? "—"
                  : `₹${previewBreakdown.finalAmount.toFixed(2)}`}
              </span>
            </div>
          </div>
        </div>
        {previewBreakdown?.mode === "customer" ? (
          <div className="mt-3 grid gap-2 rounded-lg border border-teal-100 bg-white/80 px-3 py-2 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              Base fare:{" "}
              <span className="font-mono font-semibold">₹{previewBreakdown.baseFare.toFixed(2)}</span>
            </div>
            <div>
              Distance:{" "}
              <span className="font-mono font-semibold">₹{previewBreakdown.distanceAmount.toFixed(2)}</span>
            </div>
            {previewBreakdown.minChargeAdjustment > 0 ? (
              <div>
                Min charge adj.:{" "}
                <span className="font-mono font-semibold">
                  ₹{previewBreakdown.minChargeAdjustment.toFixed(2)}
                </span>
              </div>
            ) : null}
            <div>
              Total:{" "}
              <span className="font-mono font-semibold">₹{previewBreakdown.finalAmount.toFixed(2)}</span>
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
            Add active slabs to preview ride customer fare.
          </p>
        )}
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
              slabs.map((s) => {
                const dirty = isRowDirty(s);
                const rowSaving = rowBusyId === s.id && rowBusyAction === "save";
                const rowDeleting = rowBusyId === s.id && rowBusyAction === "delete";
                const saveDisabled = actionBusy || (rowBusyId != null && rowBusyId !== s.id);

                return (
                  <tr
                    key={s.id}
                    className={`border-t border-slate-100 hover:bg-slate-50/50 ${dirty ? "bg-amber-50/30" : ""}`}
                  >
                    <td className="px-4 py-2.5">
                      <SlabNumericInput
                        className={SLAB_INPUT_CLS}
                        kind="decimal"
                        value={s.minKm}
                        onChange={(v) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, minKm: v } : x)))}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <SlabNumericInput
                        className={SLAB_INPUT_CLS}
                        kind="decimal"
                        placeholder="∞"
                        value={s.maxKm}
                        onChange={(v) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, maxKm: v } : x)))}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <SlabNumericInput
                        className={SLAB_INPUT_CLS}
                        kind="decimal"
                        disabled={parseDecimalOrZero(s.minKm) !== 0}
                        placeholder={parseDecimalOrZero(s.minKm) !== 0 ? "—" : ""}
                        value={parseDecimalOrZero(s.minKm) !== 0 ? "" : s.baseFare}
                        onChange={(v) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, baseFare: v } : x)))}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <SlabNumericInput
                        className={SLAB_INPUT_CLS}
                        kind="decimal"
                        value={s.perKmRate}
                        onChange={(v) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, perKmRate: v } : x)))}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <SlabNumericInput
                        className={SLAB_INPUT_CLS}
                        kind="decimal"
                        value={s.minCharge}
                        onChange={(v) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, minCharge: v } : x)))}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <SlabNumericInput
                        className={SLAB_INPUT_CLS}
                        kind="integer"
                        value={s.priority}
                        onChange={(v) => setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, priority: v } : x)))}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={s.isActive}
                        onChange={(e) =>
                          setSlabs((p) => p.map((x) => (x.id === s.id ? { ...x, isActive: e.target.checked } : x)))
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          disabled={saveDisabled}
                          onClick={() => void saveRowById(s.id)}
                          className="inline-flex min-w-[4.5rem] items-center justify-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                          onClick={() => void del(s.id)}
                          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
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
  );
}
