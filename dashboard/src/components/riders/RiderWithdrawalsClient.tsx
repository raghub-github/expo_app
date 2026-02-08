"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { RiderSectionHeader } from "./RiderSectionHeader";
import { CollapsibleTableFilters } from "./CollapsibleTableFilters";
import { FilterChips, type FilterChipItem } from "./FilterChips";
import { FilterSearchBar } from "./FilterSearchBar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { TablePagination } from "./TablePagination";
import { RefreshCw, ChevronDown, Copy, Check, Building2, CreditCard } from "lucide-react";

interface RiderInfo {
  id: number;
  name: string | null;
  mobile: string;
}

interface PaymentMethodDetails {
  accountHolderName: string | null;
  bankName: string | null;
  ifsc: string | null;
  branch: string | null;
  upiId: string | null;
  bankAccMasked: string;
  methodType?: string | null;
}

interface WithdrawalRow {
  id: number;
  amount: string;
  status: string;
  bankAcc: string;
  ifsc?: string | null;
  accountHolderName?: string | null;
  upiId?: string | null;
  createdAt: string;
  processedAt: string | null;
  transactionId: string | null;
  failureReason: string | null;
  paymentMethodDetails?: PaymentMethodDetails | null;
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
  const [accountOpenId, setAccountOpenId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);

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
    const nextQ = id === "q" ? "" : filterSearch.trim();
    const nextStatus = id === "status" ? "all" : status;
    const nextFrom = id === "from" ? "" : from;
    const nextTo = id === "to" ? "" : to;
    setPage(1);
    setFilterSearch(nextQ);
    setStatus(nextStatus);
    setFrom(nextFrom);
    setTo(nextTo);
    const p = new URLSearchParams();
    if (searchValue) p.set("search", searchValue);
    if (nextQ) p.set("q", nextQ);
    if (nextStatus !== "all") p.set("status", nextStatus);
    if (nextFrom) p.set("from", nextFrom);
    if (nextTo) p.set("to", nextTo);
    router.push(`/dashboard/riders/withdrawals?${p.toString()}`);
  }, [filterSearch, status, from, to, searchValue, router]);

  const clearAllWithdrawalFilters = useCallback(() => {
    setPage(1);
    setFilterSearch("");
    setStatus("all");
    setFrom("");
    setTo("");
    const p = new URLSearchParams();
    if (searchValue) p.set("search", searchValue);
    router.push(`/dashboard/riders/withdrawals?${p.toString()}`);
  }, [searchValue, router]);

  const hasSearch = searchValue.length > 0;
  const showReason = (s: string) => ["failed", "cancelled", "aborted"].includes(String(s).toLowerCase());
  const DROPDOWN_HEIGHT = 220;
  const isUpiWithdrawal = useCallback((w: WithdrawalRow) => {
    const methodType = w.paymentMethodDetails?.methodType;
    if (methodType === "upi") return true;
    if (methodType === "bank") return false;
    const hasUpi = Boolean((w.paymentMethodDetails?.upiId ?? w.upiId));
    const hasAccount = Boolean((w.paymentMethodDetails?.ifsc ?? w.ifsc) || (w.paymentMethodDetails?.bankAccMasked ?? w.bankAcc));
    return hasUpi && !hasAccount;
  }, []);

  const copyAccountDetails = useCallback(
    (w: WithdrawalRow) => {
      const pm = w.paymentMethodDetails;
      const name = pm?.accountHolderName ?? w.accountHolderName ?? "";
      let text: string;
      if (isUpiWithdrawal(w)) {
        const upi = (pm?.upiId ?? w.upiId) || "";
        text = [name && `Name: ${name}`, upi && `UPI ID: ${upi}`].filter(Boolean).join("\n") || "—";
      } else {
        const parts: string[] = [];
        if (name) parts.push(`Name: ${name}`);
        if (pm?.bankName) parts.push(`Bank: ${pm.bankName}`);
        if (pm?.ifsc ?? w.ifsc) parts.push(`IFSC: ${pm?.ifsc ?? w.ifsc}`);
        if (pm?.branch) parts.push(`Branch: ${pm?.branch}`);
        const acc = (pm?.bankAccMasked ?? w.bankAcc) || "";
        if (acc) parts.push(`Account number: ${acc}`);
        text = parts.length ? parts.join("\n") : "—";
      }
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId(w.id);
        setTimeout(() => setCopiedId(null), 2000);
      });
    },
    [isUpiWithdrawal]
  );

  const openWithdrawal = accountOpenId != null ? withdrawals.find((x) => x.id === accountOpenId) : null;

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {typeof document !== "undefined" &&
        openWithdrawal &&
        dropdownPosition &&
        createPortal(
          <>
            <div
              className="fixed z-[100] w-72 rounded-lg border border-gray-200 bg-white py-3 px-3 shadow-xl text-left"
              style={{
                left: dropdownPosition.left,
                top: dropdownPosition.top,
              }}
              role="dialog"
              aria-label="Account or UPI details"
            >
              {isUpiWithdrawal(openWithdrawal) ? (
                <div className="space-y-2 text-xs">
                  <p className="flex justify-between gap-2">
                    <span className="text-gray-500 shrink-0">Name:</span>
                    <span className="text-gray-900 font-medium text-right">
                      {openWithdrawal.paymentMethodDetails?.accountHolderName ?? openWithdrawal.accountHolderName ?? "—"}
                    </span>
                  </p>
                  <p className="flex justify-between gap-2">
                    <span className="text-gray-500 shrink-0">UPI ID:</span>
                    <span className="text-gray-900 text-right break-all">
                      {(openWithdrawal.paymentMethodDetails?.upiId ?? openWithdrawal.upiId) || "—"}
                    </span>
                  </p>
                </div>
              ) : (
                <div className="space-y-2 text-xs">
                  <p className="flex justify-between gap-2">
                    <span className="text-gray-500 shrink-0">Name:</span>
                    <span className="text-gray-900 font-medium text-right">
                      {openWithdrawal.paymentMethodDetails?.accountHolderName ?? openWithdrawal.accountHolderName ?? "—"}
                    </span>
                  </p>
                  <p className="flex justify-between gap-2">
                    <span className="text-gray-500 shrink-0">Bank:</span>
                    <span className="text-gray-900 text-right">{openWithdrawal.paymentMethodDetails?.bankName ?? "—"}</span>
                  </p>
                  <p className="flex justify-between gap-2">
                    <span className="text-gray-500 shrink-0">IFSC:</span>
                    <span className="text-gray-900 font-mono text-right">{openWithdrawal.paymentMethodDetails?.ifsc ?? openWithdrawal.ifsc ?? "—"}</span>
                  </p>
                  <p className="flex justify-between gap-2">
                    <span className="text-gray-500 shrink-0">Branch:</span>
                    <span className="text-gray-900 text-right">{openWithdrawal.paymentMethodDetails?.branch ?? "—"}</span>
                  </p>
                  <p className="flex justify-between gap-2">
                    <span className="text-gray-500 shrink-0">Account number:</span>
                    <span className="text-gray-900 font-mono text-right">
                      {(openWithdrawal.paymentMethodDetails?.bankAccMasked ?? openWithdrawal.bankAcc) || "—"}
                    </span>
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={() => openWithdrawal && copyAccountDetails(openWithdrawal)}
                className="mt-2 flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs font-medium"
              >
                {copiedId === openWithdrawal.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copiedId === openWithdrawal.id ? "Copied" : "Copy details"}
              </button>
            </div>
            <div
              className="fixed inset-0 z-[99]"
              aria-hidden
              onClick={() => {
                setAccountOpenId(null);
                setDropdownPosition(null);
              }}
            />
          </>,
          document.body
        )}
      <RiderSectionHeader
        title="Withdrawals"
        description="Use the search in the nav bar to select a rider. Filter by status and date."
        rider={rider}
        resolveLoading={resolveLoading}
        error={error}
        hasSearch={hasSearch}
        actionButtons={
          rider ? (
            <button
              type="button"
              onClick={() => fetchWithdrawals(rider.id)}
              disabled={loading}
              className="inline-flex items-center justify-center p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 shrink-0"
              title="Refresh withdrawals"
              aria-label="Refresh withdrawals"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          ) : null
        }
      />
      {rider && (
        <>
          <CollapsibleTableFilters
            label="Filters"
            activeCount={[filterSearch.trim(), status, from, to].filter((v) => v && v !== "all").length}
            filterChipsSlot={withdrawalFilterChips.length > 0 ? <FilterChips inline chips={withdrawalFilterChips} onRemove={removeWithdrawalFilter} onClearAll={clearAllWithdrawalFilters} /> : null}
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
                <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} disabled={loading} ariaLabel="Withdrawals" compact />
              </>
            }
            filterContent={
              <div className="flex flex-wrap items-end gap-3 sm:gap-4">
                <FilterSearchBar
                  value={filterSearch}
                  onChange={setFilterSearch}
                  onSubmit={applyFilters}
                  placeholder="Withdrawal ID, amount"
                  // hint="Match withdrawal ID or amount"
                  id="withdrawals-filter-search"
                />
                <div className="min-w-[120px] w-full sm:w-auto">
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 [&>option]:text-gray-900">
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="processing">Processing</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="aborted">Aborted</option>
                  </select>
                </div>
                <div className="min-w-[120px] w-full sm:w-auto">
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">From</label>
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="min-w-[120px] w-full sm:w-auto">
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">To</label>
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500" />
                </div>
                {/* <button type="button" onClick={applyFilters} className="w-full sm:w-auto px-4 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 h-[34px] shrink-0">Apply</button> */}
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
                <div className={`overflow-x-auto -mx-px transition-opacity duration-200 ${loading && withdrawals.length > 0 ? "opacity-70 pointer-events-none" : ""}`}>
                  <table className="min-w-full divide-y divide-gray-200 text-left hidden lg:table">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-gray-800 uppercase tracking-wide whitespace-nowrap">ID</th>
                        <th className="px-3 py-2 sm:px-4 text-right text-xs font-medium text-gray-800 uppercase tracking-wide whitespace-nowrap">Amount</th>
                        <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-gray-800 uppercase tracking-wide whitespace-nowrap">Status</th>
                        <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-gray-800 uppercase tracking-wide min-w-[100px]">Account / UPI</th>
                        <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-gray-800 uppercase tracking-wide whitespace-nowrap">Txn ID</th>
                        <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-gray-800 uppercase tracking-wide min-w-[120px]">Reason</th>
                        <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-gray-800 uppercase tracking-wide whitespace-nowrap">Requested</th>
                        <th className="px-3 py-2 sm:px-4 text-left text-xs font-medium text-gray-800 uppercase tracking-wide whitespace-nowrap">Processed</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {withdrawals.length === 0 ? (
                        <tr><td colSpan={8} className="px-3 py-8 sm:px-4 text-center text-gray-600 text-sm">No withdrawals found.</td></tr>
                      ) : (
                        withdrawals.map((w) => (
                          <tr key={w.id} className="hover:bg-gray-50/80">
                            <td className="px-3 py-2 sm:px-4 text-sm font-mono text-gray-900 whitespace-nowrap">{w.id}</td>
                            <td className="px-3 py-2 sm:px-4 text-sm text-right font-medium text-gray-900 whitespace-nowrap">₹{Number(w.amount).toFixed(2)}</td>
                            <td className="px-3 py-2 sm:px-4 whitespace-nowrap">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                w.status === "completed" ? "bg-green-100 text-green-800" :
                                w.status === "failed" || w.status === "cancelled" || w.status === "aborted" ? "bg-red-100 text-red-800" :
                                w.status === "processing" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"
                              }`}>{w.status}</span>
                            </td>
                            <td className="px-3 py-2 sm:px-4 text-sm text-gray-900 min-w-0 max-w-[160px]">
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    if (accountOpenId === w.id) {
                                      setAccountOpenId(null);
                                      setDropdownPosition(null);
                                      return;
                                    }
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    const spaceBelow = typeof window !== "undefined" ? window.innerHeight - rect.bottom : 300;
                                    const openUp = spaceBelow < DROPDOWN_HEIGHT;
                                    setAccountOpenId(w.id);
                                    setDropdownPosition({
                                      left: Math.max(8, Math.min(rect.left, (typeof window !== "undefined" ? window.innerWidth : 400) - 296)),
                                      top: openUp ? rect.top - DROPDOWN_HEIGHT - 4 : rect.bottom + 4,
                                    });
                                  }}
                                  className="inline-flex items-center gap-1 text-gray-900 font-medium hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                                  aria-expanded={accountOpenId === w.id}
                                >
                                  <CreditCard className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{w.bankAcc || (w.paymentMethodDetails?.upiId ?? w.upiId) || "—"}</span>
                                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${accountOpenId === w.id ? "rotate-180" : ""}`} />
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-2 sm:px-4 text-sm font-mono text-gray-800 whitespace-nowrap">{w.transactionId || "—"}</td>
                            <td className="px-3 py-2 sm:px-4 text-sm text-gray-800 max-w-[180px]">
                              {showReason(w.status) && w.failureReason ? (
                                <span className="text-red-700" title={w.failureReason}>{w.failureReason.length > 40 ? w.failureReason.slice(0, 40) + "…" : w.failureReason}</span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-2 sm:px-4 text-sm text-gray-800 whitespace-nowrap">{new Date(w.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</td>
                            <td className="px-3 py-2 sm:px-4 text-sm text-gray-800 whitespace-nowrap">{w.processedAt ? new Date(w.processedAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                  <div className="lg:hidden px-3 py-3 space-y-3">
                    {withdrawals.length === 0 ? (
                      <p className="text-center text-gray-600 text-sm py-6">No withdrawals found.</p>
                    ) : (
                      withdrawals.map((w) => (
                        <div key={w.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
                          <div className="flex justify-between items-start">
                            <span className="font-mono font-semibold text-gray-900">#{w.id}</span>
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              w.status === "completed" ? "bg-green-100 text-green-800" :
                              w.status === "failed" || w.status === "cancelled" || w.status === "aborted" ? "bg-red-100 text-red-800" :
                              w.status === "processing" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"
                            }`}>{w.status}</span>
                          </div>
                          <p className="text-lg font-semibold text-gray-900">₹{Number(w.amount).toFixed(2)}</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-gray-500">Account / UPI</span>
                              <p className="font-medium text-gray-900 truncate">{w.bankAcc || w.upiId || "—"}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Txn ID</span>
                              <p className="font-mono text-gray-900">{w.transactionId || "—"}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Requested</span>
                              <p className="text-gray-900">{new Date(w.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Processed</span>
                              <p className="text-gray-900">{w.processedAt ? new Date(w.processedAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : "—"}</p>
                            </div>
                          </div>
                          {showReason(w.status) && w.failureReason && (
                            <div className="pt-2 border-t border-gray-100">
                              <span className="text-xs text-gray-500">Reason</span>
                              <p className="text-sm text-red-700 mt-0.5">{w.failureReason}</p>
                            </div>
                          )}
                          <div className="relative pt-2 border-t border-gray-100">
                            <button
                              type="button"
                              onClick={() => setAccountOpenId(accountOpenId === w.id ? null : w.id)}
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
                            >
                              <Building2 className="h-4 w-4" />
                              {accountOpenId === w.id ? "Hide account details" : "View full account / UPI"}
                            </button>
                            {accountOpenId === w.id && (
                              <div className="mt-2 p-3 rounded-lg bg-gray-50 text-xs space-y-2">
                                {isUpiWithdrawal(w) ? (
                                  <>
                                    <p><span className="text-gray-500">Name:</span> <span className="text-gray-900 font-medium">{w.paymentMethodDetails?.accountHolderName ?? w.accountHolderName ?? "—"}</span></p>
                                    <p><span className="text-gray-500">UPI ID:</span> <span className="text-gray-900 break-all">{(w.paymentMethodDetails?.upiId ?? w.upiId) || "—"}</span></p>
                                  </>
                                ) : (
                                  <>
                                    <p><span className="text-gray-500">Name:</span> <span className="text-gray-900 font-medium">{w.paymentMethodDetails?.accountHolderName ?? w.accountHolderName ?? "—"}</span></p>
                                    <p><span className="text-gray-500">Bank:</span> <span className="text-gray-900">{w.paymentMethodDetails?.bankName ?? "—"}</span></p>
                                    <p><span className="text-gray-500">IFSC:</span> <span className="text-gray-900 font-mono">{w.paymentMethodDetails?.ifsc ?? w.ifsc ?? "—"}</span></p>
                                    <p><span className="text-gray-500">Branch:</span> <span className="text-gray-900">{w.paymentMethodDetails?.branch ?? "—"}</span></p>
                                    <p><span className="text-gray-500">Account number:</span> <span className="text-gray-900 font-mono">{(w.paymentMethodDetails?.bankAccMasked ?? w.bankAcc) || "—"}</span></p>
                                  </>
                                )}
                                <button type="button" onClick={() => copyAccountDetails(w)} className="mt-2 flex items-center gap-1 text-blue-600 text-xs font-medium">
                                  {copiedId === w.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                  {copiedId === w.id ? "Copied" : "Copy"}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
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
