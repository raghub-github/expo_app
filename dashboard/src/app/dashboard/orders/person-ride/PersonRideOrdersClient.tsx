"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, Filter, User, Car } from "lucide-react";
import { normalizePersonRideSearchType } from "@/lib/orders/person-ride-search";
import { formatRiderOrderStatusDisplayLabel } from "@/lib/riders/rider-order-status-display";
import { loadClientSnapshot, saveClientSnapshot } from "@/lib/client-route-snapshot";
import {
  endOrderListSearch,
  getOrderListSearchSnapshot,
  ORDER_LIST_SEARCH_REPEAT_EVENT,
  useOrderListSearchPending,
} from "@/lib/orders/order-list-search-ui";

const PAGE_BG = "#f3f5f7";
const CONTENT_BG = "#FFFFFF";
const ACCENT = "#121212";
const ACCENT_TEXT = "#FFFFFF";
const INACTIVE_BG = "#eef1f4";
const INACTIVE_TEXT = "#121212";
const BORDER_COLOR = "rgba(18,18,18,0.12)";
const DARK_TEXT = "#121212";
const TABLE_TEXT = "#121212";
const ORDER_TAG_BG = "#E8F0FE";
const ORDER_TAG_TEXT = "#1E40AF";

type PersonRideOrder = {
  id: number;
  formattedOrderId: string | null;
  status: string;
  currentStatus: string | null;
  passengerName: string | null;
  passengerPhone: string | null;
  customerName: string | null;
  customerMobile: string | null;
  rideType: string | null;
  vehicleTypeRequired: string | null;
  pickupAddress: string | null;
  dropAddress: string | null;
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  fare: number | null;
  createdAt: string;
};

type ApiResponse = {
  success: boolean;
  data?: PersonRideOrder[];
  pagination?: { page: number; limit: number; total: number; totalPages?: number };
  error?: string;
};

type StatusTab = {
  value: string;
  label: string;
};

const STATUS_TABS: StatusTab[] = [
  { value: "", label: "ALL" },
  { value: "assigned", label: "ASSIGNED" },
  { value: "accepted", label: "ACCEPTED" },
  { value: "reached_store", label: "REACHED PICKUP" },
  { value: "picked_up", label: "PICKED UP" },
  { value: "in_transit", label: "IN TRANSIT" },
];

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  assigned: { bg: "#FEF3C7", text: "#92400E" },
  accepted: { bg: "#DBEAFE", text: "#1E40AF" },
  reached_store: { bg: "#EDE9FE", text: "#5B21B6" },
  picked_up: { bg: "#E0E7FF", text: "#3730A3" },
  in_transit: { bg: "#CFFAFE", text: "#0E7490" },
  delivered: { bg: "#D1FAE5", text: "#065F46" },
  cancelled: { bg: "#FEE2E2", text: "#991B1B" },
};

function formatStatus(order: PersonRideOrder): string {
  const raw = order.currentStatus?.trim() || order.status?.trim() || "—";
  return formatRiderOrderStatusDisplayLabel(raw, "person_ride");
}

function formatVehicleType(order: PersonRideOrder): string {
  const raw = order.rideType?.trim() || order.vehicleTypeRequired?.trim() || "—";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPassenger(order: PersonRideOrder): { name: string; phone: string | null } {
  const name =
    order.passengerName?.trim() ||
    order.customerName?.trim() ||
    "—";
  const phone = order.passengerPhone?.trim() || order.customerMobile?.trim() || null;
  return { name, phone };
}

function truncate(text: string | null, max = 36): string {
  if (!text?.trim()) return "—";
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function formatFare(fare: number | null): string {
  if (fare == null || !Number.isFinite(fare)) return "—";
  return `₹${Math.round(fare).toLocaleString("en-IN")}`;
}

function displayOrderId(order: PersonRideOrder): string {
  const formatted = order.formattedOrderId?.trim();
  if (formatted) return formatted.replace(/^#/, "");
  return `GMP${String(order.id).padStart(6, "0")}`;
}

export type PersonRideOrdersFilters = {
  page: number;
  limit: number;
  status: string;
  dateFrom: string;
  dateTo: string;
  search: string;
  searchType: string;
};

export async function fetchPersonRideOrders(
  params: PersonRideOrdersFilters,
  signal?: AbortSignal
): Promise<{ orders: PersonRideOrder[]; total: number; page: number; limit: number; totalPages: number }> {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  qs.set("limit", String(params.limit));
  if (params.status) qs.set("status", params.status);
  if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params.dateTo) qs.set("dateTo", params.dateTo);
  if (params.search) qs.set("search", params.search);
  if (params.searchType) qs.set("searchType", params.searchType);

  const res = await fetch(`/api/orders/person-ride?${qs.toString()}`, {
    credentials: "include",
    signal,
  });
  const body: ApiResponse = await res.json().catch(() => ({ success: false }));

  if (!res.ok || !body.success || !Array.isArray(body.data)) {
    throw new Error(body.error || "Failed to load orders");
  }

  return {
    orders: body.data,
    total: body.pagination?.total ?? body.data.length,
    page: body.pagination?.page ?? params.page,
    limit: body.pagination?.limit ?? params.limit,
    totalPages: body.pagination?.totalPages ?? 1,
  };
}

function getButtonStyles(isActive: boolean) {
  if (isActive) {
    return { backgroundColor: ACCENT, color: ACCENT_TEXT, borderColor: ACCENT };
  }
  return { backgroundColor: INACTIVE_BG, color: INACTIVE_TEXT, borderColor: BORDER_COLOR };
}

export default function PersonRideOrdersClient() {
  const router = useRouter();
  const searchParams = useAppSearchParams();
  const queryClient = useQueryClient();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => setHasMounted(true), []);

  const urlStatus = searchParams.get("status") ?? "";
  const urlSearch = searchParams.get("search") ?? "";
  const urlSearchType = normalizePersonRideSearchType(searchParams.get("searchType"));
  const urlDateFrom = searchParams.get("dateFrom") ?? "";
  const urlDateTo = searchParams.get("dateTo") ?? "";
  const urlPage = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  const [dateFrom, setDateFrom] = useState(urlDateFrom);
  const [dateTo, setDateTo] = useState(urlDateTo);

  useEffect(() => {
    setDateFrom(urlDateFrom);
    setDateTo(urlDateTo);
  }, [urlDateFrom, urlDateTo]);

  // Ops board no longer lists completed/cancelled tabs — clear stale URL status.
  useEffect(() => {
    if (urlStatus !== "delivered" && urlStatus !== "cancelled") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("status");
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `/dashboard/orders/person-ride?${qs}` : "/dashboard/orders/person-ride", {
      scroll: false,
    });
  }, [urlStatus, searchParams, router]);

  const limit = 20;

  const filtersForQuery: PersonRideOrdersFilters = useMemo(
    () => ({
      page: urlPage,
      limit,
      status: urlStatus,
      dateFrom: urlDateFrom,
      dateTo: urlDateTo,
      search: urlSearch.trim(),
      searchType: urlSearchType,
    }),
    [urlPage, limit, urlStatus, urlDateFrom, urlDateTo, urlSearch, urlSearchType]
  );

  const queryKey = useMemo(
    () => ["person-ride-orders", filtersForQuery] as const,
    [filtersForQuery]
  );

  const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
  const snapshotKey = useMemo(
    () => `dashboard_snapshot:person_ride_orders:/dashboard/orders/person-ride:${JSON.stringify(filtersForQuery)}`,
    [filtersForQuery]
  );

  const cachedListData = useMemo(() => {
    if (!hasMounted) return null;
    return queryClient.getQueryData<Awaited<ReturnType<typeof fetchPersonRideOrders>>>(queryKey) ?? null;
  }, [hasMounted, queryClient, queryKey]);

  const initialSnapshot = useMemo(() => {
    if (!hasMounted) return null;
    return loadClientSnapshot<Awaited<ReturnType<typeof fetchPersonRideOrders>>>(snapshotKey, SNAPSHOT_TTL_MS);
  }, [hasMounted, snapshotKey]);

  const initialListData = cachedListData ?? initialSnapshot ?? undefined;

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchPersonRideOrders(filtersForQuery, signal),
    enabled: hasMounted,
    ...(initialListData != null ? { initialData: initialListData } : {}),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    placeholderData: (previousData) => previousData,
  });
  const searchPending = useOrderListSearchPending();
  const sawSearchFetchRef = useRef(false);

  useEffect(() => {
    if (!searchPending) {
      sawSearchFetchRef.current = false;
      return;
    }
    if (isFetching) sawSearchFetchRef.current = true;
    const submitted = getOrderListSearchSnapshot().query;
    if ((urlSearch ?? "") !== submitted) return;
    if (!sawSearchFetchRef.current || isFetching) return;
    endOrderListSearch();
  }, [searchPending, urlSearch, isFetching]);

  useEffect(() => {
    const onRepeat = () => {
      void refetch();
    };
    window.addEventListener(ORDER_LIST_SEARCH_REPEAT_EVENT, onRepeat);
    return () => window.removeEventListener(ORDER_LIST_SEARCH_REPEAT_EVENT, onRepeat);
  }, [refetch]);

  useEffect(() => {
    if (!snapshotKey || data == null) return;
    saveClientSnapshot(snapshotKey, data);
  }, [snapshotKey, data]);

  const orders = data?.orders ?? cachedListData?.orders ?? initialSnapshot?.orders ?? [];
  const total = data?.total ?? cachedListData?.total ?? initialSnapshot?.total ?? 0;
  const totalPages = data?.totalPages ?? cachedListData?.totalPages ?? initialSnapshot?.totalPages ?? 1;
  const showTableLoading = hasMounted && ((isLoading && orders.length === 0) || searchPending);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const isRefreshing = manualRefreshing || (hasMounted && isFetching && orders.length > 0);

  const replaceParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === "") params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.replace(qs ? `/dashboard/orders/person-ride?${qs}` : "/dashboard/orders/person-ride", {
        scroll: false,
      });
    },
    [router, searchParams]
  );

  const setStatusFilter = useCallback(
    (status: string) => {
      replaceParams({ status: status || null, page: null });
    },
    [replaceParams]
  );

  const applyDateFilters = useCallback(() => {
    replaceParams({
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      page: null,
    });
  }, [replaceParams, dateFrom, dateTo]);

  const clearDateFilters = useCallback(() => {
    setDateFrom("");
    setDateTo("");
    replaceParams({ dateFrom: null, dateTo: null, page: null });
  }, [replaceParams]);

  const activeTab = STATUS_TABS.find((t) => t.value === urlStatus) ?? STATUS_TABS[0];
  const hasActiveSearch = Boolean(urlSearch.trim());
  const hasDateFilter = Boolean(urlDateFrom || urlDateTo);

  return (
    <div
      className="orders-typo space-y-2 w-full max-w-full min-h-full overflow-x-hidden"
      style={{ backgroundColor: PAGE_BG }}
    >
      {/* Date filters */}
      <div
        className="rounded-xl border p-2 shadow-[0_1px_3px_rgba(18,18,18,0.04)]"
        style={{ backgroundColor: CONTENT_BG, borderColor: BORDER_COLOR }}
      >
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Date from</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-7 px-2 text-xs border rounded-md"
              style={{ borderColor: BORDER_COLOR }}
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Date to</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-7 px-2 text-xs border rounded-md"
              style={{ borderColor: BORDER_COLOR }}
            />
          </div>
          <button
            type="button"
            onClick={applyDateFilters}
            className="h-7 px-3 rounded-md text-xs font-semibold border cursor-pointer"
            style={{ backgroundColor: ACCENT, color: ACCENT_TEXT, borderColor: ACCENT }}
          >
            Apply
          </button>
          {hasDateFilter ? (
            <button
              type="button"
              onClick={clearDateFilters}
              className="h-7 px-3 rounded-md text-xs font-medium border cursor-pointer"
              style={{ backgroundColor: CONTENT_BG, borderColor: BORDER_COLOR, color: INACTIVE_TEXT }}
            >
              Clear dates
            </button>
          ) : null}
          {hasActiveSearch ? (
            <span className="ml-auto text-[11px] text-gray-600">
              Search: <strong>{urlSearchType}</strong> = &quot;{urlSearch}&quot;
            </span>
          ) : (
            <span className="ml-auto text-[11px] text-gray-500">
              Use header search — Order Id, Passenger, Rider…
            </span>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div className="p-2 mt-1" style={{ backgroundColor: CONTENT_BG }}>
        <div className="flex items-center gap-1.5 w-full overflow-x-auto">
          {STATUS_TABS.map((tab) => {
            const isActive = tab.value === urlStatus;
            return (
              <button
                key={tab.value || "all"}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`shrink-0 px-2.5 py-1.5 rounded-md text-[11px] transition-colors border cursor-pointer ${
                  isActive ? "font-bold" : "font-medium"
                }`}
                style={getButtonStyles(isActive)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex items-center justify-between p-2" style={{ backgroundColor: CONTENT_BG }}>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-blue-600" />
          <span className="text-xs font-medium" style={{ color: DARK_TEXT }}>
            {activeTab.label} — {total.toLocaleString("en-IN")} ride{total === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setManualRefreshing(true);
              void Promise.resolve(refetch()).finally(() => setManualRefreshing(false));
            }}
            disabled={isFetching && orders.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer disabled:opacity-60"
            style={{ backgroundColor: ACCENT, color: ACCENT_TEXT, borderColor: ACCENT }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {(hasDateFilter || hasActiveSearch) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                replaceParams({
                  dateFrom: null,
                  dateTo: null,
                  search: null,
                  searchType: null,
                  page: null,
                });
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer"
              style={{ backgroundColor: CONTENT_BG, borderColor: BORDER_COLOR, color: INACTIVE_TEXT }}
            >
              <Filter className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div
        className="overflow-x-auto"
        style={{ backgroundColor: CONTENT_BG, maxHeight: 420, overflowY: "auto" }}
      >
        <table className="min-w-full divide-y divide-gray-200 text-[11px]">
          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr>
              {[
                "Order",
                "Passenger",
                "Vehicle",
                "Pickup",
                "Drop",
                "Rider",
                "Status",
                "Fare",
                "Created",
              ].map((label) => (
                <th
                  key={label}
                  className="px-2 py-1.5 text-left font-medium whitespace-nowrap"
                  style={{ color: DARK_TEXT }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200" style={{ backgroundColor: CONTENT_BG }}>
            {showTableLoading ? (
              <tr>
                <td colSpan={9} className="px-2 py-8 text-center text-xs text-gray-500">
                  {searchPending ? "Searching…" : "Loading orders…"}
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={9} className="px-2 py-4 text-center text-xs text-red-600">
                  {(error as Error)?.message || "Failed to load orders"}
                </td>
              </tr>
            ) : orders.length === 0 ? (
              hasActiveSearch || hasDateFilter ? (
                <tr>
                  <td colSpan={9} className="px-2 py-6 text-center text-xs" style={{ color: TABLE_TEXT }}>
                    {hasActiveSearch
                      ? `No rides found for ${urlSearchType}: "${urlSearch}"`
                      : "No person ride orders found for these dates."}
                  </td>
                </tr>
              ) : null
            ) : (
              orders.map((order) => {
                const publicId = displayOrderId(order);
                const passenger = formatPassenger(order);
                const statusKey = (order.status || "").toLowerCase();
                const badge = STATUS_BADGE[statusKey] ?? { bg: "#F3F4F6", text: "#374151" };

                return (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <Link
                        href={`/order/${encodeURIComponent(publicId)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        prefetch={false}
                        className="inline-flex items-center px-2 py-0.5 rounded font-semibold cursor-pointer hover:underline text-[11px]"
                        style={{ backgroundColor: ORDER_TAG_BG, color: ORDER_TAG_TEXT }}
                      >
                        #{publicId}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5" style={{ color: TABLE_TEXT }}>
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3 shrink-0 text-gray-400" />
                        <div>
                          <div className="font-medium">{passenger.name}</div>
                          {passenger.phone ? (
                            <div className="text-[10px] text-gray-500">{passenger.phone}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: TABLE_TEXT }}>
                      <span className="inline-flex items-center gap-1">
                        <Car className="h-3 w-3 text-gray-400" />
                        {formatVehicleType(order)}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 max-w-[160px] truncate" style={{ color: TABLE_TEXT }} title={order.pickupAddress ?? undefined}>
                      {truncate(order.pickupAddress)}
                    </td>
                    <td className="px-2 py-1.5 max-w-[160px] truncate" style={{ color: TABLE_TEXT }} title={order.dropAddress ?? undefined}>
                      {truncate(order.dropAddress)}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: TABLE_TEXT }}>
                      {order.riderName?.trim() ? (
                        <div>
                          <div>{order.riderName.trim()}</div>
                          {order.riderMobile ? (
                            <div className="text-[10px] text-gray-500">{order.riderMobile}</div>
                          ) : order.riderId != null ? (
                            <div className="text-[10px] text-gray-500">GMR{order.riderId}</div>
                          ) : null}
                        </div>
                      ) : order.riderId != null ? (
                        `GMR${order.riderId}`
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span
                        className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{ backgroundColor: badge.bg, color: badge.text }}
                      >
                        {formatStatus(order)}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap font-semibold" style={{ color: TABLE_TEXT }}>
                      {formatFare(order.fare)}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-[10px] text-gray-600">
                      {new Date(order.createdAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between p-2" style={{ backgroundColor: CONTENT_BG }}>
          <button
            type="button"
            disabled={urlPage <= 1 || isFetching}
            onClick={() => replaceParams({ page: urlPage <= 2 ? null : String(urlPage - 1) })}
            className="px-3 py-1.5 text-xs border rounded-md disabled:opacity-50 hover:bg-gray-50 cursor-pointer"
            style={{ borderColor: BORDER_COLOR }}
          >
            Previous
          </button>
          <span className="text-xs text-gray-600">
            Page {urlPage} of {totalPages}
          </span>
          <button
            type="button"
            disabled={urlPage >= totalPages || isFetching}
            onClick={() => replaceParams({ page: String(urlPage + 1) })}
            className="px-3 py-1.5 text-xs border rounded-md disabled:opacity-50 hover:bg-gray-50 cursor-pointer"
            style={{ borderColor: BORDER_COLOR }}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
