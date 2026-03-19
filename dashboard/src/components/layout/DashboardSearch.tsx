"use client";

import { useState, useCallback, useMemo, useEffect, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { getCurrentDashboard } from "@/lib/navigation/dashboard-routes";
import { useMerchantsSearch } from "@/context/MerchantsSearchContext";

type DashboardType = "RIDER" | "CUSTOMER" | "MERCHANT" | "AREA_MANAGER";

interface DashboardSearchProps {
  compact?: boolean;
}

// Inner component that uses useSearchParams
function DashboardSearchInner({ compact = false }: DashboardSearchProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const merchantsSearch = useMerchantsSearch();
  const [loading, setLoading] = useState(false);
  const [merchantType, setMerchantType] = useState<"child" | "parent">("child");
  const [localSearchValue, setLocalSearchValue] = useState("");

  // Get current dashboard type
  const currentDashboard = useMemo(() => getCurrentDashboard(pathname), [pathname]);
  const dashboardType = useMemo<DashboardType | null>(() => {
    if (!currentDashboard) return null;
    if (currentDashboard.dashboardType === "RIDER") return "RIDER";
    if (currentDashboard.dashboardType === "CUSTOMER") return "CUSTOMER";
    if (currentDashboard.dashboardType === "MERCHANT") return "MERCHANT";
    if (currentDashboard.dashboardType === "AREA_MANAGER") return "AREA_MANAGER";
    return null;
  }, [currentDashboard]);

  // Get search value and merchant type from URL params
  const searchValue = searchParams.get("search") || "";
  const parentParam = searchParams.get("parent") === "true";

  // Sync local search value and merchant type with URL (keeps search bar in sync when returning from store)
  useEffect(() => {
    setLocalSearchValue(searchValue);
  }, [searchValue]);
  useEffect(() => {
    setMerchantType(parentParam ? "parent" : "child");
  }, [parentParam]);

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const form = (e.target as HTMLElement).closest("form");
      if (form) {
        form.requestSubmit();
      }
    }
  }, []);

  /** Normalize merchant search: digits-only → add prefix (GMMC child / GMMP parent); full ID stays as-is. */
  const normalizeMerchantSearch = useCallback((value: string, type: "child" | "parent") => {
    const trimmed = value.trim().toUpperCase().replace(/\s/g, "");
    if (!trimmed) return "";
    const digitsOnly = /^\d+$/.test(trimmed);
    if (digitsOnly) return type === "child" ? `GMMC${trimmed}` : `GMMP${trimmed}`;
    return trimmed;
  }, []);

  // Get placeholder text based on dashboard type and path
  const placeholder = useMemo(() => {
    if (!dashboardType) return "Search...";
    switch (dashboardType) {
      case "RIDER":
        return "Search by Rider ID (GMR...) or Phone...";
      case "CUSTOMER":
        return "Search by Customer ID, Number, or Name...";
      case "MERCHANT":
        return "e.g. GMMC1001 or 1001 (child) / GMMP1001 or 1001 (parent)";
      case "AREA_MANAGER":
        return pathname.includes("/stores")
          ? "Search by Store ID, Parent ID, or Number..."
          : "Search by Area Manager ID or Number...";
      default:
        return "Search...";
    }
  }, [dashboardType, pathname]);

  // Clear search button loading when pathname or search params change (after navigation)
  const queryString = searchParams.toString();
  useEffect(() => {
    if (dashboardType === "MERCHANT") setLoading(false);
  }, [pathname, queryString, dashboardType]);

  // Don't render if not in a searchable dashboard
  if (!dashboardType) {
    return null;
  }

  // Current portal (admin vs merchant) for merchant dashboard, mirroring Header logic.
  const currentPortal =
    searchParams.get("portal") ||
    (pathname.startsWith("/dashboard/merchants/stores/") ? "merchant" : "admin");

  // Render merchant-specific search with dropdowns
  if (dashboardType === "MERCHANT") {
    const isAssignAmPage = pathname.startsWith("/dashboard/merchants/assign-am");
    const searchButtonLoading = loading || (isAssignAmPage && (merchantsSearch?.assignAmSearchLoading ?? false));
    return (
      <div className={`flex items-center gap-2 ${compact ? "w-full max-w-md" : "w-full max-w-2xl"}`}>
        <form onSubmit={(e) => {
          e.preventDefault();
          const basePath = isAssignAmPage
            ? "/dashboard/merchants/assign-am"
            : currentDashboard?.href || "/dashboard";
          const normalized = normalizeMerchantSearch(localSearchValue, merchantType);
          if (!normalized) {
            const keep = new URLSearchParams(searchParams.toString());
            keep.delete("search");
            keep.delete("parent");
            keep.delete("child");
            if (currentPortal === "merchant") keep.set("portal", "merchant");
            const qs = keep.toString();
            router.push(qs ? `${basePath}?${qs}` : basePath);
            return;
          }
          // Show spinner immediately on click (before any async work)
          if (isAssignAmPage) merchantsSearch?.setAssignAmSearchLoading(true);
          else setLoading(true);

          const params = new URLSearchParams(searchParams.toString());
          params.set("search", normalized);
          if (merchantType === "parent") params.set("parent", "true");
          else params.set("child", "true");
          if (currentPortal === "merchant") params.set("portal", "merchant");
          setLocalSearchValue(normalized);
          if (!pathname.startsWith("/dashboard/merchants/assign-am")) {
            merchantsSearch?.triggerMerchantSearch(normalized, merchantType);
          }
          router.push(`${basePath}?${params.toString()}`);
        }} className="flex-1 flex flex-col sm:flex-row gap-2">
          <div className="flex-1 flex flex-col sm:flex-row gap-2">
            <select
              value={merchantType}
              onChange={(e) => setMerchantType(e.target.value as "child" | "parent")}
              className={`border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 transition-all duration-200 ${
                compact ? "px-3 py-1.5 text-sm h-9" : "px-4 py-2"
              }`}
              style={{ color: '#111827' }}
            >
              <option value="child" style={{ color: '#111827' }}>Child Merchant</option>
              <option value="parent" style={{ color: '#111827' }}>Parent Merchant</option>
            </select>
            <input
              type="text"
              value={localSearchValue}
              onChange={(e) => {
                const value = e.target.value.toUpperCase();
                setLocalSearchValue(value);
                if (!value.trim() && currentDashboard?.href) {
                  router.replace(currentDashboard.href);
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={`flex-1 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400 transition-all duration-200 uppercase ${
                compact ? "px-3 py-1.5 text-sm h-9" : "px-4 py-2"
              }`}
            />
          </div>
          <button
            type="submit"
            disabled={searchButtonLoading}
            className={`cursor-pointer rounded-lg font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
              compact ? "px-3 py-1.5 text-sm h-9" : "px-4 py-2"
            }`}
          >
            {searchButtonLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="hidden sm:inline">Searching...</span>
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Search</span>
              </>
            )}
          </button>
        </form>
      </div>
    );
  }

  // Helper function to detect if search is Customer ID or mobile number
  const isCustomerIdOrMobile = (searchTerm: string): boolean => {
    const trimmed = searchTerm.trim();
    // Check if it's a Customer ID (GM followed by numbers, case insensitive)
    const isCustomerId = /^GM\d+$/i.test(trimmed);
    // Check if it's a mobile number (10+ digits, optionally with +91 or 91 prefix)
    const isMobile = /^(\+?91)?\d{10,}$/.test(trimmed);
    return isCustomerId || isMobile;
  };

  // Render standard search for other dashboards
  return (
    <div className={`flex items-center gap-2 ${compact ? "w-full max-w-md" : "w-full max-w-lg"}`}>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const value = localSearchValue.trim();
        if (!value) return;
        
        // For customer dashboard, route directly to /all with search params
        // For area manager stores, keep search on stores page
        const params = new URLSearchParams(searchParams.toString());
        params.set("search", value);

        let targetPath: string;
        if (dashboardType === "CUSTOMER") {
          targetPath = "/dashboard/customers/all";
        } else if (dashboardType === "AREA_MANAGER" && pathname.includes("/stores")) {
          targetPath = pathname;
        } else {
          targetPath = currentDashboard?.href || "/dashboard";
        }

        router.push(`${targetPath}?${params.toString()}`);
      }} className="flex-1 flex gap-2">
        <input
          type="text"
          value={localSearchValue}
          onChange={(e) => {
            let value = e.target.value;
            // For Rider dashboard, auto-uppercase GMR prefix
            if (dashboardType === "RIDER" && /^g/i.test(value)) {
              value = value.toUpperCase();
            }
            setLocalSearchValue(value);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`flex-1 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400 transition-all duration-200 ${
            compact ? "px-3 py-1.5 text-sm h-9" : "px-4 py-2"
          }`}
        />
        <button
          type="submit"
          disabled={loading}
          className={`cursor-pointer rounded-lg font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all duration-200 ${
            compact ? "px-3 py-1.5 text-sm h-9" : "px-4 py-2"
          }`}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">Searching...</span>
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

// Wrapper component with Suspense to handle useSearchParams
export function DashboardSearch({ compact = false }: DashboardSearchProps) {
  return (
    <Suspense fallback={<div className="w-full max-w-md h-9 bg-gray-100 rounded animate-pulse" />}>
      <DashboardSearchInner compact={compact} />
    </Suspense>
  );
}
