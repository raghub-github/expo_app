"use client";

import React, { useCallback, useState } from "react";
import type { GeoSearchRow } from "@/lib/geo/geo-shared";
import type { GeoHierarchyLevel } from "@/lib/geo/geo-shared";
import { useGeoToggleMutation } from "@/store/api/geoAdminApi";
import { ServiceSwitch } from "./ServiceSwitch";
import { cn } from "@/lib/utils";
import { IndianRupee, Layers, MapPin, PencilLine } from "lucide-react";
import { formatGeoBaseFee } from "./geoFeeLabel";
import { RateCardBadge } from "./RateCardBadge";

const levelBadge: Record<string, string> = {
  state: "border-violet-200 bg-violet-50 text-violet-800",
  region: "border-sky-200 bg-sky-50 text-sky-800",
  district: "border-cyan-200 bg-cyan-50 text-cyan-900",
  division: "border-amber-200 bg-amber-50 text-amber-900",
  post_office: "border-emerald-200 bg-emerald-50 text-emerald-900",
  pincode: "border-rose-200 bg-rose-50 text-rose-900",
};

function formatLevelLabel(kind: string): string {
  return kind.replaceAll("_", " ");
}

export const ResultTable = React.memo(function ResultTable(props: {
  rows: GeoSearchRow[];
  chainFor: GeoSearchRow | null;
  onChainFor: (row: GeoSearchRow | null) => void;
  onEditRow: (row: GeoSearchRow) => void;
  onDataMutated?: () => void;
}) {
  const { onDataMutated } = props;
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [toggleMut] = useGeoToggleMutation();

  const onServiceToggle = useCallback(
    async (row: GeoSearchRow, service: "food" | "parcel" | "ride", value: boolean) => {
      const pk = `${row.id}:${service}`;
      setPendingKey(pk);
      try {
        await toggleMut({
          level: row.kind as Exclude<GeoHierarchyLevel, "root">,
          id: row.id,
          service,
          value,
        }).unwrap();
        onDataMutated?.();
      } finally {
        setPendingKey(null);
      }
    },
    [toggleMut, onDataMutated]
  );

  if (props.rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-14 text-center">
        <MapPin className="mx-auto mb-3 h-9 w-9 text-slate-300" aria-hidden />
        <p className="text-sm font-semibold text-slate-700">No matches</p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500">
          Try another keyword or clear filters in <strong>Scope &amp; services</strong> above (Any / On / Off).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-teal-100 bg-gradient-to-r from-teal-50/90 via-white to-slate-50/80 p-3 shadow-sm sm:rounded-2xl sm:p-4">
        <p className="text-sm font-semibold text-slate-900">How to read these cards</p>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-600">
          <li>
            <span className="font-semibold text-teal-800">Food / Parcel / Ride</span> in each card apply{" "}
            <strong>only to that card’s row</strong> (the level shown on the badge — e.g. post office, district).
          </li>
          <li>
            They do <strong>not</strong> change parents. Use <strong>Hierarchy</strong> to open the ladder and toggle
            or set <strong>default price</strong> for state → region → … for that hit.
          </li>
          <li>
            <strong>Edit pricing</strong> (₹) opens the same detailed modal as the tree view for{" "}
            <strong>this hit only</strong>.
          </li>
        </ul>
      </div>

      <div className="space-y-3">
        {props.rows.map((r) => {
          const selected = props.chainFor?.id === r.id && props.chainFor?.kind === r.kind;
          const levelTitle = formatLevelLabel(r.kind);
          return (
            <article
              key={`${r.kind}-${r.id}`}
              className={cn(
                "overflow-hidden rounded-2xl border bg-white shadow-sm transition",
                selected
                  ? "border-teal-400 shadow-md shadow-teal-900/10 ring-2 ring-teal-200/60"
                  : "border-slate-200/80 hover:border-slate-300/90"
              )}
            >
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        levelBadge[r.kind] ?? "border-slate-200 bg-slate-50 text-slate-700"
                      )}
                    >
                      {levelTitle}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      Services below = <strong className="text-slate-800">this {levelTitle}</strong> only
                    </span>
                  </div>
                  <h3 className="mt-2 text-base font-bold tracking-tight text-slate-900">{r.name}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600" title={r.path}>
                    {r.path}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Rider payout</span>
                    <RateCardBadge service="food" detail={r.rider_rate_summaries?.food} />
                    <RateCardBadge service="parcel" detail={r.rider_rate_summaries?.parcel} />
                    <RateCardBadge service="ride" detail={r.rider_rate_summaries?.ride} />
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-slate-500">
                    Pincode: <span className="text-slate-800">{r.pincode ?? "—"}</span>
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      title="Show state → … → this row. Toggle parents or set prices per level."
                      onClick={() => props.onChainFor(selected ? null : r)}
                      className={cn(
                        "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition",
                        selected
                          ? "border-teal-500 bg-teal-600 text-white shadow-sm"
                          : "border-slate-200 bg-slate-50 text-slate-800 hover:border-teal-300 hover:bg-white"
                      )}
                    >
                      <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      Hierarchy
                    </button>
                    <button
                      type="button"
                      title="Name, coordinates, default prices & rules for this hit"
                      onClick={() => props.onEditRow(r)}
                      className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 shadow-sm transition hover:border-teal-300 hover:text-teal-900"
                    >
                      <IndianRupee className="h-3.5 w-3.5 text-teal-600" aria-hidden />
                      Pricing
                      <PencilLine className="h-3.5 w-3.5 opacity-70" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>

              <div
                className="border-t border-slate-100 bg-slate-50/50 px-4 py-3"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Coverage on this {levelTitle} — {r.name}
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex items-end gap-2 rounded-xl border border-white/80 bg-white px-2 py-1.5 shadow-sm">
                    <div className="flex flex-col items-center gap-0.5">
                      <ServiceSwitch
                        service="food"
                        on={r.is_food_enabled}
                        inherited={!r.food_override}
                        pending={pendingKey === `${r.id}:food`}
                        onToggle={() => void onServiceToggle(r, "food", !r.is_food_enabled)}
                      />
                      <span className="font-mono text-[8px] font-semibold tabular-nums text-slate-600">
                        {formatGeoBaseFee(r.effective_food_base_fee)}
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <ServiceSwitch
                        service="parcel"
                        on={r.is_parcel_enabled}
                        inherited={!r.parcel_override}
                        pending={pendingKey === `${r.id}:parcel`}
                        onToggle={() => void onServiceToggle(r, "parcel", !r.is_parcel_enabled)}
                      />
                      <span className="font-mono text-[8px] font-semibold tabular-nums text-slate-600">
                        {formatGeoBaseFee(r.effective_parcel_base_fee)}
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <ServiceSwitch
                        service="ride"
                        on={r.is_ride_enabled}
                        inherited={!r.ride_override}
                        pending={pendingKey === `${r.id}:ride`}
                        onToggle={() => void onServiceToggle(r, "ride", !r.is_ride_enabled)}
                      />
                      <span className="font-mono text-[8px] font-semibold tabular-nums text-slate-600">
                        {formatGeoBaseFee(r.effective_ride_base_fee)}
                      </span>
                    </div>
                  </div>
                  <p className="max-w-md text-[10px] leading-snug text-slate-500">
                    Dashed ring = coverage inherited from a parent until you tap. <strong>₹</strong> ={" "}
                    <strong>base_fee</strong> rule (nearest in chain). Parents: <strong>Hierarchy</strong>.
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
});
