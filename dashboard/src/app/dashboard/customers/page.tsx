"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { SummaryCards } from "@/components/customers/SummaryCards";
import { UserCategoryCards } from "@/components/customers/UserCategoryCards";
import { HorizontalFilters } from "@/components/customers/HorizontalFilters";
import { useCustomersQuery } from "@/hooks/queries/useCustomersQuery";
import { useCustomerDashboardStats, DashboardStatsFilters } from "@/hooks/queries/useCustomerDashboardStats";
import { usePermissions } from "@/hooks/queries/usePermissionsQuery";
import { Search, AlertCircle } from "lucide-react";

// Lazily load heavy chart components so they don't block initial paint.
const AnalyticsCharts = dynamic(
  () => import("@/components/customers/AnalyticsCharts").then((m) => m.AnalyticsCharts),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-6">
        <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm min-h-[260px]"
            >
              <div className="h-6 w-32 bg-gray-200 rounded animate-pulse mb-4" />
              <div className="h-40 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    ),
  }
);

const ActivityGraphs = dynamic(
  () => import("@/components/customers/ActivityGraphs").then((m) => m.ActivityGraphs),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm min-h-[260px]"
          >
            <div className="h-6 w-32 bg-gray-200 rounded animate-pulse mb-4" />
            <div className="h-40 bg-gray-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
    ),
  }
);

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}

function CustomersPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isSuperAdmin, loading: permissionsLoading } = usePermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dashboardFilters, setDashboardFilters] = useState<DashboardStatsFilters>({});
  const prevSearchParamRef = useRef<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 500);

  // Load filters from localStorage and listen for updates from header
  useEffect(() => {
    const savedFilters = localStorage.getItem("customerDashboardFilters");
    if (savedFilters) {
      try {
        setDashboardFilters(JSON.parse(savedFilters));
      } catch (e) {
        // Ignore parse errors
      }
    }

    const handleFilterUpdate = (event: CustomEvent) => {
      setDashboardFilters(event.detail);
    };
    window.addEventListener("customerFiltersUpdated", handleFilterUpdate as EventListener);
    return () => {
      window.removeEventListener("customerFiltersUpdated", handleFilterUpdate as EventListener);
    };
  }, []);

  // Helper function to detect if search is Customer ID or mobile number
  const isCustomerIdOrMobile = (searchTerm: string): boolean => {
    const trimmed = searchTerm.trim();
    // Check if it's a Customer ID (GM followed by numbers, case insensitive)
    const isCustomerId = /^GM\d+$/i.test(trimmed);
    // Check if it's a mobile number (10+ digits, optionally with +91 or 91 prefix)
    const isMobile = /^(\+?91)?\d{10,}$/.test(trimmed);
    return isCustomerId || isMobile;
  };

  // Sync search with URL search params (for main search bar)
  useEffect(() => {
    const searchParam = searchParams.get("search");
    if (searchParam !== prevSearchParamRef.current) {
      prevSearchParamRef.current = searchParam;
      setSearch(searchParam || "");
      setPage(1);
    }
  }, [searchParams]);

  // Only fetch if super admin OR if there's a search query
  const shouldFetch = isSuperAdmin || !!debouncedSearch;
  const { data, isLoading, error } = useCustomersQuery({
    page,
    limit: 20,
    search: debouncedSearch || undefined,
    enabled: shouldFetch && !permissionsLoading,
  });

  // Fetch dashboard stats by default (when not searching and super admin)
  const shouldFetchStats = isSuperAdmin && !search;
  const {
    data: stats,
    isLoading: statsLoading,
  } = useCustomerDashboardStats(shouldFetchStats ? dashboardFilters : {}, {
    enabled: shouldFetchStats,
  });
  // Handle redirect to detail page if search returns single customer (ID/mobile search)
  useEffect(() => {
    if (
      debouncedSearch &&
      isCustomerIdOrMobile(debouncedSearch) &&
      data?.customers &&
      data.customers.length === 1 &&
      !isLoading
    ) {
      const customer = data.customers[0];
      router.replace(`/dashboard/customers/${customer.id}`);
    }
  }, [debouncedSearch, data, isLoading, router]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  // Show loading while checking permissions
  if (permissionsLoading) {
    return (
      <div className="space-y-6 w-full max-w-full overflow-x-hidden">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  // Show search prompt for non-super-admins when no search query
  if (!isSuperAdmin && !search) {
    return (
      <div className="space-y-6 w-full max-w-full overflow-x-hidden">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="rounded-full bg-blue-100 p-4">
              <Search className="h-8 w-8 text-blue-600" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold text-gray-900">Search for Customer</h2>
              <p className="text-sm text-gray-600 max-w-md">
                Please use the search bar in the header to search for a customer by ID, name, or phone number.
                Customer details will be displayed after you search.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Determine if we should show dashboard or search results
  const showDashboard = isSuperAdmin && !search;
  const showSearchResults = !!search;

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Dashboard View - Only show when not searching */}
      {showDashboard && (
        <>
          {/* Horizontal Filters - Always visible, no popup */}
          {isSuperAdmin && <HorizontalFilters />}

          {/* Top Summary Cards - Always show */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
            <SummaryCards
              allUsers={stats?.allUsers || 0}
              foodUsers={stats?.foodUsers || 0}
              parcelUsers={stats?.parcelUsers || 0}
              personUsers={stats?.personUsers || 0}
              loading={statsLoading}
            />
          </div>

          {/* User Category Cards - Always show */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">User Categories</h2>
            <UserCategoryCards
              newUsers={stats?.newUsers || 0}
              oldUsers={stats?.oldUsers || 0}
              repeatedUsers={stats?.repeatedUsers || 0}
              activeUsers={stats?.activeUsers || 0}
              inactiveUsers={stats?.inactiveUsers || 0}
              suspendedUsers={stats?.suspendedUsers || 0}
              fraudUsers={stats?.fraudUsers || 0}
              loading={statsLoading}
            />
          </div>

          {/* Analytics Charts - Always show */}
          {stats ? (
            <AnalyticsCharts stats={stats} loading={statsLoading} />
          ) : statsLoading ? (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-gray-900">
                Analytics & Insights
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm"
                  >
                    <div className="h-64 bg-gray-100 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Activity Graphs - Below all cards */}
          {stats ? (
            <ActivityGraphs stats={stats} loading={statsLoading} />
          ) : statsLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm"
                >
                  <div className="h-64 bg-gray-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}

      {/* Search Results View - Show when searching */}
      {showSearchResults && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="space-y-4">
            {/* Page Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">Search Results</h1>
                <p className="text-sm text-gray-600 mt-1">
                  {data?.pagination?.total
                    ? `Found ${data.pagination.total.toLocaleString()} customer(s)`
                    : "Searching..."}
                </p>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                <p className="text-sm text-red-800">
                  Error loading customers: {error instanceof Error ? error.message : "Unknown error"}
                </p>
              </div>
            )}

            {/* No Results Message */}
            {!isLoading && (!data?.customers || data.customers.length === 0) && (
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">No customers found</p>
                    <p className="text-sm text-yellow-700 mt-1">
                      No customers match your search query. Please try a different search term.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Customer Table */}
            <CustomerTable
              customers={data?.customers || []}
              loading={isLoading}
              pageType="all"
              onPageChange={handlePageChange}
              currentPage={data?.pagination?.page || 1}
              totalPages={data?.pagination?.totalPages || 1}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <CustomersPageContent />
    </Suspense>
  );
}
