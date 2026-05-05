"use client";

import React, { useMemo, useState } from "react";
import { GeoNode } from "./GeoNode";
import { useGeoChildrenQuery, useGeoToggleMutation } from "@/store/api/geoAdminApi";
import type { GeoChildRow } from "@/lib/geo/geo-shared";
import type { GeoHierarchyLevel } from "@/store/api/geoAdminApi";
import { RefreshCw } from "lucide-react";
import { TreeSkeletonBlock } from "./Loader";
import { cn } from "@/lib/utils";

export type GeoTreeFilters = {
  stateId: string | null;
  food: boolean | null;
  parcel: boolean | null;
  ride: boolean | null;
};

function GeoTreeNode(props: {
  row: GeoChildRow;
  depth: number;
  filters: GeoTreeFilters;
  onEdit: (row: GeoChildRow) => void;
  onPlatformOfferMap: (row: GeoChildRow) => void;
  onDeliverySlabs: (row: GeoChildRow) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pendingService, setPendingService] = useState<"food" | "parcel" | "ride" | null>(null);
  const parentLevel = props.row.kind as Exclude<GeoHierarchyLevel, "root">;

  const q = useMemo(
    () => ({
      parentLevel,
      parentId: props.row.id,
      limit: 100,
      stateId: props.filters.stateId,
      food: props.filters.food,
      parcel: props.filters.parcel,
      ride: props.filters.ride,
    }),
    [parentLevel, props.row.id, props.filters]
  );

  const { data, isFetching, isLoading } = useGeoChildrenQuery(q, {
    skip: !expanded || !props.row.has_children,
  });

  const [toggleMut] = useGeoToggleMutation();

  const onServiceToggle = async (service: "food" | "parcel" | "ride", value: boolean) => {
    setPendingService(service);
    try {
      await toggleMut({ level: parentLevel, id: props.row.id, service, value }).unwrap();
    } finally {
      setPendingService(null);
    }
  };

  const showChildLoader = expanded && props.row.has_children && (isFetching || isLoading) && !data?.rows?.length;

  return (
    <div>
      <GeoNode
        row={props.row}
        expanded={expanded}
        onToggleExpand={() => setExpanded((e) => !e)}
        onServiceToggle={onServiceToggle}
        onEdit={() => props.onEdit(props.row)}
        onPlatformOfferMap={() => props.onPlatformOfferMap(props.row)}
        onDeliverySlabs={() => props.onDeliverySlabs(props.row)}
        depth={props.depth}
        pendingService={pendingService}
      />
      {expanded && props.row.has_children && (
        <div className="relative ml-3 border-l-2 border-teal-100/80 pl-1 sm:ml-4">
          {showChildLoader && <TreeSkeletonBlock rows={5} depth={props.depth + 1} />}
          {data?.rows.map((child: GeoChildRow) => (
            <GeoTreeNode
              key={`${child.kind}-${child.id}`}
              row={child}
              depth={props.depth + 1}
              filters={props.filters}
              onEdit={props.onEdit}
              onPlatformOfferMap={props.onPlatformOfferMap}
              onDeliverySlabs={props.onDeliverySlabs}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const GeoTree = React.memo(function GeoTree(props: {
  filters: GeoTreeFilters;
  onEdit: (row: GeoChildRow) => void;
  onPlatformOfferMap: (row: GeoChildRow) => void;
  onDeliverySlabs: (row: GeoChildRow) => void;
}) {
  const q = useMemo(
    () => ({
      parentLevel: "root" as const,
      parentId: null as string | null,
      limit: 100,
      stateId: props.filters.stateId,
      food: props.filters.food,
      parcel: props.filters.parcel,
      ride: props.filters.ride,
    }),
    [props.filters]
  );

  const { data, isFetching, isLoading, refetch } = useGeoChildrenQuery(q);

  const rootLoading = isLoading || (isFetching && !data?.rows?.length);

  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white/90 shadow-md shadow-slate-200/30 sm:rounded-2xl">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-teal-50/40 px-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-800">Hierarchy</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Customer <strong className="font-medium text-slate-600">base_fee</strong>, rider payout, and{" "}
            <strong className="font-medium text-slate-600">platform offers</strong> inherit up the chain (nearest wins per offer). Use{" "}
            <strong className="font-medium text-slate-600">Map offers</strong> on a node to bind offers there.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className={cn(
            "inline-flex shrink-0 items-center justify-center gap-2 self-stretch rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition sm:self-auto sm:py-2",
            "hover:border-teal-300 hover:text-teal-800 disabled:opacity-60"
          )}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      <div className="relative max-h-[min(70vh,720px)] overflow-auto">
        <div className="p-2 sm:p-3">
          {rootLoading ? (
            <TreeSkeletonBlock rows={10} depth={0} />
          ) : (
            data?.rows.map((row: GeoChildRow) => (
              <GeoTreeNode
                key={`${row.kind}-${row.id}`}
                row={row}
                depth={0}
                filters={props.filters}
                onEdit={props.onEdit}
                onPlatformOfferMap={props.onPlatformOfferMap}
                onDeliverySlabs={props.onDeliverySlabs}
              />
            ))
          )}
          {!rootLoading && (!data?.rows || data.rows.length === 0) ? (
            <p className="py-12 text-center text-sm text-slate-500">No locations match these filters.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
});
