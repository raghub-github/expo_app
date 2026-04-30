"use client";

import React from "react";
import { ChevronDown, ChevronRight, PencilLine, Tag, Truck } from "lucide-react";
import { ServiceSwitch } from "./ServiceSwitch";
import { cn } from "@/lib/utils";
import type { GeoChildRow } from "@/lib/geo/geo-shared";
import { formatGeoDeliverySlabPreview } from "./geoFeeLabel";

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
  onPlatformOfferMap: () => void;
  onDeliverySlabs: () => void;
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
            <p className="text-[9px] font-medium uppercase tracking-wide text-slate-400">
              Customer · coverage + delivery slabs (0 km slab preview)
            </p>
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
                  title="Effective customer delivery slabs (nearest-wins). Preview uses the first slab where minKm=0."
                >
                  {formatGeoDeliverySlabPreview(row.customer_food_delivery_slabs_preview)}
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
                  title="Effective customer delivery slabs (nearest-wins). Preview uses the first slab where minKm=0."
                >
                  {formatGeoDeliverySlabPreview(row.customer_parcel_delivery_slabs_preview)}
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
                  title="Effective customer delivery slabs (nearest-wins). Preview uses the first slab where minKm=0."
                >
                  {formatGeoDeliverySlabPreview(row.customer_ride_delivery_slabs_preview)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={props.onDeliverySlabs}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/30"
            >
              <Truck className="h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden />
              Delivery slabs
            </button>
          </div>

          <div className="flex flex-col gap-1 sm:min-w-[13rem]">
            <p className="text-[9px] font-medium uppercase tracking-wide text-slate-400">Platform offers (effective)</p>
            <div className="flex flex-col gap-1.5 rounded-xl border border-indigo-200/50 bg-indigo-50/25 px-2 py-1.5">
              <div className="max-h-[5.5rem] space-y-1 overflow-y-auto text-[10px] leading-snug text-slate-700">
                {(row.effective_platform_offers ?? []).length === 0 ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  (row.effective_platform_offers ?? []).map((o) => (
                    <div
                      key={o.platform_offer_id}
                      className="rounded border border-white/60 bg-white/90 px-1.5 py-1 shadow-sm"
                      title={o.offer_setup_summary}
                    >
                      <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 font-mono text-[9px]">
                        <span className="font-bold text-slate-900">#{o.platform_offer_id}</span>
                        <span className="text-slate-600">{o.service_type}</span>
                        <span className="text-slate-500">{o.offer_audience}</span>
                        {o.is_inherited ? (
                          <span className="rounded bg-amber-100 px-1 text-[8px] font-semibold text-amber-900">Inh</span>
                        ) : null}
                      </div>
                      <p className="line-clamp-2 text-[9px] text-slate-600">{o.offer_setup_summary}</p>
                    </div>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={props.onPlatformOfferMap}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-600/20 bg-white px-2 py-1.5 text-[11px] font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-50"
              >
                <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Map offers
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
