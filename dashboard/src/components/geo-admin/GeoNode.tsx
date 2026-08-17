"use client";

import React from "react";
import { ChevronDown, ChevronRight, Loader2, PencilLine, Tag, Truck } from "lucide-react";
import { ServiceSwitch } from "./ServiceSwitch";
import { cn } from "@/lib/utils";
import type { GeoChildRow } from "@/lib/geo/geo-shared";
import { formatGeoDeliverySlabPreview } from "./geoFeeLabel";
import { prefetchDeliveryRateSlabs } from "@/lib/geo/deliveryRateSlabsCache";

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
  onRiderOnlineCheckToggle?: (value: boolean) => void | Promise<void>;
  onEdit: () => void;
  onPlatformOfferMap: () => void;
  onDeliverySlabs: () => void;
  depth: number;
  pendingService?: "food" | "parcel" | "ride" | null;
  pendingRiderOnlineCheck?: boolean;
}) {
  const { row } = props;
  const canExpand = row.has_children;
  const pad = Math.min(props.depth * 16, 112);
  const badgeClass = kindBadge[row.kind] ?? "border-slate-200 bg-slate-100 text-slate-700";
  const pathLabel = row.path?.trim() ?? "";
  const showPath = pathLabel.length > 0 && pathLabel.toLowerCase() !== row.name.trim().toLowerCase();
  const offers = row.effective_platform_offers ?? [];

  return (
    <div
      className="group relative w-full border-b border-slate-300 bg-white py-3 transition hover:bg-teal-50/15"
      style={{ paddingLeft: pad }}
    >
      <div className="grid w-full grid-cols-1 items-start gap-x-5 gap-y-3 pr-2 lg:grid-cols-[minmax(12.5rem,1.1fr)_minmax(14.5rem,1fr)_minmax(12rem,0.9fr)_minmax(12.5rem,auto)]">
        <div className="flex min-w-0 items-start gap-2">
          {canExpand ? (
            <button
              type="button"
              aria-expanded={props.expanded}
              onClick={props.onToggleExpand}
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600 shadow-sm transition hover:border-teal-300 hover:text-teal-700"
            >
              {props.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent bg-slate-50/50 text-slate-300">
              ·
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-col items-start gap-1">
              <span
                className={cn(
                  "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  badgeClass
                )}
              >
                {row.kind.replaceAll("_", " ")}
              </span>
              <span className="min-w-0 text-sm font-semibold leading-snug tracking-tight text-slate-900">
                {row.name}
              </span>
            </div>
            {showPath ? (
              <p className="mt-0.5 truncate text-[11px] leading-snug text-slate-500">{pathLabel}</p>
            ) : null}
            {(row.latitude != null || row.longitude != null) && (
              <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
                {row.latitude ?? "—"}, {row.longitude ?? "—"}
              </p>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-400">
            Customer · coverage + delivery slabs (0 km slab preview)
          </p>
          <div className="flex items-end justify-center gap-1.5 rounded-xl border border-slate-200/70 bg-white px-2 py-1.5 shadow-sm">
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
            onMouseEnter={() => {
              prefetchDeliveryRateSlabs({
                level: row.kind,
                refId: row.id,
                serviceType: "food",
                actorType: "customer",
              });
            }}
            onClick={props.onDeliverySlabs}
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-800 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/30"
          >
            <Truck className="h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden />
            Delivery slabs
          </button>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-400">
            Platform offers (effective)
          </p>
          <div className="rounded-xl border border-indigo-200/50 bg-indigo-50/20 px-2 py-1.5 text-[10px] leading-snug text-slate-600">
            {offers.length === 0 ? (
              <span className="text-slate-400">—</span>
            ) : (
              <span title={offers.map((o) => `#${o.platform_offer_id}`).join(", ")}>
                {offers.length} offer{offers.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={props.onPlatformOfferMap}
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-600/20 bg-white px-2.5 text-[11px] font-semibold text-indigo-900 shadow-sm transition hover:bg-indigo-50"
          >
            <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Map offers
          </button>
        </div>

        <div className="flex min-w-[12.5rem] shrink-0 flex-col gap-1.5">
          {row.kind === "state" ? (
            <div className="flex items-start justify-between gap-2 rounded-lg border border-amber-200/70 bg-amber-50/50 px-2.5 py-1.5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold leading-tight text-slate-800">Rider online check</p>
                <p className="mt-0.5 text-[9px] leading-snug text-slate-500">
                  {row.require_rider_online_check !== false
                    ? "Blocks checkout if no rider nearby"
                    : "Checkout skips rider restriction"}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={row.require_rider_online_check !== false}
                aria-busy={props.pendingRiderOnlineCheck}
                disabled={props.pendingRiderOnlineCheck || !props.onRiderOnlineCheckToggle}
                title="When on, Place Order checks that a rider is online nearby. Off skips that gate."
                onClick={() =>
                  void props.onRiderOnlineCheckToggle?.(row.require_rider_online_check === false)
                }
                className={cn(
                  "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500",
                  row.require_rider_online_check !== false
                    ? "border-emerald-400/50 bg-emerald-500"
                    : "border-slate-200 bg-slate-300",
                  props.pendingRiderOnlineCheck && "cursor-not-allowed opacity-60"
                )}
              >
                <span
                  className={cn(
                    "absolute top-px left-px flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-sm transition-transform",
                    row.require_rider_online_check !== false && "translate-x-[16px]"
                  )}
                >
                  {props.pendingRiderOnlineCheck ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin text-teal-600" aria-hidden />
                  ) : null}
                </span>
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={props.onEdit}
            className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-teal-300 hover:text-teal-800"
          >
            <PencilLine className="h-3.5 w-3.5" />
            Edit location
          </button>
        </div>
      </div>
    </div>
  );
});
