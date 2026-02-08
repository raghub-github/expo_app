"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { invalidateRiderSummary } from "@/lib/cache-invalidation";
import { RiderSectionHeader } from "./RiderSectionHeader";
import { CollapsibleTableFilters } from "./CollapsibleTableFilters";
import { FilterChips, type FilterChipItem } from "./FilterChips";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { TablePagination } from "./TablePagination";
import { usePermissionsQuery } from "@/hooks/queries/usePermissionsQuery";
import { useRiderAccessQuery } from "@/hooks/queries/useRiderAccessQuery";

interface RequestRow {
  id: number;
  riderId: number;
  orderId?: number;
  serviceType?: string;
  amount: number;
  reason: string;
  status: string;
  requestedBySystemUserId?: number;
  requestedByEmail?: string;
  requestedAt: string;
  reviewedByEmail?: string;
  reviewedAt?: string;
  reviewNote?: string;
  approvedLedgerRef?: string;
}

export function PendingActionsClient() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const riderIdParam = searchParams.get("search") || searchParams.get("riderId") || "";

  const [status, setStatus] = useState(searchParams.get("status") || "pending");
  const [riderIdFilter, setRiderIdFilter] = useState(riderIdParam);
  const [from, setFrom] = useState(searchParams.get("from") || "");
  const [to, setTo] = useState(searchParams.get("to") || "");
  const [minAmount, setMinAmount] = useState(searchParams.get("minAmount") || "");
  const [maxAmount, setMaxAmount] = useState(searchParams.get("maxAmount") || "");
  const [orderIdSearch, setOrderIdSearch] = useState(searchParams.get("orderId") || "");

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: number; reason: string } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: permissionsData } = usePermissionsQuery();
  const { data: riderAccess } = useRiderAccessQuery();
  const systemUserId = permissionsData?.systemUserId ?? null;
  const canApproveRejectWalletCredit = riderAccess?.canApproveRejectWalletCredit ?? riderAccess?.isSuperAdmin ?? false;
  const canDeleteRequest = (r: RequestRow) =>
    r.status === "pending" &&
    (r.requestedBySystemUserId === systemUserId || canApproveRejectWalletCredit);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (riderIdFilter.trim()) params.set("riderId", riderIdFilter.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (minAmount.trim()) params.set("minAmount", minAmount.trim());
      if (maxAmount.trim()) params.set("maxAmount", maxAmount.trim());
      if (orderIdSearch.trim()) params.set("orderId", orderIdSearch.trim());
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));

      const res = await fetch(`/api/wallet-credit-requests?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load requests");
      setRequests(json.data || []);
      setTotal(json.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requests");
      setRequests([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [status, riderIdFilter, from, to, minAmount, maxAmount, orderIdSearch, page, pageSize]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    setPage(1);
  }, [status, riderIdFilter, from, to, minAmount, maxAmount, orderIdSearch]);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

  const handleApprove = async (id: number) => {
    setActioningId(id);
    setError(null);
    try {
      const res = await fetch(`/api/wallet-credit-requests/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to approve");
      const req = requests.find((r) => r.id === id);
      if (req) invalidateRiderSummary(queryClient, req.riderId);
      await fetchRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (id: number, reviewNote: string) => {
    setActioningId(id);
    setError(null);
    try {
      const res = await fetch(`/api/wallet-credit-requests/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewNote: reviewNote.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to reject");
      setRejectModal(null);
      const req = requests.find((r) => r.id === id);
      if (req) invalidateRiderSummary(queryClient, req.riderId);
      await fetchRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setActioningId(null);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setError(null);
    try {
      const req = requests.find((r) => r.id === id);
      const res = await fetch(`/api/wallet-credit-requests/${id}/delete`, { method: "DELETE", credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to delete");
      if (req) invalidateRiderSummary(queryClient, req.riderId);
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const applyFilters = () => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (riderIdFilter.trim()) p.set("riderId", riderIdFilter.trim());
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (minAmount.trim()) p.set("minAmount", minAmount.trim());
    if (maxAmount.trim()) p.set("maxAmount", maxAmount.trim());
    if (orderIdSearch.trim()) p.set("orderId", orderIdSearch.trim());
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
  };

  const filterChips: FilterChipItem[] = [];
  if (status && status !== "pending") filterChips.push({ key: "status", label: `Status: ${status}` });
  if (riderIdFilter.trim()) filterChips.push({ key: "riderId", label: `Rider: ${riderIdFilter.trim()}` });
  if (from) filterChips.push({ key: "from", label: `From: ${from}` });
  if (to) filterChips.push({ key: "to", label: `To: ${to}` });
  if (minAmount.trim()) filterChips.push({ key: "minAmount", label: `Min: ₹${minAmount}` });
  if (maxAmount.trim()) filterChips.push({ key: "maxAmount", label: `Max: ₹${maxAmount}` });
  if (orderIdSearch.trim()) filterChips.push({ key: "orderId", label: `Order: ${orderIdSearch.trim()}` });

  const removeFilter = (key: string) => {
    if (key === "status") setStatus("pending");
    if (key === "riderId") setRiderIdFilter("");
    if (key === "from") setFrom("");
    if (key === "to") setTo("");
    if (key === "minAmount") setMinAmount("");
    if (key === "maxAmount") setMaxAmount("");
    if (key === "orderId") setOrderIdSearch("");
  };

  const clearAllFilters = () => {
    setPage(1);
    setStatus("pending");
    setRiderIdFilter("");
    setFrom("");
    setTo("");
    setMinAmount("");
    setMaxAmount("");
    setOrderIdSearch("");
  };

  const activeFilterCount = filterChips.length;

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <RiderSectionHeader
        title="Pending Actions"
        description="Wallet credit requests submitted by agents. Approve or reject pending requests. Use filters to find by rider, order, date, or amount."
        rider={null}
        resolveLoading={false}
        error={error}
        hasSearch={false}
      />

      <CollapsibleTableFilters
        label="Filters"
        activeCount={activeFilterCount}
        filterChipsSlot={filterChips.length > 0 ? <FilterChips inline chips={filterChips} onRemove={removeFilter} onClearAll={clearAllFilters} /> : null}
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
            <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} disabled={loading} ariaLabel="Pending actions" compact />
          </>
        }
        filterContent={
          <>
            <div className="min-w-[120px]">
              <label className="block text-xs font-medium text-gray-600 mb-0.5">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="min-w-[100px]">
              <label className="block text-xs font-medium text-gray-600 mb-0.5">Rider ID</label>
              <input
                type="text"
                value={riderIdFilter}
                onChange={(e) => setRiderIdFilter(e.target.value)}
                placeholder="e.g. 123"
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="min-w-[100px]">
              <label className="block text-xs font-medium text-gray-600 mb-0.5">Order ID</label>
              <input
                type="text"
                value={orderIdSearch}
                onChange={(e) => setOrderIdSearch(e.target.value)}
                placeholder="e.g. 456"
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="min-w-[120px]">
              <label className="block text-xs font-medium text-gray-600 mb-0.5">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="min-w-[120px]">
              <label className="block text-xs font-medium text-gray-600 mb-0.5">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="min-w-[90px]">
              <label className="block text-xs font-medium text-gray-600 mb-0.5">Min ₹</label>
              <input
                type="number"
                step="0.01"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                placeholder="0"
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="min-w-[90px]">
              <label className="block text-xs font-medium text-gray-600 mb-0.5">Max ₹</label>
              <input
                type="number"
                step="0.01"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                placeholder="0"
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button type="button" onClick={clearAllFilters} className="w-full sm:w-auto px-4 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors h-[34px] shrink-0">Clear filters</button>
          </>
        }
      >
        <div className="overflow-hidden relative">
          {loading && requests.length === 0 ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="md" text="Loading requests..." />
            </div>
          ) : (
            <>
              {loading && requests.length > 0 && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-100 z-10">
                  <div className="h-full w-1/3 bg-blue-500 animate-pulse rounded-r" />
                </div>
              )}
              <div className={`overflow-x-auto transition-opacity duration-200 ${loading && requests.length > 0 ? "opacity-70 pointer-events-none" : ""}`}>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">ID</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Rider</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Order</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 uppercase tracking-wide">Amount</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Reason</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Requested By</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Status</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Reviewed By</th>
                      {(status === "pending" || requests.some((r) => r.status === "pending")) && (
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 uppercase tracking-wide min-w-[180px] w-[180px]">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {requests.length === 0 ? (
                      <tr>
                        <td colSpan={status === "pending" ? 9 : 8} className="px-4 py-8 text-center text-gray-600 text-sm">
                          No wallet credit requests found.
                        </td>
                      </tr>
                    ) : (
                      requests.map((r) => (
                        <tr key={r.id} className="text-gray-900">
                          <td className="px-4 py-2 text-sm font-mono">{r.id}</td>
                          <td className="px-4 py-2 text-sm font-mono">GMR{r.riderId}</td>
                          <td className="px-4 py-2 text-sm">{r.orderId ?? "—"}</td>
                          <td className="px-4 py-2 text-sm text-right font-medium">₹{r.amount.toFixed(2)}</td>
                          <td className="px-4 py-2 text-sm max-w-[200px] truncate" title={r.reason}>{r.reason}</td>
                          <td className="px-4 py-2 text-sm">
                            <div className="flex flex-col leading-tight">
                              <span className="text-gray-700">{r.requestedByEmail ?? "—"}</span>
                              <span className="text-[11px] text-gray-500 mt-0.5">{new Date(r.requestedAt).toLocaleString()}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                                r.status === "approved" ? "bg-green-100 text-green-800" : r.status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm">
                            <div className="flex flex-col leading-tight">
                              <span className="text-gray-700">{r.reviewedByEmail ?? "—"}</span>
                              <span className="text-[11px] text-gray-500 mt-0.5">{r.reviewedAt ? new Date(r.reviewedAt).toLocaleString() : "—"}</span>
                            </div>
                          </td>
                          {(status === "pending" || requests.some((x) => x.status === "pending")) && (
                            <td className="px-4 py-2 text-right align-middle min-w-[180px]">
                              {r.status === "pending" ? (
                                <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                                  {canApproveRejectWalletCredit ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleApprove(r.id)}
                                        disabled={actioningId !== null}
                                        className="shrink-0 px-2 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded"
                                      >
                                        {actioningId === r.id ? "..." : "Approve"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setRejectModal({ id: r.id, reason: "" })}
                                        disabled={actioningId !== null}
                                        className="shrink-0 px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-xs text-gray-500 shrink-0">View only</span>
                                  )}
                                  {canDeleteRequest(r) && (
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(r.id)}
                                      disabled={deletingId !== null}
                                      className="shrink-0 p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                                      title="Delete request"
                                      aria-label="Delete request"
                                    >
                                      {deletingId === r.id ? (
                                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>
                          )}
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

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setRejectModal(null)}>
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Reject request #{rejectModal.id}</h3>
            <p className="text-sm text-gray-600 mb-4">Optional: add a note for the requester.</p>
            <textarea
              rows={3}
              value={rejectModal.reason}
              onChange={(e) => setRejectModal((m) => m ? { ...m, reason: e.target.value } : null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white mb-4"
              placeholder="Reason for rejection (optional)"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRejectModal(null)}
                className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => rejectModal && handleReject(rejectModal.id, rejectModal.reason)}
                disabled={actioningId !== null}
                className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg"
              >
                {actioningId === rejectModal.id ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
