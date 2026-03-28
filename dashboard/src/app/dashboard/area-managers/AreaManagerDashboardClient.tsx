"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Store,
  Package,
  MapPin,
  AlertTriangle,
  UserCheck,
  UserX,
  Clock,
  Activity,
  Building2,
  Building,
  Search,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  useGetAreaManagerMetricsQuery,
  useGetAreaManagerCountsQuery,
  useGetAreaManagersQuery,
  type AreaManagerListItem,
} from "@/store/api/areaManagerApi";

const CARD_MIN_HEIGHT = "min-h-[110px]";

interface MerchantMetrics {
  managerType: "MERCHANT";
  isSuperAdmin?: boolean;
  stores: { total: number; verified: number; pending: number; rejected: number; active: number };
  parents: { total: number };
  children: { total: number };
}

interface RiderMetrics {
  managerType: "RIDER";
  isSuperAdmin?: boolean;
  riders: { total: number; active: number; inactive: number; blocked: number };
  availability: { online: number; busy: number; offline: number };
  riderShortageAlerts: Array<{
    localityCode: string | null;
    totalRiders: number;
    activeRiders: number;
    online: number;
    busy: number;
    offline: number;
    isZeroCoverage: boolean;
    isLowAvailability: boolean;
  }>;
}

type MetricsData = MerchantMetrics | RiderMetrics;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

const AreaManagerRow = React.memo(function AreaManagerRow({ am }: { am: AreaManagerListItem }) {
  return (
    <tr>
      <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">
        {am.fullName ?? "—"}
      </td>
      <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">
        {am.email ?? "—"}
      </td>
      <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">
        {am.city ?? "—"}
      </td>
      <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">
        {[am.areaCode, am.localityCode].filter(Boolean).join(" / ") || "—"}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span
          className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
            am.status === "ACTIVE"
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-800"
          }`}
        >
          {am.status}
        </span>
      </td>
    </tr>
  );
});

function SuperAdminAreaManagerList() {
  const [type, setType] = useState<"MERCHANT" | "RIDER">("MERCHANT");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 400);

  const { data: counts } = useQuery<{
    success: boolean;
    data?: { merchant: number; rider: number };
  }>({
    queryKey: ["area-managers", "counts"],
    queryFn: async () => {
      const res = await fetch("/api/area-manager/list/counts", { credentials: "include" });
      const json = await res.json();
      return json;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const { data: merchantListData, isFetching: merchantLoading } = useQuery<{
    success: boolean;
    data?: { items: AreaManagerListItem[] };
  }>({
    queryKey: ["area-managers", "merchant"],
    queryFn: async () => {
      const res = await fetch("/api/area-manager/list?type=MERCHANT", {
        credentials: "include",
      });
      const json = await res.json();
      return json;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
  const { data: riderListData, isFetching: riderLoading } = useQuery<{
    success: boolean;
    data?: { items: AreaManagerListItem[] };
  }>({
    queryKey: ["area-managers", "rider"],
    queryFn: async () => {
      const res = await fetch("/api/area-manager/list?type=RIDER", {
        credentials: "include",
      });
      const json = await res.json();
      return json;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const list: AreaManagerListItem[] = useMemo(() => {
    if (type === "MERCHANT") {
      return merchantListData?.data?.items ?? [];
    }
    return riderListData?.data?.items ?? [];
  }, [type, merchantListData, riderListData]);

  const listLoading = type === "MERCHANT" ? merchantLoading : riderLoading;

  const searchLower = debouncedSearch.trim().toLowerCase();
  const filteredList = useMemo(
    () =>
      searchLower
        ? list.filter(
            (am) =>
              (am.fullName ?? "").toLowerCase().includes(searchLower) ||
              (am.email ?? "").toLowerCase().includes(searchLower) ||
              (am.city ?? "").toLowerCase().includes(searchLower) ||
              (am.areaCode ?? "").toLowerCase().includes(searchLower) ||
              (am.localityCode ?? "").toLowerCase().includes(searchLower)
          )
        : list,
    [list, searchLower]
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Area managers</span>
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-100">
            <button
              type="button"
              onClick={() => setType("MERCHANT")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                type === "MERCHANT"
                  ? "bg-blue-500 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Merchant
            </button>
            <button
              type="button"
              onClick={() => setType("RIDER")}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
                type === "RIDER"
                  ? "bg-blue-500 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Rider
            </button>
          </div>
          {counts?.data && (
            <span className="text-sm text-gray-500">
              {type === "MERCHANT" ? "Merchant" : "Rider"}:{" "}
              <span className="font-medium text-gray-700">
                {type === "MERCHANT" ? counts.data.merchant : counts.data.rider}
              </span>
            </span>
          )}
        </div>
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Search by name, email, city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
      </div>
      {listLoading ? (
        <div className="flex justify-center py-8 table-container min-h-[250px]">
          <LoadingSpinner />
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">No area managers found.</p>
      ) : filteredList.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">
          No matches for &quot;{debouncedSearch.trim()}&quot;.
        </p>
      ) : (
        <div className="overflow-x-auto table-container min-h-[250px]">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  City
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Area / Locality
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredList.map((am) => (
                <AreaManagerRow key={am.id} am={am} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  href,
  subtitle,
  compact = false,
  bgColor = "bg-white",
  iconBgColor = "bg-gray-100",
  iconColor = "text-gray-600",
  textColor = "text-gray-900",
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  subtitle?: string;
  compact?: boolean;
  bgColor?: string;
  iconBgColor?: string;
  iconColor?: string;
  textColor?: string;
}) {
  const content = (
    <div
      className={`rounded-lg border border-gray-200 ${bgColor} h-full flex flex-col ${
        compact ? "p-3" : "p-6"
      } ${CARD_MIN_HEIGHT} transition-all duration-200`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-gray-600 mb-0.5 ${compact ? "text-xs" : "text-sm"}`}>
            {title}
          </p>
          <p className={`font-semibold ${textColor} ${compact ? "text-xl" : "text-3xl"}`}>
            {value}
          </p>
          {subtitle != null && (
            <p className={`mt-0.5 text-gray-500 ${compact ? "text-[10px]" : "text-xs"}`}>
              {subtitle}
            </p>
          )}
        </div>
        <div className={`rounded-md ${iconBgColor} flex-shrink-0 ${compact ? "p-1.5" : "p-2"}`}>
          <Icon className={`${iconColor} ${compact ? "h-4 w-4" : "h-5 w-5"}`} />
        </div>
      </div>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block transition hover:shadow-md">
        {content}
      </Link>
    );
  }
  return content;
}

export function AreaManagerDashboardClient() {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isFetching,
    error,
  } = useQuery<{
    success: boolean;
    data?: MetricsData;
  }>({
    queryKey: ["area-managers", "metrics"],
    queryFn: async () => {
      const res = await fetch("/api/area-manager/metrics", { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Failed to load metrics");
      }
      return json;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  // Preload both merchant and rider lists so tab switching feels instant.
  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ["area-managers", "merchant"],
      queryFn: async () => {
        const res = await fetch("/api/area-manager/list?type=MERCHANT", {
          credentials: "include",
        });
        return res.json();
      },
    });
    queryClient.prefetchQuery({
      queryKey: ["area-managers", "rider"],
      queryFn: async () => {
        const res = await fetch("/api/area-manager/list?type=RIDER", {
          credentials: "include",
        });
        return res.json();
      },
    });
  }, [queryClient]);

  if (isLoading && !data) {    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-800">
          {error instanceof Error ? error.message : String(error)}
        </p>      </div>
    );
  }

  if (!data?.data) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-gray-500">No metrics available.</p>
      </div>
    );
  }

  const metrics = data.data;

  if (metrics.managerType === "MERCHANT") {
    const merchantData = metrics as MerchantMetrics;
    const isSuperAdmin = !!merchantData.isSuperAdmin;

    const cardsGrid = (
      <div
        className={
          isSuperAdmin
            ? "grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
            : "grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        }
      >
        <StatCard
          title="Parent Stores"
          value={merchantData.parents.total}
          icon={Building2}
          href="/dashboard/area-managers/stores?filter=parent"
          compact={isSuperAdmin}
          bgColor="bg-white"
          iconBgColor="bg-gray-100"
          iconColor="text-gray-600"
          textColor="text-gray-900"
        />
        <StatCard
          title="Child Stores"
          value={merchantData.children.total}
          icon={Building}
          href="/dashboard/area-managers/stores?filter=child"
          compact={isSuperAdmin}
          bgColor="bg-white"
          iconBgColor="bg-gray-100"
          iconColor="text-gray-600"
          textColor="text-gray-900"
        />
        <StatCard
          title="Verified Stores"
          value={merchantData.stores.verified}
          icon={UserCheck}
          href="/dashboard/area-managers/stores?status=VERIFIED"
          compact={isSuperAdmin}
          bgColor="bg-white"
          iconBgColor="bg-gray-100"
          iconColor="text-gray-600"
          textColor="text-gray-900"
        />
        <StatCard
          title="Rejected Stores"
          value={merchantData.stores.rejected}
          icon={UserX}
          href="/dashboard/area-managers/stores?status=REJECTED"
          compact={isSuperAdmin}
          bgColor="bg-white"
          iconBgColor="bg-gray-100"
          iconColor="text-gray-600"
          textColor="text-gray-900"
        />
        <StatCard
          title="Pending Stores"
          value={merchantData.stores.pending}
          icon={Clock}
          href="/dashboard/area-managers/stores?status=PENDING"
          compact={isSuperAdmin}
          bgColor="bg-white"
          iconBgColor="bg-gray-100"
          iconColor="text-gray-600"
          textColor="text-gray-900"
        />
        <StatCard
          title="Active Stores"
          value={merchantData.stores.active}
          icon={Activity}
          href="/dashboard/area-managers/stores"
          compact={isSuperAdmin}
          bgColor="bg-white"
          iconBgColor="bg-gray-100"
          iconColor="text-gray-600"
          textColor="text-gray-900"
        />
      </div>
    );

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-gray-900">Store Overview</h2>
        </div>
        {cardsGrid}
        {isSuperAdmin && (
          <SuperAdminAreaManagerList />
        )}
      </div>
    );
  }

  const riderData = data.data as RiderMetrics;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Rider Overview</h2>
      </div>
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        <StatCard
          title="Total Riders"
          value={riderData.riders.total}
          icon={Package}
          href="/dashboard/area-managers/riders"
          bgColor="bg-gradient-to-br from-blue-50 to-blue-100"
          iconBgColor="bg-blue-500"
          iconColor="text-white"
          textColor="text-blue-700"
        />
        <StatCard
          title="Active Riders"
          value={riderData.riders.active}
          icon={UserCheck}
          href="/dashboard/area-managers/riders?status=ACTIVE"
          bgColor="bg-gradient-to-br from-green-50 to-green-100"
          iconBgColor="bg-green-500"
          iconColor="text-white"
          textColor="text-green-700"
        />
        <StatCard
          title="Inactive Riders"
          value={riderData.riders.inactive}
          icon={UserX}
          href="/dashboard/area-managers/riders?status=INACTIVE"
          bgColor="bg-gradient-to-br from-gray-50 to-gray-100"
          iconBgColor="bg-gray-500"
          iconColor="text-white"
          textColor="text-gray-700"
        />
        <StatCard
          title="Blocked Riders"
          value={riderData.riders.blocked}
          icon={UserX}
          href="/dashboard/area-managers/riders?status=BLOCKED"
          bgColor="bg-gradient-to-br from-red-50 to-red-100"
          iconBgColor="bg-red-500"
          iconColor="text-white"
          textColor="text-red-700"
        />
        <StatCard
          title="Available (Online)"
          value={riderData.availability.online}
          icon={Activity}
          href="/dashboard/area-managers/availability"
          subtitle="Currently available"
          bgColor="bg-gradient-to-br from-emerald-50 to-emerald-100"
          iconBgColor="bg-emerald-500"
          iconColor="text-white"
          textColor="text-emerald-700"
        />
        <StatCard
          title="Busy"
          value={riderData.availability.busy}
          icon={Clock}
          href="/dashboard/area-managers/availability"
          bgColor="bg-gradient-to-br from-amber-50 to-amber-100"
          iconBgColor="bg-amber-500"
          iconColor="text-white"
          textColor="text-amber-700"
        />
        <StatCard
          title="Offline"
          value={riderData.availability.offline}
          icon={MapPin}
          href="/dashboard/area-managers/availability"
          bgColor="bg-gradient-to-br from-slate-50 to-slate-100"
          iconBgColor="bg-slate-500"
          iconColor="text-white"
          textColor="text-slate-700"
        />
      </div>
      {riderData.riderShortageAlerts.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <h3 className="font-medium">Rider shortage alerts</h3>
          </div>
          <ul className="mt-2 list-inside list-disc text-sm text-amber-700">
            {riderData.riderShortageAlerts.slice(0, 10).map((a, i) => (
              <li key={i}>
                Locality {a.localityCode ?? "(unspecified)"}: {a.totalRiders} riders
                {a.isZeroCoverage ? " (zero coverage)" : a.isLowAvailability ? " (low availability)" : ""}
              </li>
            ))}
          </ul>
          <Link
            href="/dashboard/area-managers/availability"
            className="mt-2 inline-block text-sm font-medium text-amber-800 underline"
          >
            View availability
          </Link>
        </div>
      )}
    </div>
  );
}
