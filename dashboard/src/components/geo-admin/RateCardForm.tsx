"use client";

import React, { useEffect, useState } from "react";
import type { RiderRateCardRow } from "@/lib/geo/geo-shared";
import { cn } from "@/lib/utils";

export type RateCardFormValues = {
  baseFare: string;
  perKmRate: string;
  minDistanceKm: string;
  maxDistanceKm: string;
  waitingChargePerMin: string;
  surgeMultiplier: string;
  priority: string;
  isActive: boolean;
  override: boolean;
};

function toVals(row: RiderRateCardRow | null, defaults?: Partial<RateCardFormValues>): RateCardFormValues {
  if (row) {
    return {
      baseFare: row.base_fare ?? "0",
      perKmRate: row.per_km_rate ?? "0",
      minDistanceKm: row.min_distance_km ?? "0",
      maxDistanceKm: row.max_distance_km ?? "",
      waitingChargePerMin: row.waiting_charge_per_min ?? "0",
      surgeMultiplier: row.surge_multiplier ?? "1",
      priority: String(row.priority ?? 0),
      isActive: row.is_active,
      override: row.override,
    };
  }
  return {
    baseFare: defaults?.baseFare ?? "0",
    perKmRate: defaults?.perKmRate ?? "0",
    minDistanceKm: defaults?.minDistanceKm ?? "0",
    maxDistanceKm: defaults?.maxDistanceKm ?? "",
    waitingChargePerMin: defaults?.waitingChargePerMin ?? "0",
    surgeMultiplier: defaults?.surgeMultiplier ?? "1",
    priority: defaults?.priority ?? "0",
    isActive: defaults?.isActive ?? true,
    override: defaults?.override ?? false,
  };
}

export const RateCardForm = React.memo(function RateCardForm(props: {
  service: "food" | "parcel" | "ride";
  storedRow: RiderRateCardRow | null;
  effectiveDefaults?: { base: number; perKm: number } | null;
  onSubmit: (v: RateCardFormValues) => void | Promise<void>;
  submitting?: boolean;
  className?: string;
}) {
  const [vals, setVals] = useState<RateCardFormValues>(() =>
    toVals(props.storedRow, {
      baseFare: props.effectiveDefaults ? String(props.effectiveDefaults.base) : undefined,
      perKmRate: props.effectiveDefaults ? String(props.effectiveDefaults.perKm) : undefined,
    })
  );

  useEffect(() => {
    setVals(
      toVals(props.storedRow, {
        baseFare: props.effectiveDefaults ? String(props.effectiveDefaults.base) : undefined,
        perKmRate: props.effectiveDefaults ? String(props.effectiveDefaults.perKm) : undefined,
      })
    );
  }, [props.storedRow, props.effectiveDefaults?.base, props.effectiveDefaults?.perKm, props.service]);

  return (
    <form
      className={cn("space-y-3", props.className)}
      onSubmit={(e) => {
        e.preventDefault();
        void props.onSubmit(vals);
      }}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Base fare (₹)
          <input
            type="number"
            step="0.01"
            value={vals.baseFare}
            onChange={(e) => setVals((v) => ({ ...v, baseFare: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium"
            required
          />
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Per km (₹)
          <input
            type="number"
            step="0.0001"
            value={vals.perKmRate}
            onChange={(e) => setVals((v) => ({ ...v, perKmRate: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium"
            required
          />
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Min distance (km)
          <input
            type="number"
            step="0.01"
            value={vals.minDistanceKm}
            onChange={(e) => setVals((v) => ({ ...v, minDistanceKm: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium"
          />
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Max distance (km)
          <input
            type="number"
            step="0.01"
            value={vals.maxDistanceKm}
            onChange={(e) => setVals((v) => ({ ...v, maxDistanceKm: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium"
            placeholder="Optional"
          />
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Waiting ₹/min
          <input
            type="number"
            step="0.0001"
            value={vals.waitingChargePerMin}
            onChange={(e) => setVals((v) => ({ ...v, waitingChargePerMin: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium"
          />
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Surge multiplier
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={vals.surgeMultiplier}
            onChange={(e) => setVals((v) => ({ ...v, surgeMultiplier: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium"
          />
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Priority
          <input
            type="number"
            step="1"
            value={vals.priority}
            onChange={(e) => setVals((v) => ({ ...v, priority: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium"
          />
        </label>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          checked={vals.isActive}
          onChange={(e) => setVals((v) => ({ ...v, isActive: e.target.checked }))}
        />
        Active
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          checked={vals.override}
          onChange={(e) => setVals((v) => ({ ...v, override: e.target.checked }))}
        />
        Override (explicit rule at this level)
      </label>

      <button
        type="submit"
        disabled={props.submitting}
        className="w-full rounded-lg bg-teal-600 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60"
      >
        {props.submitting ? "Saving…" : "Save rider rate card"}
      </button>
    </form>
  );
});
