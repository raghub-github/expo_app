"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type DistanceSlab = {
  min_km: number;
  max_km: number | null;
  base_fare?: number;
  per_km?: number;
};

type Props = {
  value: DistanceSlab[];
  onChange: (next: DistanceSlab[]) => void;
  className?: string;
};

/**
 * Optional distance slabs stored under `actions.distance_slabs`.
 * Server-side `pricing_rule_compute_totals` currently uses flat base + per_km; extend engine to apply slabs when ready.
 */
export function SlabEditor({ value, onChange, className }: Props) {
  const add = () => {
    onChange([
      ...value,
      {
        min_km: value.length ? (value[value.length - 1].max_km ?? 0) : 0,
        max_km: null,
        base_fare: 0,
        per_km: 0,
      },
    ]);
  };

  const update = (i: number, patch: Partial<DistanceSlab>) => {
    const next = value.map((row, j) => (j === i ? { ...row, ...patch } : row));
    onChange(next);
  };

  const remove = (i: number) => {
    onChange(value.filter((_, j) => j !== i));
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-700">Distance slabs</p>
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add slab
        </button>
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-slate-500">No slabs. Flat base + per km in Basic tab is used.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-1.5 font-semibold">Min km</th>
                <th className="px-2 py-1.5 font-semibold">Max km</th>
                <th className="px-2 py-1.5 font-semibold">Base</th>
                <th className="px-2 py-1.5 font-semibold">₹/km</th>
                <th className="w-10 px-1 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {value.map((row, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      className="w-full rounded border border-slate-200 px-1 py-0.5"
                      value={row.min_km}
                      onChange={(e) => update(i, { min_km: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      placeholder="∞ empty"
                      className="w-full rounded border border-slate-200 px-1 py-0.5"
                      value={row.max_km == null ? "" : row.max_km}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        update(i, { max_km: v === "" ? null : Number(v) || 0 });
                      }}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      className="w-full rounded border border-slate-200 px-1 py-0.5"
                      value={row.base_fare ?? ""}
                      onChange={(e) => update(i, { base_fare: e.target.value === "" ? undefined : Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      className="w-full rounded border border-slate-200 px-1 py-0.5"
                      value={row.per_km ?? ""}
                      onChange={(e) => update(i, { per_km: e.target.value === "" ? undefined : Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-700"
                      aria-label="Remove slab"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
