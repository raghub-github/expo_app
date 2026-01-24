"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useDashboardAccess } from "@/hooks/useDashboardAccess";
import { usePermissions } from "@/hooks/usePermissions";
import {
  mainNavigation,
  getCurrentDashboard,
  getCurrentDashboardSubRoutes,
  type MainNavItem,
  type DashboardSubRoute,
} from "@/lib/navigation/dashboard-routes";

interface HierarchicalSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  isInSpecificDashboard?: boolean;
}

export function HierarchicalSidebar({ isOpen, onToggle, isInSpecificDashboard: propIsInSpecificDashboard }: HierarchicalSidebarProps) {
  const pathname = usePathname();
  const { dashboards, loading: accessLoading } = useDashboardAccess();
  const { isSuperAdmin, loading: permissionsLoading } = usePermissions();
  const [isMainMenuOpen, setIsMainMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Remove query parameters for comparison
  const cleanPathname = useMemo(() => pathname.split('?')[0].split('#')[0], [pathname]);

  // Get current dashboard
  const currentDashboard = useMemo(
    () => getCurrentDashboard(cleanPathname),
    [cleanPathname]
  );

  // Get sub-routes for current dashboard
  const currentSubRoutes = useMemo(
    () => {
      const routes = getCurrentDashboardSubRoutes(cleanPathname);
      // Debug logging
      if (process.env.NODE_ENV === "development") {
        console.log("[Sidebar Debug]", {
          pathname,
          cleanPathname,
          currentDashboard: currentDashboard?.name,
          hasSubRoutes: !!currentDashboard?.subRoutes,
          subRoutesCount: routes.length,
          isInSpecificDashboard: currentDashboard && cleanPathname !== "/dashboard"
        });
      }
      return routes;
    },
    [cleanPathname, pathname, currentDashboard]
  );

  // Check if we're in a specific dashboard (not on home)
  const isInSpecificDashboard = propIsInSpecificDashboard ?? (currentDashboard && cleanPathname !== "/dashboard");

  // Reset main menu when entering/exiting a specific dashboard
  useEffect(() => {
    if (currentDashboard && cleanPathname !== "/dashboard") {
      setIsMainMenuOpen(false); // Close main menu when entering specific dashboard
    }
  }, [cleanPathname, currentDashboard]);

  // Create accessible dashboards set
  const accessibleDashboards = useMemo(() => {
    return new Set(
      dashboards.filter((d) => d.isActive).map((d) => d.dashboardType)
    );
  }, [dashboards]);

  // Filter navigation items based on access
  const filteredNavigation = useMemo(() => {
    return mainNavigation.filter((item) => {
      // Always show Home
      if (item.href === "/dashboard") {
        return true;
      }

      // Check super admin requirement
      if (item.requiresSuperAdmin) {
        return isSuperAdmin;
      }

      // Check dashboard access
      if (item.dashboardType) {
        // Super admin has access to all dashboards
        if (isSuperAdmin) {
          return true;
        }

        // Special handling for Orders - show if user has access to any order type
        if (item.dashboardType === "ORDER_FOOD") {
          return (
            accessibleDashboards.has("ORDER_FOOD") ||
            accessibleDashboards.has("ORDER_PERSON_RIDE") ||
            accessibleDashboards.has("ORDER_PARCEL")
          );
        }

        // Check dashboard access directly
        return accessibleDashboards.has(item.dashboardType);
      }

      // Default: show if no specific requirements
      return true;
    });
  }, [isSuperAdmin, accessibleDashboards]);

  // Close mobile menu when pathname changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Loading state - maintain exact dimensions to prevent layout shift
  if (accessLoading || permissionsLoading) {
    return (
      <aside className={`fixed inset-y-0 left-0 z-40 flex h-screen flex-col bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 shadow-2xl transition-all duration-300 ease-in-out ${
        isOpen ? "w-56" : "w-16"
      }`}>
        <div className="flex h-14 items-center justify-between border-b border-gray-700 px-2">
          {isOpen ? (
            <div className="flex items-center justify-center flex-1">
              <div className="h-11 w-11 bg-gray-700 rounded animate-pulse" />
              <div className="ml-2 h-4 w-24 bg-gray-700 rounded animate-pulse" />
            </div>
          ) : (
            <div className="flex items-center justify-center w-full">
              <div className="h-10 w-10 bg-gray-700 rounded animate-pulse" />
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
          {/* Skeleton navigation items matching final structure */}
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className={`rounded-lg ${
                isOpen ? "px-2.5 py-2" : "px-2 py-2.5 justify-center"
              } flex items-center ${
                isOpen ? "space-x-2" : ""
              }`}
            >
              <div className="h-4 w-4 bg-gray-700 rounded animate-pulse flex-shrink-0" />
              {isOpen && (
                <div className="h-3 w-20 bg-gray-700 rounded animate-pulse" />
              )}
            </div>
          ))}
        </nav>
        <div className="border-t border-gray-700/50 bg-gray-800/50 backdrop-blur-sm p-2">
          <div className={`flex w-full items-center justify-center rounded-lg bg-gray-700/80 ${
            isOpen ? "space-x-2 px-3 py-2.5" : "p-2.5"
          }`}>
            <div className="h-4 w-4 bg-gray-600 rounded animate-pulse" />
            {isOpen && <div className="h-3 w-8 bg-gray-600 rounded animate-pulse" />}
          </div>
        </div>
      </aside>
    );
  }

  // When in specific dashboard, show collapsed sidebar with toggle button
  if (isInSpecificDashboard) {
    return (
      <>
        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="fixed left-4 top-4 z-50 rounded-lg bg-gradient-to-r from-gray-800 to-gray-700 p-2.5 text-white shadow-xl hover:shadow-2xl transition-all hover:scale-105 border border-gray-600/50 lg:hidden"
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? (
            <X className="h-6 w-6 transition-transform rotate-90" />
          ) : (
            <Menu className="h-6 w-6" />
          )}
        </button>

        {/* Collapsible Left Sidebar - Icon-only when closed, full when open */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex h-screen flex-col bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 shadow-2xl transition-all duration-300 ease-in-out ${
            isOpen ? "w-56" : "w-16"
          }`}
        >
          {/* Sidebar Header */}
          <div className="flex h-14 items-center justify-between border-b border-gray-700 px-2">
            {isOpen ? (
              <>
                <Link
                  href="/dashboard"
                  className="flex items-center justify-center flex-1"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Image
                    src="/onlylogo.png"
                    alt="GatiMitra"
                    width={44}
                    height={44}
                    className="object-contain flex-shrink-0"
                    priority
                  />
                  <span className="ml-2 text-sm font-bold text-white whitespace-nowrap">GatiMitra</span>
                </Link>
                <button
                  onClick={onToggle}
                  className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white lg:hidden"
                  aria-label="Close sidebar"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <Link
                href="/dashboard"
                className="flex items-center justify-center w-full"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Image
                  src="/onlylogo.png"
                  alt="GatiMitra"
                  width={40}
                  height={40}
                  className="object-contain"
                  priority
                />
              </Link>
            )}
          </div>

          {/* Navigation Content */}
          <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
            <div className="space-y-1">
              {filteredNavigation.map((item) => {
                const isActive = cleanPathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                    }}
                    className={`group relative flex items-center rounded-lg transition-all duration-200 ${
                      isOpen 
                        ? `space-x-2 px-2.5 py-2 text-xs font-medium ${
                            isActive
                              ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/20"
                              : "text-gray-300 hover:bg-gray-800/80 hover:text-white hover:translate-x-1"
                          }`
                        : `justify-center px-2 py-2.5 ${
                            isActive
                              ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg"
                              : "text-gray-300 hover:bg-gray-800/80 hover:text-white"
                          }`
                    }`}
                    title={!isOpen ? item.name : undefined}
                  >
                    <Icon className={`flex-shrink-0 ${isOpen ? "h-4 w-4" : "h-5 w-5"}`} />
                    {isOpen && (
                      <>
                        <span className="truncate">{item.name}</span>
                        {isActive && (
                          <div className="absolute right-2 h-2 w-2 rounded-full bg-white animate-pulse shadow-lg shadow-white/50"></div>
                        )}
                      </>
                    )}
                    {/* Tooltip for collapsed state */}
                    {!isOpen && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
                        {item.name}
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 border-4 border-transparent border-r-gray-900"></div>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Sidebar Footer with Toggle Button */}
          <div className="border-t border-gray-700/50 bg-gray-800/50 backdrop-blur-sm p-2">
            {/* {isOpen && (
              <div className="text-xs mb-2 px-2">
                <p className="font-semibold text-gray-200 mb-1">Main Dashboard</p>
                <p className="text-gray-400">{filteredNavigation.length} dashboards</p>
              </div>
            )} */}
            <button
              onClick={onToggle}
              className={`flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-gray-700/80 to-gray-600/80 text-white transition-all hover:from-gray-600 hover:to-gray-500 hover:shadow-lg hover:scale-105 ${
                isOpen ? "space-x-2 px-3 py-2.5" : "p-2.5"
              }`}
              title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <ChevronLeft className={`h-4 w-4 transition-transform duration-200 ${isOpen ? '' : 'rotate-180'}`} />
              {isOpen && <span className="text-xs font-semibold">Hide</span>}
            </button>
          </div>

          {/* Overlay for mobile */}
          {isMobileMenuOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/50 lg:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-hidden="true"
            />
          )}
        </aside>
      </>
    );
  }

  // Default sidebar for main dashboard
  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-gradient-to-r from-gray-800 to-gray-700 p-2.5 text-white shadow-xl hover:shadow-2xl transition-all hover:scale-105 border border-gray-600/50 lg:hidden"
        aria-label="Toggle menu"
      >
        {isMobileMenuOpen ? (
          <X className="h-6 w-6 transition-transform rotate-90" />
        ) : (
          <Menu className="h-6 w-6" />
        )}
      </button>

      {/* Sidebar - Main Dashboard */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen flex-col bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 shadow-2xl transition-all duration-300 ease-in-out ${
          isOpen ? "w-56" : "w-16"
        }`}
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#4B5563 #1F2937' }}
      >
        {/* Sidebar Header */}
        <div className="flex h-14 items-center justify-between border-b border-gray-700 px-2">
          {isOpen ? (
            <>
              <Link
                href="/dashboard"
                className="flex items-center justify-center flex-1"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Image
                  src="/onlylogo.png"
                  alt="GatiMitra"
                  width={44}
                  height={44}
                  className="object-contain flex-shrink-0"
                  priority
                />
                <span className="ml-2 text-sm font-bold text-white whitespace-nowrap">GatiMitra</span>
              </Link>
              <button
                onClick={onToggle}
                className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white lg:hidden"
                aria-label="Close sidebar"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <Link
              href="/dashboard"
              className="flex items-center justify-center w-full"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <Image
                src="/onlylogo.png"
                alt="GatiMitra"
                width={40}
                height={40}
                className="object-contain"
                priority
              />
            </Link>
          )}
        </div>

        {/* Navigation Content */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
          {/* Show Main Navigation when NOT in a specific dashboard */}
          {!isInSpecificDashboard && (
            <div className="space-y-1">
              {filteredNavigation.map((item) => {
                const isActive = cleanPathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`group relative flex items-center rounded-lg transition-all duration-200 ${
                      isOpen 
                        ? `space-x-2 px-2.5 py-2 text-xs font-medium ${
                            isActive
                              ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/20"
                              : "text-gray-300 hover:bg-gray-800/80 hover:text-white hover:translate-x-1"
                          }`
                        : `justify-center px-2 py-2.5 ${
                            isActive
                              ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg"
                              : "text-gray-300 hover:bg-gray-800/80 hover:text-white"
                          }`
                    }`}
                    title={!isOpen ? item.name : undefined}
                  >
                    <Icon className={`flex-shrink-0 ${isOpen ? "h-4 w-4" : "h-5 w-5"}`} />
                    {isOpen && (
                      <>
                        <span className="truncate">{item.name}</span>
                        {isActive && (
                          <div className="absolute right-2 h-1.5 w-1.5 rounded-full bg-white animate-pulse shadow-lg shadow-white/50"></div>
                        )}
                      </>
                    )}
                    {/* Tooltip for collapsed state */}
                    {!isOpen && (
                      <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
                        {item.name}
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 border-4 border-transparent border-r-gray-900"></div>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* Sidebar Footer with Toggle Button */}
        <div className="border-t border-gray-700/50 bg-gray-800/50 backdrop-blur-sm p-2">
          {/* {isOpen && (
            <div className="text-xs mb-2 px-2">
              <p className="font-semibold text-gray-200 mb-1">Main Dashboard</p>
              <p className="text-gray-400">{filteredNavigation.length} dashboards</p>
            </div>
          )} */}
          <button
            onClick={onToggle}
            className={`flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-gray-700/80 to-gray-600/80 text-white transition-all hover:from-gray-600 hover:to-gray-500 hover:shadow-lg hover:scale-105 ${
              isOpen ? "space-x-2 px-3 py-2.5" : "p-2.5"
            }`}
            title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <ChevronLeft className={`h-4 w-4 transition-transform duration-200 ${isOpen ? '' : 'rotate-180'}`} />
            {isOpen && <span className="text-xs font-semibold">Hide</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </>
  );
}
