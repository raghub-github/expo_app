"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { Plus, RotateCcw, RefreshCw, ChevronDown, X } from "lucide-react";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { useRiderAccessQuery } from "@/hooks/queries/useRiderAccessQuery";
import {
  useGetRiderPenaltiesQuery,
  useAddRiderPenaltyMutation,
  useRevertRiderPenaltyMutation,
} from "@/store/api/riderApi";

interface Penalty {
  id: number;
  serviceType: string | null;
  penaltyType: string;
  amount: string;
  reason: string | null;
  status: string;
  orderId: number | null;
  source?: string;
  resolutionNotes?: string | null;
  imposedAt: string | null;
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
  const riderFromContext = riderContext?.currentRiderInfo ?? null;

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
  /** Applied search term (debounced or on Enter) — used for API fetch */
  const [appliedFilterSearch, setAppliedFilterSearch] = useState<string>("");
  const filterSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [revertingId, setRevertingId] = useState<number | null>(null);

  const [showAddPenalty, setShowAddPenalty] = useState(false);
  const [addPenaltySubmitting, setAddPenaltySubmitting] = useState(false);
  const [addPenaltyForm, setAddPenaltyForm] = useState({
    amount: "",
    reason: "",
    serviceType: "",
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
      const svc = serviceType === "food" ? "food" : serviceType === "parcel" ? "parcel" : serviceType === "person_ride" ? "person_ride" : "parcel";
      return !!riderAccess?.canRevertPenalty?.[svc];
    },
    [riderAccess]
  );

  const riderId = rider?.id ?? riderFromContext?.id ?? null;

  const {
    data: penaltiesData,
    isLoading: penaltiesLoading,
    isFetching: penaltiesFetching,
    error: penaltiesError,
    refetch: refetchPenalties,
  } = useGetRiderPenaltiesQuery(
    riderId
      ? {
          riderId,
          filters: {
            limit,
            offset: (page - 1) * limit,
            from,
            to,
            serviceType,
            status,
            q: appliedFilterSearch.trim() || undefined,
          },
        }
      : ({ riderId: 0 } as any),
    {
      skip: riderId == null,
    } as any
  );

  const [addPenaltyMutation, { isLoading: addPenaltyMutating }] = useAddRiderPenaltyMutation();
  const [revertPenaltyMutation, { isLoading: revertPenaltyMutating }] = useRevertRiderPenaltyMutation();

  const openRevertModal = useCallback((penaltyId: number) => {
    setRevertPenaltyId(penaltyId);
    setRevertReason("");
    setShowRevertModal(true);
    setError(null);
  }, []);

  const handleRevert = useCallback(
    async (penaltyId: number, reason?: string) => {
      if (!riderId) return;
      setRevertingId(penaltyId);
      try {
        await revertPenaltyMutation({
          riderId,
          penaltyId,
          reason: (reason ?? "").trim() || undefined,
        }).unwrap();
        setShowRevertModal(false);
        setRevertPenaltyId(null);
        setRevertReason("");
        invalidateRiderSummary(queryClient, riderId);
        await refetchPenalties();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to revert penalty");
      } finally {
        setRevertingId(null);
      }
    },
    [riderId, queryClient, revertPenaltyMutation, refetchPenalties]
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
      if (!riderId) return;
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
      const svc = addPenaltyForm.serviceType?.trim();
      if (!svc || !["food", "parcel", "person_ride"].includes(svc)) {
        setError("Please select a service (Food, Parcel, or Person Ride).");
        return;
      }
      if (orderId !== undefined && (Number.isNaN(orderId) || orderId < 1)) {
        setError("Order ID must be a positive number if provided.");
        return;
      }
      setAddPenaltySubmitting(true);
      setError(null);
      try {
        await addPenaltyMutation({
          riderId,
          body: {
            amount,
            reason,
            serviceType:
              addPenaltyForm.serviceType && ["food", "parcel", "person_ride"].includes(addPenaltyForm.serviceType)
                ? addPenaltyForm.serviceType
                : null,
            penaltyType: addPenaltyForm.penaltyType,
            ...(orderId != null && !Number.isNaN(orderId) ? { orderId } : {}),
          },
        }).unwrap();
        setShowAddPenalty(false);
        setAddPenaltyForm({ amount: "", reason: "", serviceType: "", penaltyType: "other", orderId: "" });
        invalidateRiderSummary(queryClient, riderId);
        await refetchPenalties();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to add penalty");
      } finally {
        setAddPenaltySubmitting(false);
      }
    },
    [riderId, queryClient, addPenaltyForm, addPenaltyMutation, refetchPenalties]
  );

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

  useEffect(() => {
    setLoading(penaltiesLoading || penaltiesFetching);
  }, [penaltiesLoading, penaltiesFetching]);

  useEffect(() => {
    if (!penaltiesData) {
      setPenalties([]);
      setTotal(0);
      return;
    }
    setPenalties(penaltiesData.penalties ?? []);
    setTotal(penaltiesData.total ?? 0);
  }, [penaltiesData]);

  useEffect(() => {
    if (!penaltiesError) return;
    setError(penaltiesError instanceof Error ? penaltiesError.message : String(penaltiesError));
  }, [penaltiesError]);

  // Debounce filter search: apply 400ms after user stops typing
  useEffect(() => {
    if (filterSearchDebounceRef.current) {
      clearTimeout(filterSearchDebounceRef.current);
      filterSearchDebounceRef.current = null;
    }
    if (filterSearch === appliedFilterSearch) return;
    filterSearchDebounceRef.current = setTimeout(() => {
      setAppliedFilterSearch(filterSearch);
      setPage(1);
      filterSearchDebounceRef.current = null;
    }, 400);
    return () => {
      if (filterSearchDebounceRef.current) clearTimeout(filterSearchDebounceRef.current);
    };
  }, [filterSearch]);

  const penaltyFilterChips: FilterChipItem[] = [];
  if (appliedFilterSearch.trim()) penaltyFilterChips.push({ id: "q", label: `Search: ${appliedFilterSearch.trim().slice(0, 16)}${appliedFilterSearch.trim().length > 16 ? "…" : ""}` });
  if (serviceType !== "all") penaltyFilterChips.push({ id: "serviceType", label: `Service: ${serviceType === "unspecified" ? "Unspecified" : serviceType.replace("_", " ")}` });
  if (status !== "all") penaltyFilterChips.push({ id: "status", label: `Status: ${status}` });
  if (from) penaltyFilterChips.push({ id: "from", label: `From: ${from}` });
  if (to) penaltyFilterChips.push({ id: "to", label: `To: ${to}` });
  if (limit !== 10) penaltyFilterChips.push({ id: "limit", label: `Limit: ${limit}` });
  const removePenaltyFilter = (id: string) => {
    if (id === "q") {
      setFilterSearch("");
      setAppliedFilterSearch("");
    } else if (id === "serviceType") setServiceType("all");
    else if (id === "status") setStatus("all");
    else if (id === "from") setFrom("");
    else if (id === "to") setTo("");
    else if (id === "limit") setLimit(10);
  };
  const clearAllPenaltyFilters = useCallback(() => {
    setPage(1);
    setFilterSearch("");
    setAppliedFilterSearch("");
    setServiceType("all");
    setStatus("all");
    setFrom("");
    setTo("");
    setLimit(10);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [appliedFilterSearch, serviceType, status, from, to, limit]);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setLimit(newSize);
    setPage(1);
  }, []);

  const applyPenaltyFilters = useCallback(() => {
    if (filterSearchDebounceRef.current) {
      clearTimeout(filterSearchDebounceRef.current);
      filterSearchDebounceRef.current = null;
    }
    setAppliedFilterSearch(filterSearch);
    setPage(1);
  }, [filterSearch]);

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
              onClick={() => void refetchPenalties()}              disabled={loading}
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
          <CollapsibleTableFilters
            label="Filters"
            activeCount={penaltyFilterChips.length}
            trailingSlot={
              <>
                {canAddPenaltyAny && (
                  <button
                    type="button"
                    onClick={() => setShowAddPenalty(true)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded border border-amber-700 shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Penalty
                  </button>
                )}
                <span className="text-[10px] sm:text-xs text-gray-600 whitespace-nowrap">Rows</span>
                <select
                  value={limit}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  className="h-6 sm:h-7 min-w-[2.5rem] rounded border border-gray-300 bg-white px-1.5 text-[10px] sm:text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  aria-label="Rows per page"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <TablePagination
                  page={page}
                  pageSize={limit}
                  total={total}
                  onPageChange={setPage}
                  disabled={loading}
                  ariaLabel="Penalties"
                  compact
                />
              </>
            }
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
                  onSubmit={applyPenaltyFilters}
                  placeholder="Penalty ID, Order ID, or reason"
                  // hint="Match penalty ID, order ID, or reason text"
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
                    <option value="unspecified">Unspecified</option>
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
                <div className={`transition-opacity duration-200 ${loading && penalties.length > 0 ? "opacity-70 pointer-events-none" : ""}`}>
                  {/* Desktop: modern table (lg and up) */}
                  <div className="hidden lg:block rounded-xl border border-gray-200/80 overflow-hidden bg-white shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[920px] text-sm border-collapse">
                        <thead>
                          <tr className="bg-gradient-to-r from-gray-50 to-gray-50/80 border-b border-gray-200">
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">ID</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Order</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Service</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider min-w-[130px]">Reason</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider min-w-[120px]">Imposed</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-[100px]">Details</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider w-28">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {penalties.map((p) => (
                            <PenaltyRow
                              key={p.id}
                              penalty={p}
                              riderId={rider.id}
                              onReverted={() => void refetchPenalties()}                              revertingId={revertingId}
                              onRevert={openRevertModal}
                              canRevert={canRevertForService(p.serviceType ?? "parcel")}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile/Tablet: card layout */}
                  <div className="lg:hidden space-y-3">
                    {penalties.map((p) => (
                      <PenaltyCard
                        key={p.id}
                        penalty={p}
                        revertingId={revertingId}
                        onRevert={openRevertModal}
                        canRevert={canRevertForService(p.serviceType ?? "parcel")}
                      />
                    ))}
                  </div>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Service (optional)</label>
                    <select
                      value={addPenaltyForm.serviceType}
                      onChange={(e) => setAddPenaltyForm((f) => ({ ...f, serviceType: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white text-gray-900"
                    >
                      <option value="" className="text-gray-900 bg-white">— Not specified</option>
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
  const [showDetails, setShowDetails] = useState(false);
  const [detailsOpenBelow, setDetailsOpenBelow] = useState(true);
  const [detailsPosition, setDetailsPosition] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 });
  const viewButtonRef = useRef<HTMLButtonElement>(null);
  const detailsPortalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDetails) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const inButton = viewButtonRef.current?.contains(target);
      const inPortal = detailsPortalRef.current?.contains(target);
      if (!inButton && !inPortal) setShowDetails(false);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [showDetails]);

  useEffect(() => {
    if (!showDetails) return;
    const handleScrollOrResize = () => setShowDetails(false);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [showDetails]);

  const toggleDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showDetails) {
      setShowDetails(false);
      return;
    }
    const btn = viewButtonRef.current;
    if (btn && typeof window !== "undefined") {
      const rect = btn.getBoundingClientRect();
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openBelow = spaceBelow >= spaceAbove;
      setDetailsOpenBelow(openBelow);
      const dropdownWidth = 280;
      let left = rect.left + rect.width / 2 - dropdownWidth / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - dropdownWidth - 8));
      if (openBelow) {
        setDetailsPosition({ top: rect.bottom + 4, left });
      } else {
        setDetailsPosition({ bottom: window.innerHeight - rect.top + 4, left });
      }
    }
    setShowDetails(true);
  };

  const isRevertible = penalty.status === "active" || penalty.status === "paid";
  const canRevert = isRevertible && canRevertPermission;
  const imposedBy = penalty.imposedByUser?.email ?? penalty.imposedByUser?.fullName ?? null;
  const reversedBy = penalty.reversedByUser?.email ?? penalty.reversedByUser?.fullName ?? null;
  const imposedAtStr = penalty.imposedAt ? new Date(penalty.imposedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";
  const revertedAtStr = penalty.resolvedAt ? new Date(penalty.resolvedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : null;

  return (
    <tr className="hover:bg-gray-50/80 transition-colors">
      <td className="px-4 py-3.5 text-gray-800 font-mono text-[14px] align-middle">{penalty.id}</td>
      <td className="px-4 py-3.5 text-gray-800 font-mono text-[14px] align-middle">
        {penalty.orderId != null ? penalty.orderId : "—"}
      </td>
      <td className="px-4 py-3.5 capitalize text-gray-800 text-[14px] align-middle">
        {penalty.serviceType ? penalty.serviceType.replace("_", " ") : "—"}
      </td>
      <td className="px-4 py-3.5 text-gray-700 text-[14px] align-middle truncate max-w-[100px]" title={penalty.penaltyType}>
        {penalty.penaltyType.replace("_", " ")}
      </td>
      <td className="px-4 py-3.5 text-gray-700 align-middle max-w-[180px]">
        <span className="block text-[14px] leading-snug line-clamp-2" title={penalty.reason ?? undefined}>
          {penalty.reason ?? "—"}
        </span>
        {penalty.status === "reversed" && penalty.resolutionNotes && (
          <span className="block text-[13px] text-gray-500 mt-0.5 line-clamp-1" title={penalty.resolutionNotes}>
            Revert: {penalty.resolutionNotes}
          </span>
        )}
      </td>
      <td className="px-4 py-3.5 text-right font-semibold text-red-600 text-[15px] align-middle whitespace-nowrap">
        ₹{Number(penalty.amount || 0).toFixed(2)}
      </td>
      <td className="px-4 py-3.5 text-gray-700 text-[14px] align-middle whitespace-nowrap" title={imposedBy ? `${imposedAtStr} by ${imposedBy}` : imposedAtStr}>
        {imposedAtStr}
      </td>
      <td className="px-4 py-3.5 align-middle w-[100px] overflow-visible">
        <div className="relative flex justify-center">
          <button
            ref={viewButtonRef}
            type="button"
            onClick={toggleDetails}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-[14px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg border border-gray-200 bg-white transition-colors"
            aria-expanded={showDetails}
          >
            View <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDetails ? "rotate-180" : ""}`} />
          </button>
          {showDetails &&
            typeof document !== "undefined" &&
            createPortal(
              <div
                ref={detailsPortalRef}
                className="fixed z-[9999] min-w-[280px] max-w-[320px] rounded-lg border border-gray-200 bg-white shadow-2xl py-3 px-4"
                style={{
                  left: detailsPosition.left,
                  ...(detailsOpenBelow
                    ? { top: detailsPosition.top }
                    : { bottom: detailsPosition.bottom }),
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Imposed / Reverted</span>
                  <button type="button" onClick={() => setShowDetails(false)} className="p-0.5 text-gray-400 hover:text-gray-600 rounded" aria-label="Close">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="space-y-2.5 text-[14px] leading-snug">
                  <div>
                    <span className="text-gray-500 font-medium text-[12px] uppercase">Imposed</span>
                    <p className="text-gray-800 mt-0.5">{imposedAtStr} <span className="text-gray-500">by</span></p>
                    <p className="text-gray-900 break-all font-medium text-[13px]" title={imposedBy ?? undefined}>{imposedBy ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium text-[12px] uppercase">Reverted</span>
                    {revertedAtStr ? (
                      <>
                        <p className="text-gray-800 mt-0.5">{revertedAtStr} <span className="text-gray-500">by</span></p>
                        <p className="text-gray-900 break-all font-medium text-[13px]" title={reversedBy ?? undefined}>{reversedBy ?? "—"}</p>
                      </>
                    ) : (
                      <p className="text-gray-500 mt-0.5">—</p>
                    )}
                  </div>
                </div>
              </div>,
              document.body
            )}
        </div>
      </td>
      <td className="px-4 py-3.5 text-right align-middle">
        {canRevert ? (
          isRevertible ? (
            <button
              type="button"
              onClick={() => onRevert(penalty.id)}
              disabled={revertingId === penalty.id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[14px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50 border border-amber-200/60"
            >
              {revertingId === penalty.id ? "…" : "Revert"}
            </button>
          ) : (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[14px] font-medium text-gray-500 bg-gray-100">
              Reverted
            </span>
          )
        ) : (
          <StatusBadge status={penalty.status} />
        )}
      </td>
    </tr>
  );
}

/** Status badge for penalty: Active, Paid, or Reverted based on actual status */
function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  if (s === "reversed") {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[14px] font-medium text-gray-500 bg-gray-100">
        Reverted
      </span>
    );
  }
  if (s === "paid") {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[14px] font-medium text-blue-700 bg-blue-50">
        Paid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[14px] font-medium text-amber-700 bg-amber-50">
      Active
    </span>
  );
}

/** Mobile/tablet card: one penalty per card, responsive and touch-friendly */
function PenaltyCard({
  penalty,
  revertingId,
  onRevert,
  canRevert,
}: {
  penalty: Penalty;
  revertingId: number | null;
  onRevert: (id: number) => void;
  canRevert: boolean;
}) {
  const isRevertible = penalty.status === "active" || penalty.status === "paid";
  const canRevertAction = isRevertible && canRevert;
  const imposedBy = penalty.imposedByUser?.email ?? penalty.imposedByUser?.fullName ?? null;
  const reversedBy = penalty.reversedByUser?.email ?? penalty.reversedByUser?.fullName ?? null;
  const imposedAtStr = penalty.imposedAt ? new Date(penalty.imposedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";
  const revertedAtStr = penalty.resolvedAt ? new Date(penalty.resolvedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[14px] font-medium text-gray-800">#{penalty.id}</span>
          <span className="text-[14px] text-gray-500 capitalize">{penalty.serviceType ? penalty.serviceType.replace("_", " ") : "—"}</span>
          <span className="text-gray-500">·</span>
          <span className="text-[14px] text-gray-600 capitalize">{penalty.penaltyType.replace("_", " ")}</span>
        </div>
        {canRevert ? (
          isRevertible ? (
            <button
              type="button"
              onClick={() => onRevert(penalty.id)}
              disabled={revertingId === penalty.id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[14px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200/60 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {revertingId === penalty.id ? "…" : "Revert"}
            </button>
          ) : (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[14px] font-medium text-gray-500 bg-gray-100">
              Reverted
            </span>
          )
        ) : (
          <StatusBadge status={penalty.status} />
        )}
      </div>
      <div className="text-[18px] font-semibold text-red-600 mb-3">
        ₹{Number(penalty.amount || 0).toFixed(2)}
      </div>
      <div className="space-y-2 text-[14px] text-gray-600">
        <div>
          <span className="text-gray-500 font-medium">Reason</span>
          <p className="text-gray-800 mt-0.5">{penalty.reason}</p>
          {penalty.status === "reversed" && penalty.resolutionNotes && (
            <p className="text-[13px] text-gray-500 mt-1">Revert: {penalty.resolutionNotes}</p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-gray-100">
          <div>
            <span className="text-gray-500 font-medium text-[11px] uppercase tracking-wide">Imposed</span>
            <p className="text-[14px] text-gray-800 mt-0.5">{imposedAtStr} <span className="text-gray-500">by</span></p>
            <p className="text-[14px] text-gray-900 break-all font-medium" title={imposedBy ?? undefined}>{imposedBy ?? "—"}</p>
          </div>
          <div>
            <span className="text-gray-500 font-medium text-[11px] uppercase tracking-wide">Reverted</span>
            {revertedAtStr ? (
              <>
                <p className="text-[14px] text-gray-800 mt-0.5">{revertedAtStr} <span className="text-gray-500">by</span></p>
                <p className="text-[14px] text-gray-900 break-all font-medium" title={reversedBy ?? undefined}>{reversedBy ?? "—"}</p>
              </>
            ) : (
              <p className="text-[14px] text-gray-500 mt-0.5">—</p>
            )}
          </div>
          {penalty.orderId != null && (
            <div>
              <span className="text-gray-500 font-medium text-[11px] uppercase tracking-wide">Order</span>
              <p className="text-[14px] font-mono text-gray-800 mt-0.5">{penalty.orderId}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

