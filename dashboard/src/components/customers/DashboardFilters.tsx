"use client";

import { useState } from "react";
import { Filter, X } from "lucide-react";
import { DashboardStatsFilters } from "@/hooks/queries/useCustomerDashboardStats";

interface DashboardFiltersProps {
  filters: DashboardStatsFilters;
  onFiltersChange: (filters: DashboardStatsFilters) => void;
  onApplyFilters: () => void;
  isSuperAdmin: boolean;
}

export function DashboardFilters({
  filters,
  onFiltersChange,
  onApplyFilters,
  isSuperAdmin,
}: DashboardFiltersProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [localFilters, setLocalFilters] = useState<DashboardStatsFilters>(filters);

  if (!isSuperAdmin) {
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
    onFiltersChange(localFilters);
    onApplyFilters();
    setShowFilters(false);
  };

  const clearFilters = () => {
    const emptyFilters = {};
    setLocalFilters(emptyFilters);
    onFiltersChange(emptyFilters);
    onApplyFilters();
  };

  const hasActiveFilters = Object.values(localFilters).some((v) => v !== undefined);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
              Active
            </span>
          )}
        </button>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          )}
          {showFilters && (
            <button
              onClick={applyFilters}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
            >
              Apply
            </button>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 pt-3 border-t border-gray-200">
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
      )}
    </div>
  );
}
