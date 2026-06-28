"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Filter, MapPinned, Search } from "lucide-react";

import { Spinner } from "@/components/geo-admin/Loader";
import { useGeoStatesQuery } from "@/store/api/geoAdminApi";

export default function CxAppHomePage() {
  const { data, isLoading, isFetching } = useGeoStatesQuery();
  const states = data?.states ?? [];
  const [query, setQuery] = useState("");
  const [sortDesc, setSortDesc] = useState(false);
  const [page, setPage] = useState(1);

  const pageSize = 21;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q ? states.filter((s) => s.name.toLowerCase().includes(q)) : states;
    const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    return sortDesc ? sorted.reverse() : sorted;
  }, [states, query, sortDesc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const paged = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  return (
    <div className="w-full min-w-0 max-w-none space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-cyan-50 text-cyan-600 shrink-0 mt-0.5">
              <MapPinned className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 leading-tight">CXApp Home</h2>
              <p className="text-xs text-gray-500 mt-0.5">App Category - CXApp Home: states and UT coverage list.</p>
            </div>
          </div>
          <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            <Link
              href="/dashboard/super-admin/customer-app-categories"
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              App Category
            </Link>
            <span className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white">CXApp Home</span>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-2.5">
            <div>
              <h3 className="text-[24px] font-semibold leading-none text-slate-900">States / UT</h3>
              <p className="mt-1 text-xs text-gray-500">Showing all available states and union territories from geo master.</p>
            </div>
            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
              <label className="relative block w-full sm:w-[250px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search state / UT..."
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-cyan-500"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setSortDesc((p) => !p);
                  setPage(1);
                }}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Filter className="h-4 w-4 text-slate-500" />
                Filter
              </button>
            </div>
          </div>

          {isLoading || isFetching ? (
            <div className="flex justify-center py-10">
              <Spinner label="Loading states / UT..." className="text-slate-600" />
            </div>
          ) : paged.length === 0 ? (
            <p className="py-8 text-sm text-slate-500">No states/UT found.</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {paged.map((state) => (
                <Link
                  key={state.id}
                  href={`/dashboard/super-admin/cxapp-home/${state.id}`}
                  onMouseEnter={() => {
                    void fetch(`/api/super-admin/cxapp-home/food-layout/${state.id}`, {
                      cache: "no-store",
                    }).catch(() => {});
                  }}
                  className="group flex min-h-[40px] items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-slate-800 transition hover:border-cyan-300 hover:bg-cyan-50/40"
                >
                  <span className="truncate text-[13px] font-semibold">{state.name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-cyan-700" />
                </Link>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
            <p className="text-xs text-slate-500">Showing {filtered.length} items</p>
            <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe <= 1}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="inline-flex min-w-8 items-center justify-center rounded-md bg-cyan-600 px-2 py-1 text-xs font-semibold text-white">
                {pageSafe}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
