"use client";

import { useMemo, useState } from "react";
import { Filter, Search } from "lucide-react";

import { CxAppHomeSectionToggle } from "@/components/cxapp-home/CxAppHomeSectionToggle";
import { CxAppHomeStatesVirtualGrid } from "@/components/cxapp-home/CxAppHomeStatesVirtualGrid";
import { useGeoStatesQuery } from "@/store/api/geoAdminApi";
import type { GeoStateRow } from "@/lib/geo/list-active-states";

type Props = {
  initialStates: GeoStateRow[];
};

export function CxAppHomeClient({ initialStates }: Props) {
  const { data, isLoading, isError, error } = useGeoStatesQuery(undefined, {
    refetchOnMountOrArgChange: false,
    refetchOnFocus: false,
    refetchOnReconnect: false,
  });
  const states = data?.states?.length ? data.states : initialStates;
  const [query, setQuery] = useState("");
  const [sortDesc, setSortDesc] = useState(false);

  const showInitialSkeleton = isLoading && states.length === 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q ? states.filter((s) => s.name.toLowerCase().includes(q)) : states;
    const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    return sortDesc ? sorted.reverse() : sorted;
  }, [states, query, sortDesc]);

  return (
    <div className="flex w-full min-w-0 max-w-none flex-col gap-3">
      <div className="rounded-md border-[0.5px] border-[#121212]/40 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b-[0.5px] border-[#121212]/10 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold tracking-tight text-[#121212] sm:text-base">
              CXApp Home
            </h2>
            <p className="text-[11px] leading-snug text-[#121212]/50">
              States / UT layout coverage
            </p>
          </div>
          <CxAppHomeSectionToggle />
        </div>

        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:thin]">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#121212]/35" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search state / UT…"
              className="h-9 w-full rounded-md border border-[#121212]/12 bg-white py-1.5 pl-8 pr-2 text-xs text-[#121212] placeholder:text-[#121212]/40 outline-none focus:border-[#121212]/35"
            />
          </div>
          <button
            type="button"
            onClick={() => setSortDesc((p) => !p)}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[#121212]/12 bg-white px-3 text-xs font-semibold text-[#121212] hover:bg-[#F7F7F7]"
          >
            <Filter className="h-3.5 w-3.5 text-[#121212]/45" />
            {sortDesc ? "Z–A" : "A–Z"}
          </button>
          <p className="ml-auto shrink-0 text-[11px] text-[#121212]/50">
            {showInitialSkeleton ? "Loading…" : `${filtered.length} items`}
          </p>
        </div>
      </div>

      <div className={`min-h-0 rounded-md border-[0.5px] border-[#121212]/40 bg-white p-2.5`}>
        {showInitialSkeleton ? (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-md border border-[#121212]/08 bg-[#F7F7F7]"
              />
            ))}
          </div>
        ) : isError ? (
          <p className="py-8 text-sm text-red-600">
            {error && "status" in error
              ? "Failed to load states / UT."
              : "Failed to load states / UT."}
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-sm text-[#121212]/50">No states/UT found.</p>
        ) : (
          <CxAppHomeStatesVirtualGrid states={filtered} />
        )}
      </div>
    </div>
  );
}
