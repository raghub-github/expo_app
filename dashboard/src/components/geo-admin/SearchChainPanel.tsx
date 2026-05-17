"use client";

import React, { useState } from "react";
import { useGeoChainServicesQuery, useGeoToggleMutation } from "@/store/api/geoAdminApi";
import type { GeoChildRow, GeoHierarchyLevel, GeoSearchRow } from "@/lib/geo/geo-shared";
import { ServiceSwitch } from "./ServiceSwitch";
import { cn } from "@/lib/utils";
import { IndianRupee, Loader2, X } from "lucide-react";
import { formatGeoDeliverySlabPreview } from "./geoFeeLabel";

const levelBadge: Record<string, string> = {
  state: "border-violet-200 bg-violet-50 text-violet-800",
  region: "border-sky-200 bg-sky-50 text-sky-800",
  district: "border-cyan-200 bg-cyan-50 text-cyan-900",
  division: "border-amber-200 bg-amber-50 text-amber-900",
  post_office: "border-emerald-200 bg-emerald-50 text-emerald-900",
  pincode: "border-rose-200 bg-rose-50 text-rose-900",
};

function formatLevel(l: string): string {
  return l.replaceAll("_", " ");
}

export const SearchChainPanel = React.memo(function SearchChainPanel(props: {
  row: GeoSearchRow | null;
  onClose: () => void;
  onEditPricing: (row: GeoChildRow) => void;
  onDataMutated?: () => void;
}) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [toggleMut] = useGeoToggleMutation();

  const { data, isLoading, isError } = useGeoChainServicesQuery(
    { level: props.row?.kind ?? "state", refId: props.row?.id ?? "" },
    { skip: !props.row?.id }
  );

  if (!props.row) return null;

  const onServiceToggle = async (
    level: GeoChildRow["kind"],
    id: string,
    service: "food" | "parcel" | "ride",
    value: boolean
  ) => {
    const pk = `${id}:${service}`;
    setPendingKey(pk);
    try {
      await toggleMut({
        level: level as Exclude<GeoHierarchyLevel, "root">,
        id,
        service,
        value,
      }).unwrap();
      props.onDataMutated?.();
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-teal-200/60 bg-gradient-to-br from-white via-teal-50/20 to-slate-50/80 shadow-md shadow-teal-900/5">
      <div className="flex items-start justify-between gap-3 border-b border-teal-100/80 bg-teal-600/5 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-teal-800/80">Full hierarchy</p>
          <h3 className="mt-0.5 truncate text-sm font-bold text-slate-900">{props.row.name}</h3>
          <p className="mt-1 line-clamp-2 text-xs text-slate-600">{props.row.path}</p>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50"
          aria-label="Close hierarchy panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[min(60vh,420px)] overflow-y-auto px-3 py-3 sm:px-4">
        <div className="mb-3 rounded-xl border border-slate-200/80 bg-slate-50/90 p-3 text-[11px] leading-relaxed text-slate-600">
          <p className="font-semibold text-slate-800">One block per geographic level (top = state, bottom = your hit)</p>
          <p className="mt-1">
            Switches in a block affect <strong>only that level’s record</strong>. <strong>₹</strong> under each switch
            is the effective <strong>base_fee</strong> for that level (its own rule or inherited from above). Use{" "}
            <strong>Default price &amp; rules</strong> to add or edit rules on that level.
          </p>
        </div>
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin text-teal-600" aria-hidden />
            Loading chain…
          </div>
        )}
        {isError && (
          <p className="py-6 text-center text-sm text-red-600">Could not load hierarchy. Try again.</p>
        )}
        {!isLoading && !isError && data?.chain && data.chain.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-600">No hierarchy rows returned for this record.</p>
        )}
        {!isLoading && !isError && data?.chain && data.chain.length > 0 && (
          <div className="relative space-y-0 pl-2">
            <div className="absolute bottom-2 left-[7px] top-2 w-px bg-teal-200/90" />
            {data.chain.map((node) => {
              const isHit =
                props.row != null && node.id === props.row.id && node.kind === props.row.kind;
              return (
                <div key={`${node.kind}-${node.id}`} className="relative pb-4 pl-5 last:pb-0">
                  <span className="absolute left-0 top-3 h-2 w-2 rounded-full border-2 border-white bg-teal-500 shadow ring-1 ring-teal-200" />
                  <div
                    className={cn(
                      "rounded-xl border p-3 shadow-sm",
                      isHit
                        ? "border-teal-300/90 bg-white shadow-teal-200/25"
                        : "border-slate-200/80 bg-white/95"
                    )}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                          levelBadge[node.kind] ?? "border-slate-200 bg-slate-50 text-slate-700"
                        )}
                      >
                        {formatLevel(node.kind)}
                      </span>
                      <span className="text-xs font-semibold text-slate-900">{node.name}</span>
                      {isHit ? (
                        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[9px] font-bold uppercase text-teal-900">
                          Search hit
                        </span>
                      ) : null}
                    </div>
                    <p className="mb-2 truncate text-[10px] text-slate-500" title={node.path}>
                      {node.path}
                    </p>
                    <div className="mb-2">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Platform offers (effective)</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(node.effective_platform_offers ?? []).length === 0 ? (
                          <span className="text-[10px] text-slate-400">—</span>
                        ) : (
                          (node.effective_platform_offers ?? []).map((o) => (
                            <span
                              key={o.platform_offer_id}
                              className="inline-flex max-w-full items-center gap-1 rounded border border-indigo-100 bg-indigo-50/70 px-1.5 py-0.5 font-mono text-[9px] text-indigo-950"
                              title={o.offer_setup_summary}
                            >
                              <span className="font-bold">#{o.platform_offer_id}</span>
                              <span className="truncate">{o.service_type}</span>
                              {o.is_inherited ? (
                                <span className="shrink-0 rounded bg-amber-100 px-0.5 text-[8px] font-semibold text-amber-900">
                                  Inh
                                </span>
                              ) : null}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div
                        className="flex items-end gap-2 rounded-lg border border-slate-200/70 bg-slate-50/50 px-2 py-1.5"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <ServiceSwitch
                            service="food"
                            on={node.is_food_enabled}
                            inherited={!node.food_override}
                            pending={pendingKey === `${node.id}:food`}
                            onToggle={() =>
                              void onServiceToggle(node.kind, node.id, "food", !node.is_food_enabled)
                            }
                          />
                          <span className="font-mono text-[8px] font-semibold tabular-nums text-slate-600">
                            {formatGeoDeliverySlabPreview(node.customer_food_delivery_slabs_preview)}
                          </span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                          <ServiceSwitch
                            service="parcel"
                            on={node.is_parcel_enabled}
                            inherited={!node.parcel_override}
                            pending={pendingKey === `${node.id}:parcel`}
                            onToggle={() =>
                              void onServiceToggle(node.kind, node.id, "parcel", !node.is_parcel_enabled)
                            }
                          />
                          <span className="font-mono text-[8px] font-semibold tabular-nums text-slate-600">
                            {formatGeoDeliverySlabPreview(node.customer_parcel_delivery_slabs_preview)}
                          </span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                          <ServiceSwitch
                            service="ride"
                            on={node.is_ride_enabled}
                            inherited={!node.ride_override}
                            pending={pendingKey === `${node.id}:ride`}
                            onToggle={() =>
                              void onServiceToggle(node.kind, node.id, "ride", !node.is_ride_enabled)
                            }
                          />
                          <span className="font-mono text-[8px] font-semibold tabular-nums text-slate-600">
                            {formatGeoDeliverySlabPreview(node.customer_ride_delivery_slabs_preview)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => props.onEditPricing(node)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-800 shadow-sm transition hover:border-teal-300 hover:text-teal-800"
                      >
                        <IndianRupee className="h-3.5 w-3.5 text-teal-600" aria-hidden />
                        Default price &amp; rules
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
