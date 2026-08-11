"use client";
import { useAppPathname } from "@/hooks/useAppSearchParams";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchDashboardSection } from "@/lib/dashboard-prefetch";
import { ChevronLeft, LogOut, X } from "lucide-react";
import { useDashboardAccess } from "@/hooks/useDashboardAccess";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/providers/AuthProvider";
import {
  mainNavigation,
  getCurrentDashboard,
  getCurrentDashboardSubRoutes,
  isSuperAdminNavPath,
} from "@/lib/navigation/dashboard-routes";
import { getOrdersNavHref, isOrdersSectionPath } from "@/lib/navigation/orders-nav-href";
import { useLeftSidebarMobile } from "@/context/LeftSidebarMobileContext";
import { useLogout } from "@/hooks/queries/useAuthQuery";
import { getUserInitials } from "@/lib/user-avatar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useCurrentRoute } from "@/context/CurrentRouteContext";
import { TICKETS_QUEUE_HOME_PATH, isTicketsQueueWorkspacePath } from "@/lib/tickets/ticket-path-utils";
import {
  cleanDashboardHref,
  isDashboardNavAlreadyAtTarget,
  resolveSidebarActivePath,
} from "@/lib/navigation/dashboard-nav-transition";
import { poppinsUi as sidebarFont } from "@/lib/fonts/tickets-fonts";

/** Premium dark sidebar chrome — charcoal black */
const SIDEBAR_BG = "#121212";
const TOOLTIP_BG = "#121212";

interface HierarchicalSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  isInSpecificDashboard?: boolean;
  /** Called on mousedown with target href so layout can show section-specific skeleton. */
  onNavigationStart?: (targetHref: string) => void;
  /**
   * When true, the rail is visually hidden (display:none) but stays mounted so
   * permissions/menu state survive special layouts (queue, from-order, add-child).
   */
  shellHidden?: boolean;
}

/** Survives remounts within the same browser tab session after first successful nav paint. */
let leftSidebarSessionPrimed = false;

export function HierarchicalSidebar({
  isOpen,
  onToggle,
  isInSpecificDashboard: propIsInSpecificDashboard,
  onNavigationStart,
  shellHidden = false,
}: HierarchicalSidebarProps) {
  const pathname = useAppPathname();
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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const currentRouteCtx = useCurrentRoute();
  const { user: authUser, systemUser } = useAuth();
  const logoutMutation = useLogout();
  const [identityReady, setIdentityReady] = useState(false);
  const userEmail = systemUser?.email ?? authUser?.email ?? null;
  const userMetadata = (authUser as { user_metadata?: Record<string, unknown> } | null)?.user_metadata ?? {};
  const userName =
    systemUser?.fullName ??
    (typeof userMetadata?.full_name === "string" ? userMetadata.full_name : null) ??
    (typeof userMetadata?.name === "string" ? userMetadata.name : null) ??
    (userEmail ? userEmail.split("@")[0] : null) ??
    null;
  const avatarUrl =
    (typeof userMetadata?.avatar_url === "string" ? userMetadata.avatar_url : null) ??
    (typeof userMetadata?.picture === "string" ? userMetadata.picture : null) ??
    null;

  useEffect(() => {
    setIdentityReady(true);
  }, []);

  // New session / logout must allow a fresh cold-load skeleton; do not keep a prior user's primed shell.
  useEffect(() => {
    if (!authUser && !systemUser) {
      leftSidebarSessionPrimed = false;
    }
  }, [authUser, systemUser]);

  // Remove query parameters for comparison
  const cleanPathname = useMemo(() => pathname.split('?')[0].split('#')[0], [pathname]);
  const isTicketsQueueWorkspace = useMemo(() => isTicketsQueueWorkspacePath(cleanPathname), [cleanPathname]);

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

  // Mark session primed once permissions/access have resolved so remounts never re-skeleton.
  useEffect(() => {
    if (!isLoading) {
      leftSidebarSessionPrimed = true;
    }
  }, [isLoading]);

  // null = super-admin / error fallback (show all dashboard sections); Set = filter by access.
  const accessibleDashboards = useMemo(() => {
    if (hasError) return null;
    if (isLoading) return new Set<string>();
    if (dashboards.length === 0) return isSuperAdmin ? null : new Set<string>();
    return new Set(
      dashboards.filter((d) => d.isActive).map((d) => d.dashboardType)
    );
  }, [dashboards, isLoading, hasError, isSuperAdmin]);

  /**
   * Click handlers are for UI feedback only (mobile close, overlay intent).
   * Next.js <Link> always owns the actual navigation — never router.push here.
   */
  const handleModuleNavClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, targetHref: string) => {
      // Modifier clicks open a new tab/window — leave native Link behavior alone.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      setMobileMenuOpen(false);
      const cleanTarget = cleanDashboardHref(targetHref);
      // Duplicate same-route: skip navigation, keep URL stable.
      if (isDashboardNavAlreadyAtTarget(cleanPathname, cleanTarget)) {
        event.preventDefault();
        return;
      }
      // Different route: do not preventDefault — Link must navigate even under RSC load.
      onNavigationStart?.(cleanTarget);
    },
    [cleanPathname, onNavigationStart, setMobileMenuOpen]
  );

  const effectiveSuperAdmin = hasError ? true : isSuperAdmin;

  const filteredNavigation = useMemo(() => {
    return mainNavigation.filter((item) => {
      // Home + open fleet tools (no dashboardType grant required)
      if (item.href === "/dashboard" || item.href === "/dashboard/rx") {
        return true;
      }
      if (item.requiresSuperAdmin) return effectiveSuperAdmin;
      if (accessibleDashboards === null) return true;
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

  const navRef = useRef<HTMLElement | null>(null);
  /** Start true so short viewports can scroll before measure; flipped off when content fits. */
  const [navOverflows, setNavOverflows] = useState(true);

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

  // Cold-load skeleton only once per browser-tab session after login. Never re-skeleton on remount/nav.
  const showSkeleton = !leftSidebarSessionPrimed && isLoading;
  const pendingNavHref = currentRouteCtx?.pendingNavHref ?? null;
  const activePath = resolveSidebarActivePath(cleanPathname, pendingNavHref);
  const mobileTranslate = isMobileMenuOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full";

  // Scroll nav only when items don't fit the viewport; hide overflow when they do.
  useEffect(() => {
    if (showSkeleton) return;
    const el = navRef.current;
    if (!el) return;

    const check = () => {
      setNavOverflows(el.scrollHeight > el.clientHeight + 1);
    };

    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [filteredNavigation, isOpen, showSkeleton, isMobileMenuOpen]);

  /** Skip width animation while skeleton mounts so the rail doesn't flash collapsed→expand. */
  const sidebarBase =
    `fixed inset-y-0 left-0 z-40 flex h-screen max-lg:w-72 flex-col shrink-0 overflow-hidden lg:translate-x-0 ${mobileTranslate} ${isOpen ? "lg:w-56" : "lg:w-16"} ${sidebarFont.className} ${
      showSkeleton ? "" : "transition-[transform,width] duration-[220ms] ease-in-out"
    }${shellHidden ? " !hidden" : ""}`;

  /** Full-bleed sidebar chrome — 100% width & height of allocated rail. */
  const asideStyle: React.CSSProperties = {
    background: SIDEBAR_BG,
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(255,255,255,0.2) transparent",
  };

  const navItemBase =
    "group relative flex h-11 w-full items-center rounded-xl outline-none transition-[background-color,color] duration-[220ms] ease-in-out focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]";

  /** Soft white wash — no green/teal highlight */
  const navItemActive = "bg-white/10 text-white";

  const navItemIdle = "text-slate-300 hover:bg-white/[0.06] hover:text-white";

  if (showSkeleton) {
    return (
      <aside className={sidebarBase} style={asideStyle} aria-busy="true" aria-label="Loading navigation">
        <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden" style={{ background: SIDEBAR_BG }}>
          <div className="flex h-[72px] min-h-[72px] items-center px-3 shrink-0" style={{ background: SIDEBAR_BG }}>
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-[12px] ring-1 ring-white/10"
              style={{ background: SIDEBAR_BG }}
            >
              <Image
                src="/onlylogo.png"
                alt=""
                width={32}
                height={32}
                className="opacity-80"
                priority
              />
            </span>
            {isOpen ? (
              <div className="ml-3 space-y-1.5 min-w-0">
                <div className="h-3.5 w-24 rounded-md bg-white/10 animate-pulse" />
                <div className="h-2.5 w-16 rounded-md bg-white/10 animate-pulse" />
              </div>
            ) : null}
          </div>
          <nav className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto px-3 pb-3 pt-2">
            <div className="space-y-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div key={i} className="flex h-11 w-full items-center rounded-xl">
                  <span className="flex size-10 shrink-0 items-center justify-center">
                    <span className="h-5 w-5 rounded-md bg-white/10 animate-pulse" />
                  </span>
                  {isOpen ? <span className="ml-0 h-3.5 w-24 rounded bg-white/10 animate-pulse" /> : null}
                </div>
              ))}
            </div>
          </nav>
          <div className="mt-auto shrink-0 flex flex-col">
            <div className="mx-3 hidden h-px bg-white/[0.08] lg:block" aria-hidden />
            <div className="hidden lg:block p-3">
              <div className="flex h-10 w-full items-center justify-center rounded-[10px] border border-white/10 bg-transparent">
                <div className="h-4 w-4 rounded bg-white/15 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  // Single sidebar layout for all pages (Home + every dashboard) — no branch-specific UI
  return (
    <>
      <aside className={sidebarBase} style={asideStyle}>
        <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden" style={{ background: SIDEBAR_BG }}>
          {/* HEADER — same bg as sidebar; fixed logo slot (no separate header fill) */}
          <div
            className="flex h-[72px] min-h-[72px] items-center px-3 shrink-0"
            style={{ background: SIDEBAR_BG }}
          >
            <Link
              href="/dashboard"
              scroll={false}
              className="flex min-w-0 flex-1 items-center outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-xl"
              onClick={(e) => handleModuleNavClick(e, "/dashboard")}
              title="GatiMitra"
            >
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-[12px] ring-1 ring-white/10"
                style={{ background: SIDEBAR_BG }}
              >
                <Image
                  src="/onlylogo.png"
                  alt="GatiMitra"
                  width={32}
                  height={32}
                  className="size-8 object-contain"
                  priority
                />
              </span>
              <span
                className={`min-w-0 flex flex-col overflow-hidden transition-[opacity,margin] duration-[220ms] ease-in-out ${
                  isOpen ? "ml-3 opacity-100" : "pointer-events-none ml-0 w-0 opacity-0 max-lg:pointer-events-auto max-lg:ml-3 max-lg:w-auto max-lg:opacity-100"
                }`}
                aria-hidden={!isOpen}
              >
                <span className="truncate text-[15px] font-semibold leading-tight tracking-wide text-white whitespace-nowrap">
                  GatiMitra
                </span>
                <span className="mt-0.5 truncate text-[10px] font-medium leading-tight tracking-[0.06em] uppercase text-slate-400 whitespace-nowrap">
                  Control Dashboard
                </span>
              </span>
            </Link>
            {/* Mobile close only — no header chevron on desktop */}
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors duration-[220ms] hover:bg-white/[0.06] hover:text-white lg:hidden"
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* MENU — stable icon column (w-10) prevents jump on collapse/expand */}
          <nav
            ref={navRef}
            className={`flex-1 min-h-0 overflow-x-hidden px-3 pb-3 pt-2 ${
              navOverflows ? "overflow-y-auto" : "overflow-y-hidden"
            }`}
          >
            <div className="space-y-1.5">
              {filteredNavigation.map((item) => {
                const inQueueWorkspace = isTicketsQueueWorkspacePath(cleanPathname);
                const prefetchHref =
                  item.href === "/dashboard/tickets" && inQueueWorkspace
                    ? TICKETS_QUEUE_HOME_PATH
                    : item.dashboardType === "ORDER_FOOD"
                      ? getOrdersNavHref(accessibleDashboards, effectiveSuperAdmin)
                      : item.href;
                const moduleRootHref =
                  item.dashboardType === "ORDER_FOOD"
                    ? "/dashboard/orders"
                    : item.href === "/dashboard/tickets" && inQueueWorkspace
                      ? TICKETS_QUEUE_HOME_PATH
                      : item.href;
                // Active = settled URL, or in-flight pending target for instant click feedback.
                const isActive =
                  activePath === moduleRootHref ||
                  (item.href !== "/dashboard" && activePath.startsWith(item.href + "/")) ||
                  (item.dashboardType === "ORDER_FOOD" && isOrdersSectionPath(activePath)) ||
                  (item.href === "/dashboard/super-admin" && isSuperAdminNavPath(activePath));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={moduleRootHref}
                    scroll={false}
                    onMouseEnter={() => handleNavPrefetch(prefetchHref)}
                    onFocus={() => handleNavPrefetch(prefetchHref)}
                    onClick={(e) => handleModuleNavClick(e, moduleRootHref)}
                    className={`${navItemBase} ${isActive ? navItemActive : navItemIdle}`}
                    title={!isOpen ? item.name : undefined}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center">
                      <Icon
                        className={`h-5 w-5 stroke-[1.6] transition-colors duration-[220ms] ${
                          isActive ? "text-white" : "text-slate-300 group-hover:text-white"
                        }`}
                      />
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-[14px] font-medium tracking-wide whitespace-nowrap transition-[opacity,max-width] duration-[220ms] ease-in-out ${
                        isOpen
                          ? "max-w-[140px] opacity-100 pr-2"
                          : "max-w-0 opacity-0 overflow-hidden max-lg:max-w-[140px] max-lg:opacity-100 max-lg:pr-2"
                      }`}
                    >
                      {item.name}
                    </span>
                    {!isOpen && (
                      <div
                        className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl transition-opacity duration-[220ms] group-hover:opacity-100 max-lg:hidden"
                        style={{ background: TOOLTIP_BG }}
                      >
                        {item.name}
                        <span
                          className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 border-[6px] border-transparent"
                          style={{ borderRightColor: TOOLTIP_BG }}
                        />
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* BOTTOM — Collapse control (chevron only here as the action affordance) */}
          <div className="mt-auto shrink-0 flex flex-col">
            <div className="mx-3 hidden h-px bg-white/[0.08] lg:block" aria-hidden />
            <div className="hidden lg:block p-3">
              <button
                type="button"
                onClick={onToggle}
                className={`flex h-10 w-full items-center justify-center rounded-[10px] border border-white/10 bg-transparent text-white transition-colors duration-[220ms] hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                  isOpen ? "gap-2" : ""
                }`}
                title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
                aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                <ChevronLeft
                  className={`h-4 w-4 stroke-[1.75] shrink-0 transition-transform duration-[220ms] ${
                    isOpen ? "" : "rotate-180"
                  }`}
                  aria-hidden
                />
                {isOpen ? (
                  <span className="text-[13px] font-medium tracking-wide whitespace-nowrap">
                    Collapse
                  </span>
                ) : null}
              </button>
            </div>
            <div className="lg:hidden px-4 py-5">
              {!identityReady ? (
                <div className="flex items-center gap-3 mb-3" aria-hidden>
                  <div className="h-10 w-10 rounded-full bg-white/15 shrink-0 animate-pulse" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-24 rounded bg-white/15 animate-pulse" />
                    <div className="h-3 w-32 rounded bg-white/10 animate-pulse" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full bg-white/15 flex items-center justify-center text-white text-sm font-semibold overflow-hidden shrink-0 ring-1 ring-white/15">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      getUserInitials(userName, userEmail)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{userName || "User"}</p>
                    {userEmail ? <p className="text-xs text-slate-400 truncate">{userEmail}</p> : null}
                  </div>
                </div>
              )}
              {!isTicketsQueueWorkspace && (
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-400/50 text-red-200 py-3 text-sm font-medium hover:bg-red-500/20 transition-colors duration-[220ms] min-h-[44px]"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              )}
            </div>
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
      {showLogoutConfirm && !isTicketsQueueWorkspace && (
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
