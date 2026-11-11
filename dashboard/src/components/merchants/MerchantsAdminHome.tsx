"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export type AdminStoreRow = {
  id: number;
  store_id: string;
  name: string;
  city: string | null;
  state?: string | null;
  store_type?: string | null;
  approval_status: string;
  created_at?: string | null;
};

export type AdminStats = {
  total: number;
  verified: number;
  pending: number;
  rejected: number;
  drafted: number;
  new: number;
  resubmitted: number;
  partners?: number;
};

type CategoryKey =
  | "total"
  | "verified"
  | "pending"
  | "rejected"
  | "drafted"
  | "new"
  | "resubmitted"
  | "partners";

function storeTypeLabel(storeType: string | null | undefined): string {
  const t = (storeType ?? "").trim().toUpperCase();
  const map: Record<string, string> = {
    RESTAURANT: "Restaurant",
    CAFE: "Cafe",
    BAKERY: "Bakery",
    CLOUD_KITCHEN: "Cloud Kitchen",
    GROCERY: "Grocery",
    PHARMA: "Pharma",
  };
  return map[t] ?? (t ? t.replace(/_/g, " ") : "Restaurant");
}

function statusLabel(status: string): string {
  const s = (status || "").toUpperCase();
  if (s === "APPROVED") return "Verified";
  if (s === "DRAFT") return "Drafted";
  if (s === "REJECTED" || s === "BLOCKED" || s === "SUSPENDED") return "Rejected";
  return "Pending";
}

const outerBorder = "rounded-md border-[0.5px] border-[#121212]/40";
const rowBorder = "border-b-[0.5px] border-[#121212]/12";

const controlClass =
  "h-10 rounded-md border border-[#121212]/15 bg-white text-sm text-[#121212] focus:border-[#121212]/35 focus:outline-none";

interface MerchantsAdminHomeProps {
  stats: AdminStats | null;
  statsLoading: boolean;
  category: CategoryKey | null;
  onCategoryClick: (key: CategoryKey) => void;
  fromDate?: string;
  toDate?: string;
  storeType?: string;
  statusFilter?: string;
  dateFromInput: string;
  dateToInput: string;
  storeTypeFilter: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onStoreTypeChange: (v: string) => void;
  onStatusFilterChange: (v: string) => void;
  onApplyFilters: () => void;
  onClearFilters: () => void;
  portalQuery: string;
  buildStoreUrl: (store: AdminStoreRow) => string;
}

export function MerchantsAdminHome({
  stats,
  statsLoading: _statsLoading,
  category: _category,
  onCategoryClick: _onCategoryClick,
  fromDate,
  toDate,
  storeType,
  statusFilter = "",
  dateFromInput,
  dateToInput,
  storeTypeFilter,
  onDateFromChange,
  onDateToChange,
  onStoreTypeChange,
  onStatusFilterChange,
  onApplyFilters,
  onClearFilters,
  portalQuery: _portalQuery,
  buildStoreUrl,
}: MerchantsAdminHomeProps) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");

  const overviewQuery = useQuery({
    queryKey: ["merchant-admin-overview", fromDate, toDate, storeType, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      if (storeType) params.set("storeType", storeType);
      if (statusFilter) params.set("status", statusFilter);
      params.set("trendDays", "7");
      const res = await fetch(`/api/merchant/stores/admin-overview?${params.toString()}`);
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error ?? "Failed to load overview");
      return data as {
        stores: AdminStoreRow[];
        totalListed: number;
      };
    },
    staleTime: 30_000,
  });

  const stores = overviewQuery.data?.stores ?? [];
  const totalStores = stats?.total ?? stores.length;
  const verifiedStores =
    stats?.verified ??
    stores.filter((s) => (s.approval_status || "").toUpperCase() === "APPROVED").length;

  const handleSearch = () => {
    const v = searchInput.trim();
    if (!v) return;
    router.push(`/dashboard/merchants?portal=admin&search=${encodeURIComponent(v)}`);
  };

  return (
    <div className="merchants-typo flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      {/* Sticky filter bar — stays put while table rows scroll */}
      <div className="flex shrink-0 flex-col gap-3 bg-white lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 sm:gap-10">
          <div className="relative w-full max-w-[240px] sm:w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#121212]/35" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search store by name, ID or place"
              className={`${controlClass} w-full pl-10 pr-3 placeholder:text-[#121212]/40`}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
            />
          </div>
          <div className="flex items-center gap-6 text-sm sm:ml-2 sm:gap-8">
            <p className="text-[#121212]/70">
              Total stores{" "}
              <span className="merchants-num font-semibold text-[#121212]">{totalStores}</span>
            </p>
            <p className="text-[#121212]/70">
              Verified{" "}
              <span className="merchants-num font-semibold text-[#121212]">{verifiedStores}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className={`${controlClass} min-w-[140px] px-3`}
            aria-label="Status"
          >
            <option value="">All statuses</option>
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
            <option value="drafted">Drafted</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            value={storeTypeFilter}
            onChange={(e) => onStoreTypeChange(e.target.value)}
            className={`${controlClass} min-w-[140px] px-3`}
            aria-label="Store type"
          >
            <option value="">All types</option>
            <option value="RESTAURANT">Restaurant</option>
            <option value="CLOUD_KITCHEN">Cloud Kitchen</option>
            <option value="CAFE">Cafe</option>
            <option value="PHARMA">Pharma</option>
            <option value="GROCERY">Grocery</option>
          </select>
          <div className="flex h-10 items-center gap-1.5 rounded-md border border-[#121212]/15 bg-white px-2.5">
            <input
              type="date"
              value={dateFromInput}
              onChange={(e) => onDateFromChange(e.target.value)}
              className="h-8 border-0 bg-transparent px-1 text-sm text-[#121212] focus:outline-none focus:ring-0"
              aria-label="From date"
            />
            <span className="text-xs text-[#121212]/30">–</span>
            <input
              type="date"
              value={dateToInput}
              onChange={(e) => onDateToChange(e.target.value)}
              className="h-8 border-0 bg-transparent px-1 text-sm text-[#121212] focus:outline-none focus:ring-0"
              aria-label="To date"
            />
          </div>
          <button
            type="button"
            onClick={fromDate || toDate ? onClearFilters : onApplyFilters}
            className="h-10 cursor-pointer rounded-md bg-[#121212] px-4 text-sm font-medium text-white hover:bg-black"
          >
            {fromDate || toDate ? "Clear" : "Apply"}
          </button>
        </div>
      </div>

      {/* Table: outer border opacity .4; header sticky; only body rows scroll */}
      <div className={`min-h-0 flex-1 overflow-auto bg-white ${outerBorder}`}>
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="text-xs font-medium text-[#121212]/55">
            <tr>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-medium ${rowBorder}`}>
                Store name
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-medium ${rowBorder}`}>
                Store ID
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-medium ${rowBorder}`}>
                Type
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-medium ${rowBorder}`}>
                City
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-medium ${rowBorder}`}>
                State
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-medium ${rowBorder}`}>
                Status
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 text-right font-medium ${rowBorder}`}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {overviewQuery.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className={`px-3 py-3 ${rowBorder}`}>
                    <div className="h-4 w-2/3 animate-pulse bg-[#121212]/08" />
                  </td>
                </tr>
              ))
            ) : stores.length === 0 ? (
              <tr>
                <td colSpan={7} className={`px-3 py-10 text-center text-sm text-[#121212]/50 ${rowBorder}`}>
                  No merchants found.
                </td>
              </tr>
            ) : (
              stores.map((store) => {
                const status = (store.approval_status || "").toUpperCase();
                const isVerified = status === "APPROVED";
                return (
                  <tr
                    key={store.id}
                    className={
                      isVerified
                        ? "bg-white hover:bg-[#FAFAFA]"
                        : "bg-rose-50 hover:bg-rose-100/70"
                    }
                  >
                    <td className={`max-w-[220px] px-3 py-2.5 font-bold text-[#121212] ${rowBorder}`}>
                      <span className="block truncate" title={store.name}>
                        {store.name}
                      </span>
                    </td>
                    <td className={`merchants-num whitespace-nowrap px-3 py-2.5 text-[#121212]/70 ${rowBorder}`}>
                      {store.store_id}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-[#121212]/70 ${rowBorder}`}>
                      {storeTypeLabel(store.store_type)}
                    </td>
                    <td className={`max-w-[120px] px-3 py-2.5 text-[#121212]/70 ${rowBorder}`}>
                      <span className="block truncate" title={store.city ?? undefined}>
                        {store.city ?? "—"}
                      </span>
                    </td>
                    <td className={`max-w-[120px] px-3 py-2.5 text-[#121212]/70 ${rowBorder}`}>
                      <span className="block truncate" title={store.state ?? undefined}>
                        {store.state?.trim() || "—"}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-[#121212]/70 ${rowBorder}`}>
                      {statusLabel(store.approval_status)}
                    </td>
                    <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                      <button
                        type="button"
                        onClick={() => router.push(buildStoreUrl(store))}
                        className={
                          isVerified
                            ? "inline-flex h-8 cursor-pointer items-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                            : "inline-flex h-8 cursor-pointer items-center rounded-md bg-amber-500 px-3 text-xs font-semibold text-white hover:bg-amber-600"
                        }
                      >
                        {isVerified ? "View" : "Verify"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
