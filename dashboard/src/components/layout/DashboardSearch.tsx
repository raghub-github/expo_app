"use client";

import { useState, useCallback, useMemo, useEffect, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { getCurrentDashboard } from "@/lib/navigation/dashboard-routes";

type DashboardType = "RIDER" | "CUSTOMER" | "MERCHANT" | "AREA_MANAGER";

interface DashboardSearchProps {
  compact?: boolean;
}

// Inner component that uses useSearchParams
function DashboardSearchInner({ compact = false }: DashboardSearchProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
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

  // Get search value from URL params
  const searchValue = searchParams.get("search") || "";

  // Sync local search value with URL
  useEffect(() => {
    setLocalSearchValue(searchValue);
  }, [searchValue]);

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

  // Get placeholder text based on dashboard type
  const placeholder = useMemo(() => {
    if (!dashboardType) return "Search...";
    switch (dashboardType) {
      case "RIDER":
        return "Search by Rider ID (GMR...) or Phone...";
      case "CUSTOMER":
        return "Search by Customer ID, Number, or Name...";
      case "MERCHANT":
        return "Search by Merchant ID or Number...";
      case "AREA_MANAGER":
        return "Search by Area Manager ID or Number...";
      default:
        return "Search...";
    }
  }, [dashboardType]);

  // Don't render if not in a searchable dashboard
  if (!dashboardType) {
    return null;
  }

  // Render merchant-specific search with dropdowns
  if (dashboardType === "MERCHANT") {
    return (
      <div className={`flex items-center gap-2 ${compact ? "w-full max-w-md" : "w-full max-w-2xl"}`}>
        <form onSubmit={(e) => {
          e.preventDefault();
          const params = new URLSearchParams();
          if (localSearchValue.trim()) params.set("search", localSearchValue.trim());
          if (merchantType === "parent") {
            params.set("parent", "true");
          } else {
            params.set("child", "true");
          }
          const basePath = currentDashboard?.href || "/dashboard";
          router.push(`${basePath}?${params.toString()}`);
        }} className="flex-1 flex flex-col sm:flex-row gap-2">
          <div className="flex-1 flex flex-col sm:flex-row gap-2">
            <select
              value={merchantType}
              onChange={(e) => setMerchantType(e.target.value as "child" | "parent")}
              className={`border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 transition-all duration-200 ${
                compact ? "px-3 py-1.5 text-sm h-9" : "px-4 py-2"
              }`}
            >
              <option value="child">Child Merchant</option>
              <option value="parent">Parent Merchant</option>
            </select>
            <input
              type="text"
              value={localSearchValue}
              onChange={(e) => {
                let value = e.target.value;
                setLocalSearchValue(value);
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className={`flex-1 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder:text-gray-400 transition-all duration-200 ${
                compact ? "px-3 py-1.5 text-sm h-9" : "px-4 py-2"
              }`}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className={`rounded-lg font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
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

  // Render standard search for other dashboards
  return (
    <div className={`flex items-center gap-2 ${compact ? "w-full max-w-md" : "w-full max-w-lg"}`}>
      <form onSubmit={(e) => {
        e.preventDefault();
        const value = localSearchValue.trim();
        if (!value) return;
        const params = new URLSearchParams();
        params.set("search", value);
        const basePath = currentDashboard?.href || "/dashboard";
        router.push(`${basePath}?${params.toString()}`);
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
          className={`rounded-lg font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all duration-200 ${
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
