"use client";

import { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  getCurrentDashboard,
  getCurrentDashboardSubRoutes,
  type DashboardSubRoute,
  type AreaManagerTypeFilter,
} from "@/lib/navigation/dashboard-routes";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { TicketFilters } from "@/components/tickets/TicketFilters";
import { AgentStatusToggle } from "@/components/tickets/AgentStatusToggle";
import { usePermission } from "@/hooks/usePermission";

interface RightSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function RightSidebar({ isOpen, onToggle }: RightSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const riderCtx = useRiderDashboardOptional();
  
  // Remove query parameters for comparison
  const cleanPathname = useMemo(() => pathname.split('?')[0].split('#')[0], [pathname]);

  // Get current dashboard
  const currentDashboard = useMemo(
    () => getCurrentDashboard(cleanPathname),
    [cleanPathname]
  );

  // Sub-routes for current dashboard (may be filtered for Area Managers)
  const rawSubRoutes = useMemo(
    () => getCurrentDashboardSubRoutes(cleanPathname),
    [cleanPathname]
  );
  const isAreaManagerDashboard =
    currentDashboard?.dashboardType === "AREA_MANAGER";
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
    if (!isAreaManagerDashboard || !rawSubRoutes.length) return rawSubRoutes;
    if (areaManagerType === null) return rawSubRoutes;
    return rawSubRoutes.filter((r) => {
      const allowed = r.areaManagerType;
      if (!allowed || allowed === "BOTH") return true;
      return allowed === areaManagerType;
    });
  }, [isAreaManagerDashboard, rawSubRoutes, areaManagerType]);

  // Check if we're in a specific dashboard (not on home)
  const isInSpecificDashboard = Boolean(currentDashboard && cleanPathname !== "/dashboard");

  // Don't show right sidebar if not in a specific dashboard
  if (!isInSpecificDashboard || !currentSubRoutes.length) {
    return null;
  }

  // Keep selected rider across rider dashboard sub-routes (use GMR{id} so URL is stable and refresh restores)
  const isRiderDashboard = cleanPathname === "/dashboard/riders" || cleanPathname.startsWith("/dashboard/riders/");
  const selectedRiderSearch = (searchParams.get("search") || "").trim();
  const selectedRiderId = selectedRiderSearch || (riderCtx?.currentRiderId != null ? `GMR${riderCtx.currentRiderId}` : "");
  const appendRiderSearch = (href: string) => {
    if (!isRiderDashboard) return href;
    if (!selectedRiderId) return href;
    return `${href}?search=${encodeURIComponent(selectedRiderId)}`;
  };

  const isTicketsDashboard = currentDashboard?.href === "/dashboard/tickets";

  return (
    <>
      {/* Right Sidebar - Collapsible; Tickets: filters only, no nav links */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex h-screen flex-col shadow-xl transition-all duration-300 ease-in-out ${
          isOpen ? "w-56" : "w-14"
        }`}
        style={{ backgroundColor: '#E8F0F2', scrollbarWidth: 'thin', scrollbarColor: '#9CA3AF #E8F0F2' }}
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
              {isTicketsDashboard && (
                <AgentStatusToggle />
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center w-full relative">
              {currentDashboard?.icon && (
                <div className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 p-1.5">
                  <currentDashboard.icon className="h-4 w-4 text-white" />
                </div>
              )}
              {/* Agent Status Toggle - Collapsed state */}
              {isTicketsDashboard && (
                <div className="absolute right-1">
                  <AgentStatusToggle />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation - hidden on Tickets dashboard; show filters only */}
        {!isTicketsDashboard && (
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2 shrink-0">
            {(() => {
              const isWalletOrEarningsPath =
                cleanPathname === "/dashboard/riders/wallet-history" ||
                cleanPathname.startsWith("/dashboard/riders/wallet-history/") ||
                cleanPathname === "/dashboard/riders/earnings" ||
                cleanPathname.startsWith("/dashboard/riders/earnings/");
              const activeHref = currentSubRoutes
                .filter((r) => {
                  const exactOrPrefix = cleanPathname === r.href || cleanPathname.startsWith(r.href + "/");
                  const walletEarningsAlias = r.href === "/dashboard/riders/wallet" && isWalletOrEarningsPath;
                  return exactOrPrefix || walletEarningsAlias;
                })
                .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
              return currentSubRoutes.map((route) => {
                const isActive = activeHref === route.href;
                const Icon = route.icon;
                return (
                  <Link
                    key={route.href}
                    href={appendRiderSearch(route.href)}
                    className={`group relative flex items-center rounded-lg transition-all duration-200 ${
                      isOpen 
                        ? `space-x-2 px-2 py-1.5 text-xs font-medium ${
                            isActive
                              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20"
                              : "text-gray-700 hover:bg-gray-200/80 hover:text-gray-900"
                          }`
                        : `justify-center p-2 ${
                            isActive
                              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg"
                              : "text-gray-700 hover:bg-gray-200/80 hover:text-gray-900"
                          }`
                    }`}
                    title={!isOpen ? route.name : route.description}
                  >
                    <Icon className={`flex-shrink-0 ${isOpen ? "h-4 w-4" : "h-5 w-5"}`} />
                    {isOpen && (
                      <>
                        <span className="flex-1 truncate">{route.name}</span>
                        {isActive && (
                          <div className="absolute right-2 h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                        )}
                      </>
                    )}
                    {!isOpen && (
                      <div className="absolute right-full mr-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
                        {route.name}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 border-4 border-transparent border-l-gray-800" />
                      </div>
                    )}
                  </Link>
                );
              });
            })()}
          </nav>
        )}

        {/* Tickets: filters only (no nav); fills remaining space */}
        {isTicketsDashboard && isOpen && (
          <div className="flex-1 min-h-0 flex flex-col border-t border-gray-300/30">
            <TicketFilters variant="sidebar" dark={false} />
          </div>
        )}

        {/* Sidebar Footer with Toggle Button */}
        <div className="border-t border-gray-300/30 bg-gray-200/30 backdrop-blur-sm p-2">
          <button
            onClick={onToggle}
            className={`flex w-full items-center justify-center rounded-lg bg-gray-300/50 text-gray-800 transition-all hover:bg-gray-400/60 hover:shadow-lg hover:scale-105 ${
              isOpen ? "space-x-2 px-3 py-2.5" : "p-2.5"
            }`}
            title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            {isOpen && <span className="text-xs font-semibold">Hide</span>}
          </button>
        </div>
      </aside>

      {/* Overlay for mobile - only show when sidebar is open on mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}
    </>
  );
}
