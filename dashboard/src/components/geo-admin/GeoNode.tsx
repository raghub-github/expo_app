"use client";

import React from "react";
import { Bike, ChevronDown, ChevronRight, PencilLine } from "lucide-react";
import { ServiceSwitch } from "./ServiceSwitch";
import { cn } from "@/lib/utils";
import type { GeoChildRow } from "@/lib/geo/geo-shared";
import { formatGeoBaseFee } from "./geoFeeLabel";
import { RateCardBadge } from "./RateCardBadge";

const kindBadge: Record<string, string> = {
  state: "border-violet-200 bg-violet-50 text-violet-800",
  region: "border-sky-200 bg-sky-50 text-sky-800",
  district: "border-cyan-200 bg-cyan-50 text-cyan-900",
  division: "border-amber-200 bg-amber-50 text-amber-900",
  post_office: "border-emerald-200 bg-emerald-50 text-emerald-900",
  pincode: "border-rose-200 bg-rose-50 text-rose-900",
};

export const GeoNode = React.memo(function GeoNode(props: {
  row: GeoChildRow;
  expanded: boolean;
  onToggleExpand: () => void;
  onServiceToggle: (service: "food" | "parcel" | "ride", value: boolean) => void | Promise<void>;
  onEdit: () => void;
  onRiderRates: () => void;
  depth: number;
  pendingService?: "food" | "parcel" | "ride" | null;
}) {
  const { row } = props;
  const canExpand = row.has_children;
  const pad = Math.min(props.depth * 16, 112);
  const badgeClass = kindBadge[row.kind] ?? "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <div
      className="group relative border-b border-slate-100/90 bg-white/40 py-2.5 transition hover:bg-teal-50/20"
      style={{ paddingLeft: pad }}
    >
      <div className="flex flex-col gap-3 pr-2 xl:flex-row xl:items-start xl:justify-between xl:gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
          {canExpand ? (
            <button
              type="button"
              aria-expanded={props.expanded}
              onClick={props.onToggleExpand}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600 shadow-sm transition hover:border-teal-300 hover:text-teal-700"
            >
              {props.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent bg-slate-50/50 text-slate-300">
              ·
            </span>
          )}

          <span
            className={cn(
              "shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              badgeClass
            )}
          >
            {row.kind.replaceAll("_", " ")}
          </span>

          <span className="min-w-0 flex-1 text-sm font-semibold tracking-tight text-slate-900">{row.name}</span>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end xl:w-auto xl:max-w-[min(100%,52rem)]">
          <div className="flex flex-col gap-1">
            <p className="text-[9px] font-medium uppercase tracking-wide text-slate-400">Customer · coverage + base fee</p>
            <div className="flex items-end gap-1.5 rounded-xl border border-slate-200/60 bg-white/90 px-2 py-1.5 shadow-sm">
              <div className="flex flex-col items-center gap-0.5">
                <ServiceSwitch
                  service="food"
                  on={row.is_food_enabled}
                  inherited={!row.food_override}
                  pending={props.pendingService === "food"}
                  onToggle={() => void props.onServiceToggle("food", !row.is_food_enabled)}
                />
                <span
                  className="font-mono text-[8px] font-semibold tabular-nums text-slate-600"
                  title="Effective base_fee (this row or nearest parent)"
                >
                  {formatGeoBaseFee(row.effective_food_base_fee)}
                </span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <ServiceSwitch
                  service="parcel"
                  on={row.is_parcel_enabled}
                  inherited={!row.parcel_override}
                  pending={props.pendingService === "parcel"}
                  onToggle={() => void props.onServiceToggle("parcel", !row.is_parcel_enabled)}
                />
                <span
                  className="font-mono text-[8px] font-semibold tabular-nums text-slate-600"
                  title="Effective base_fee (this row or nearest parent)"
                >
                  {formatGeoBaseFee(row.effective_parcel_base_fee)}
                </span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <ServiceSwitch
                  service="ride"
                  on={row.is_ride_enabled}
                  inherited={!row.ride_override}
                  pending={props.pendingService === "ride"}
                  onToggle={() => void props.onServiceToggle("ride", !row.is_ride_enabled)}
                />
                <span
                  className="font-mono text-[8px] font-semibold tabular-nums text-slate-600"
                  title="Effective base_fee (this row or nearest parent)"
                >
                  {formatGeoBaseFee(row.effective_ride_base_fee)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1 sm:min-w-[12rem]">
            <p className="text-[9px] font-medium uppercase tracking-wide text-slate-400">Rider payout (effective)</p>
            <div className="flex flex-col gap-1.5 rounded-xl border border-teal-200/50 bg-teal-50/30 px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-1">
                <RateCardBadge service="food" detail={row.rider_rate_summaries?.food} />
                <RateCardBadge service="parcel" detail={row.rider_rate_summaries?.parcel} />
                <RateCardBadge service="ride" detail={row.rider_rate_summaries?.ride} />
              </div>
              <button
                type="button"
                onClick={props.onRiderRates}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-teal-600/20 bg-white px-2 py-1.5 text-[11px] font-semibold text-teal-800 shadow-sm transition hover:bg-teal-50"
              >
                <Bike className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Rider payout
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={props.onEdit}
            className="inline-flex shrink-0 items-center gap-1 self-end rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:text-teal-800"
          >
            <PencilLine className="h-3.5 w-3.5" />
            Edit location
          </button>
        </div>
      </div>

      <p className="mt-1.5 pl-[2.75rem] text-xs leading-relaxed text-slate-500">{row.path}</p>
      {(row.latitude != null || row.longitude != null) && (
        <p className="mt-0.5 pl-[2.75rem] font-mono text-[11px] text-slate-400">
          {row.latitude ?? "—"}, {row.longitude ?? "—"}
        </p>
      )}
    </div>
  );
});
