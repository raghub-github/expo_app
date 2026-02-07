"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";
import { invalidateRiderSummary } from "@/lib/cache-invalidation";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { RiderSectionHeader } from "./RiderSectionHeader";
import { CollapsibleTableFilters } from "./CollapsibleTableFilters";
import { FilterChips, type FilterChipItem } from "./FilterChips";
import { FilterSearchBar } from "./FilterSearchBar";
import { TablePagination } from "./TablePagination";
import { Plus, RotateCcw, RefreshCw } from "lucide-react";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { useRiderAccessQuery } from "@/hooks/queries/useRiderAccessQuery";

interface Penalty {
  id: number;
  serviceType: string;
  penaltyType: string;
  amount: string;
  reason: string;
  status: string;
  orderId: number | null;
  source?: string;
  resolutionNotes?: string | null;
  imposedAt: string;
  resolvedAt: string | null;
  imposedByUser?: { email: string; fullName: string | null } | null;
  reversedByUser?: { email: string; fullName: string | null } | null;
}

interface RiderSummaryInfo {
  id: number;
  name: string | null;
  mobile: string;
  city: string | null;
  state: string | null;
  status: string;
  onboardingStage: string;
  kycStatus: string;
}

const PENALTY_TYPES = [
  "cancellation",
  "fraud",
  "extra_charges",
  "late_delivery",
  "customer_complaint",
  "order_mistake",
  "other",
] as const;

export function RiderPenaltiesClient() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const searchValue = (searchParams.get("search") || "").trim();
  const riderContext = useRiderDashboardOptional();

  const [rider, setRider] = useState<RiderSummaryInfo | null>(null);
  const [resolvingRider, setResolvingRider] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [serviceType, setServiceType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [limit, setLimit] = useState<number>(10);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [filterSearch, setFilterSearch] = useState<string>("");
  const [revertingId, setRevertingId] = useState<number | null>(null);

  const [showAddPenalty, setShowAddPenalty] = useState(false);
  const [addPenaltySubmitting, setAddPenaltySubmitting] = useState(false);
  const [addPenaltyForm, setAddPenaltyForm] = useState({
    amount: "",
    reason: "",
    serviceType: "food",
    penaltyType: "other",
    orderId: "",
  });

  const [showRevertModal, setShowRevertModal] = useState(false);
  const [revertPenaltyId, setRevertPenaltyId] = useState<number | null>(null);
  const [revertReason, setRevertReason] = useState("");

  const hasSearch = useMemo(() => searchValue.length > 0, [searchValue]);
  const { data: riderAccess } = useRiderAccessQuery();
  const canAddPenaltyAny =
    riderAccess?.isSuperAdmin ||
    riderAccess?.canAddPenalty?.food ||
    riderAccess?.canAddPenalty?.parcel ||
    riderAccess?.canAddPenalty?.person_ride;
  const canRevertForService = useCallback(
    (serviceType: string) => {
      if (riderAccess?.isSuperAdmin) return true;
      const svc = serviceType === "food" ? "food" : serviceType === "parcel" ? "parcel" : "person_ride";
      return !!riderAccess?.canRevertPenalty?.[svc];
    },
    [riderAccess]
  );

  const fetchPenalties = useCallback(
    async (r: RiderSummaryInfo | null) => {
      if (!r) {
        setPenalties([]);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.set("limit", String(limit));
        params.set("offset", String((page - 1) * limit));
        if (filterSearch.trim()) params.set("q", filterSearch.trim());
        if (serviceType && serviceType !== "all") {
          params.set("serviceType", serviceType);
        }
        if (status && status !== "all") {
          params.set("status", status);
        }
        if (from) params.set("from", from);
        if (to) params.set("to", to);

        const res = await fetch(
          `/api/riders/${r.id}/penalties?${params.toString()}`
        );
        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to load penalties");
        }

        setPenalties(json.data.penalties || []);
        setTotal(json.data.total ?? 0);
      } catch (err: unknown) {
        console.error("[RiderPenalties] Error loading penalties:", err);
        setError(err instanceof Error ? err.message : "Failed to load penalties");
        setPenalties([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [limit, page, filterSearch, serviceType, status, from, to]
  );

  const openRevertModal = useCallback((penaltyId: number) => {
    setRevertPenaltyId(penaltyId);
    setRevertReason("");
    setShowRevertModal(true);
    setError(null);
  }, []);

  const handleRevert = useCallback(
    async (penaltyId: number, reason?: string) => {
      if (!rider) return;
      setRevertingId(penaltyId);
      try {
        const res = await fetch(
          `/api/riders/${rider.id}/penalties/${penaltyId}/revert`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: (reason ?? "").trim() || undefined }),
          }
        );
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Revert failed");
        }
        setShowRevertModal(false);
        setRevertPenaltyId(null);
        setRevertReason("");
        invalidateRiderSummary(queryClient, rider.id);
        await fetchPenalties(rider);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to revert penalty");
      } finally {
        setRevertingId(null);
      }
    },
    [rider, queryClient, fetchPenalties]
  );

  const confirmRevert = useCallback(() => {
    if (revertPenaltyId == null || !rider) return;
    handleRevert(revertPenaltyId, revertReason);
  }, [revertPenaltyId, revertReason, rider, handleRevert]);

  const resolveRider = useCallback(
    async (value: string) => {
      if (!value.trim()) {
        setRider(null);
        return;
      }

      try {
        setResolvingRider(true);
        setResolveError(null);

        if (!supabase) {
          throw new Error("Database connection not available.");
        }

        let query = supabase
          .from("riders")
          .select(
            "id, name, mobile, city, state, status, onboarding_stage, kyc_status"
          );

        const isPhoneWith91 = /^(\+91|91)\d{10}$/.test(value);
        const isPhone = /^\d{10,}$/.test(value);
        const isRiderId = /^GMR(\d+)$/i.test(value);
        const isNumericId = /^\d{1,9}$/.test(value);

        if (isPhoneWith91) {
          let phone = value.replace(/^\+?91/, "");
          query = query.eq("mobile", phone);
        } else if (isPhone) {
          query = query.eq("mobile", value);
        } else if (isRiderId) {
          const idNum = value.replace(/^GMR/i, "");
          if (/^\d+$/.test(idNum)) {
            query = query.eq("id", Number(idNum));
          } else {
            query = query.eq("id", -1);
          }
        } else if (isNumericId) {
          query = query.eq("id", Number(value));
        } else {
          query = query.ilike("mobile", `%${value}%`);
        }

        const { data, error: supabaseError } = await query.limit(1);
        if (supabaseError) {
          throw supabaseError;
        }

        if (!data || data.length === 0) {
          setRider(null);
          setResolveError("No rider found for this search.");
          return;
        }

        const row = data[0]!;
        setRider({
          id: row.id,
          name: row.name,
          mobile: row.mobile,
          city: row.city,
          state: row.state,
          status: row.status,
          onboardingStage: row.onboarding_stage,
          kycStatus: row.kyc_status,
        });
      } catch (err: any) {
        console.error("[RiderPenalties] Error resolving rider:", err);
        setResolveError(
          err?.message || "Failed to resolve rider from search value."
        );
        setRider(null);
      } finally {
        setResolvingRider(false);
      }
    },
    []
  );

  const handleAddPenalty = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!rider) return;
      const amount = parseFloat(addPenaltyForm.amount);
      const reason = addPenaltyForm.reason.trim();
      const orderIdRaw = addPenaltyForm.orderId.trim();
      const orderId = orderIdRaw ? parseInt(orderIdRaw, 10) : undefined;
      if (!(amount > 0)) {
        setError("Amount must be positive.");
        return;
      }
      if (!reason) {
        setError("Reason is required.");
        return;
      }
      if (orderId !== undefined && (Number.isNaN(orderId) || orderId < 1)) {
        setError("Order ID must be a positive number if provided.");
        return;
      }
      setAddPenaltySubmitting(true);
      setError(null);
      try {
        const res = await fetch(`/api/riders/${rider.id}/penalties`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            reason,
            serviceType: addPenaltyForm.serviceType,
            penaltyType: addPenaltyForm.penaltyType,
            ...(orderId != null && !Number.isNaN(orderId) ? { orderId } : {}),
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to add penalty");
        }
        setShowAddPenalty(false);
        setAddPenaltyForm({ amount: "", reason: "", serviceType: "food", penaltyType: "other", orderId: "" });
        invalidateRiderSummary(queryClient, rider.id);
        await fetchPenalties(rider);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to add penalty");
      } finally {
        setAddPenaltySubmitting(false);
      }
    },
    [rider, queryClient, addPenaltyForm, fetchPenalties]
  );

  // Rider from context (persists when navigating from Rider Information to Penalties)
  const riderFromContext = riderContext?.currentRiderInfo ?? null;

  // Resolve rider: prefer URL search param; if none, use rider from context so data persists
  useEffect(() => {
    if (hasSearch) {
      resolveRider(searchValue);
    } else if (riderFromContext) {
      setRider(riderFromContext);
      setResolveError(null);
    } else {
      setRider(null);
      setPenalties([]);
      setResolveError(null);
    }
  }, [hasSearch, searchValue, riderFromContext?.id, resolveRider]);

  // Fetch penalties whenever rider or filters change
  useEffect(() => {
    if (rider) {
      fetchPenalties(rider);
    }
  }, [rider, fetchPenalties]);

  const penaltyFilterChips: FilterChipItem[] = [];
  if (filterSearch.trim()) penaltyFilterChips.push({ id: "q", label: `Search: ${filterSearch.trim().slice(0, 16)}${filterSearch.trim().length > 16 ? "…" : ""}` });
  if (serviceType !== "all") penaltyFilterChips.push({ id: "serviceType", label: `Service: ${serviceType.replace("_", " ")}` });
  if (status !== "all") penaltyFilterChips.push({ id: "status", label: `Status: ${status}` });
  if (from) penaltyFilterChips.push({ id: "from", label: `From: ${from}` });
  if (to) penaltyFilterChips.push({ id: "to", label: `To: ${to}` });
  if (limit !== 10) penaltyFilterChips.push({ id: "limit", label: `Limit: ${limit}` });
  const removePenaltyFilter = (id: string) => {
    if (id === "q") setFilterSearch("");
    else if (id === "serviceType") setServiceType("all");
    else if (id === "status") setStatus("all");
    else if (id === "from") setFrom("");
    else if (id === "to") setTo("");
    else if (id === "limit") setLimit(10);
  };
  const clearAllPenaltyFilters = useCallback(() => {
    setPage(1);
    setFilterSearch("");
    setServiceType("all");
    setStatus("all");
    setFrom("");
    setTo("");
    setLimit(10);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filterSearch, serviceType, status, from, to, limit]);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setLimit(newSize);
    setPage(1);
  }, []);

  const applyPenaltyFilters = useCallback(() => {
    setPage(1);
    if (rider) fetchPenalties(rider);
  }, [rider, fetchPenalties]);

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <RiderSectionHeader
        title="Penalties"
        description="View and analyse rider penalties by service, status and date range."
        rider={rider ? { id: rider.id, name: rider.name, mobile: rider.mobile } : null}
        resolveLoading={resolvingRider}
        error={resolveError}
        hasSearch={hasSearch}
        actionButtons={
          rider ? (
            <button
              type="button"
              onClick={() => fetchPenalties(rider)}
              disabled={loading}
              className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50 shrink-0"
              title="Refresh penalties"
              aria-label="Refresh penalties"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          ) : undefined
        }
      />

      {/* Filters + table */}
      {rider && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm ring-1 ring-gray-900/5">
          <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
            {canAddPenaltyAny && (
              <button
                type="button"
                onClick={() => setShowAddPenalty(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Add Penalty
              </button>
            )}
          </div>
          <CollapsibleTableFilters
            label="Filters"
            activeCount={penaltyFilterChips.length}
            filterChipsSlot={
              penaltyFilterChips.length > 0 ? (
                <FilterChips
                  inline
                  chips={penaltyFilterChips}
                  onRemove={removePenaltyFilter}
                  onClearAll={clearAllPenaltyFilters}
                />
              ) : null
            }
            filterContent={
              <>
                <FilterSearchBar
                  value={filterSearch}
                  onChange={setFilterSearch}
                  placeholder="Penalty ID, Order ID"
                  hint="Match penalty ID or order ID"
                  id="penalties-filter-search"
                />
                <div className="min-w-[120px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Service Type</label>
                  <select
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All</option>
                    <option value="food">Food</option>
                    <option value="parcel">Parcel</option>
                    <option value="person_ride">Person Ride</option>
                  </select>
                </div>
                <div className="min-w-[120px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="reversed">Reversed</option>
                    <option value="paid">Paid</option>
                  </select>
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
                <button
                  type="button"
                  onClick={applyPenaltyFilters}
                  className="px-4 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors h-[34px]"
                >
                  Apply
                </button>
                <button type="button" onClick={clearAllPenaltyFilters} className="px-4 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors h-[34px] shrink-0">
                  Clear filters
                </button>
              </>
            }
          >
          <div className="mt-4 relative">
            {loading && penalties.length === 0 ? (
              <div className="flex justify-center py-10">
                <LoadingSpinner size="md" variant="default" text="Loading penalties..." className="text-blue-600" />
              </div>
            ) : error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : penalties.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-6">No penalties found for selected filters.</p>
            ) : (
              <>
                {loading && penalties.length > 0 && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-100 z-10">
                    <div className="h-full w-1/3 bg-blue-500 animate-pulse rounded-r" />
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 py-2 px-3 sm:px-4 border-b border-gray-200 bg-gray-50/60">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Rows per page</span>
                    <select
                      value={limit}
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
                    pageSize={limit}
                    total={total}
                    onPageChange={setPage}
                    disabled={loading}
                    ariaLabel="Penalties"
                  />
                </div>
                <div className={`overflow-x-auto -mx-1 transition-opacity duration-200 ${loading && penalties.length > 0 ? "opacity-70 pointer-events-none" : ""}`}>
                  <table className="w-full divide-y divide-gray-200 text-xs border-collapse">
                    <thead className="bg-gray-50/80 sticky top-0 z-10">
                      <tr>
                        <th className="px-2 py-2 text-left font-medium text-gray-700 uppercase tracking-wider text-[10px] w-[1%] whitespace-nowrap">Dates</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-700 uppercase tracking-wider text-[10px] w-[1%] whitespace-nowrap">ID</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-700 uppercase tracking-wider text-[10px] w-[1%] whitespace-nowrap">Order</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-700 uppercase tracking-wider text-[10px] w-[1%] whitespace-nowrap">Service</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-700 uppercase tracking-wider text-[10px] whitespace-nowrap">Type</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-700 uppercase tracking-wider text-[10px] min-w-[100px]">Reason</th>
                        <th className="px-2 py-2 text-right font-medium text-gray-700 uppercase tracking-wider text-[10px] w-[1%] whitespace-nowrap">Amount</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-700 uppercase tracking-wider text-[10px] min-w-[120px]">Agent</th>
                        <th className="px-2 py-2 text-left font-medium text-gray-700 uppercase tracking-wider text-[10px] w-[1%] whitespace-nowrap">Status</th>
                        <th className="px-2 py-2 text-right font-medium text-gray-700 uppercase tracking-wider text-[10px] w-[1%] whitespace-nowrap">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {penalties.map((p) => (
                        <PenaltyRow
                          key={p.id}
                          penalty={p}
                          riderId={rider.id}
                          onReverted={fetchPenalties.bind(null, rider)}
                          revertingId={revertingId}
                          onRevert={openRevertModal}
                          canRevert={canRevertForService(p.serviceType)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          </CollapsibleTableFilters>

          {/* Add Penalty modal */}
          {showAddPenalty && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Add Penalty</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Manually impose a penalty for this rider.</p>
                </div>
                <form onSubmit={handleAddPenalty} className="p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={addPenaltyForm.amount}
                      onChange={(e) => setAddPenaltyForm((f) => ({ ...f, amount: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                    <textarea
                      rows={2}
                      required
                      value={addPenaltyForm.reason}
                      onChange={(e) => setAddPenaltyForm((f) => ({ ...f, reason: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white text-gray-900 placeholder:text-gray-500"
                      placeholder="e.g. Order cancellation, fraud, extra charges..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
                    <select
                      value={addPenaltyForm.serviceType}
                      onChange={(e) => setAddPenaltyForm((f) => ({ ...f, serviceType: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white text-gray-900"
                    >
                      <option value="food" className="text-gray-900 bg-white">Food</option>
                      <option value="parcel" className="text-gray-900 bg-white">Parcel</option>
                      <option value="person_ride" className="text-gray-900 bg-white">Person Ride</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Penalty Type</label>
                    <select
                      value={addPenaltyForm.penaltyType}
                      onChange={(e) => setAddPenaltyForm((f) => ({ ...f, penaltyType: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white text-gray-900"
                    >
                      {PENALTY_TYPES.map((t) => (
                        <option key={t} value={t} className="text-gray-900 bg-white">{t.replace(/_/g, " ")}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Order ID (optional)</label>
                    <input
                      type="number"
                      min="1"
                      value={addPenaltyForm.orderId}
                      onChange={(e) => setAddPenaltyForm((f) => ({ ...f, orderId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white text-gray-900 placeholder:text-gray-500"
                      placeholder="Leave empty if not linked to an order"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => { setShowAddPenalty(false); setError(null); }}
                      className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addPenaltySubmitting}
                      className="flex-1 px-3 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg"
                    >
                      {addPenaltySubmitting ? "Adding..." : "Add Penalty"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Revert penalty modal */}
          {showRevertModal && revertPenaltyId != null && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !revertingId && (setShowRevertModal(false), setRevertPenaltyId(null), setRevertReason(""))}>
              <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <RotateCcw className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Revert penalty</h2>
                      <p className="text-sm text-gray-600 mt-0.5">Credit the rider and mark this penalty as reversed. Reason for revert is required for audit.</p>
                    </div>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason for revert *</label>
                    <textarea
                      rows={3}
                      required
                      value={revertReason}
                      onChange={(e) => setRevertReason(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 placeholder:text-gray-400"
                      placeholder="e.g. Mistaken penalty, order was delivered on time..."
                    />
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => { setShowRevertModal(false); setRevertPenaltyId(null); setRevertReason(""); setError(null); }}
                      disabled={revertingId !== null}
                      className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={confirmRevert}
                      disabled={revertingId !== null || !revertReason.trim()}
                      className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {revertingId === revertPenaltyId ? (
                        <>Reverting…</>
                      ) : (
                        <>
                          <RotateCcw className="h-4 w-4" />
                          Confirm revert
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PenaltyRow({
  penalty,
  riderId,
  onReverted,
  revertingId,
  onRevert,
  canRevert: canRevertPermission,
}: {
  penalty: Penalty;
  riderId: number;
  onReverted: () => void;
  revertingId: number | null;
  onRevert: (id: number) => void;
  canRevert: boolean;
}) {
  const isRevertible = (penalty.status === "active" || penalty.status === "paid") && penalty.status !== "reversed";
  const canRevert = isRevertible && canRevertPermission;
  const imposedBy = penalty.imposedByUser?.email ?? penalty.imposedByUser?.fullName ?? null;
  const reversedBy = penalty.reversedByUser?.email ?? penalty.reversedByUser?.fullName ?? null;
  const imposedAtStr = penalty.imposedAt ? new Date(penalty.imposedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";
  const revertedAtStr = penalty.resolvedAt ? new Date(penalty.resolvedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : null;

  return (
    <tr className="hover:bg-amber-50/40 transition-colors border-b border-gray-100 last:border-0">
      <td className="px-2 py-2 text-gray-600 align-top">
        <div className="space-y-0.5 text-[11px] leading-tight">
          <div><span className="text-gray-400 font-medium">Imposed:</span> {imposedAtStr}</div>
          {revertedAtStr && <div><span className="text-gray-400 font-medium">Reverted:</span> {revertedAtStr}</div>}
        </div>
      </td>
      <td className="px-2 py-2 text-gray-800 font-mono align-top">{penalty.id}</td>
      <td className="px-2 py-2 text-gray-800 font-mono align-top">
        {penalty.orderId != null ? penalty.orderId : "—"}
      </td>
      <td className="px-2 py-2 capitalize text-gray-800 align-top">
        {penalty.serviceType.replace("_", " ")}
      </td>
      <td className="px-2 py-2 text-gray-800 align-top truncate max-w-[80px]" title={penalty.penaltyType}>
        {penalty.penaltyType.replace("_", " ")}
      </td>
      <td className="px-2 py-2 text-gray-700 align-top max-w-[140px]">
        <span className="block truncate text-[11px] leading-snug" title={penalty.reason}>{penalty.reason}</span>
        {penalty.status === "reversed" && penalty.resolutionNotes && (
          <span className="block text-[10px] text-gray-500 truncate mt-0.5" title={penalty.resolutionNotes}>
            Revert: {penalty.resolutionNotes}
          </span>
        )}
      </td>
      <td className="px-2 py-2 text-right font-semibold text-red-600 align-top whitespace-nowrap">
        ₹{Number(penalty.amount || 0).toFixed(2)}
      </td>
      <td className="px-2 py-2 text-gray-900 align-top max-w-[130px]">
        <div className="space-y-0.5 text-[11px] leading-tight">
          <div className="truncate" title={imposedBy ?? undefined}>
            <span className="text-gray-600 font-medium">Imposed:</span> <span className="text-gray-900">{imposedBy ?? "—"}</span>
          </div>
          <div className="truncate" title={reversedBy !== "—" ? String(reversedBy) : undefined}>
            <span className="text-gray-600 font-medium">Reverted:</span> <span className="text-gray-900">{reversedBy ?? "—"}</span>
          </div>
        </div>
      </td>
      <td className="px-2 py-2 align-top">
        <span
          className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium capitalize ${
            penalty.status === "active"
              ? "bg-red-50 text-red-700"
              : penalty.status === "paid"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {penalty.status}
        </span>
      </td>
      <td className="px-2 py-2 text-right align-top">
        {canRevert ? (
          <button
            type="button"
            onClick={() => onRevert(penalty.id)}
            disabled={revertingId === penalty.id}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors disabled:opacity-50"
          >
            {revertingId === penalty.id ? "…" : "Revert"}
          </button>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
    </tr>
  );
}

