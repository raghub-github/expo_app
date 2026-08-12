"use client";

import { useMemo } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useDashboardAccessQuery } from "@/hooks/queries/useDashboardAccessQuery";
import {
  isTicketViewOnlyAccess,
  ticketCanMutate,
} from "@/lib/tickets/ticket-dashboard-access";

/** Client-side ticket dashboard capability checks from dashboard_access_points. */
export function useTicketDashboardAccess() {
  const { isSuperAdmin, loading: permsLoading } = usePermissions();
  const { data: dashboardAccessData, isLoading: accessLoading } = useDashboardAccessQuery();

  const accessPoints = dashboardAccessData?.accessPoints ?? [];
  const accessReady = !permsLoading && !accessLoading && dashboardAccessData != null;
  const loading = !accessReady;

  const isViewOnly = useMemo(() => {
    // Safe default: block mutations until access is known.
    if (!accessReady) return true;
    return isTicketViewOnlyAccess({ isSuperAdmin, accessPoints });
  }, [accessReady, isSuperAdmin, accessPoints]);

  const canMutate = useMemo(
    () =>
      accessReady &&
      !isViewOnly &&
      ticketCanMutate({ isSuperAdmin, accessPoints }),
    [accessReady, isViewOnly, isSuperAdmin, accessPoints]
  );

  return {
    loading,
    isViewOnly,
    canMutate,
    accessPoints,
  };
}
