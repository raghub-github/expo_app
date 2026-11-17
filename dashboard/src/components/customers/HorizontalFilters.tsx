"use client";
import { useAppPathname } from "@/hooks/useAppSearchParams";

import { useState, useEffect } from "react";
import { DashboardStatsFilters } from "@/hooks/queries/useCustomerDashboardStats";
import { usePermissions } from "@/hooks/queries/usePermissionsQuery";

const controlClass =
  "h-9 rounded-md border border-[#121212]/12 bg-white px-2.5 text-xs text-[#121212] outline-none focus:border-[#121212]/35";

export function HorizontalFilters() {
  const pathname = useAppPathname();
  const { isSuperAdmin, loading: permissionsLoading } = usePermissions();
  const [localFilters, setLocalFilters] = useState<DashboardStatsFilters>({});
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    const savedFilters = localStorage.getItem("customerDashboardFilters");
    if (savedFilters) {
      try {
        const parsed = JSON.parse(savedFilters) as DashboardStatsFilters;
        setLocalFilters(parsed);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    const handleFilterUpdate = (event: CustomEvent) => {
      setLocalFilters(event.detail as DashboardStatsFilters);
    };
    window.addEventListener("customerFiltersUpdated", handleFilterUpdate as EventListener);
    return () => {
      window.removeEventListener("customerFiltersUpdated", handleFilterUpdate as EventListener);
    };
  }, []);

  if (!hasMounted || permissionsLoading || pathname !== "/dashboard/customers" || !isSuperAdmin) {
    return null;
  }

  const handleFilterChange = (key: keyof DashboardStatsFilters, value: string) => {
    setLocalFilters({
      ...localFilters,
      [key]: value || undefined,
    });
  };

  const applyFilters = () => {
    localStorage.setItem("customerDashboardFilters", JSON.stringify(localFilters));
    window.dispatchEvent(new CustomEvent("customerFiltersUpdated", { detail: localFilters }));
  };

  const clearAllFilters = () => {
    const emptyFilters = {};
    setLocalFilters(emptyFilters);
    localStorage.removeItem("customerDashboardFilters");
    window.dispatchEvent(new CustomEvent("customerFiltersUpdated", { detail: emptyFilters }));
  };

  const hasAnyFilter = Boolean(
    localFilters.orderType ||
      localFilters.dateFrom ||
      localFilters.dateTo ||
      localFilters.accountStatus ||
      localFilters.riskFlag
  );

  return (
    <div className="sticky top-0 z-20 shrink-0 bg-white py-2">
      <div className="flex h-11 flex-nowrap items-center gap-2 overflow-x-auto rounded-md border-[0.5px] border-[#121212]/40 bg-white px-2.5 [scrollbar-width:thin]">
        <select
          value={localFilters.orderType || ""}
          onChange={(e) =>
            handleFilterChange("orderType", e.target.value as "food" | "parcel" | "person_ride" | "")
          }
          className={`${controlClass} w-[8.5rem] shrink-0`}
          aria-label="Service type"
        >
          <option value="">All services</option>
          <option value="food">Food</option>
          <option value="parcel">Parcel</option>
          <option value="person_ride">Person Ride</option>
        </select>

        <input
          type="date"
          value={localFilters.dateFrom || ""}
          onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
          className={`${controlClass} w-[8rem] shrink-0 px-1.5`}
          aria-label="Date from"
        />
        <input
          type="date"
          value={localFilters.dateTo || ""}
          onChange={(e) => handleFilterChange("dateTo", e.target.value)}
          className={`${controlClass} w-[8rem] shrink-0 px-1.5`}
          aria-label="Date to"
        />

        <select
          value={localFilters.accountStatus || ""}
          onChange={(e) => handleFilterChange("accountStatus", e.target.value)}
          className={`${controlClass} w-[8.5rem] shrink-0`}
          aria-label="Account status"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="BLOCKED">Blocked</option>
        </select>

        <select
          value={localFilters.riskFlag || ""}
          onChange={(e) => handleFilterChange("riskFlag", e.target.value)}
          className={`${controlClass} w-[8.5rem] shrink-0`}
          aria-label="Risk flag"
        >
          <option value="">All risk levels</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
          {hasAnyFilter ? (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex h-9 cursor-pointer items-center rounded-md border border-[#121212]/12 bg-white px-3 text-xs font-semibold text-[#121212]/65 hover:bg-[#F7F7F7]"
            >
              Reset
            </button>
          ) : null}
          <button
            type="button"
            onClick={applyFilters}
            className="inline-flex h-9 cursor-pointer items-center rounded-md bg-[#121212] px-3 text-xs font-semibold text-white hover:bg-black"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
