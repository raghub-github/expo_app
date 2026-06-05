"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

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

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "assigned", label: "Assigned / Searching" },
  { value: "accepted", label: "Accepted" },
  { value: "reached_store", label: "Reached Pickup" },
  { value: "picked_up", label: "Picked Up" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

function formatStatus(order: PersonRideOrder): string {
  const raw = order.currentStatus?.trim() || order.status?.trim() || "—";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatVehicleType(order: PersonRideOrder): string {
  const raw = order.rideType?.trim() || order.vehicleTypeRequired?.trim() || "—";
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPassenger(order: PersonRideOrder): string {
  if (order.passengerName?.trim()) return order.passengerName.trim();
  if (order.customerName?.trim()) return order.customerName.trim();
  if (order.passengerPhone?.trim()) return order.passengerPhone.trim();
  if (order.customerMobile?.trim()) return order.customerMobile.trim();
  return "—";
}

function truncate(text: string | null, max = 42): string {
  if (!text?.trim()) return "—";
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function formatFare(fare: number | null): string {
  if (fare == null || !Number.isFinite(fare)) return "—";
  return `₹${Math.round(fare).toLocaleString("en-IN")}`;
}

async function fetchPersonRideOrders(params: {
  page: number;
  limit: number;
  status: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}): Promise<{ orders: PersonRideOrder[]; total: number; page: number; limit: number; totalPages: number }> {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  qs.set("limit", String(params.limit));
  if (params.status) qs.set("status", params.status);
  if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params.dateTo) qs.set("dateTo", params.dateTo);
  if (params.search) qs.set("search", params.search);

  const res = await fetch(`/api/orders/person-ride?${qs.toString()}`, { credentials: "include" });
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

export default function PersonRideOrdersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "");
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const [page, setPage] = useState(Math.max(1, parseInt(searchParams.get("page") || "1", 10)));

  const limit = 20;

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const syncUrl = useCallback(
    (next: { status: string; dateFrom: string; dateTo: string; search: string; page: number }) => {
      const qs = new URLSearchParams();
      if (next.status) qs.set("status", next.status);
      if (next.dateFrom) qs.set("dateFrom", next.dateFrom);
      if (next.dateTo) qs.set("dateTo", next.dateTo);
      if (next.search) qs.set("search", next.search);
      if (next.page > 1) qs.set("page", String(next.page));
      const q = qs.toString();
      router.replace(q ? `/dashboard/orders/person-ride?${q}` : "/dashboard/orders/person-ride", {
        scroll: false,
      });
    },
    [router]
  );

  useEffect(() => {
    syncUrl({ status, dateFrom, dateTo, search, page });
  }, [status, dateFrom, dateTo, search, page, syncUrl]);

  const queryKey = useMemo(
    () => ["person-ride-orders", { status, dateFrom, dateTo, search, page, limit }],
    [status, dateFrom, dateTo, search, page]
  );

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchPersonRideOrders({ page, limit, status, dateFrom, dateTo, search }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value || "all"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Order ID, Passenger, Rider..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              {isLoading ? "Loading…" : `${total.toLocaleString("en-IN")} order${total === 1 ? "" : "s"}`}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    "Order ID",
                    "Passenger",
                    "Vehicle Type",
                    "Pickup",
                    "Drop",
                    "Rider",
                    "Status",
                    "Fare",
                    "Created",
                  ].map((label) => (
                    <th
                      key={label}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                      Loading person ride orders…
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-red-600">
                      {(error as Error)?.message || "Failed to load orders"}
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                      No person ride orders found.
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {order.formattedOrderId?.trim() || `#${order.id}`}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-800">{formatPassenger(order)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {formatVehicleType(order)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 max-w-[220px]">
                        {truncate(order.pickupAddress)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 max-w-[220px]">
                        {truncate(order.dropAddress)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">
                        {order.riderName?.trim() ||
                          (order.riderId != null ? `Rider #${order.riderId}` : "—")}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {formatStatus(order)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatFare(order.fare)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(order.createdAt).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
