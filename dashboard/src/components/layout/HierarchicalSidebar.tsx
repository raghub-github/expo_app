"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchDashboardSection } from "@/lib/dashboard-prefetch";
import {
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useDashboardAccess } from "@/hooks/useDashboardAccess";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/providers/AuthProvider";
import {
  mainNavigation,
  getCurrentDashboard,
  getCurrentDashboardSubRoutes,
  isSuperAdminNavPath,
  type MainNavItem,
  type DashboardSubRoute,
} from "@/lib/navigation/dashboard-routes";
import { useLeftSidebarMobile } from "@/context/LeftSidebarMobileContext";
import { useLogout } from "@/hooks/queries/useAuthQuery";
import { getUserInitials } from "@/lib/user-avatar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useCurrentRoute } from "@/context/CurrentRouteContext";

interface HierarchicalSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  isInSpecificDashboard?: boolean;
  /** Called on mousedown with target href so layout can show section-specific skeleton. */
  onNavigationStart?: (targetHref: string) => void;
}

export function HierarchicalSidebar({ isOpen, onToggle, isInSpecificDashboard: propIsInSpecificDashboard, onNavigationStart }: HierarchicalSidebarProps) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { dashboards, loading: accessLoading, error: accessError } = useDashboardAccess();
  const handleNavPrefetch = useCallback(
    (href: string) => {
      prefetchDashboardSection(queryClient, href);
    },
    [queryClient]
  );
  const { isSuperAdmin, loading: permissionsLoading, error: permissionsError } = usePermissions();
  const [isMainMenuOpen, setIsMainMenuOpen] = useState(false);
  const mobileCtx = useLeftSidebarMobile();
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const isMobileMenuOpen = mobileCtx ? mobileCtx.isMobileMenuOpen : internalMobileOpen;
  const setMobileMenuOpen = mobileCtx ? mobileCtx.setMobileMenuOpen : setInternalMobileOpen;
  const [skeletonExpired, setSkeletonExpired] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  /** Optimistic active state: set on mousedown so the clicked item highlights instantly before route/API. */
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);
  const { user: authUser } = useAuth();
  const logoutMutation = useLogout();
  const userEmail = authUser?.email ?? null;
  const userMetadata = (authUser as any)?.user_metadata ?? {};
  const userName =
    userMetadata?.full_name ??
    userMetadata?.name ??
    (userEmail ? userEmail.split("@")[0] : null) ??
    null;
  const avatarUrl = userMetadata?.avatar_url ?? userMetadata?.picture ?? null;
  const currentRouteCtx = useCurrentRoute();

  // Short skeleton (0.5s) so sidebar appears fast; then show real nav
  useEffect(() => {
    const t = setTimeout(() => setSkeletonExpired(true), 500);
    return () => clearTimeout(t);
  }, []);

  // Remove query parameters for comparison
  const cleanPathname = useMemo(() => pathname.split('?')[0].split('#')[0], [pathname]);

  // Get current dashboard
  const currentDashboard = useMemo(
    () => getCurrentDashboard(cleanPathname),
    [cleanPathname]
  );

  // Get sub-routes for current dashboard
  const currentSubRoutes = useMemo(
    () => getCurrentDashboardSubRoutes(cleanPathname),
    [cleanPathname]
  );

  // Check if we're in a specific dashboard (not on home)
  const isInSpecificDashboard = propIsInSpecificDashboard ?? (currentDashboard && cleanPathname !== "/dashboard");

  // Reset main menu when entering/exiting a specific dashboard
  useEffect(() => {
    if (currentDashboard && cleanPathname !== "/dashboard") {
      setIsMainMenuOpen(false); // Close main menu when entering specific dashboard
    }
  }, [cleanPathname, currentDashboard]);

  const isLoading = accessLoading || permissionsLoading;
  const hasError = Boolean(accessError || permissionsError);
  const useFallback = isLoading && skeletonExpired;

  // null = show all items; Set = filter by access. While loading (useFallback) show all so sidebar isn't empty.
  const accessibleDashboards = useMemo(() => {
    if (hasError) return null;
    if (useFallback) return null; // Still loading: show full nav; filter once data loads
    if (dashboards.length === 0) return null;
    return new Set(
      dashboards.filter((d) => d.isActive).map((d) => d.dashboardType)
    );
  }, [dashboards, useFallback, hasError]);

  // Clear optimistic active state as soon as pathname changes (navigation completed or user navigated elsewhere)
  useEffect(() => {
    setPendingNavHref(null);
  }, [cleanPathname]);

  const effectiveSuperAdmin = hasError || useFallback ? true : isSuperAdmin;

  const filteredNavigation = useMemo(() => {
    return mainNavigation.filter((item) => {
      if (item.href === "/dashboard") return true;
      if (accessibleDashboards === null) return true;
      if (item.requiresSuperAdmin) return effectiveSuperAdmin;
      if (item.dashboardType) {
        if (effectiveSuperAdmin) return true;
        if (item.dashboardType === "ORDER_FOOD") {
          return (
            accessibleDashboards.has("ORDER_FOOD") ||
            accessibleDashboards.has("ORDER_PERSON_RIDE") ||
            accessibleDashboards.has("ORDER_PARCEL")
          );
        }
        return accessibleDashboards.has(item.dashboardType);
      }
      return true;
    });
  }, [effectiveSuperAdmin, accessibleDashboards]);

  // Close mobile menu when pathname changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname, setMobileMenuOpen]);

  // Back button (browser/Android) closes sidebar when open
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onPop = () => setMobileMenuOpen(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [isMobileMenuOpen, setMobileMenuOpen]);

  const showSkeleton = isLoading && !skeletonExpired;
  // Same width as right sidebar: w-56 (224px) when expanded, w-16 when collapsed. Mobile: w-72 when open.
  const sidebarWidth = `max-lg:w-72 ${isOpen ? "lg:w-56" : "lg:w-16"}`;
  const mobileTranslate = isMobileMenuOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full";
  const sidebarBase =
    `fixed inset-y-0 left-0 z-40 flex h-screen flex-col shrink-0 transition-[transform,width] duration-300 ease-out lg:translate-x-0 ${mobileTranslate} ${sidebarWidth}`;

  /** Single source of truth for sidebar chrome - same on every page. Min-width prevents any flex reflow. */
  const asideStyle: React.CSSProperties = {
    background: "linear-gradient(180deg, #0f2d42 0%, #12344D 50%, #0f2d42 100%)",
    boxShadow: "4px 0 24px rgba(0,0,0,0.15)",
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(255,255,255,0.2) transparent",
    minWidth: isOpen ? 224 : undefined,
  };

  if (showSkeleton) {
    return (
      <aside className={sidebarBase} style={asideStyle}>
        <div className="flex h-14 min-h-14 items-center justify-between border-b border-white/10 px-3 shrink-0">
          {isOpen ? (
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-white/15 animate-pulse shrink-0" />
              <div className="h-4 w-24 rounded-lg bg-white/15 animate-pulse" />
            </div>
          ) : (
            <div className="flex items-center justify-center w-full">
              <div className="h-9 w-9 rounded-xl bg-white/15 animate-pulse" />
            </div>
          )}
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 py-4 space-y-0.5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-xl flex items-center px-3 py-2.5 gap-3">
              <div className="h-5 w-5 rounded-md bg-white/15 animate-pulse shrink-0" />
              {isOpen && <div className="h-3.5 w-20 rounded bg-white/15 animate-pulse" />}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 bg-white/5 backdrop-blur-md p-2.5 shrink-0">
          <div className={`flex w-full items-center justify-center rounded-xl bg-white/10 ${
            isOpen ? "gap-2 px-3 py-2.5" : "p-2.5"
          }`}>
            <div className="h-4 w-4 rounded bg-white/25 animate-pulse" />
            {isOpen && <div className="h-3 w-10 rounded bg-white/25 animate-pulse" />}
          </div>
        </div>
      </aside>
    );
  }

  // Single sidebar layout for all pages (Home + every dashboard) — no branch-specific UI
  return (
    <>
      <aside className={sidebarBase} style={asideStyle}>
        {/* LOGO - top */}
        <div className="flex h-14 min-h-14 items-center justify-between border-b border-white/10 px-3 shrink-0">
          {isOpen ? (
            <>
              <Link href="/dashboard" className="flex items-center gap-2.5 flex-1 min-w-0" onMouseDown={() => { onNavigationStart?.("/dashboard"); setPendingNavHref("/dashboard"); currentRouteCtx?.setCurrentRoute("/dashboard"); }} onClick={() => setMobileMenuOpen(false)}>
                <Image src="/onlylogo.png" alt="GatiMitra" width={36} height={36} className="object-contain shrink-0 rounded-lg" priority />
                <span className="text-sm font-semibold text-white truncate">GatiMitra</span>
              </Link>
              <button onClick={onToggle} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close sidebar">
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <Link href="/dashboard" className="flex items-center justify-center w-full max-lg:justify-start max-lg:gap-2.5 max-lg:px-1" onMouseDown={() => { onNavigationStart?.("/dashboard"); setPendingNavHref("/dashboard"); currentRouteCtx?.setCurrentRoute("/dashboard"); }} onClick={() => setMobileMenuOpen(false)}>
              <Image src="/onlylogo.png" alt="GatiMitra" width={36} height={36} className="object-contain shrink-0 rounded-lg" priority />
              <span className="text-sm font-semibold text-white truncate lg:hidden">GatiMitra</span>
            </Link>
          )}
        </div>

        {/* MENU ITEMS - same on every page */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 py-4">
          <div className="space-y-0.5">
            {filteredNavigation.map((item) => {
              // Exactly one active: during pending nav only that item is active; otherwise use pathname
              const isRouteActive =
                cleanPathname === item.href ||
                (item.href !== "/dashboard" && cleanPathname.startsWith(item.href + "/")) ||
                (item.href === "/dashboard/super-admin" && isSuperAdminNavPath(cleanPathname));
              const isActive =
                pendingNavHref !== null
                  ? item.href === pendingNavHref
                  : isRouteActive;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onMouseDown={() => {
                    onNavigationStart?.(item.href);
                    setPendingNavHref(item.href);
                    currentRouteCtx?.setCurrentRoute(item.href);
                  }}
                  onMouseEnter={() => handleNavPrefetch(item.href)}
                  onFocus={() => handleNavPrefetch(item.href)}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`group relative flex items-center rounded-xl transition-all duration-150 max-lg:gap-3 max-lg:px-3 max-lg:py-2.5 max-lg:text-sm ${
                    isOpen
                      ? `gap-3 px-3 py-2.5 text-sm font-medium ${
                          isActive
                            ? "bg-gradient-to-r from-blue-500/90 to-indigo-500/90 text-white shadow-lg shadow-blue-500/25"
                            : "text-white/85 hover:bg-white/10 hover:text-white"
                        }`
                      : `justify-center p-2.5 lg:justify-center ${
                          isActive
                            ? "bg-gradient-to-r from-blue-500/90 to-indigo-500/90 text-white shadow-lg"
                            : "text-white/85 hover:bg-white/10 hover:text-white"
                        }`
                  }`}
                  title={!isOpen ? item.name : undefined}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-white/90 rounded-r-full" aria-hidden />
                  )}
                  <Icon className="h-5 w-5 shrink-0" />
                  {(isOpen && <span className="truncate">{item.name}</span>) || <span className="truncate lg:hidden">{item.name}</span>}
                  {isActive && (
                    <span className="absolute right-2.5 h-1.5 w-1.5 rounded-full bg-white/90 animate-pulse" aria-hidden />
                  )}
                  {!isOpen && (
                    <div
                      className="absolute left-full ml-2 px-2.5 py-1.5 text-xs font-medium text-white rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50 shadow-xl border border-white/10 max-lg:hidden"
                      style={{ background: "linear-gradient(135deg, #0f2d42 0%, #12344D 100%)" }}
                    >
                      {item.name}
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 border-[6px] border-transparent" style={{ borderRightColor: "#12344D" }} />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* BOTTOM: Desktop = collapse toggle; Mobile = user section */}
        <div className="shrink-0 border-t border-white/10 flex flex-col">
          <div className="hidden lg:block bg-white/5 backdrop-blur-md p-2.5">
            <button
              onClick={onToggle}
              className={`flex w-full items-center justify-center rounded-xl bg-white/10 text-white transition-all duration-200 hover:bg-white/15 hover:shadow-md ${isOpen ? "gap-2 px-3 py-2.5" : "p-2.5"}`}
              title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <ChevronLeft className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "" : "rotate-180"}`} />
              {isOpen && <span className="text-xs font-semibold">Collapse</span>}
            </button>
          </div>
          <div className="lg:hidden px-4 py-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-semibold overflow-hidden shrink-0">
                {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : getUserInitials(userName, userEmail)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{userName || "User"}</p>
                {userEmail && <p className="text-xs text-white/70 truncate">{userEmail}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-400/80 text-red-200 py-3 text-sm font-medium hover:bg-red-500/20 transition-colors min-h-[44px]"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay - tap outside to close */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity duration-300"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 text-center">Sign out?</h3>
            <p className="mt-2 text-sm text-gray-500 text-center">You will need to sign in again to access the dashboard.</p>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setShowLogoutConfirm(false)} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setShowLogoutConfirm(false); logoutMutation.mutate(); }}
                disabled={logoutMutation.isPending}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50"
              >
                {logoutMutation.isPending ? <LoadingSpinner variant="button" size="sm" /> : <><LogOut className="h-4 w-4" /> Sign out</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
