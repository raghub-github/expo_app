"use client";

import { useMemo } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useDashboardAccessQuery } from "@/hooks/queries/useDashboardAccessQuery";
import {
  canToggleMerchantPortal,
  filterStoreScopedRoutesByMerchantAccess,
  hasMerchantAdminAccess,
  isMerchantViewOnlyAccess,
  merchantCanMutate,
  merchantHasAccessGroup,
  merchantHasAction,
} from "@/lib/merchants/merchant-dashboard-access";
import type { DashboardSubRoute } from "@/lib/navigation/dashboard-routes";

/** Client-side merchant dashboard capability checks from dashboard_access_points. */
export function useMerchantDashboardAccess() {
  const { isSuperAdmin, canTogglePortal, loading: permsLoading } = usePermissions();
  const { data: dashboardAccessData, isLoading: accessLoading } = useDashboardAccessQuery();

  const accessPoints = dashboardAccessData?.accessPoints ?? [];
  /** Block mutations until access payload is present (avoids CTA flash / stale cache). */
  const accessReady = !permsLoading && !accessLoading && dashboardAccessData != null;
  const loading = permsLoading || accessLoading;

  const hasAdminMerchantAccess = useMemo(
    () =>
      hasMerchantAdminAccess({
        isSuperAdmin,
        accessPoints,
      }),
    [isSuperAdmin, accessPoints]
  );

  const canShowPortalToggle = useMemo(
    () =>
      canToggleMerchantPortal({
        isSuperAdmin,
        canTogglePortal,
        accessPoints,
      }),
    [isSuperAdmin, canTogglePortal, accessPoints]
  );

  const isViewOnly = useMemo(
    () =>
      !accessReady ||
      isMerchantViewOnlyAccess({
        isSuperAdmin,
        accessPoints,
      }),
    [accessReady, isSuperAdmin, accessPoints]
  );

  const canMutate = useMemo(
    () =>
      accessReady &&
      !isViewOnly &&
      merchantCanMutate({
        isSuperAdmin,
        accessPoints,
      }),
    [accessReady, isSuperAdmin, accessPoints, isViewOnly]
  );

  const canOnboard = useMemo(
    () =>
      !isViewOnly &&
      (isSuperAdmin ||
        hasAdminMerchantAccess ||
        merchantHasAction(accessPoints, "MERCHANT_ONBOARDING", "APPROVE") ||
        merchantHasAction(accessPoints, "MERCHANT_ONBOARDING", "REJECT") ||
        merchantHasAction(accessPoints, "MERCHANT_ONBOARDING", "UPDATE")),
    [isSuperAdmin, hasAdminMerchantAccess, accessPoints, isViewOnly]
  );

  const canOperateStore = useMemo(
    () =>
      !isViewOnly &&
      (isSuperAdmin ||
        hasAdminMerchantAccess ||
        merchantHasAction(accessPoints, "MERCHANT_OPERATIONS", "UPDATE") ||
        merchantHasAccessGroup(accessPoints, "MERCHANT_STATUS_MANAGEMENT")),
    [isSuperAdmin, hasAdminMerchantAccess, accessPoints, isViewOnly]
  );

  const canManageStore = useMemo(
    () =>
      !isViewOnly &&
      (isSuperAdmin ||
        hasAdminMerchantAccess ||
        merchantHasAccessGroup(accessPoints, "MERCHANT_STORE_MANAGEMENT") ||
        merchantHasAccessGroup(accessPoints, "MERCHANT_MENU_MANAGEMENT")),
    [isSuperAdmin, hasAdminMerchantAccess, accessPoints, isViewOnly]
  );

  const canEditWallet = useMemo(
    () =>
      !isViewOnly &&
      (isSuperAdmin ||
        hasAdminMerchantAccess ||
        merchantHasAction(accessPoints, "MERCHANT_WALLET", "UPDATE") ||
        merchantHasAccessGroup(accessPoints, "MERCHANT_WALLET_REQUESTS")),
    [isSuperAdmin, hasAdminMerchantAccess, accessPoints, isViewOnly]
  );

  const canManageBank = useMemo(
    () =>
      !isViewOnly &&
      (isSuperAdmin ||
        hasAdminMerchantAccess ||
        merchantHasAccessGroup(accessPoints, "MERCHANT_BANK_MANAGEMENT") ||
        merchantHasAccessGroup(accessPoints, "MERCHANT_STORE_MANAGEMENT")),
    [isSuperAdmin, hasAdminMerchantAccess, accessPoints, isViewOnly]
  );

  const canManageOffers = useMemo(
    () =>
      !isViewOnly &&
      (isSuperAdmin ||
        hasAdminMerchantAccess ||
        merchantHasAccessGroup(accessPoints, "MERCHANT_OFFER_MANAGEMENT") ||
        merchantHasAccessGroup(accessPoints, "MERCHANT_STORE_MANAGEMENT")),
    [isSuperAdmin, hasAdminMerchantAccess, accessPoints, isViewOnly]
  );

  const canApproveMenuItems = useMemo(
    () =>
      !isViewOnly &&
      (isSuperAdmin ||
        hasAdminMerchantAccess ||
        merchantHasAccessGroup(accessPoints, "MERCHANT_ITEM_APPROVAL") ||
        merchantHasAccessGroup(accessPoints, "MERCHANT_MENU_MANAGEMENT") ||
        merchantHasAccessGroup(accessPoints, "MERCHANT_STORE_MANAGEMENT")),
    [isSuperAdmin, hasAdminMerchantAccess, accessPoints, isViewOnly]
  );

  const filterStoreRoutes = useMemo(() => {
    return (routes: DashboardSubRoute[]) =>
      filterStoreScopedRoutesByMerchantAccess(routes, {
        isSuperAdmin,
        canTogglePortal: hasAdminMerchantAccess || canShowPortalToggle,
        accessPoints,
      });
  }, [isSuperAdmin, hasAdminMerchantAccess, canShowPortalToggle, accessPoints]);

  return {
    loading,
    isSuperAdmin,
    hasAdminMerchantAccess,
    /** Show Admin/Merchant portal switch (does not grant CRUD by itself). */
    canShowPortalToggle,
    isViewOnly,
    canMutate,
    canOnboard,
    canOperateStore,
    canManageStore,
    canManageBank,
    canManageOffers,
    canApproveMenuItems,
    canEditWallet,
    filterStoreRoutes,
    accessPoints,
  };
}
