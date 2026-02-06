"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { RiderSectionHeader } from "./RiderSectionHeader";
import { CollapsibleTableFilters } from "./CollapsibleTableFilters";
import { FilterChips, type FilterChipItem } from "./FilterChips";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { AddAmountModal } from "./AddAmountModal";
import { useRiderAccessQuery } from "@/hooks/queries/useRiderAccessQuery";
import Link from "next/link";
import { MoreVertical } from "lucide-react";

interface RiderInfo {
  id: number;
  name: string | null;
  mobile: string;
}

interface OrderRow {
  id: number;
  orderType: string;
  status: string;
  fareAmount: string | null;
  riderEarning: string | null;
  createdAt: string;
  externalRef: string | null;
}

export function RiderOrdersClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const riderContext = useRiderDashboardOptional();
  const searchValue = (searchParams.get("search") || "").trim();
  const [searchInput, setSearchInput] = useState(searchValue);
  const [orderType, setOrderType] = useState(searchParams.get("orderType") || "all");
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [from, setFrom] = useState(searchParams.get("from") || "");
  const [to, setTo] = useState(searchParams.get("to") || "");

  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addPenaltyForOrder, setAddPenaltyForOrder] = useState<{ orderId: number; serviceType: string; orderValue: number } | null>(null);
  const [addPenaltySubmitting, setAddPenaltySubmitting] = useState(false);
  const [addPenaltyForm, setAddPenaltyForm] = useState({ reason: "", penaltyPercent: 100 });
  const [addAmountForOrder, setAddAmountForOrder] = useState<{ orderId: number; serviceType: string } | null>(null);
  const [pendingCreditOrderIds, setPendingCreditOrderIds] = useState<Set<number>>(new Set());
  const [approvedExtraByOrderId, setApprovedExtraByOrderId] = useState<Map<number, number>>(new Map());
  const [openMenuOrderId, setOpenMenuOrderId] = useState<number | null>(null);

  const orderFilterChips: FilterChipItem[] = useMemo(() => {
    const chips: FilterChipItem[] = [];
    if (orderType && orderType !== "all") chips.push({ key: "orderType", label: `Service: ${orderType.replace("_", " ")}` });
    if (status && status !== "all") chips.push({ key: "status", label: `Status: ${status.replace("_", " ")}` });
    if (from) chips.push({ key: "from", label: `From: ${from}` });
    if (to) chips.push({ key: "to", label: `To: ${to}` });
    return chips;
  }, [orderType, status, from, to]);

  const removeOrderFilter = useCallback((key: string) => {
    if (key === "orderType") setOrderType("all");
    else if (key === "status") setStatus("all");
    else if (key === "from") setFrom("");
    else if (key === "to") setTo("");
  }, []);

  const clearAllOrderFilters = useCallback(() => {
    setOrderType("all");
    setStatus("all");
    setFrom("");
    setTo("");
  }, []);

  const resolveRider = useCallback(async (value: string) => {
    if (!value.trim()) {
      setRider(null);
      setOrders([]);
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
        setOrders([]);
        setError("No rider found");
        return;
      }
      setRider({ id: data.id, name: data.name, mobile: data.mobile });
    } catch (err: any) {
      setError(err?.message || "Failed to resolve rider");
      setRider(null);
      setOrders([]);
    } finally {
      setResolveLoading(false);
    }
  }, []);

  const fetchOrders = useCallback(async (riderId: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (orderType !== "all") params.set("orderType", orderType);
      if (status !== "all") params.set("status", status);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("limit", "50");
      const res = await fetch(`/api/riders/${riderId}/orders?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load orders");
      setOrders(json.data?.orders ?? []);
    } catch (err: any) {
      setError(err?.message || "Failed to load orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [orderType, status, from, to]);

  const riderFromContext = riderContext?.currentRiderInfo
    ? { id: riderContext.currentRiderInfo.id, name: riderContext.currentRiderInfo.name, mobile: riderContext.currentRiderInfo.mobile }
    : null;

  useEffect(() => setSearchInput(searchValue), [searchValue]);
  useEffect(() => {
    if (searchValue) resolveRider(searchValue);
    else if (riderFromContext) {
      setRider(riderFromContext);
      setError(null);
    } else {
      setRider(null);
      setOrders([]);
      setError(null);
    }
  }, [searchValue, riderFromContext?.id, resolveRider]);
  useEffect(() => {
    if (rider) fetchOrders(rider.id);
  }, [rider, fetchOrders]);

  const fetchPendingCreditOrderIds = useCallback(async (riderId: number) => {
    try {
      const res = await fetch(`/api/wallet-credit-requests?riderId=${riderId}&status=pending`);
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        const ids = new Set<number>();
        for (const r of json.data) {
          if (r.orderId != null) ids.add(r.orderId);
        }
        setPendingCreditOrderIds(ids);
      } else {
        setPendingCreditOrderIds(new Set());
      }
    } catch {
      setPendingCreditOrderIds(new Set());
    }
  }, []);

  const fetchApprovedExtraByOrderId = useCallback(async (riderId: number) => {
    try {
      const res = await fetch(`/api/wallet-credit-requests?riderId=${riderId}&status=approved&limit=100`);
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) {
        const map = new Map<number, number>();
        for (const r of json.data) {
          if (r.orderId == null) continue;
          const amt = Number(r.amount) || 0;
          map.set(r.orderId, (map.get(r.orderId) ?? 0) + amt);
        }
        setApprovedExtraByOrderId(map);
      } else {
        setApprovedExtraByOrderId(new Map());
      }
    } catch {
      setApprovedExtraByOrderId(new Map());
    }
  }, []);

  useEffect(() => {
    if (rider) {
      fetchPendingCreditOrderIds(rider.id);
      fetchApprovedExtraByOrderId(rider.id);
    } else {
      setPendingCreditOrderIds(new Set());
      setApprovedExtraByOrderId(new Map());
    }
  }, [rider, fetchPendingCreditOrderIds, fetchApprovedExtraByOrderId]);

  const { data: riderAccess } = useRiderAccessQuery();
  const canAddPenaltyForService = useCallback(
    (orderType: string) => {
      if (riderAccess?.isSuperAdmin) return true;
      const svc = orderType === "food" ? "food" : orderType === "parcel" ? "parcel" : "person_ride";
      return !!riderAccess?.canAddPenalty?.[svc];
    },
    [riderAccess]
  );

  const applyFilters = useCallback(() => {
    const p = new URLSearchParams();
    if (searchValue) p.set("search", searchValue);
    if (orderType !== "all") p.set("orderType", orderType);
    if (status !== "all") p.set("status", status);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    router.push(`/dashboard/riders/orders?${p.toString()}`);
    if (rider) fetchOrders(rider.id);
  }, [searchValue, orderType, status, from, to, rider, router, fetchOrders]);

  const handleAddPenaltyFromOrder = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!rider || !addPenaltyForOrder) return;
      const reason = addPenaltyForm.reason.trim();
      if (!reason) {
        setError("Reason is required.");
        return;
      }
      const amount = (addPenaltyForOrder.orderValue * addPenaltyForm.penaltyPercent) / 100;
      if (!(amount > 0)) {
        setError("Order value is zero; cannot impose penalty.");
        return;
      }
      setAddPenaltySubmitting(true);
      setError(null);
      try {
        const res = await fetch(`/api/riders/${rider.id}/penalties`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: Math.round(amount * 100) / 100,
            reason,
            serviceType: addPenaltyForOrder.serviceType,
            penaltyType: "other",
            orderId: addPenaltyForOrder.orderId,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Failed to add penalty");
        setAddPenaltyForOrder(null);
        setAddPenaltyForm({ reason: "", penaltyPercent: 100 });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to add penalty");
      } finally {
        setAddPenaltySubmitting(false);
      }
    },
    [rider, addPenaltyForOrder, addPenaltyForm]
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-order-menu]")) {
        setOpenMenuOrderId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasSearch = searchValue.length > 0;

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <RiderSectionHeader
        title="Rider Orders"
        description="Use the search in the nav bar to select a rider. Filter by service, status, and date. Add penalty from order actions."
        rider={rider}
        resolveLoading={resolveLoading}
        error={error}
        hasSearch={hasSearch}
      />

      {rider && (
        <>
          <CollapsibleTableFilters
            label="Filters"
            activeCount={[orderType, status, from, to].filter((v) => v && v !== "all").length}
            filterChipsSlot={orderFilterChips.length > 0 ? <FilterChips inline chips={orderFilterChips} onRemove={removeOrderFilter} onClearAll={clearAllOrderFilters} /> : null}
            filterContent={
              <>
                <div className="min-w-[100px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Service</label>
                  <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="all">All</option>
                    <option value="food">Food</option>
                    <option value="parcel">Parcel</option>
                    <option value="person_ride">Person Ride</option>
                  </select>
                </div>
                <div className="min-w-[120px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="all">All</option>
                    <option value="assigned">Assigned</option>
                    <option value="accepted">Accepted</option>
                    <option value="reached_store">Reached Store</option>
                    <option value="picked_up">Picked Up</option>
                    <option value="in_transit">In Transit</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="failed">Failed</option>
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
                <button type="button" onClick={applyFilters} className="px-4 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors h-[34px]">
                  Apply
                </button>
              </>
            }
          >
          <div className="overflow-hidden relative">
            {loading && orders.length === 0 ? (
              <div className="flex justify-center py-12"><LoadingSpinner size="md" text="Loading orders..." /></div>
            ) : (
              <>
                {loading && orders.length > 0 && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-100 z-10">
                    <div className="h-full w-1/3 bg-blue-500 animate-pulse rounded-r" />
                  </div>
                )}
                <div className={`transition-opacity duration-200 ${loading && orders.length > 0 ? "opacity-70 pointer-events-none" : ""}`}>
                  {/* Card layout for small screens */}
                  <div className="block md:hidden space-y-3">
                    {orders.length === 0 ? (
                      <p className="px-4 py-8 text-center text-gray-600 text-sm">No orders found.</p>
                    ) : (
                      orders.map((o) => (
                        <div key={o.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm ring-1 ring-gray-900/5">
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-gray-900">#{o.externalRef || o.id}</p>
                              <p className="text-sm text-gray-500 capitalize">{o.orderType.replace("_", " ")} • {o.status.replace("_", " ")}</p>
                            </div>
                            <OrderRowMenu
                              orderId={o.id}
                              orderType={o.orderType}
                              isOpen={openMenuOrderId === o.id}
                              onToggle={() => setOpenMenuOrderId((id) => (id === o.id ? null : o.id))}
                              onAddPenalty={() => {
                                const orderValue = parseFloat(o.riderEarning || o.fareAmount || "0") || 0;
                                setAddPenaltyForOrder({ orderId: o.id, serviceType: o.orderType, orderValue });
                                setAddPenaltyForm({ reason: "", penaltyPercent: 100 });
                                setOpenMenuOrderId(null);
                              }}
                              onAddAmount={() => {
                                setAddAmountForOrder({ orderId: o.id, serviceType: o.orderType });
                                setOpenMenuOrderId(null);
                              }}
                              addAmountPending={pendingCreditOrderIds.has(o.id)}
                              showAddPenalty={canAddPenaltyForService(o.orderType)}
                            />
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                            <span className="text-gray-600">Fare: <span className="font-medium text-gray-900">₹{o.fareAmount ?? "—"}</span></span>
                            <span className="text-gray-600">Earning: <span className="font-medium text-gray-900">₹{o.riderEarning ?? "—"}</span></span>
                            {(approvedExtraByOrderId.get(o.id) ?? 0) > 0 && (
                              <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 border border-green-200">
                                Extra +₹{(approvedExtraByOrderId.get(o.id) ?? 0).toFixed(2)}
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-xs text-gray-500">{new Date(o.createdAt).toLocaleString()}</p>
                        </div>
                      ))
                    )}
                  </div>
                  {/* Table for md and up */}
                  <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Order ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wide">Fare</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wide">Earning</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Date</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {orders.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-600 text-sm">No orders found.</td></tr>
                    ) : (
                      orders.map((o) => (
                        <tr key={o.id} className="relative hover:bg-gray-50/50">
                          <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">{o.externalRef || o.id}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 capitalize">{o.orderType.replace("_", " ")}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 capitalize">{o.status.replace("_", " ")}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">₹{o.fareAmount ?? "—"}</td>
                          <td className="px-4 py-3 text-sm text-right">
                            <div className="flex flex-col items-end leading-tight">
                              <span className="font-medium text-gray-900">₹{o.riderEarning ?? "—"}</span>
                              {(approvedExtraByOrderId.get(o.id) ?? 0) > 0 && (
                                <span
                                  className="mt-1 inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 border border-green-200"
                                  title="Approved extra amount (add amount) for this order"
                                >
                                  Extra +₹{(approvedExtraByOrderId.get(o.id) ?? 0).toFixed(2)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{new Date(o.createdAt).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">
                            <OrderRowMenu
                              orderId={o.id}
                              orderType={o.orderType}
                              isOpen={openMenuOrderId === o.id}
                              onToggle={() => setOpenMenuOrderId((id) => (id === o.id ? null : o.id))}
                              onAddPenalty={() => {
                                const orderValue = parseFloat(o.riderEarning || o.fareAmount || "0") || 0;
                                setAddPenaltyForOrder({ orderId: o.id, serviceType: o.orderType, orderValue });
                                setAddPenaltyForm({ reason: "", penaltyPercent: 100 });
                                setOpenMenuOrderId(null);
                              }}
                              onAddAmount={() => {
                                setAddAmountForOrder({ orderId: o.id, serviceType: o.orderType });
                                setOpenMenuOrderId(null);
                              }}
                              addAmountPending={pendingCreditOrderIds.has(o.id)}
                              showAddPenalty={canAddPenaltyForService(o.orderType)}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                </div>
                </div>
              </>
            )}
          </div>
          </CollapsibleTableFilters>

          {/* Add Amount modal (from order) */}
          {addAmountForOrder && rider && (
            <AddAmountModal
              riderId={rider.id}
              riderLabel={`Order #${addAmountForOrder.orderId}`}
              open={true}
              onClose={() => { setAddAmountForOrder(null); setError(null); }}
              onSuccess={(requestId) => {
                setPendingCreditOrderIds((prev) => new Set(prev).add(addAmountForOrder.orderId));
              }}
              orderId={addAmountForOrder.orderId}
              serviceType={addAmountForOrder.serviceType as "food" | "parcel" | "person_ride"}
            />
          )}

          {/* Add Penalty modal (from order) */}
          {addPenaltyForOrder && rider && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Add Penalty for Order</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Order #{addPenaltyForOrder.orderId} • {addPenaltyForOrder.serviceType.replace("_", " ")}
                  </p>
                </div>
                <form onSubmit={handleAddPenaltyFromOrder} className="p-4 space-y-4">
                  <div className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    Order ID: <strong className="text-gray-900">{addPenaltyForOrder.orderId}</strong> • Service: <strong className="text-gray-900">{addPenaltyForOrder.serviceType.replace("_", " ")}</strong> • Order value: <strong className="text-gray-900">₹{addPenaltyForOrder.orderValue.toFixed(2)}</strong>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Percentage of order value *</label>
                    <select
                      value={addPenaltyForm.penaltyPercent}
                      onChange={(e) => setAddPenaltyForm((f) => ({ ...f, penaltyPercent: Number(e.target.value) }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white text-gray-900"
                    >
                      <option value={25} className="text-gray-900 bg-white">25%</option>
                      <option value={50} className="text-gray-900 bg-white">50%</option>
                      <option value={75} className="text-gray-900 bg-white">75%</option>
                      <option value={100} className="text-gray-900 bg-white">100% (default)</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-600">
                      Penalty amount: <strong className="text-gray-900">₹{((addPenaltyForOrder.orderValue * addPenaltyForm.penaltyPercent) / 100).toFixed(2)}</strong>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                    <textarea
                      rows={2}
                      required
                      value={addPenaltyForm.reason}
                      onChange={(e) => setAddPenaltyForm((f) => ({ ...f, reason: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white text-gray-900 placeholder:text-gray-500"
                      placeholder="e.g. Order cancellation, late delivery..."
                    />
                  </div>
                  {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => { setAddPenaltyForOrder(null); setError(null); }}
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
        </>
      )}
    </div>
  );
}

function OrderRowMenu({
  orderId,
  orderType,
  isOpen,
  onToggle,
  onAddPenalty,
  onAddAmount,
  showAddPenalty,
  addAmountPending = false,
}: {
  orderId: number;
  orderType: string;
  isOpen: boolean;
  onToggle: () => void;
  onAddPenalty: () => void;
  onAddAmount: () => void;
  showAddPenalty?: boolean;
  addAmountPending?: boolean;
}) {
  const showPenalty = showAddPenalty !== false;
  return (
    <div className="relative inline-block" data-order-menu>
      <button
        type="button"
        onClick={onToggle}
        className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
        aria-label="Order actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-[100] min-w-[160px] rounded-lg border border-gray-200 bg-white shadow-lg py-1 ring-1 ring-gray-900/5">
          {addAmountPending ? (
            <div className="px-3 py-2 text-sm text-amber-700 bg-amber-50 border-b border-amber-100" title="An add amount request is already pending for this order">
              Add amount — request pending
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { onAddAmount(); }}
              className="w-full px-3 py-2 text-left text-sm text-blue-700 hover:bg-blue-50"
            >
              Add amount
            </button>
          )}
          {showPenalty && (
            <button
              type="button"
              onClick={() => { onAddPenalty(); }}
              className="w-full px-3 py-2 text-left text-sm text-amber-700 hover:bg-amber-50"
            >
              Add penalty
            </button>
          )}
        </div>
      )}
    </div>
  );
}
