"use client";

import { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Users } from "lucide-react";
import {
  getCurrentDashboard,
  getCurrentDashboardSubRoutes,
  getMerchantSubRoutesForPath,
  adminPortalMerchantRoutes,
  merchantPortalSidebarRoutes,
  type DashboardSubRoute,
  type AreaManagerTypeFilter,
} from "@/lib/navigation/dashboard-routes";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { TicketFilters } from "@/components/tickets/TicketFilters";
import { TicketPropertiesPanel } from "@/components/tickets/ticket-view/TicketPropertiesPanel";
import { usePermission } from "@/hooks/usePermission";
import { getDashboardTypeFromPath } from "@/lib/permissions/path-mapping";
import { StoreInfoCard, StoreInfoCardSkeleton, type StoreInfoCardData } from "@/components/layout/StoreInfoCard";
import { WalletRequestsSummarySidebar } from "@/components/merchants/WalletRequestsSummarySidebar";
import { useStore } from "@/hooks/useStore";
import { useMerchantsSearch } from "@/context/MerchantsSearchContext";

interface RightSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  /** When true, this (Properties) sidebar shifts left so Filters can sit at right: 0 */
  filterSidebarOpen?: boolean;
}

export function RightSidebar({ isOpen, onToggle, filterSidebarOpen }: RightSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const riderCtx = useRiderDashboardOptional();
  const { hasDashboardAccess, isSuperAdmin } = usePermission();
  
  // Remove query parameters for comparison
  const cleanPathname = useMemo(() => pathname.split('?')[0].split('#')[0], [pathname]);

  // Get current dashboard
  const currentDashboard = useMemo(
    () => getCurrentDashboard(cleanPathname),
    [cleanPathname]
  );

  const isStorePath = /^\/dashboard\/merchants\/stores\/\d+/.test(cleanPathname);
  const portal = searchParams.get("portal") || (isStorePath ? "merchant" : "admin");

  // Sub-routes for current dashboard. When on merchants: admin portal = only All Merchants + Verifications; merchant portal = Dashboard, Orders, Menu, etc. When on a store page, show store-scoped links.
  const rawSubRoutes = useMemo(() => {
    const dashboard = getCurrentDashboard(cleanPathname);
    if (dashboard?.href === "/dashboard/merchants") {
      const isStorePath = /^\/dashboard\/merchants\/stores\/\d+/.test(cleanPathname);
      if (isStorePath) return getMerchantSubRoutesForPath(cleanPathname);
      if (portal === "merchant") return merchantPortalSidebarRoutes;
      return adminPortalMerchantRoutes;
    }
    return getCurrentDashboardSubRoutes(cleanPathname);
  }, [cleanPathname, portal]);
  const isAreaManagerDashboard =
    currentDashboard?.dashboardType === "AREA_MANAGER";
  const isOrderDashboard =
    currentDashboard?.dashboardType === "ORDER_FOOD" ||
    currentDashboard?.dashboardType === "ORDER_PARCEL" ||
    currentDashboard?.dashboardType === "ORDER_PERSON_RIDE" ||
    cleanPathname.startsWith("/dashboard/orders");
  const [areaManagerType, setAreaManagerType] =
    useState<AreaManagerTypeFilter | null>(null);

  useEffect(() => {
    if (!isAreaManagerDashboard) return;
    let cancelled = false;
    fetch("/api/area-manager/me")
      .then((r) => r.json())
      .then((body) => {
        if (cancelled || !body?.success) return;
        const t = body?.data?.managerType;
        if (t === "MERCHANT" || t === "RIDER") setAreaManagerType(t);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAreaManagerDashboard]);

  const currentSubRoutes = useMemo((): DashboardSubRoute[] => {
    let filtered = rawSubRoutes;

    // Filter Area Manager routes
    if (isAreaManagerDashboard && rawSubRoutes.length) {
      if (areaManagerType !== null) {
        filtered = rawSubRoutes.filter((r) => {
          const allowed = r.areaManagerType;
          if (!allowed || allowed === "BOTH") return true;
          return allowed === areaManagerType;
        });
      }
    }

    // Filter Order dashboard routes based on permissions
    if (isOrderDashboard && rawSubRoutes.length) {
      filtered = rawSubRoutes.filter((route) => {
        if (isSuperAdmin) return true;
        const dashboardType = getDashboardTypeFromPath(route.href);
        if (!dashboardType) return true;
        return hasDashboardAccess(dashboardType);
      });
    }

    return filtered;
  }, [isAreaManagerDashboard, isOrderDashboard, rawSubRoutes, areaManagerType, hasDashboardAccess, isSuperAdmin]);

  // Check if we're in a specific dashboard (not on home)
  const isInSpecificDashboard = Boolean(currentDashboard && cleanPathname !== "/dashboard");

  // Ticket ID from path (must be before any conditional return to satisfy Rules of Hooks)
  const ticketIdFromPath = useMemo(() => {
    const match = cleanPathname.match(/^\/dashboard\/tickets\/(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  }, [cleanPathname]);

  // Store ID when on a merchant store page (for Store Information Card in sidebar)
  const storeIdFromPath = useMemo(() => {
    const match = cleanPathname.match(/^\/dashboard\/merchants\/stores\/(\d+)/);
    return match ? match[1] : null;
  }, [cleanPathname]);

  const { store: sidebarStoreData } = useStore(storeIdFromPath);
  const merchantsSearch = useMerchantsSearch();

  const sidebarStore: StoreInfoCardData | null = useMemo(() => {
    if (!sidebarStoreData) return null;
    return {
      storeId: sidebarStoreData.id,
      name: sidebarStoreData.name ?? "",
      store_id: sidebarStoreData.store_id ?? "",
      full_address: sidebarStoreData.full_address ?? null,
      approval_status: sidebarStoreData.approval_status ?? null,
      store_phones: sidebarStoreData.store_phones ?? null,
      store_email: sidebarStoreData.store_email ?? null,
      created_at: sidebarStoreData.created_at ?? null,
    };
  }, [sidebarStoreData]);

  const isMerchantsListPage = cleanPathname === "/dashboard/merchants";
  const showMerchantSearchSkeleton =
    isMerchantsListPage && portal === "merchant" && Boolean(merchantsSearch?.isLoading);
  const merchantSearchResultStore: StoreInfoCardData | null = useMemo(() => {
    if (!merchantsSearch?.searchResultStore || !isMerchantsListPage || portal !== "merchant") return null;
    const s = merchantsSearch.searchResultStore;
    return {
      storeId: s.storeId,
      name: s.name,
      store_id: s.store_id,
      full_address: s.full_address ?? null,
      approval_status: s.approval_status ?? null,
      store_phones: s.store_phones ?? null,
    };
  }, [merchantsSearch?.searchResultStore, isMerchantsListPage, portal]);

  const isTicketsDashboard = currentDashboard?.href === "/dashboard/tickets";

  const isRiderDashboard =
    cleanPathname === "/dashboard/riders" ||
    cleanPathname.startsWith("/dashboard/riders/");

  const selectedRiderSearch = (searchParams.get("search") || "").trim();

  // Debug: verify when selected rider is available for sidebar decisions.
  if (isRiderDashboard) {
    // eslint-disable-next-line no-console
    console.log("RightSidebar - selectedRiderSearch:", selectedRiderSearch);
  }

  // Don't show right sidebar if not in a specific dashboard.
  // For rider dashboard, allow sidebar even when there are no sub-routes,
  // but only after a rider search value is present.
  if (
    !isInSpecificDashboard ||
    (!isRiderDashboard && !currentSubRoutes.length) ||
    (isRiderDashboard && !selectedRiderSearch)
  ) {
    return null;
  }

  // Keep selected rider across rider dashboard sub-routes (use GMR{id} from URL so refresh restores)
  const selectedRiderId = selectedRiderSearch;
  const appendRiderSearch = (href: string) => {
    if (!isRiderDashboard) return href;
    if (!selectedRiderId) return href;
    return `${href}?search=${encodeURIComponent(selectedRiderId)}`;
  };

  const isMerchantsDashboard = currentDashboard?.href === "/dashboard/merchants";
  const appendMerchantPortal = (href: string) => {
    if (!isMerchantsDashboard || portal !== "merchant") return href;
    const sep = href.includes("?") ? "&" : "?";
    return `${href}${sep}portal=merchant`;
  };

  return (
    <>
      {/* Right Sidebar: desktop = fixed rail; mobile = drawer from right with overlay */}
      {/* Mobile overlay - tap to close (same as left sidebar) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity duration-300"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed top-0 bottom-0 z-40 flex flex-col shadow-xl transition-[transform,width] duration-300 ease-out
          lg:top-14
          ${isOpen ? "w-56" : "w-14"}
          max-lg:w-72 ${isOpen ? "max-lg:translate-x-0" : "max-lg:translate-x-full"}
          lg:translate-x-0`}
        style={{
          right: filterSidebarOpen ? "14rem" : 0,
          backgroundColor: "#E8F0F2",
          scrollbarWidth: "thin",
          scrollbarColor: "#9CA3AF #E8F0F2",
        }}
      >
        {/* Sidebar Header - compact */}
        <div className="flex h-12 sm:h-14 items-center justify-between border-b border-gray-300/30 px-2 shrink-0">
          {isOpen ? (
            <div className="flex items-center justify-between flex-1 min-w-0 gap-2">
              <div className="flex items-center space-x-2 flex-1 min-w-0">
                {currentDashboard?.icon && (
                  <div className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 p-1.5 shrink-0">
                    <currentDashboard.icon className="h-4 w-4 text-white" />
                  </div>
                )}
                <h2 className="text-xs font-bold text-gray-800 truncate">{currentDashboard?.name}</h2>
              </div>
              {/* Agent Status Toggle - Only show on Tickets dashboard (API handles permission check) */}
            </div>
          ) : (
            <div className="flex items-center justify-center w-full relative">
              {currentDashboard?.icon && (
                <div className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 p-1.5">
                  <currentDashboard.icon className="h-4 w-4 text-white" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tickets dashboard: on ticket detail show Properties panel; else filters. Other dashboards: nav links. */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {isTicketsDashboard && ticketIdFromPath != null && isOpen ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <TicketPropertiesPanel ticketId={ticketIdFromPath} />
            </div>
          ) : isTicketsDashboard && isOpen ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <TicketFilters variant="sidebar" dark={false} />
            </div>
          ) : isTicketsDashboard ? (
            /* Tickets collapsed: no duplicate icons, empty content */
            <div className="flex-1 min-h-0" />
          ) : (
            <nav className="flex-1 space-y-2 overflow-y-auto px-2 py-3">
              {(() => {
                // Wallet & Earnings sub-pages (wallet-history, earnings) should highlight "Wallet & Earnings", not Rider Information
                const isWalletOrEarningsPath =
                  cleanPathname === "/dashboard/riders/wallet-history" ||
                  cleanPathname.startsWith("/dashboard/riders/wallet-history/") ||
                  cleanPathname === "/dashboard/riders/earnings" ||
                  cleanPathname.startsWith("/dashboard/riders/earnings/");
                // Special handling for customer dashboard - highlight "All Customers" when on /dashboard/customers
                const isCustomerDashboardHome = cleanPathname === "/dashboard/customers";
                const allRoutesForActive = [...currentSubRoutes];
                // When on Assign AM page, don't highlight the main Merchants tabs; the dedicated
                // "Assign AM to Stores" link below should be the only active item.
                const activeHref =
                  cleanPathname === "/dashboard/merchants/assign-am"
                    ? null
                    : allRoutesForActive
                        .filter((r) => {
                          const exactOrPrefix = cleanPathname === r.href || cleanPathname.startsWith(r.href + "/");
                          const walletEarningsAlias = r.href === "/dashboard/riders/wallet" && isWalletOrEarningsPath;
                          const customerHomeAlias = isCustomerDashboardHome && r.href === "/dashboard/customers/all";
                          return exactOrPrefix || walletEarningsAlias || customerHomeAlias;
                        })
                        .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
                const linkEl = (route: DashboardSubRoute) => {
                  const isActive = activeHref === route.href;
                  const Icon = route.icon;
                  return (
                    <Link
                      key={route.href}
                      href={appendMerchantPortal(appendRiderSearch(route.href))}
                      className={`group relative flex cursor-pointer items-center rounded-lg transition-all duration-200 ${
                        isOpen
                          ? `space-x-2 px-2.5 py-2 text-xs font-medium ${
                              isActive
                                ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/20"
                                : "text-gray-900 hover:bg-gray-200/80 hover:text-gray-900 hover:-translate-x-1"
                            }`
                          : `justify-center px-2 py-2.5 ${
                              isActive
                                ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg"
                                : "text-gray-900 hover:bg-gray-200/80 hover:text-gray-900"
                            }`
                      }`}
                      title={!isOpen ? route.name : route.description}
                    >
                      <Icon className={`flex-shrink-0 ${isOpen ? "h-4 w-4" : "h-5 w-5"}`} />
                      {isOpen && (
                        <>
                          <span className="flex-1 truncate">{route.name}</span>
                          {isActive && (
                            <div className="absolute right-2 h-2 w-2 rounded-full bg-white animate-pulse shadow-lg shadow-white/50"></div>
                          )}
                        </>
                      )}
                      {!isOpen && (
                        <div className="absolute right-full mr-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
                          {route.name}
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 border-4 border-transparent border-l-gray-900"></div>
                        </div>
                      )}
                    </Link>
                  );
                };
                const isAssignAmActive = cleanPathname === "/dashboard/merchants/assign-am";
                const effectiveStoreId =
                  storeIdFromPath ??
                  (merchantSearchResultStore?.storeId != null
                    ? String(merchantSearchResultStore.storeId)
                    : null);
                const showWalletRequests = isMerchantsDashboard && !effectiveStoreId;
                return (
                  <>
                    {currentSubRoutes.map((route) => linkEl(route))}
                    {/* Assign AM link for admin portal merchants dashboard (shown open and collapsed) */}
                    {isMerchantsDashboard && portal === "admin" && (
                      isOpen ? (
                        <Link
                          href="/dashboard/merchants/assign-am"
                          className={`mt-1 flex cursor-pointer items-center space-x-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-all duration-200 ${
                            isAssignAmActive
                              ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/20"
                              : "text-gray-900 hover:bg-gray-200/80 hover:text-gray-900 hover:-translate-x-1"
                          }`}
                        >
                          <Users className="h-4 w-4 flex-shrink-0" />
                          <span className="flex-1 truncate">Assign AM to Stores</span>
                        </Link>
                      ) : (
                        <Link
                          href="/dashboard/merchants/assign-am"
                          title="Assign AM to Stores"
                          className={`group relative mt-1 flex cursor-pointer items-center justify-center rounded-lg px-2 py-2.5 transition-all duration-200 ${
                            isAssignAmActive
                              ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg"
                              : "text-gray-900 hover:bg-gray-200/80 hover:text-gray-900"
                          }`}
                        >
                          <Users className="h-5 w-5 flex-shrink-0" />
                          <div className="absolute right-full mr-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
                            Assign AM to Stores
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 border-4 border-transparent border-l-gray-900" />
                          </div>
                        </Link>
                      )
                    )}
                    {/* Wallet requests: show only when NO specific store is selected (open and collapsed) */}
                    {showWalletRequests && (
                      <div className={isOpen ? "mt-2 min-w-0" : "mt-1"}>
                        <WalletRequestsSummarySidebar collapsed={!isOpen} />
                      </div>
                    )}
                    {/* Store Information Card: merchant portal — from URL store, or from search result on list page; skeleton when search loading */}
                    {isOpen && portal === "merchant" && (
                      <div className="mt-3 min-w-0">
                        {showMerchantSearchSkeleton ? (
                          <StoreInfoCardSkeleton />
                        ) : sidebarStore ? (
                          <StoreInfoCard store={sidebarStore} />
                        ) : merchantSearchResultStore ? (
                          <StoreInfoCard store={merchantSearchResultStore} />
                        ) : null}
                      </div>
                    )}
                  </>
                );
              })()}
            </nav>
          )}
        </div>

        {/* Sidebar Footer with Toggle Button - hidden on Tickets dashboard (use Open/Hide in pagination bar instead) */}
        {!isTicketsDashboard && (
          <div className="border-t border-gray-300/30 bg-gray-200/30 backdrop-blur-sm p-2">
            <button
              onClick={onToggle}
              className={`flex w-full cursor-pointer items-center justify-center rounded-lg bg-gray-300/50 text-gray-800 transition-all hover:bg-gray-400/60 hover:shadow-lg hover:scale-105 ${
                isOpen ? "space-x-2 px-3 py-2.5" : "p-2.5"
              }`}
              title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
              {isOpen && <span className="text-xs font-semibold">Hide</span>}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
