"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { RiderSectionHeader } from "./RiderSectionHeader";
import { CollapsibleTableFilters } from "./CollapsibleTableFilters";
import { FilterChips, type FilterChipItem } from "./FilterChips";
import { FilterSearchBar } from "./FilterSearchBar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { TablePagination } from "./TablePagination";
import { RefreshCw } from "lucide-react";

interface RiderInfo {
  id: number;
  name: string | null;
  mobile: string;
}

interface WithdrawalRow {
  id: number;
  amount: string;
  status: string;
  bankAcc: string;
  createdAt: string;
  processedAt: string | null;
  transactionId: string | null;
}

export function RiderWithdrawalsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const riderContext = useRiderDashboardOptional();
  const searchValue = (searchParams.get("search") || "").trim();
  const [searchInput, setSearchInput] = useState(searchValue);
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [from, setFrom] = useState(searchParams.get("from") || "");
  const [to, setTo] = useState(searchParams.get("to") || "");
  const [filterSearch, setFilterSearch] = useState(searchParams.get("q") || "");

  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveRider = useCallback(async (value: string) => {
    if (!value.trim()) {
      setRider(null);
      setWithdrawals([]);
      return;
    }
    setResolveLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Database not available");
      let query = supabase.from("riders").select("id, name, mobile");
      const isPhone = /^\d{10,}$/.test(value.replace(/^\+?91/, ""));
      const isRiderId = /^GMR(\d+)$/i.test(value);
      const isNumeric = /^\d{1,9}$/.test(value);
      if (isRiderId) query = query.eq("id", parseInt(value.replace(/^GMR/i, ""), 10));
      else if (isNumeric) query = query.eq("id", parseInt(value, 10));
      else if (isPhone) query = query.eq("mobile", value.replace(/^\+?91/, ""));
      else query = query.ilike("mobile", `%${value}%`);
      const { data, error: e } = await query.limit(1).single();
      if (e || !data) {
        setRider(null);
        setWithdrawals([]);
        setError("No rider found");
        return;
      }
      setRider({ id: data.id, name: data.name, mobile: data.mobile });
    } catch (err: any) {
      setError(err?.message || "Failed to resolve rider");
      setRider(null);
      setWithdrawals([]);
    } finally {
      setResolveLoading(false);
    }
  }, []);

  const fetchWithdrawals = useCallback(async (riderId: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterSearch.trim()) params.set("q", filterSearch.trim());
      if (status !== "all") params.set("status", status);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));
      const res = await fetch(`/api/riders/${riderId}/withdrawals?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load withdrawals");
      setWithdrawals(json.data?.withdrawals ?? []);
      setTotal(json.data?.total ?? 0);
    } catch (err: any) {
      setError(err?.message || "Failed to load withdrawals");
      setWithdrawals([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filterSearch, status, from, to, page, pageSize]);

  const riderFromContext = riderContext?.currentRiderInfo
    ? { id: riderContext.currentRiderInfo.id, name: riderContext.currentRiderInfo.name, mobile: riderContext.currentRiderInfo.mobile }
    : null;

  useEffect(() => setSearchInput(searchValue), [searchValue]);
  useEffect(() => setFilterSearch(searchParams.get("q") || ""), [searchParams.get("q")]);
  useEffect(() => {
    if (searchValue) resolveRider(searchValue);
    else if (riderFromContext) {
      setRider(riderFromContext);
      setError(null);
    } else {
      setRider(null);
      setWithdrawals([]);
      setError(null);
    }
  }, [searchValue, riderFromContext?.id, resolveRider]);
  useEffect(() => {
    if (rider) fetchWithdrawals(rider.id);
  }, [rider, fetchWithdrawals]);

  useEffect(() => {
    setPage(1);
  }, [filterSearch, status, from, to]);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

  const applyFilters = useCallback(() => {
    setPage(1);
    const p = new URLSearchParams();
    if (searchValue) p.set("search", searchValue);
    if (filterSearch.trim()) p.set("q", filterSearch.trim());
    if (status !== "all") p.set("status", status);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    router.push(`/dashboard/riders/withdrawals?${p.toString()}`);
  }, [router, searchValue, filterSearch, status, from, to]);

  const withdrawalFilterChips: FilterChipItem[] = [];
  if (filterSearch.trim()) withdrawalFilterChips.push({ id: "q", label: `Search: ${filterSearch.trim().slice(0, 16)}${filterSearch.trim().length > 16 ? "…" : ""}` });
  if (status !== "all") withdrawalFilterChips.push({ id: "status", label: `Status: ${status}` });
  if (from) withdrawalFilterChips.push({ id: "from", label: `From: ${from}` });
  if (to) withdrawalFilterChips.push({ id: "to", label: `To: ${to}` });

  const removeWithdrawalFilter = useCallback((id: string) => {
    if (id === "q") setFilterSearch("");
    else if (id === "status") setStatus("all");
    else if (id === "from") setFrom("");
    else if (id === "to") setTo("");
  }, []);

  const clearAllWithdrawalFilters = useCallback(() => {
    setPage(1);
    setFilterSearch("");
    setStatus("all");
    setFrom("");
    setTo("");
  }, []);

  const hasSearch = searchValue.length > 0;

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden px-2 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <RiderSectionHeader
          title="Withdrawals"
          description="Use the search in the nav bar to select a rider. Filter by status and date."
          rider={rider}
          resolveLoading={resolveLoading}
          error={error}
          hasSearch={hasSearch}
        />
        {rider && (
          <button
            type="button"
            onClick={() => fetchWithdrawals(rider.id)}
            disabled={loading}
            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 shrink-0 self-start sm:self-center"
            title="Refresh withdrawals"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>
      {rider && (
        <>
          <CollapsibleTableFilters
            label="Filters"
            activeCount={[filterSearch.trim(), status, from, to].filter((v) => v && v !== "all").length}
            filterChipsSlot={withdrawalFilterChips.length > 0 ? <FilterChips inline chips={withdrawalFilterChips} onRemove={removeWithdrawalFilter} onClearAll={clearAllWithdrawalFilters} /> : null}
            filterContent={
              <div className="flex flex-wrap items-end gap-3 sm:gap-4">
                <FilterSearchBar
                  value={filterSearch}
                  onChange={setFilterSearch}
                  placeholder="Withdrawal ID, amount"
                  hint="Match withdrawal ID or amount"
                  id="withdrawals-filter-search"
                />
                <div className="min-w-[120px] w-full sm:w-auto">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="min-w-[120px] w-full sm:w-auto">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">From</label>
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="min-w-[120px] w-full sm:w-auto">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">To</label>
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500" />
                </div>
                <button type="button" onClick={applyFilters} className="w-full sm:w-auto px-4 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors h-[34px]">Apply</button>
                <button type="button" onClick={clearAllWithdrawalFilters} className="w-full sm:w-auto px-4 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors h-[34px] shrink-0">Clear filters</button>
              </div>
            }
          >
          <div className="overflow-hidden relative rounded-lg border border-gray-200 bg-white">
            {loading && withdrawals.length === 0 ? (
              <div className="flex justify-center py-12"><LoadingSpinner size="md" text="Loading withdrawals..." /></div>
            ) : (
              <>
                {loading && withdrawals.length > 0 && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-100 z-10">
                    <div className="h-full w-1/3 bg-blue-500 animate-pulse rounded-r" />
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 py-2 px-3 sm:px-4 border-b border-gray-200 bg-gray-50/60">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Rows per page</span>
                    <select
                      value={pageSize}
                      onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                      className="h-8 min-w-[3.5rem] sm:min-w-[4rem] rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      aria-label="Rows per page"
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                  <TablePagination
                    page={page}
                    pageSize={pageSize}
                    total={total}
                    onPageChange={setPage}
                    disabled={loading}
                    ariaLabel="Withdrawals"
                  />
                </div>
                <div className={`overflow-x-auto -mx-px transition-opacity duration-200 ${loading && withdrawals.length > 0 ? "opacity-70 pointer-events-none" : ""}`}>
                  <table className="min-w-full divide-y divide-gray-200 text-left">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wide whitespace-nowrap">ID</th>
                        <th className="px-3 py-2 sm:px-4 text-right text-xs font-medium text-gray-700 uppercase tracking-wide whitespace-nowrap">Amount</th>
                        <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wide whitespace-nowrap">Status</th>
                        <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wide min-w-[100px]">Bank</th>
                        <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wide whitespace-nowrap">Requested</th>
                        <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wide whitespace-nowrap">Processed</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {withdrawals.length === 0 ? (
                        <tr><td colSpan={6} className="px-3 py-8 sm:px-4 text-center text-gray-600 text-sm">No withdrawals found.</td></tr>
                      ) : (
                        withdrawals.map((w) => (
                          <tr key={w.id} className="hover:bg-gray-50/80">
                            <td className="px-3 py-2 sm:px-4 text-sm font-mono text-gray-900 whitespace-nowrap">{w.id}</td>
                            <td className="px-3 py-2 sm:px-4 text-sm text-right font-medium text-gray-900 whitespace-nowrap">₹{Number(w.amount).toFixed(2)}</td>
                            <td className="px-3 py-2 sm:px-4 text-sm text-gray-900 whitespace-nowrap">{w.status}</td>
                            <td className="px-3 py-2 sm:px-4 text-sm text-gray-800 min-w-0 max-w-[140px] sm:max-w-none truncate" title={w.bankAcc}>{w.bankAcc}</td>
                            <td className="px-3 py-2 sm:px-4 text-sm text-gray-800 whitespace-nowrap">{new Date(w.createdAt).toLocaleString()}</td>
                            <td className="px-3 py-2 sm:px-4 text-sm text-gray-800 whitespace-nowrap">{w.processedAt ? new Date(w.processedAt).toLocaleString() : "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
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
