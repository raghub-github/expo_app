"use client";

import { useAppSearchParams } from "@/lib/navigation/use-app-search-params";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { GeoTree, type GeoTreeFilters } from "@/components/geo-admin/GeoTree";
import { SearchBar } from "@/components/geo-admin/SearchBar";
import { FilterPanel, type ServiceTriState } from "@/components/geo-admin/FilterPanel";
import { ResultTable } from "@/components/geo-admin/ResultTable";
import { SearchChainPanel } from "@/components/geo-admin/SearchChainPanel";
import { AddLocationForm } from "@/components/geo-admin/AddLocationForm";
import { EditLocationModal } from "@/components/geo-admin/EditLocationModal";
import { PlatformOfferMapModal } from "@/components/geo-admin/PlatformOfferMapModal";
import { DeliverySlabsModal } from "@/components/geo-admin/DeliverySlabsModal";
import { DeliveryFallbackPanel } from "@/components/geo-admin/DeliveryFallbackPanel";
import { useGeoStatesQuery, useLazyGeoSearchQuery } from "@/store/api/geoAdminApi";
import type { GeoChildRow, GeoSearchRow } from "@/lib/geo/geo-shared";
import { GitBranch, LayoutList, MapPin, Plus, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/geo-admin/Loader";

const GEO_VIEW_STORAGE_KEY = "geo_super_admin_view_tab";

type GeoView = "tree" | "flat" | "fallback";

function parseGeoView(value: string | null): GeoView | null {
  if (value === "tree" || value === "flat" || value === "fallback") return value;
  return null;
}

function searchRowToChild(r: GeoSearchRow): GeoChildRow {
  return {
    kind: r.kind,
    id: r.id,
    name: r.name,
    pincode: r.pincode,
    path: r.path,
    latitude: r.latitude,
    longitude: r.longitude,
    is_food_enabled: r.is_food_enabled,
    is_parcel_enabled: r.is_parcel_enabled,
    is_ride_enabled: r.is_ride_enabled,
    food_override: r.food_override,
    parcel_override: r.parcel_override,
    ride_override: r.ride_override,
    has_children: r.kind !== "pincode",
    effective_food_base_fee: r.effective_food_base_fee ?? null,
    effective_parcel_base_fee: r.effective_parcel_base_fee ?? null,
    effective_ride_base_fee: r.effective_ride_base_fee ?? null,
    customer_food_delivery_slabs_preview: r.customer_food_delivery_slabs_preview ?? null,
    customer_parcel_delivery_slabs_preview: r.customer_parcel_delivery_slabs_preview ?? null,
    customer_ride_delivery_slabs_preview: r.customer_ride_delivery_slabs_preview ?? null,
    rider_rate_summaries: r.rider_rate_summaries ?? null,
    effective_platform_offers: r.effective_platform_offers ?? [],
  };
}

export default function GeoSuperAdminPage() {
  const searchParams = useAppSearchParams();
  const [view, setViewState] = useState<GeoView>("tree");

  useEffect(() => {
    const fromUrl = parseGeoView(searchParams.get("view"));
    if (fromUrl) {
      setViewState(fromUrl);
      try {
        sessionStorage.setItem(GEO_VIEW_STORAGE_KEY, fromUrl);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const stored = parseGeoView(sessionStorage.getItem(GEO_VIEW_STORAGE_KEY));
      if (stored) setViewState(stored);
    } catch {
      /* ignore */
    }
  }, [searchParams]);

  const setView = useCallback((next: GeoView) => {
    setViewState(next);
    try {
      sessionStorage.setItem(GEO_VIEW_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);
  const [stateId, setStateId] = useState<string | null>(null);
  const [food, setFood] = useState<ServiceTriState>(null);
  const [parcel, setParcel] = useState<ServiceTriState>(null);
  const [ride, setRide] = useState<ServiceTriState>(null);
  const [editRow, setEditRow] = useState<GeoChildRow | null>(null);
  const [offerMapRow, setOfferMapRow] = useState<GeoChildRow | null>(null);
  const [slabsRow, setSlabsRow] = useState<GeoChildRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [flatChainRow, setFlatChainRow] = useState<GeoSearchRow | null>(null);
  const [lastQuery, setLastQuery] = useState("");

  const { data: statesRes, isLoading: statesLoading, isFetching: statesFetching } = useGeoStatesQuery();
  const states = statesRes?.states ?? [];

  const filters: GeoTreeFilters = useMemo(
    () => ({ stateId, food, parcel, ride }),
    [stateId, food, parcel, ride]
  );

  const treeRemountKey = `${stateId ?? "all"}-${food}-${parcel}-${ride}`;

  const [runSearch, searchState] = useLazyGeoSearchQuery();

  const onSearch = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      setFlatChainRow(null);
      if (trimmed.length < 1) {
        setLastQuery("");
        return;
      }
      setLastQuery(trimmed);
      void runSearch({
        q: trimmed,
        limit: 80,
        stateId,
        food,
        parcel,
        ride,
      });
    },
    [runSearch, stateId, food, parcel, ride]
  );

  const refetchSearch = useCallback(() => {
    if (lastQuery.length < 1) return;
    void runSearch({
      q: lastQuery,
      limit: 80,
      stateId,
      food,
      parcel,
      ride,
    });
  }, [lastQuery, runSearch, stateId, food, parcel, ride]);

  const onPickSearchRow = useCallback((r: GeoSearchRow) => {
    setEditRow(searchRowToChild(r));
  }, []);

  return (
    <div className="relative min-h-[calc(100vh-4rem)] w-full min-w-0 overflow-x-hidden bg-slate-50/80">
      <div className="border-b border-slate-200/90 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 py-3 sm:px-4 sm:py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600/10 text-teal-700 ring-1 ring-teal-600/15">
              <MapPin className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <Link
                  href="/dashboard/super-admin"
                  className="text-[10px] font-semibold uppercase tracking-wider text-teal-700/90 hover:text-teal-800"
                >
                  Super Admin
                </Link>
                <span className="hidden text-slate-300 sm:inline" aria-hidden>
                  ·
                </span>
                <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">Geo & coverage</h1>
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-500 sm:max-w-2xl">
                Hierarchy from state to pincode; lazy load, service rules, and search.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className={cn(
              "inline-flex w-full shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-teal-600/20 bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 sm:w-auto sm:self-auto",
              view === "fallback" && "hidden"
            )}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add location
          </button>
        </div>
      </div>

      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-5">
        {view !== "fallback" ? (
          <FilterPanel
            states={states}
            stateId={stateId}
            onStateId={setStateId}
            food={food}
            parcel={parcel}
            ride={ride}
            onFood={setFood}
            onParcel={setParcel}
            onRide={setRide}
            statesLoading={statesLoading || statesFetching}
          />
        ) : null}

        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div
            className="flex w-full min-w-0 shrink-0 flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm sm:w-auto"
            role="tablist"
            aria-label="Directory view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === "tree"}
              onClick={() => setView("tree")}
              className={cn(
                "inline-flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition sm:min-h-0 sm:flex-initial sm:px-3.5",
                view === "tree"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <GitBranch className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">Tree view</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "flat"}
              onClick={() => setView("flat")}
              className={cn(
                "inline-flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition sm:min-h-0 sm:flex-initial sm:px-3.5",
                view === "flat"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <LayoutList className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">Flat search</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "fallback"}
              onClick={() => setView("fallback")}
              className={cn(
                "inline-flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition sm:min-h-0 sm:flex-initial sm:px-3.5",
                view === "fallback"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <Truck className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">Fallback Del charge</span>
            </button>
          </div>

          {view === "flat" ? (
            <div className="min-w-0 w-full sm:flex-1 sm:pl-0">
              <SearchBar
                className="max-w-none"
                initialQuery={lastQuery}
                onDebouncedChange={onSearch}
                debounceMs={400}
                isSearching={searchState.isFetching}
              />
            </div>
          ) : null}
        </div>

        {view === "tree" ? (
          <GeoTree
            key={treeRemountKey}
            filters={filters}
            onEdit={setEditRow}
            onPlatformOfferMap={setOfferMapRow}
            onDeliverySlabs={setSlabsRow}
          />
        ) : view === "flat" ? (
          <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-md shadow-slate-200/30 sm:rounded-2xl sm:p-5">
            {searchState.isError ? (
              <p className="text-sm font-medium text-red-600">Search failed. Check connection and try again.</p>
            ) : null}
            {lastQuery.length < 1 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center sm:rounded-2xl sm:px-5 sm:py-10">
                <p className="text-sm font-medium text-slate-700">Search the directory</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Type a pincode, post office, division, district, or state. Results stay on <strong>Flat search</strong>{" "}
                  while we load — use <strong>Tree view</strong> only when you switch tabs yourself.
                </p>
              </div>
            ) : searchState.isLoading ? (
              <div className="flex justify-center py-16">
                <Spinner label="Searching directory…" className="text-slate-600" />
              </div>
            ) : (
              <>
                {searchState.isFetching ? (
                  <p className="text-center text-[11px] font-medium text-teal-700">Refreshing results…</p>
                ) : null}
                <ResultTable
                  rows={searchState.data?.rows ?? []}
                  chainFor={flatChainRow}
                  onChainFor={setFlatChainRow}
                  onEditRow={onPickSearchRow}
                  onPlatformOfferMap={(r) => setOfferMapRow(searchRowToChild(r))}
                  onDeliverySlabs={(r) => setSlabsRow(searchRowToChild(r))}
                  onDataMutated={refetchSearch}
                />
                <SearchChainPanel
                  row={flatChainRow}
                  onClose={() => setFlatChainRow(null)}
                  onEditPricing={setEditRow}
                  onDataMutated={refetchSearch}
                />
              </>
            )}
          </div>
        ) : (
          <DeliveryFallbackPanel />
        )}
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-t-2xl border border-slate-200/80 bg-white p-4 shadow-2xl shadow-slate-900/20 sm:max-h-[90vh] sm:rounded-2xl sm:p-6">
            <h2 className="mb-1 text-lg font-bold text-slate-900">Add location</h2>
            <p className="mb-4 text-xs text-slate-500">Creates missing parents and links pincode ↔ post office.</p>
            <AddLocationForm onClose={() => setAddOpen(false)} />
          </div>
        </div>
      )}

      {editRow && <EditLocationModal row={editRow} onClose={() => setEditRow(null)} />}
      {slabsRow && <DeliverySlabsModal row={slabsRow} onClose={() => setSlabsRow(null)} />}
      {offerMapRow && (
        <PlatformOfferMapModal
          row={offerMapRow}
          onClose={() => setOfferMapRow(null)}
          onBindingsChanged={refetchSearch}
        />
      )}
    </div>
  );
}
