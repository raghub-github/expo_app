"use client";

import { useState, useEffect } from "react";
import type { DashboardType, AccessPointGroup } from "@/lib/db/schema";

interface DashboardAccess {
  dashboardType: string;
  accessLevel: string;
  isActive: boolean;
}

interface AccessPoint {
  dashboardType: string;
  accessPointGroup: string;
  accessPointName: string;
  allowedActions: string[];
  isActive: boolean;
}

interface DashboardAccessData {
  dashboards: DashboardAccess[];
  accessPoints: AccessPoint[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch and manage user dashboard access
 * Returns accessible dashboards and access points for the current user
 */
export function useDashboardAccess(): DashboardAccessData {
  const [data, setData] = useState<DashboardAccessData>({
    dashboards: [],
    accessPoints: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchAccess = async () => {
      try {
        setData((prev) => ({ ...prev, loading: true, error: null }));

        const response = await fetch("/api/auth/dashboard-access");
        const result = await response.json();

        if (result.success) {
          setData({
            dashboards: result.data.dashboards || [],
            accessPoints: result.data.accessPoints || [],
            loading: false,
            error: null,
          });
        } else {
          setData({
            dashboards: [],
            accessPoints: [],
            loading: false,
            error: result.error || "Failed to fetch dashboard access",
          });
        }
      } catch (error) {
        console.error("Error fetching dashboard access:", error);
        setData({
          dashboards: [],
          accessPoints: [],
          loading: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    };

    fetchAccess();
  }, []);

  return data;
}

/**
 * Hook to check if user has access to a specific dashboard
 */
export function useHasDashboardAccess(dashboardType: DashboardType): boolean {
  const { dashboards, loading } = useDashboardAccess();

  if (loading) {
    return false; // Don't show content while loading
  }

  return dashboards.some(
    (d) => d.dashboardType === dashboardType && d.isActive
  );
}

/**
 * Hook to get access points for a specific dashboard
 */
export function useDashboardAccessPoints(
  dashboardType: DashboardType
): AccessPoint[] {
  const { accessPoints } = useDashboardAccess();

  return accessPoints.filter(
    (ap) => ap.dashboardType === dashboardType && ap.isActive
  );
}

/**
 * Hook to check if user has a specific access point
 */
export function useHasAccessPoint(
  dashboardType: DashboardType,
  accessPointGroup: AccessPointGroup
): boolean {
  const { accessPoints } = useDashboardAccess();

  return accessPoints.some(
    (ap) =>
      ap.dashboardType === dashboardType &&
      ap.accessPointGroup === accessPointGroup &&
      ap.isActive
  );
}
