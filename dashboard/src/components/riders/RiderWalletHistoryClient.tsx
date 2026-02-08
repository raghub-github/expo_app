"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { RiderSectionHeader } from "./RiderSectionHeader";
import { CollapsibleTableFilters } from "./CollapsibleTableFilters";
import { FilterChips, type FilterChipItem } from "./FilterChips";
import { FilterSearchBar } from "./FilterSearchBar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { TablePagination } from "./TablePagination";
import Link from "next/link";

interface RiderInfo {
  id: number;
  name: string | null;
  mobile: string;
}

interface LedgerRow {
  id: number;
  riderId: number;
  entryType: string;
  amount: string;
  balance: string | null;
  serviceType: string | null;
  ref: string | null;
  refType: string | null;
  description: string | null;
  orderId: string | null;
  performedByType: string | null;
  performedById: number | null;
  performedByEmail: string | null;
  performedByName: string | null;
  createdAt: string;
}

export function RiderWalletHistoryClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const riderContext = useRiderDashboardOptional();
  const searchValue = (searchParams.get("search") || "").trim();
  const [searchInput, setSearchInput] = useState(searchValue);
  const [flow, setFlow] = useState(searchParams.get("flow") || "all");
  const [entryType, setEntryType] = useState(searchParams.get("entryType") || "all");
  const [serviceType, setServiceType] = useState(searchParams.get("serviceType") || "all");
  const [from, setFrom] = useState(searchParams.get("from") || "");
  const [to, setTo] = useState(searchParams.get("to") || "");
  const [filterSearch, setFilterSearch] = useState(searchParams.get("q") || "");

  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  const resolveRider = useCallback(async (value: string) => {
    if (!value.trim()) {
      setRider(null);
      setLedger([]);
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
        setLedger([]);
        setError("No rider found");
        return;
      }
      setRider({ id: data.id, name: data.name, mobile: data.mobile });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resolve rider");
      setRider(null);
      setLedger([]);
    } finally {
      setResolveLoading(false);
    }
  }, []);

  const fetchLedger = useCallback(async (riderId: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (flow !== "all") params.set("flow", flow);
      if (entryType !== "all") params.set("entryType", entryType);
      if (serviceType !== "all") params.set("serviceType", serviceType);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (filterSearch.trim()) params.set("q", filterSearch.trim());
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));
      const res = await fetch(`/api/riders/${riderId}/ledger?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load wallet history");
      setLedger(json.data?.ledger ?? []);
      setTotal(json.data?.total ?? 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load wallet history");
      setLedger([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [flow, entryType, serviceType, from, to, filterSearch, page, pageSize]);

  const riderFromContext = riderContext?.currentRiderInfo
    ? { id: riderContext.currentRiderInfo.id, name: riderContext.currentRiderInfo.name, mobile: riderContext.currentRiderInfo.mobile }
    : null;

  useEffect(() => {
    if (searchValue) resolveRider(searchValue);
    else if (riderFromContext) {
      setRider(riderFromContext);
      setError(null);
    } else {
      setRider(null);
      setLedger([]);
      setError(null);
    }
  }, [searchValue, riderFromContext?.id, resolveRider]);
  useEffect(() => {
    setFlow(searchParams.get("flow") || "all");
    setEntryType(searchParams.get("entryType") || "all");
    setServiceType(searchParams.get("serviceType") || "all");
    setFrom(searchParams.get("from") || "");
    setTo(searchParams.get("to") || "");
    setFilterSearch(searchParams.get("q") || "");
  }, [searchParams]);

  useEffect(() => {
    if (rider) fetchLedger(rider.id);
  }, [rider, fetchLedger]);

  useEffect(() => {
    setPage(1);
  }, [flow, entryType, serviceType, from, to, filterSearch]);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

  const applyFilters = (overrides?: { flow?: string; entryType?: string; serviceType?: string; from?: string; to?: string; q?: string }) => {
    const o = overrides ?? {};
    const fl = o.flow ?? flow;
    const et = o.entryType ?? entryType;
    const svc = o.serviceType ?? serviceType;
    const fr = o.from ?? from;
    const t = o.to ?? to;
    const qVal = o.q ?? filterSearch;
    const p = new URLSearchParams();
    if (searchValue) p.set("search", searchValue);
    if (fl !== "all") p.set("flow", fl);
    if (et !== "all") p.set("entryType", et);
    if (svc !== "all") p.set("serviceType", svc);
    if (fr) p.set("from", fr);
    if (t) p.set("to", t);
    if (qVal.trim()) p.set("q", qVal.trim());
    setPage(1);
    router.push(`/dashboard/riders/wallet-history?${p.toString()}`);
    if (overrides) {
      setFlow(fl);
      setEntryType(et);
      setServiceType(svc);
      setFrom(fr);
      setTo(t);
      if (o.q !== undefined) setFilterSearch(o.q);
    }
  };

  const ledgerFilterChips: FilterChipItem[] = [];
  if (filterSearch.trim()) ledgerFilterChips.push({ id: "q", label: `Search: "${filterSearch.trim().slice(0, 14)}${filterSearch.trim().length > 14 ? "…" : ""}"` });
  if (flow !== "all") ledgerFilterChips.push({ id: "flow", label: `Flow: ${flow === "credit" ? "Credit only" : "Debit only"}` });
  if (entryType !== "all") ledgerFilterChips.push({ id: "entryType", label: `Type: ${entryType.replace("_", " ")}` });
  if (serviceType !== "all") ledgerFilterChips.push({ id: "serviceType", label: `Service: ${serviceType.replace("_", " ")}` });
  if (from) ledgerFilterChips.push({ id: "from", label: `From: ${from}` });
  if (to) ledgerFilterChips.push({ id: "to", label: `To: ${to}` });
  const removeLedgerFilter = (id: string) => {
    applyFilters({
      flow: id === "flow" ? "all" : flow,
      entryType: id === "entryType" ? "all" : entryType,
      serviceType: id === "serviceType" ? "all" : serviceType,
      from: id === "from" ? "" : from,
      to: id === "to" ? "" : to,
      q: id === "q" ? "" : filterSearch,
    });
  };
  const clearAllLedgerFilters = () => {
    setPage(1);
    applyFilters({ flow: "all", entryType: "all", serviceType: "all", from: "", to: "", q: "" });
  };

  const isCredit = (t: string) =>
    ["earning", "bonus", "refund", "referral_bonus", "penalty_reversal", "manual_add", "incentive", "surge", "failed_withdrawal_revert", "cancellation_payout"].includes(t);

  function actionByLabel(row: LedgerRow): string {
    const t = (row.performedByType ?? "system").toLowerCase();
    if (t === "agent" && (row.performedByEmail || row.performedByName))
      return row.performedByName ? `${row.performedByName} (${row.performedByEmail ?? "—"})` : (row.performedByEmail ?? "Agent");
    if (t === "rider") return "Rider";
    if (t === "automated") return "Automated";
    return "System";
  }

  const hasSearch = searchValue.length > 0;

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <RiderSectionHeader
        title="Wallet Transaction History"
        description="Use the search in the nav bar to select a rider. Filter by flow, type, service, and date."
        rider={rider}
        resolveLoading={resolveLoading}
        error={error}
        hasSearch={hasSearch}
        actionButtons={
          rider ? (
            <Link href={`/dashboard/riders/wallet?search=${rider.id}`} className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 bg-white hover:bg-gray-50">Wallet</Link>
          ) : null
        }
      />

      {rider && (
        <>
          <CollapsibleTableFilters
            label="Filters"
            activeCount={[filterSearch.trim(), flow, entryType, serviceType, from, to].filter((v) => v && v !== "all").length}
            filterChipsSlot={<FilterChips inline chips={ledgerFilterChips} onRemove={removeLedgerFilter} onClearAll={clearAllLedgerFilters} />}
            trailingSlot={
              <>
                <span className="text-[10px] sm:text-xs text-gray-600 whitespace-nowrap">Rows</span>
                <select
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="h-6 sm:h-7 min-w-[2.5rem] rounded border border-gray-300 bg-white px-1.5 text-[10px] sm:text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  aria-label="Rows per page"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} disabled={loading} ariaLabel="Wallet history" compact />
              </>
            }
            filterContent={
              <>
                <FilterSearchBar
                  value={filterSearch}
                  onChange={setFilterSearch}
                  onSubmit={() => applyFilters()}
                  placeholder="Amount, ref, description…"
                  // hint="Match amount, ref, or description"
                  id="ledger-filter-search"
                />
                <div className="min-w-[100px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Flow</label>
                  <select value={flow} onChange={(e) => setFlow(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500">
                    <option value="all">All</option>
                    <option value="credit">Credit only</option>
                    <option value="debit">Debit only</option>
                  </select>
                </div>
                <div className="min-w-[110px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Type</label>
                  <select value={entryType} onChange={(e) => setEntryType(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500">
                    <option value="all">All</option>
                    <option value="earning">Earning</option>
                    <option value="penalty">Penalty</option>
                    <option value="penalty_reversal">Penalty reversal</option>
                    <option value="bonus">Bonus</option>
                    <option value="refund">Refund</option>
                    <option value="referral_bonus">Referral bonus</option>
                    <option value="onboarding_fee">Onboarding fee</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </div>
                <div className="min-w-[100px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Service</label>
                  <select value={serviceType} onChange={(e) => setServiceType(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500">
                    <option value="all">All</option>
                    <option value="food">Food</option>
                    <option value="parcel">Parcel</option>
                    <option value="person_ride">Person Ride</option>
                  </select>
                </div>
                <div className="min-w-[120px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">From</label>
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="min-w-[120px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">To</label>
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500" />
                </div>
                <button type="button" onClick={clearAllLedgerFilters} className="px-4 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors h-[34px] shrink-0">Clear filters</button>
              </>
            }
          >
          <div className="overflow-hidden relative">
            {loading && ledger.length === 0 ? (
              <div className="flex justify-center py-12"><LoadingSpinner size="md" text="Loading wallet history..." /></div>
            ) : (
              <>
                {loading && ledger.length > 0 && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-100 z-10">
                    <div className="h-full w-1/3 bg-blue-500 animate-pulse rounded-r" />
                  </div>
                )}
                <div className={`overflow-x-auto transition-opacity duration-200 ${loading && ledger.length > 0 ? "opacity-70 pointer-events-none" : ""}`}>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Type</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Service</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 uppercase tracking-wide">Amount</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 uppercase tracking-wide">Balance</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Ref</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Order ID</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Date</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Action by</th>
                      <th className="px-4 py-2 w-10 text-center text-xs font-medium text-gray-700 uppercase tracking-wide">Details</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {ledger.length === 0 ? (
                      <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-600 text-sm">No transactions found.</td></tr>
                    ) : (
                      ledger.map((row) => {
                        const rowKey = `${row.id}-${row.riderId}-${row.createdAt}`;
                        const isExpanded = expandedRowKey === rowKey;
                        return (
                          <React.Fragment key={rowKey}>
                            <tr className={isExpanded ? "bg-gray-50" : ""}>
                              <td className="px-4 py-2 text-sm text-gray-900 font-medium">{row.entryType}</td>
                              <td className="px-4 py-2 text-sm text-gray-900">{row.serviceType ?? "—"}</td>
                              <td className={`px-4 py-2 text-sm text-right font-medium whitespace-nowrap ${isCredit(row.entryType) ? "text-green-600" : "text-red-600"}`}>
                                <span className="inline-flex items-center justify-end gap-0.5">
                                  <span aria-hidden="true">{isCredit(row.entryType) ? "+" : "−"}</span>
                                  <span>₹{Number(row.amount).toFixed(2)}</span>
                                </span>
                              </td>
                              <td className={`px-4 py-2 text-sm text-right font-medium ${row.balance != null && Number(row.balance) < 0 ? "text-red-600" : "text-gray-900"}`}>
                                {row.balance != null ? `₹${Number(row.balance).toFixed(2)}` : "—"}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-900">{row.ref ?? row.description ?? "—"}</td>
                              <td className="px-4 py-2 text-sm text-gray-800">{row.orderId ? `#${row.orderId}` : "—"}</td>
                              <td className="px-4 py-2 text-sm text-gray-800">{new Date(row.createdAt).toLocaleString()}</td>
                              <td className="px-4 py-2 text-sm text-gray-800">{actionByLabel(row)}</td>
                              <td className="px-2 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => setExpandedRowKey(isExpanded ? null : rowKey)}
                                  className="p-1 rounded hover:bg-gray-200 text-gray-600 aria-expanded:bg-gray-200"
                                  aria-expanded={isExpanded}
                                  title="Toggle details"
                                >
                                  <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${rowKey}-detail`} className="bg-gray-50 border-b border-gray-200">
                                <td colSpan={9} className="px-4 py-3 text-sm">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 text-gray-700">
                                    {row.description && <div><span className="font-medium text-gray-600">Reason:</span> {row.description}</div>}
                                    {row.orderId && <div><span className="font-medium text-gray-600">Order ID:</span> #{row.orderId}</div>}
                                    <div><span className="font-medium text-gray-600">Date:</span> {new Date(row.createdAt).toLocaleString()}</div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
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
