"use client";

import { useState, useEffect } from "react";
import { Filter, X } from "lucide-react";
import { DashboardStatsFilters } from "@/hooks/queries/useCustomerDashboardStats";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/hooks/queries/usePermissionsQuery";

export function HeaderFilters() {
  const pathname = usePathname();
  const { isSuperAdmin } = usePermissions();
  const [showFilters, setShowFilters] = useState(false);
  const [localFilters, setLocalFilters] = useState<DashboardStatsFilters>({});

  // Load filters from localStorage on mount - MUST be called before any conditional returns
  useEffect(() => {
    const savedFilters = localStorage.getItem('customerDashboardFilters');
    if (savedFilters) {
      try {
        setLocalFilters(JSON.parse(savedFilters));
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  // Only show on customer dashboard home page - AFTER all hooks
  if (pathname !== "/dashboard/customers" || !isSuperAdmin) {
    return null;
  }

  const handleFilterChange = (key: keyof DashboardStatsFilters, value: string) => {
    const updatedFilters = {
      ...localFilters,
      [key]: value || undefined,
    };
    setLocalFilters(updatedFilters);
  };

  const applyFilters = () => {
    // Save to localStorage
    localStorage.setItem('customerDashboardFilters', JSON.stringify(localFilters));
    // Dispatch event to update page
    window.dispatchEvent(new CustomEvent('customerFiltersUpdated', { detail: localFilters }));
    setShowFilters(false);
  };

  const clearFilters = () => {
    const emptyFilters = {};
    setLocalFilters(emptyFilters);
    localStorage.removeItem('customerDashboardFilters');
    // Dispatch event to update page
    window.dispatchEvent(new CustomEvent('customerFiltersUpdated', { detail: emptyFilters }));
  };

  const hasActiveFilters = Object.values(localFilters).some((v) => v !== undefined);

  return (
    <div className="relative">
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Filter className="h-4 w-4" />
        <span className="hidden sm:inline">Filters</span>
        {hasActiveFilters && (
          <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
            Active
          </span>
        )}
      </button>

      {showFilters && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowFilters(false)}
          />
          
          {/* Horizontal Dropdown Panel */}
          <div className="absolute right-0 top-full mt-2 w-[600px] bg-white rounded-lg border border-gray-200 shadow-lg z-50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Filters</h3>
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900"
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setShowFilters(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Horizontal Layout - 2 rows, 3 columns */}
            <div className="grid grid-cols-3 gap-4">
              {/* Service Type Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Service Type
                </label>
                <select
                  value={localFilters.orderType || ""}
                  onChange={(e) =>
                    handleFilterChange(
                      "orderType",
                      e.target.value as "food" | "parcel" | "person_ride" | ""
                    )
                  }
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Services</option>
                  <option value="food">Food</option>
                  <option value="parcel">Parcel</option>
                  <option value="person_ride">Person Ride</option>
                </select>
              </div>

              {/* Date From Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Date From
                </label>
                <input
                  type="date"
                  value={localFilters.dateFrom || ""}
                  onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Date To Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Date To
                </label>
                <input
                  type="date"
                  value={localFilters.dateTo || ""}
                  onChange={(e) => handleFilterChange("dateTo", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Account Status Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Account Status
                </label>
                <select
                  value={localFilters.accountStatus || ""}
                  onChange={(e) => handleFilterChange("accountStatus", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="BLOCKED">Blocked</option>
                </select>
              </div>

              {/* Risk Flag Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Risk Flag
                </label>
                <select
                  value={localFilters.riskFlag || ""}
                  onChange={(e) => handleFilterChange("riskFlag", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Risk Levels</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>

            <button
              onClick={applyFilters}
              className="w-full mt-4 px-3 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
            >
              Apply Filters
            </button>
          </div>
        </>
      )}
    </div>
  );
}
