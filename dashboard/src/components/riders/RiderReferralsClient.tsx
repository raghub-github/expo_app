"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { RiderSectionHeader } from "./RiderSectionHeader";
import { CollapsibleTableFilters } from "./CollapsibleTableFilters";
import { FilterChips, type FilterChipItem } from "./FilterChips";
import { FilterSearchBar } from "./FilterSearchBar";
import { TablePagination } from "./TablePagination";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  UserPlus,
  Hash,
  User,
  Copy,
  Check,
  FileText,
  IndianRupee,
  Package,
} from "lucide-react";

interface RiderInfo {
  id: number;
  name: string | null;
  mobile: string;
}

interface RiderDetailResponse {
  rider: {
    id: number;
    name: string | null;
    mobile: string;
    referralCode: string | null;
    referredBy: number | null;
  };
}

interface ReferralListItem {
  referralId: number;
  referredRiderId: number;
  referredRiderName: string | null;
  referredMobile: string;
  referredAt: string;
  cityName: string | null;
  offerCode: string | null;
  offerName: string | null;
  offerType: string | null;
  minOrdersRequired: number;
  ordersCompletedTotal: number;
  ordersCompletedFood: number;
  ordersCompletedParcel: number;
  ordersCompletedPersonRide: number;
  currentOrderCountTotal: number;
  currentOrderCountFood: number;
  currentOrderCountParcel: number;
  currentOrderCountPersonRide: number;
  fulfillmentStatus: string;
  offerFulfilled: boolean;
  amountCredited: string;
  amountCreditedFood: string;
  amountCreditedParcel: string;
  amountCreditedPersonRide: string;
  creditedAt: string | null;
  fulfilledAt: string | null;
  termsAndConditions: string | null;
  termsSnapshot: Record<string, unknown>;
}

interface ReferralDataResponse {
  success: boolean;
  data?: {
    rider: {
      id: number;
      name: string | null;
      mobile: string;
      referralCode: string | null;
      referredBy: number | null;
    };
    totalReferredCount: number;
    totalAmountCredited: string;
    list: ReferralListItem[];
    total?: number;
    hasMore: boolean;
    limit: number;
    offset: number;
  };
  error?: string;
}

export function RiderReferralsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const riderContext = useRiderDashboardOptional();
  const searchValue = (searchParams.get("search") || "").trim();
  const [searchInput, setSearchInput] = useState(searchValue);
  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referredBy, setReferredBy] = useState<number | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referredByCopied, setReferredByCopied] = useState(false);
  const [referralData, setReferralData] = useState<ReferralDataResponse["data"] | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    cityName: "",
    status: "",
    q: "",
  });

  const copyReferredById = useCallback(async () => {
    if (referredBy == null) return;
    const id = `GMR${referredBy}`;
    try {
      await navigator.clipboard.writeText(id);
      setReferredByCopied(true);
      setTimeout(() => setReferredByCopied(false), 2000);
    } catch {
      setError("Failed to copy to clipboard");
    }
  }, [referredBy]);

  const resolveRider = useCallback(async (value: string) => {
    if (!value.trim()) {
      setRider(null);
      setReferralCode(null);
      setReferredBy(null);
      setReferralData(null);
      return;
    }
    setResolveLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Database not available");
      let query = supabase.from("riders").select("id, name, mobile");
      const isRiderId = /^GMR(\d+)$/i.test(value);
      const isNumeric = /^\d{1,9}$/.test(value);
      const isPhone = /^\d{10,}$/.test(value.replace(/^\+?91/, ""));
      if (isRiderId) query = query.eq("id", parseInt(value.replace(/^GMR/i, ""), 10));
      else if (isNumeric) query = query.eq("id", parseInt(value, 10));
      else if (isPhone) query = query.eq("mobile", value.replace(/^\+?91/, ""));
      else query = query.ilike("mobile", `%${value}%`);
      const { data, error: e } = await query.limit(1).single();
      if (e || !data) {
        setRider(null);
        setReferralCode(null);
        setReferredBy(null);
        setReferralData(null);
        setError("No rider found");
        return;
      }
      setRider({ id: data.id, name: data.name, mobile: data.mobile });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resolve rider");
      setRider(null);
      setReferralCode(null);
      setReferredBy(null);
      setReferralData(null);
    } finally {
      setResolveLoading(false);
    }
  }, []);

  const fetchRiderDetail = useCallback(async (riderId: number) => {
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/riders/${riderId}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load rider");
      const data = json.data as RiderDetailResponse;
      setReferralCode(data.rider?.referralCode ?? null);
      setReferredBy(data.rider?.referredBy ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load referral data");
      setReferralCode(null);
      setReferredBy(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const fetchReferralData = useCallback(
    async (riderId: number) => {
      setListLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("limit", String(pageSize));
        params.set("offset", String((page - 1) * pageSize));
        if (filters.from) params.set("from", filters.from);
        if (filters.to) params.set("to", filters.to);
        if (filters.cityName.trim()) params.set("cityName", filters.cityName.trim());
        if (filters.status) params.set("status", filters.status);
        if (filters.q.trim()) params.set("q", filters.q.trim());
        const res = await fetch(
          `/api/riders/${riderId}/referral-data?${params.toString()}`,
          { credentials: "include" }
        );
        const json: ReferralDataResponse = await res.json();
        if (!res.ok || !json.success)
          throw new Error(json.error || "Failed to load referral data");
        if (!json.data) {
          setReferralData(null);
          return;
        }
        setReferralData({ ...json.data, total: json.data.total ?? json.data.list.length });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load referral list");
        setReferralData(null);
      } finally {
        setListLoading(false);
      }
    },
    [filters, page, pageSize]
  );

  const riderFromContext = riderContext?.currentRiderInfo
    ? {
        id: riderContext.currentRiderInfo.id,
        name: riderContext.currentRiderInfo.name,
        mobile: riderContext.currentRiderInfo.mobile,
      }
    : null;

  useEffect(() => setSearchInput(searchValue), [searchValue]);
  useEffect(() => {
    if (searchValue) resolveRider(searchValue);
    else if (riderFromContext) {
      setRider(riderFromContext);
      setError(null);
    } else {
      setRider(null);
      setReferralCode(null);
      setReferredBy(null);
      setReferralData(null);
      setError(null);
    }
  }, [searchValue, riderFromContext?.id, resolveRider]);
  useEffect(() => {
    if (rider) fetchRiderDetail(rider.id);
  }, [rider, fetchRiderDetail]);
  useEffect(() => {
    if (rider) fetchReferralData(rider.id);
  }, [rider?.id, fetchReferralData]);

  useEffect(() => {
    setFilters({
      from: searchParams.get("from") || "",
      to: searchParams.get("to") || "",
      cityName: searchParams.get("cityName") || "",
      status: searchParams.get("status") || "",
      q: searchParams.get("q") || "",
    });
  }, [searchParams]);

  useEffect(() => {
    setPage(1);
  }, [filters.from, filters.to, filters.cityName, filters.status, filters.q]);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

  const applyFilters = useCallback(
    (overrides?: Partial<typeof filters>) => {
      const next = { ...filters, ...overrides };
      setPage(1);
      const urlParams = new URLSearchParams();
      if (searchValue) urlParams.set("search", searchValue);
      if (next.from) urlParams.set("from", next.from);
      if (next.to) urlParams.set("to", next.to);
      if (next.cityName && next.cityName.trim()) urlParams.set("cityName", next.cityName.trim());
      if (next.status) urlParams.set("status", next.status);
      if (next.q && next.q.trim()) urlParams.set("q", next.q.trim());
      router.push(`/dashboard/riders/referrals?${urlParams.toString()}`);
      if (overrides) setFilters(next);
    },
    [filters, searchValue, router]
  );

  const referralFilterChips: FilterChipItem[] = [];
  if (filters.from) referralFilterChips.push({ id: "from", label: `From: ${filters.from}` });
  if (filters.to) referralFilterChips.push({ id: "to", label: `To: ${filters.to}` });
  if (filters.cityName.trim())
    referralFilterChips.push({ id: "cityName", label: `City: ${filters.cityName.trim().slice(0, 12)}${filters.cityName.trim().length > 12 ? "…" : ""}` });
  if (filters.status)
    referralFilterChips.push({ id: "status", label: `Status: ${filters.status}` });
  if (filters.q.trim())
    referralFilterChips.push({ id: "q", label: `Search: "${filters.q.trim().slice(0, 10)}${filters.q.trim().length > 10 ? "…" : ""}"` });

  const removeReferralFilter = (id: string) => {
    const next = { ...filters };
    if (id === "from") next.from = "";
    if (id === "to") next.to = "";
    if (id === "cityName") next.cityName = "";
    if (id === "status") next.status = "";
    if (id === "q") next.q = "";
    applyFilters(next);
  };
  const clearAllReferralFilters = () => {
    applyFilters({
      from: "",
      to: "",
      cityName: "",
      status: "",
      q: "",
    });
  };

  const totalFiltered = referralData?.total ?? 0;
  const activeFilterCount = [filters.from, filters.to, filters.cityName.trim(), filters.status, filters.q.trim()].filter(Boolean).length;

  const hasSearch = searchValue.length > 0;
  const list = referralData?.list ?? [];
  const totalReferred = referralData?.totalReferredCount ?? 0;
  const totalCredited = referralData?.totalAmountCredited ?? "0";

  const formatDate = (s: string | null) =>
    s ? new Date(s).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—";
  const formatCurrency = (s: string) =>
    "₹" + (parseFloat(s) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  return (
    <div className="space-y-3 sm:space-y-4 w-full max-w-full overflow-x-hidden">
      <RiderSectionHeader
        title="Referral Data"
        description="View referral code, and detailed referral history with order counts and credited amounts."
        rider={rider}
        resolveLoading={resolveLoading}
        error={error}
        hasSearch={hasSearch}
      />
      {rider && (
        <>
          {/* Compact stats bar — single row on desktop, 2x2 on small screens */}
          <div className="rounded-xl border border-gray-200/90 bg-white px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm ring-1 ring-gray-900/5 relative">
            {detailLoading && referralCode == null && referredBy == null ? (
              <div className="flex justify-center py-6">
                <LoadingSpinner size="sm" text="Loading..." />
              </div>
            ) : (
              <>
                {detailLoading && (referralCode != null || referredBy != null) && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-100 z-10 rounded-t-xl overflow-hidden">
                    <div className="h-full w-1/3 bg-blue-500 animate-pulse rounded-r" />
                  </div>
                )}
                <div
                  className={`transition-opacity duration-200 ${
                    detailLoading && (referralCode != null || referredBy != null)
                      ? "opacity-70 pointer-events-none"
                      : ""
                  }`}
                >
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2 sm:gap-x-6 sm:gap-y-3">
                    <div className="min-w-0">
                      <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1">
                        <Hash className="h-3 w-3 shrink-0" />
                        Referral code
                      </p>
                      <p className="text-sm sm:text-base font-semibold text-gray-900 font-mono truncate mt-0.5" title={referralCode || undefined}>
                        {referralCode || "—"}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1">
                        <User className="h-3 w-3 shrink-0" />
                        Referred by
                      </p>
                      <p className="mt-0.5">
                        {referredBy != null ? (
                          <button
                            type="button"
                            onClick={copyReferredById}
                            className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 -ml-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 transition-colors"
                            aria-label={`Copy GMR${referredBy}`}
                            title="Copy ID"
                          >
                            <span className="font-mono">GMR{referredBy}</span>
                            {referredByCopied ? (
                              <Check className="h-3.5 w-3.5 text-green-600 shrink-0" aria-hidden />
                            ) : (
                              <Copy className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                            )}
                            {referredByCopied && (
                              <span className="text-[10px] font-medium text-green-600">Copied</span>
                            )}
                          </button>
                        ) : (
                          <span className="text-sm font-semibold text-gray-900">—</span>
                        )}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] sm:text-xs font-medium text-blue-600 uppercase tracking-wider flex items-center gap-1">
                        <UserPlus className="h-3 w-3 shrink-0" />
                        Total referred
                      </p>
                      <p className="text-sm sm:text-base font-bold text-blue-900 mt-0.5">{totalReferred}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] sm:text-xs font-medium text-green-600 uppercase tracking-wider flex items-center gap-1">
                        <IndianRupee className="h-3 w-3 shrink-0" />
                        Amount credited
                      </p>
                      <p className="text-sm sm:text-base font-bold text-green-900 mt-0.5">{formatCurrency(totalCredited)}</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <CollapsibleTableFilters
            label="Referral History & Fulfillment"
            activeCount={activeFilterCount}
            filterChipsSlot={
              <FilterChips
                inline
                chips={referralFilterChips}
                onRemove={removeReferralFilter}
                onClearAll={clearAllReferralFilters}
              />
            }
            trailingSlot={
              list.length > 0 || totalFiltered > 0 ? (
                <>
                  <span className="text-[10px] sm:text-xs text-gray-600 whitespace-nowrap">Rows</span>
                  <select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    className="h-6 sm:h-7 min-w-[2.5rem] rounded border border-gray-300 bg-white px-1.5 text-[10px] sm:text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    aria-label="Rows per page"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <TablePagination
                    page={page}
                    pageSize={pageSize}
                    total={totalFiltered}
                    onPageChange={setPage}
                    disabled={listLoading}
                    ariaLabel="Referral history"
                    compact
                  />
                </>
              ) : null
            }
            filterContent={
              <>
                <FilterSearchBar
                  value={filters.q}
                  onChange={(v) => setFilters((f) => ({ ...f, q: v }))}
                  onSubmit={() => applyFilters()}
                  placeholder="Name, mobile, or rider ID"
                  // hint="Search referred riders"
                  id="referral-search"
                  className="min-w-0 flex-1"
                />
                <div className="min-w-[120px]">
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">From date</label>
                  <input
                    type="date"
                    value={filters.from}
                    onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="min-w-[120px]">
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">To date</label>
                  <input
                    type="date"
                    value={filters.to}
                    onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="min-w-[120px]">
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">City</label>
                  <input
                    type="text"
                    placeholder="City name"
                    value={filters.cityName}
                    onChange={(e) => setFilters((f) => ({ ...f, cityName: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="min-w-[120px]">
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Status</label>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 [&>option]:text-gray-900 [&>option]:bg-white"
                    aria-label="Filter by status"
                  >
                    <option value="">All</option>
                    <option value="pending">Pending</option>
                    <option value="fulfilled">Fulfilled</option>
                    <option value="credited">Credited</option>
                    <option value="expired">Expired</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => applyFilters()}
                  className="px-4 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors h-[34px] shrink-0"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={clearAllReferralFilters}
                  className="px-4 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors h-[34px] shrink-0"
                >
                  Clear
                </button>
              </>
            }
          >
            <div className="overflow-hidden relative min-h-[120px]">
              {listLoading && list.length === 0 ? (
                <div className="flex justify-center py-12">
                  <LoadingSpinner size="md" text="Loading referral history..." />
                </div>
              ) : list.length === 0 ? (
                <div className="px-4 sm:px-5 lg:px-6 py-12 text-center text-gray-600">
                  No referred riders found. Referral history and fulfillment data will appear here when
                  available.
                </div>
              ) : (
                <>
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-800">Referred rider</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-800">Referred at</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-800">City</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-800">Offer</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-800">Min orders</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-800">Orders done</th>
                          <th className="px-3 py-2 text-center font-medium text-gray-800">Fulfilled?</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-800">Amount credited</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-800">Credited at</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-800">T&C</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {list.map((row) => (
                          <tr key={row.referralId} className="hover:bg-gray-50/50">
                            <td className="px-3 py-2">
                              <div>
                                <span className="font-mono font-medium text-gray-900">
                                  GMR{row.referredRiderId}
                                </span>
                                <br />
                                <span className="text-gray-800">{row.referredRiderName || "—"}</span>
                                <br />
                                <span className="text-gray-600 text-xs">{row.referredMobile}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                              {formatDate(row.referredAt)}
                            </td>
                            <td className="px-3 py-2 text-gray-700">{row.cityName || "—"}</td>
                            <td className="px-3 py-2">
                              <span className="font-medium text-gray-900">{row.offerName || "—"}</span>
                              {row.offerCode && (
                                <span className="text-xs text-gray-600 block">{row.offerCode}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-gray-800">
                              {row.minOrdersRequired}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="font-mono font-medium text-gray-900">{row.currentOrderCountTotal}</span>
                              <span className="text-gray-600 text-xs block">
                                F:{row.currentOrderCountFood} P:{row.currentOrderCountParcel} R:
                                {row.currentOrderCountPersonRide}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {row.offerFulfilled ? (
                                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                                  Yes
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-800">
                                  {row.fulfillmentStatus}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="font-medium text-green-800">
                                {formatCurrency(row.amountCredited)}
                              </span>
                              {(parseFloat(row.amountCreditedFood) || 0) +
                                (parseFloat(row.amountCreditedParcel) || 0) +
                                (parseFloat(row.amountCreditedPersonRide) || 0) >
                                0 && (
                                <span className="text-xs text-gray-600 block">
                                  F:{formatCurrency(row.amountCreditedFood)} P:
                                  {formatCurrency(row.amountCreditedParcel)} R:
                                  {formatCurrency(row.amountCreditedPersonRide)}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                              {formatDate(row.creditedAt)}
                            </td>
                            <td className="px-3 py-2 max-w-[120px]">
                              {row.termsAndConditions ? (
                                <span
                                  className="inline-flex items-center gap-1 text-gray-700 cursor-help truncate block"
                                  title={row.termsAndConditions}
                                >
                                  <FileText className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{row.termsAndConditions.slice(0, 40)}…</span>
                                </span>
                              ) : (
                                <span className="text-gray-500">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="lg:hidden px-4 py-3 space-y-3">
                    {list.map((row) => (
                      <div
                        key={row.referralId}
                        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-2"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-mono font-semibold text-gray-900">GMR{row.referredRiderId}</span>
                            <p className="text-gray-800">{row.referredRiderName || "—"}</p>
                            <p className="text-xs text-gray-600">{row.referredMobile}</p>
                          </div>
                          <span className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                            {row.offerFulfilled ? "Fulfilled" : row.fulfillmentStatus}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-600">Referred at</span>
                            <p className="font-medium text-gray-900">{formatDate(row.referredAt)}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">City</span>
                            <p className="font-medium text-gray-900">{row.cityName || "—"}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Offer</span>
                            <p className="font-medium text-gray-900">{row.offerName || "—"}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Orders</span>
                            <p className="font-medium text-gray-900">{row.currentOrderCountTotal} / {row.minOrdersRequired}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Amount credited</span>
                            <p className="font-medium text-green-800">{formatCurrency(row.amountCredited)}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Credited at</span>
                            <p className="font-medium text-gray-900">{formatDate(row.creditedAt)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </CollapsibleTableFilters>
        </>
      )}
    </div>
  );
}
