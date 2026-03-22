"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { usePermissionsQuery } from "@/hooks/queries/usePermissionsQuery";
import { useDashboardAccessQuery, type AccessPoint } from "@/hooks/queries/useDashboardAccessQuery";
import { getDashboardTypeFromPath } from "@/lib/permissions/path-mapping";
import { toPermissionKey, toPermissionKeys } from "@/lib/permissions/constants";
import type { DashboardType, ActionType } from "@/lib/db/schema";

/**
 * Single hook for permission and dashboard access.
 * Uses cached permissions and dashboard-access data (React Query) so checks are
 * fast and consistent. Use for UI (hide/disable buttons, sidebar) and to avoid
 * repeated server calls. API routes must still enforce permissions server-side.
 */
export function usePermission() {
  const pathname = usePathname();
  const { data: permissionsData, isLoading: permissionsLoading, error: permissionsError } = usePermissionsQuery();
  const { data: dashboardAccessData, isLoading: dashboardAccessLoading, error: dashboardAccessError } = useDashboardAccessQuery();

  const isSuperAdmin = permissionsData?.isSuperAdmin ?? false;
  const loading = permissionsLoading || dashboardAccessLoading;
  const error = permissionsError || dashboardAccessError;

  const permissionSet = useMemo(() => {
    if (permissionsData?.permissionStrings?.length) {
      return new Set(permissionsData.permissionStrings);
    }
    if (!permissionsData?.permissions?.length) return new Set<string>();
    const arr = permissionsData.permissions as Array<{ module: string; action: string; resourceType?: string }>;
    if (typeof arr[0] === "string") return new Set(arr as unknown as string[]);
    return new Set(toPermissionKeys(arr));
  }, [permissionsData?.permissionStrings, permissionsData?.permissions]);

  const dashboardSet = useMemo(() => {
    if (!dashboardAccessData?.dashboards?.length) return new Set<string>();
    return new Set(
      dashboardAccessData.dashboards
        .filter((d) => d.isActive)
        .map((d) => d.dashboardType)
    );
  }, [dashboardAccessData?.dashboards]);

  const accessPointsByDashboard = useMemo(() => {
    const points = dashboardAccessData?.accessPoints;
    if (!points?.length) return new Map<string, NonNullable<typeof points>>();
    const map = new Map<string, typeof points>();
    for (const ap of points) {      if (!ap.isActive) continue;
      const key = ap.dashboardType;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ap);
    }
    return map;
  }, [dashboardAccessData?.accessPoints]);

  const canAccessPage = useMemo(() => {
    return (path: string) => {
      if (isSuperAdmin) return true;
      const dashboardType = getDashboardTypeFromPath(path);
      if (!dashboardType) return false;
      if (dashboardType === "PAYMENT") return false;
      return dashboardSet.has(dashboardType);
    };
  }, [isSuperAdmin, dashboardSet]);

  const canAccessCurrentPage = useMemo(() => canAccessPage(pathname ?? "/dashboard"), [canAccessPage, pathname]);

  const hasDashboardAccess = useMemo(() => {
    return (dashboardType: DashboardType) => {
      if (isSuperAdmin) return true;
      if (dashboardType === "PAYMENT") return false;
      return dashboardSet.has(dashboardType);
    };
  }, [isSuperAdmin, dashboardSet]);

  const canPerformAction = useMemo(() => {
    return (
      dashboardType: DashboardType,
      actionType: ActionType,
      context?: { access_point_group?: string }
    ) => {
      if (isSuperAdmin) return true;
      if (!hasDashboardAccess(dashboardType)) return false;
      const points = accessPointsByDashboard.get(dashboardType) ?? [];
      for (const ap of points) {
        if (context?.access_point_group && ap.accessPointGroup !== context.access_point_group) continue;
        const actions = ap.allowedActions ?? [];
        if (actions.includes(actionType)) return true;
      }
      return false;
    };
  }, [isSuperAdmin, hasDashboardAccess, accessPointsByDashboard]);

  const can = useMemo(() => {
    return (module: string, action: string) => {
      if (isSuperAdmin) return true;
      return permissionSet.has(toPermissionKey(module as any, action as any));
    };
  }, [isSuperAdmin, permissionSet]);

  return {
    isSuperAdmin,
    loading,
    error,
    can,
    canAccessPage,
    canAccessCurrentPage,
    hasDashboardAccess,
    canPerformAction,
    permissionSet,
    dashboardSet,
    permissions: permissionsData ?? null,
    dashboardAccess: dashboardAccessData ?? null,
  };
}
