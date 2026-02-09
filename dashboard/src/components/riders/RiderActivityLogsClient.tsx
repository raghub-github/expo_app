"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { RiderSectionHeader } from "./RiderSectionHeader";
import { CollapsibleTableFilters } from "./CollapsibleTableFilters";
import { FilterChips, type FilterChipItem } from "./FilterChips";
import { TablePagination } from "./TablePagination";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  FileText,
  Clock,
  Package,
  IndianRupee,
  TrendingUp,
  XCircle,
} from "lucide-react";
import Link from "next/link";

interface RiderInfo {
  id: number;
  name: string | null;
  mobile: string;
}

export interface ActivityLogRow {
  date: string;
  serviceType: string;
  totalLoginSeconds: number;
  firstLoginAt: string | null;
  lastLogoutAt: string | null;
  ordersCompleted: number;
  ordersCancelled: number;
  earningsOrders: number;
  earningsOffers: number;
  earningsIncentives: number;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}

function formatDate(d: string): string {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function serviceLabel(s: string): string {
  const map: Record<string, string> = {
    food: "Food",
    parcel: "Parcel",
    person_ride: "Person Ride",
  };
  return map[s] || s;
}

export function RiderActivityLogsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const riderContext = useRiderDashboardOptional();
  const searchValue = (searchParams.get("search") || "").trim();
  const [searchInput, setSearchInput] = useState(searchValue);
  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [period, setPeriod] = useState(searchParams.get("period") || "week");
  const [serviceType, setServiceType] = useState(
    searchParams.get("serviceType") || "all"
  );
  const [from, setFrom] = useState(searchParams.get("from") || "");
  const [to, setTo] = useState(searchParams.get("to") || "");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<ActivityLogRow[]>([]);
  const [totalsFromApi, setTotalsFromApi] = useState<{
    loginSeconds: number;
    completed: number;
    cancelled: number;
    earningsOrders: number;
    earningsOffers: number;
    earningsIncentives: number;
  } | null>(null);
  const [meta, setMeta] = useState<{
    from?: string;
    to?: string;
    period?: string;
    serviceType?: string;
  }>({});

  const resolveRider = useCallback(async (value: string) => {
    if (!value.trim()) {
      setRider(null);
      setRows([]);
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
      if (isRiderId)
        query = query.eq("id", parseInt(value.replace(/^GMR/i, ""), 10));
      else if (isNumeric) query = query.eq("id", parseInt(value, 10));
      else if (isPhone)
        query = query.eq("mobile", value.replace(/^\+?91/, ""));
      else query = query.ilike("mobile", `%${value}%`);
      const { data, error: e } = await query.limit(1).single();
      if (e || !data) {
        setRider(null);
        setRows([]);
        setError("No rider found");
        return;
      }
      setRider({
        id: data.id,
        name: data.name,
        mobile: data.mobile,
      });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to resolve rider"
      );
      setRider(null);
      setRows([]);
    } finally {
      setResolveLoading(false);
    }
  }, []);

  const fetchActivityLogs = useCallback(
    async (riderId: number) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (period) params.set("period", period);
        if (serviceType && serviceType !== "all")
          params.set("serviceType", serviceType);
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        params.set("limit", String(pageSize));
        params.set("offset", String((page - 1) * pageSize));
        const res = await fetch(
          `/api/riders/${riderId}/activity-logs?${params.toString()}`
        );
        const json = await res.json();
        if (!res.ok || !json.success)
          throw new Error(json.error || "Failed to load activity logs");
        setRows(json.data?.rows ?? []);
        setTotal(json.data?.total ?? 0);
        setTotalsFromApi(json.data?.totals ?? null);
        setMeta({
          from: json.data?.from,
          to: json.data?.to,
          period: json.data?.period,
          serviceType: json.data?.serviceType,
        });
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to load activity logs"
        );
        setRows([]);
        setTotal(0);
        setTotalsFromApi(null);
      } finally {
        setLoading(false);
      }
    },
    [period, serviceType, from, to, page, pageSize]
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
      setRows([]);
      setError(null);
    }
  }, [searchValue, riderFromContext?.id, resolveRider]);

  useEffect(() => {
    if (rider) fetchActivityLogs(rider.id);
  }, [rider, fetchActivityLogs]);

  useEffect(() => {
    setPeriod(searchParams.get("period") || "week");
    setServiceType(searchParams.get("serviceType") || "all");
    setFrom(searchParams.get("from") || "");
    setTo(searchParams.get("to") || "");
  }, [searchParams]);

  useEffect(() => {
    setPage(1);
  }, [period, serviceType, from, to]);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  }, []);

  const applyFilters = (overrides?: {
    period?: string;
    serviceType?: string;
    from?: string;
    to?: string;
  }) => {
    const o = overrides ?? {};
    const p = o.period ?? period;
    const svc = o.serviceType ?? serviceType;
    const fr = o.from ?? from;
    const t = o.to ?? to;
    setPage(1);
    const urlParams = new URLSearchParams();
    if (searchValue) urlParams.set("search", searchValue);
    if (p) urlParams.set("period", p);
    if (svc && svc !== "all") urlParams.set("serviceType", svc);
    if (fr) urlParams.set("from", fr);
    if (t) urlParams.set("to", t);
    router.push(`/dashboard/riders/activity-logs?${urlParams.toString()}`);
    if (overrides) {
      setPeriod(p);
      setServiceType(svc);
      setFrom(fr);
      setTo(t);
    }
  };

  const activityFilterChips: FilterChipItem[] = [];
  if (period && period !== "day") activityFilterChips.push({ id: "period", label: `Period: ${period}` });
  if (serviceType && serviceType !== "all")
    activityFilterChips.push({
      id: "serviceType",
      label: `Service: ${serviceLabel(serviceType)}`,
    });
  if (from) activityFilterChips.push({ id: "from", label: `From: ${from}` });
  if (to) activityFilterChips.push({ id: "to", label: `To: ${to}` });

  const removeActivityFilter = (id: string) => {
    applyFilters({
      period: id === "period" ? "day" : period,
      serviceType: id === "serviceType" ? "all" : serviceType,
      from: id === "from" ? "" : from,
      to: id === "to" ? "" : to,
    });
  };
  const clearAllActivityFilters = () => {
    applyFilters({ period: "week", serviceType: "all", from: "", to: "" });
  };

  const hasSearch = searchValue.length > 0;
  const activeFilterCount = [period !== "day", serviceType !== "all", from, to].filter(
    Boolean
  ).length;

  const totals = totalsFromApi ?? rows.reduce(
    (acc, r) => ({
      loginSeconds: acc.loginSeconds + r.totalLoginSeconds,
      completed: acc.completed + r.ordersCompleted,
      cancelled: acc.cancelled + r.ordersCancelled,
      earningsOrders: acc.earningsOrders + r.earningsOrders,
      earningsOffers: acc.earningsOffers + r.earningsOffers,
      earningsIncentives: acc.earningsIncentives + r.earningsIncentives,
    }),
    { loginSeconds: 0, completed: 0, cancelled: 0, earningsOrders: 0, earningsOffers: 0, earningsIncentives: 0 }
  );

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <RiderSectionHeader
        title="Activity Logs"
        description="Rider login time, service, orders completed/cancelled, and earnings."
        rider={rider}
        resolveLoading={resolveLoading}
        error={error}
        hasSearch={hasSearch}
        actionButtons={
          rider ? (
            <Link
              href={`/dashboard/riders/wallet-history?search=${rider.id}`}
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              View Wallet History
            </Link>
          ) : null
        }
      />

      {rider && (
        <>
          <CollapsibleTableFilters
            label="Filters"
            activeCount={activeFilterCount}
            filterChipsSlot={
              <FilterChips
                inline
                chips={activityFilterChips}
                onRemove={removeActivityFilter}
                onClearAll={clearAllActivityFilters}
              />
            }
            trailingSlot={
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
                  total={total}
                  onPageChange={setPage}
                  disabled={loading}
                  ariaLabel="Activity logs"
                  compact
                />
              </>
            }
            filterContent={
              <>
                <div className="min-w-[100px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">
                    Period
                  </label>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="day">Today</option>
                    <option value="week">This week</option>
                    <option value="month">This month</option>
                    <option value="year">This year</option>
                  </select>
                </div>
                <div className="min-w-[120px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">
                    Service
                  </label>
                  <select
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All</option>
                    <option value="food">Food</option>
                    <option value="parcel">Parcel</option>
                    <option value="person_ride">Person Ride</option>
                  </select>
                </div>
                <div className="min-w-[120px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">
                    From
                  </label>
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="min-w-[120px]">
                  <label className="block text-xs font-medium text-gray-600 mb-0.5">
                    To
                  </label>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {/* <button
                  type="button"
                  onClick={() => applyFilters()}
                  className="px-4 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors h-[34px] shrink-0"
                >
                  Apply
                </button> */}
                <button
                  type="button"
                  onClick={clearAllActivityFilters}
                  className="px-4 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors h-[34px] shrink-0"
                >
                  Clear
                </button>
              </>
            }
          >
            <div className="overflow-hidden relative min-h-[200px]">
              {loading && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 rounded-b-2xl">
                  <LoadingSpinner className="h-8 w-8 text-gray-600" />
                </div>
              )}

              {!loading && rows.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 mb-4">
                    <FileText className="h-7 w-7" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">
                    No activity in this range
                  </h2>
                  <p className="text-sm text-gray-500 max-w-md mb-4">
                    No duty logs, orders, or earnings found for GMR{rider.id} in
                    the selected period. Try a different date range or service.
                  </p>
                  <Link
                    href={`/dashboard/riders/wallet-history?search=${rider.id}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
                  >
                    View Wallet History
                  </Link>
                </div>
              )}

              {!loading && rows.length > 0 && (
                <div className="p-4 sm:p-6">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-6">
                    <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 sm:p-4">
                      <div className="flex items-center gap-2 text-gray-500 mb-1">
                        <Clock className="h-4 w-4" />
                        <span className="text-xs font-medium">Login time</span>
                      </div>
                      <p className="text-lg sm:text-xl font-semibold text-gray-900">
                        {formatDuration(totals.loginSeconds)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 sm:p-4">
                      <div className="flex items-center gap-2 text-gray-500 mb-1">
                        <Package className="h-4 w-4" />
                        <span className="text-xs font-medium">Completed</span>
                      </div>
                      <p className="text-lg sm:text-xl font-semibold text-gray-900">
                        {totals.completed}
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 sm:p-4">
                      <div className="flex items-center gap-2 text-gray-500 mb-1">
                        <XCircle className="h-4 w-4" />
                        <span className="text-xs font-medium">Cancelled</span>
                      </div>
                      <p className="text-lg sm:text-xl font-semibold text-gray-900">
                        {totals.cancelled}
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-emerald-50/80 p-3 sm:p-4">
                      <div className="flex items-center gap-2 text-emerald-600 mb-1">
                        <IndianRupee className="h-4 w-4" />
                        <span className="text-xs font-medium">Orders</span>
                      </div>
                      <p className="text-lg sm:text-xl font-semibold text-emerald-800">
                        ₹{Number(totals.earningsOrders).toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-blue-50/80 p-3 sm:p-4">
                      <div className="flex items-center gap-2 text-blue-600 mb-1">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-xs font-medium">Offers</span>
                      </div>
                      <p className="text-lg sm:text-xl font-semibold text-blue-800">
                        ₹{Number(totals.earningsOffers).toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-violet-50/80 p-3 sm:p-4">
                      <div className="flex items-center gap-2 text-violet-600 mb-1">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-xs font-medium">Incentives</span>
                      </div>
                      <p className="text-lg sm:text-xl font-semibold text-violet-800">
                        ₹{Number(totals.earningsIncentives).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Desktop table */}
                  <div className="hidden lg:block overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Service</th>
                          <th className="px-4 py-3">Login time</th>
                          <th className="px-4 py-3">First login</th>
                          <th className="px-4 py-3">Last logout</th>
                          <th className="px-4 py-3">Completed</th>
                          <th className="px-4 py-3">Cancelled</th>
                          <th className="px-4 py-3">Earnings (orders)</th>
                          <th className="px-4 py-3">Offers</th>
                          <th className="px-4 py-3">Incentives</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map((r, i) => (
                          <tr
                            key={`${r.date}-${r.serviceType}-${i}`}
                            className="hover:bg-gray-50/80"
                          >
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {formatDate(r.date)}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {serviceLabel(r.serviceType)}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {formatDuration(r.totalLoginSeconds)}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {formatTime(r.firstLoginAt)}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {formatTime(r.lastLogoutAt)}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {r.ordersCompleted}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {r.ordersCancelled}
                            </td>
                            <td className="px-4 py-3 text-emerald-700 font-medium">
                              ₹{Number(r.earningsOrders).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-blue-700">
                              ₹{Number(r.earningsOffers).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-violet-700">
                              ₹{Number(r.earningsIncentives).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="lg:hidden space-y-3">
                    {rows.map((r, i) => (
                      <div
                        key={`${r.date}-${r.serviceType}-${i}`}
                        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-2"
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-semibold text-gray-900">
                            {formatDate(r.date)}
                          </span>
                          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {serviceLabel(r.serviceType)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-500">Login</span>
                            <p className="font-medium text-gray-900">
                              {formatDuration(r.totalLoginSeconds)}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">First / Last</span>
                            <p className="font-medium text-gray-700">
                              {formatTime(r.firstLoginAt)} /{" "}
                              {formatTime(r.lastLogoutAt)}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Completed</span>
                            <p className="font-medium text-gray-900">
                              {r.ordersCompleted}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Cancelled</span>
                            <p className="font-medium text-gray-900">
                              {r.ordersCancelled}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Orders earn.</span>
                            <p className="font-medium text-emerald-700">
                              ₹{Number(r.earningsOrders).toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Offers</span>
                            <p className="font-medium text-blue-700">
                              ₹{Number(r.earningsOffers).toFixed(2)}
                            </p>
                          </div>
                          <div className="col-span-2">
                            <span className="text-gray-500">Incentives</span>
                            <p className="font-medium text-violet-700">
                              ₹{Number(r.earningsIncentives).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleTableFilters>
        </>
      )}

      {!rider && !resolveLoading && !searchValue && (
        <div className="rounded-2xl border border-gray-200/90 bg-white p-6 sm:p-8 shadow-sm ring-1 ring-gray-900/5">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 mb-4">
              <FileText className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Select a rider
            </h2>
            <p className="text-sm text-gray-500 max-w-md">
              Use the search in the nav bar to select a rider. Activity logs will
              show login time, service, orders, and earnings for the selected
              period.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
