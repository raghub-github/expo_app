"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { DashboardStatsFilters } from "@/hooks/queries/useCustomerDashboardStats";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/hooks/queries/usePermissionsQuery";

export function HorizontalFilters() {
  const pathname = usePathname();
  const { isSuperAdmin } = usePermissions();
  const [localFilters, setLocalFilters] = useState<DashboardStatsFilters>({});
  const [appliedFilters, setAppliedFilters] = useState<DashboardStatsFilters>({});

  // Load filters from localStorage on mount - MUST be called before any conditional returns
  useEffect(() => {
    const savedFilters = localStorage.getItem('customerDashboardFilters');
    if (savedFilters) {
      try {
        const parsed = JSON.parse(savedFilters);
        setLocalFilters(parsed);
        setAppliedFilters(parsed);
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  // Listen for filter updates
  useEffect(() => {
    const handleFilterUpdate = (event: CustomEvent) => {
      setAppliedFilters(event.detail);
      setLocalFilters(event.detail);
    };
    window.addEventListener('customerFiltersUpdated', handleFilterUpdate as EventListener);
    return () => {
      window.removeEventListener('customerFiltersUpdated', handleFilterUpdate as EventListener);
    };
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
    setAppliedFilters(localFilters);
    // Dispatch event to update page
    window.dispatchEvent(new CustomEvent('customerFiltersUpdated', { detail: localFilters }));
  };

  const removeFilter = (key: keyof DashboardStatsFilters) => {
    const updatedFilters = {
      ...localFilters,
      [key]: undefined,
    };
    setLocalFilters(updatedFilters);
    localStorage.setItem('customerDashboardFilters', JSON.stringify(updatedFilters));
    setAppliedFilters(updatedFilters);
    window.dispatchEvent(new CustomEvent('customerFiltersUpdated', { detail: updatedFilters }));
  };

  const clearAllFilters = () => {
    const emptyFilters = {};
    setLocalFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    localStorage.removeItem('customerDashboardFilters');
    window.dispatchEvent(new CustomEvent('customerFiltersUpdated', { detail: emptyFilters }));
  };

  const getFilterLabel = (key: keyof DashboardStatsFilters, value: string): string => {
    switch (key) {
      case 'orderType':
        return value === 'food' ? 'Food' : value === 'parcel' ? 'Parcel' : 'Person Ride';
      case 'accountStatus':
        return value;
      case 'riskFlag':
        return value;
      case 'dateFrom':
        return `From: ${value}`;
      case 'dateTo':
        return `To: ${value}`;
      default:
        return value;
    }
  };

  const activeFilterKeys = Object.keys(appliedFilters).filter(
    (key) => appliedFilters[key as keyof DashboardStatsFilters] !== undefined
  ) as Array<keyof DashboardStatsFilters>;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm mb-6">
      {/* Filter Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
        {/* Service Type Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
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
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Services</option>
            <option value="food">Food</option>
            <option value="parcel">Parcel</option>
            <option value="person_ride">Person Ride</option>
          </select>
        </div>

        {/* Date From Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Date From
          </label>
          <input
            type="date"
            value={localFilters.dateFrom || ""}
            onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Date To Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Date To
          </label>
          <input
            type="date"
            value={localFilters.dateTo || ""}
            onChange={(e) => handleFilterChange("dateTo", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Account Status Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Account Status
          </label>
          <select
            value={localFilters.accountStatus || ""}
            onChange={(e) => handleFilterChange("accountStatus", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="BLOCKED">Blocked</option>
          </select>
        </div>

        {/* Risk Flag Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Risk Flag
          </label>
          <select
            value={localFilters.riskFlag || ""}
            onChange={(e) => handleFilterChange("riskFlag", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Risk Levels</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>
      </div>

      {/* Applied Filters Chips Row */}
      {activeFilterKeys.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-gray-200">
          <span className="text-xs font-medium text-gray-600">Applied Filters:</span>
          {activeFilterKeys.map((key) => {
            const value = appliedFilters[key];
            if (!value) return null;
            return (
              <div
                key={key}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium"
              >
                <span>{getFilterLabel(key, value as string)}</span>
                <button
                  onClick={() => removeFilter(key)}
                  className="hover:bg-blue-100 rounded-full p-0.5 transition-colors"
                  aria-label={`Remove ${key} filter`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
          <button
            onClick={clearAllFilters}
            className="text-xs text-gray-600 hover:text-gray-900 font-medium ml-2"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Apply Button */}
      <div className="flex justify-end mt-4 pt-3 border-t border-gray-200">
        <button
          onClick={applyFilters}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
        >
          Apply Filters
        </button>
      </div>
    </div>
  );
}
