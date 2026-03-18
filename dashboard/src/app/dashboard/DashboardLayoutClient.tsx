"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { HierarchicalSidebar } from "@/components/layout/HierarchicalSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { Header } from "@/components/layout/Header";
import { AuthProvider } from "@/providers/AuthProvider";
import { RightSidebarProvider, useRightSidebar } from "@/context/RightSidebarContext";
import { MerchantsSearchProvider } from "@/context/MerchantsSearchContext";
import { LeftSidebarMobileProvider, useLeftSidebarMobile } from "@/context/LeftSidebarMobileContext";
import { TicketFilterSidebarProvider, useTicketFilterSidebar } from "@/context/TicketFilterSidebarContext";
import { getCurrentDashboard, getCurrentDashboardSubRoutes } from "@/lib/navigation/dashboard-routes";
import { queryKeys } from "@/lib/queryKeys";
import { TicketFilters } from "@/components/tickets/TicketFilters";
import { fetchBootstrapAndSeedCache } from "@/hooks/queries/useBootstrapQuery";
/** Full-page skeleton shown until bootstrap has run (or cache exists) so only one auth request is made. */
function DashboardBootstrapSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#E6F6F5" }}>
      <div className="w-56 shrink-0 bg-[#0f2d42]" aria-hidden>
        <div className="h-14 border-b border-white/10 flex items-center px-3 gap-2">
          <div className="h-9 w-9 rounded-lg bg-white/15 animate-pulse" />
          <div className="h-4 w-24 rounded bg-white/15 animate-pulse" />
        </div>
        <div className="p-2 space-y-1">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-10 rounded-xl bg-white/10 animate-pulse" />
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-14 border-b border-gray-200 bg-white/80 animate-pulse" />
        <main className="flex-1 p-4 overflow-auto">
          <div className="h-8 w-48 rounded bg-gray-200 animate-pulse mb-4" />
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Gate: only render dashboard tree after bootstrap has run (or cache already has session).
 * Ensures a single /api/auth/bootstrap call instead of 4 parallel auth calls.
 */
function useBootstrapGate(queryClient: ReturnType<typeof useQueryClient>) {
  const [ready, setReady] = useState(false);
  const didRun = useRef(false);
  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;
    const cached = queryClient.getQueryData(["auth", "session"]);
    if (cached != null) {
      setReady(true);
      return;
    }
    fetchBootstrapAndSeedCache(queryClient).then(() => setReady(true));
  }, [queryClient]);
  return ready;
}

const SIDEBAR_STATE_KEY = "dashboard-sidebar-open";

type PersistedSidebar = "left" | "right" | "none";

function getPersistedSidebar(): PersistedSidebar | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(SIDEBAR_STATE_KEY);
    return v === "left" || v === "right" || v === "none" ? v : null;
  } catch {
    return null;
  }
}

function setPersistedSidebar(which: PersistedSidebar) {
  try {
    localStorage.setItem(SIDEBAR_STATE_KEY, which);
  } catch {}
}

/** When left sidebar opens on mobile, close right sidebar so only one is open. */
function SyncSidebarsOnMobile() {
  const left = useLeftSidebarMobile();
  const right = useRightSidebar();
  useEffect(() => {
    if (left?.isMobileMenuOpen && right?.setOpen) right.setOpen(false);
  }, [left?.isMobileMenuOpen, right?.setOpen]);
  return null;
}

/** Prefetch all dashboard routes so clicks open instantly (no "Compiling..." delay). */
const DASHBOARD_ROUTES_TO_PREFETCH = [
  "/dashboard",
  "/dashboard/super-admin",
  "/dashboard/customers",
  "/dashboard/riders",
  "/dashboard/merchants",
  "/dashboard/orders",
  "/dashboard/tickets",
  "/dashboard/area-managers",
  "/dashboard/system",
  "/dashboard/analytics",
];

function usePrefetchDashboardRoutes() {
  const router = useRouter();
  const didPrefetch = useRef(false);
  useEffect(() => {
    if (didPrefetch.current) return;
    didPrefetch.current = true;
    DASHBOARD_ROUTES_TO_PREFETCH.forEach((href) => {
      try {
        router.prefetch(href);
      } catch {
        // ignore
      }
    });
  }, [router]);
}

export default function DashboardLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const bootstrapReady = useBootstrapGate(queryClient);

  usePrefetchDashboardRoutes();

  // When navigating away from merchant dashboard (e.g. via left sidebar to Customers/Riders), clear store result/cache so it doesn’t persist
  const isOnMerchantDashboard = useMemo(
    () => /^\/dashboard\/merchants(\/|$)/.test(pathname.split("?")[0].split("#")[0]),
    [pathname]
  );
  useEffect(() => {
    if (!isOnMerchantDashboard) {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] === "store" });
    }
  }, [isOnMerchantDashboard, queryClient]);

  const cleanPathname = useMemo(() => pathname.split('?')[0].split('#')[0], [pathname]);
  const isAddChildPage = useMemo(
    () => /^\/dashboard\/area-managers\/stores\/add-child(\/|$)/.test(cleanPathname),
    [cleanPathname]
  );
  const isAreaManagersSection = useMemo(
    () => /^\/dashboard\/area-managers(\/|$)/.test(cleanPathname),
    [cleanPathname]
  );
  const currentDashboard = useMemo(() => getCurrentDashboard(cleanPathname), [cleanPathname]);
  const currentSubRoutes = useMemo(() => getCurrentDashboardSubRoutes(cleanPathname), [cleanPathname]);
  const isInSpecificDashboard: boolean = Boolean(currentDashboard && cleanPathname !== "/dashboard");

  const hasRightSidebar = useMemo(() => {
    return isInSpecificDashboard && currentSubRoutes.length > 0;
  }, [isInSpecificDashboard, currentSubRoutes.length]);

  // Store orders path: left closed, right (order status/filters) open by default so only order sidebar is visible
  const isStoreOrdersPath = useMemo(
    () => /^\/dashboard\/merchants\/stores\/\d+\/orders(\/|$)/.test(cleanPathname),
    [cleanPathname]
  );

  // Settings page: right sidebar must remain open (exception)
  const isSettingsPage = useMemo(
    () => /\/settings(\/|$)/.test(cleanPathname) || /\/store-settings(\/|$)/.test(cleanPathname),
    [cleanPathname]
  );

  // Deterministic initial state (no localStorage) so server and client match and hydration succeeds
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(() => {
    if (!hasRightSidebar) return true;
    if (isStoreOrdersPath) return false; // Orders page: left closed by default
    return false;
  });
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(() => {
    if (!hasRightSidebar) return false;
    if (isStoreOrdersPath) return true; // Orders page: right (order filters) open by default
    return true;
  });

  // Apply persisted state on navigation. Only one sidebar open at a time.
  // Orders page: always left closed, right open. Settings: right open. Other pages: use persisted.
  useEffect(() => {
    if (isSettingsPage && hasRightSidebar) {
      setIsRightSidebarOpen(true);
      setIsLeftSidebarOpen(false);
      return;
    }
    if (isStoreOrdersPath && hasRightSidebar) {
      setIsLeftSidebarOpen(false);
      setIsRightSidebarOpen(true);
      return;
    }
    if (!hasRightSidebar) {
      setIsRightSidebarOpen(false);
      setIsLeftSidebarOpen(true);
      return;
    }
    const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
    if (isMobile) return;
    const persisted = getPersistedSidebar();
    if (persisted === "left") {
      setIsLeftSidebarOpen(true);
      setIsRightSidebarOpen(false);
    } else if (persisted === "right" || persisted === null) {
      setIsLeftSidebarOpen(false);
      setIsRightSidebarOpen(true);
    } else {
      // "none" = both closed; left remains collapsed
      setIsLeftSidebarOpen(false);
      setIsRightSidebarOpen(false);
    }
  }, [hasRightSidebar, isStoreOrdersPath, isSettingsPage, cleanPathname]);

  // Enforce only one sidebar open at a time (never both expanded)
  useEffect(() => {
    if (hasRightSidebar && isLeftSidebarOpen && isRightSidebarOpen) {
      setIsRightSidebarOpen(false);
    }
  }, [hasRightSidebar, isLeftSidebarOpen, isRightSidebarOpen]);

  const handleLeftSidebarToggle = () => {
    const nextLeftOpen = !isLeftSidebarOpen;
    if (nextLeftOpen) {
      setIsRightSidebarOpen(false);
      setPersistedSidebar("left");
    } else {
      setPersistedSidebar("none");
    }
    setIsLeftSidebarOpen(nextLeftOpen);
  };

  const handleRightSidebarToggle = () => {
    const nextRightOpen = !isRightSidebarOpen;
    if (nextRightOpen) {
      setIsLeftSidebarOpen(false);
      setPersistedSidebar("right");
    } else {
      setPersistedSidebar("none");
    }
    setIsRightSidebarOpen(nextRightOpen);
  };

  if (!bootstrapReady) {
    if (isAddChildPage || isAreaManagersSection) {
      return (
        <AuthProvider>
          <div className="flex h-screen overflow-hidden items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
            <p className="text-sm text-slate-500">Loading…</p>
          </div>
        </AuthProvider>
      );
    }
    return <DashboardBootstrapSkeleton />;
  }

  if (isAddChildPage) {
    return (
      <AuthProvider>
        <div className="flex h-screen overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
          {children}
        </div>
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <TicketFilterSidebarProvider>
        <DashboardLayoutContent
          isLeftSidebarOpen={isLeftSidebarOpen}
          isRightSidebarOpen={isRightSidebarOpen}
          setRightSidebarOpen={setIsRightSidebarOpen}
          hasRightSidebar={hasRightSidebar}
          handleRightSidebarToggle={handleRightSidebarToggle}
          handleLeftSidebarToggle={handleLeftSidebarToggle}
          isInSpecificDashboard={isInSpecificDashboard}
        >
          {children}
        </DashboardLayoutContent>
      </TicketFilterSidebarProvider>
    </AuthProvider>
  );
}

function DashboardLayoutContent({
  children,
  isLeftSidebarOpen,
  isRightSidebarOpen,
  setRightSidebarOpen,
  hasRightSidebar,
  handleRightSidebarToggle,
  handleLeftSidebarToggle,
  isInSpecificDashboard,
}: {
  children: React.ReactNode;
  isLeftSidebarOpen: boolean;
  isRightSidebarOpen: boolean;
  setRightSidebarOpen: (open: boolean) => void;
  hasRightSidebar: boolean;
  handleRightSidebarToggle: () => void;
  handleLeftSidebarToggle: () => void;
  isInSpecificDashboard: boolean;
}) {
  const pathname = usePathname();
  const filterSidebar = useTicketFilterSidebar();
  const cleanPathname = useMemo(() => pathname.split("?")[0].split("#")[0], [pathname]);
  const isTicketDetailPage = useMemo(
    () => /^\/dashboard\/tickets\/\d+$/.test(cleanPathname),
    [cleanPathname]
  );
  const isFilterSidebarOpen = Boolean(isTicketDetailPage && filterSidebar?.isFilterSidebarOpen);

  return (
    <LeftSidebarMobileProvider>
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#E6F6F5" }}>
        <HierarchicalSidebar
          isOpen={isLeftSidebarOpen}
          onToggle={handleLeftSidebarToggle}
          isInSpecificDashboard={isInSpecificDashboard}
        />
        <RightSidebarProvider
          value={{
            isOpen: isRightSidebarOpen,
            onToggle: handleRightSidebarToggle,
            setOpen: setRightSidebarOpen,
          }}
        >
          <MerchantsSearchProvider>
          <SyncSidebarsOnMobile />
        {/* Main content: margin-left reserves space for fixed left sidebar (w-56, same as right); margin-right for right sidebar overlay */}
        <div
          className={`flex flex-1 flex-col overflow-hidden w-full min-w-0 ${
            isLeftSidebarOpen ? "lg:ml-56" : "lg:ml-16"
          } ${
            hasRightSidebar && isRightSidebarOpen
              ? isFilterSidebarOpen
                ? "lg:mr-[28rem]"
                : "lg:mr-56"
              : hasRightSidebar && !isRightSidebarOpen
                ? "lg:mr-16"
                : ""
          }`}
          style={{ transition: "margin 0.3s ease-out" }}
        >
          <Header />
          <div className="flex flex-1 overflow-hidden relative w-full">
            <main
              className="flex-1 overflow-y-auto p-3 sm:p-4 transition-all duration-300 w-full flex flex-col min-h-0"
              style={{ backgroundColor: "#FFFFFF" }}
            >
              <div className="w-full max-w-full min-w-0 flex-1 flex flex-col min-h-0">
                {children}
              </div>
            </main>
            <RightSidebar
              isOpen={isRightSidebarOpen}
              onToggle={handleRightSidebarToggle}
              filterSidebarOpen={isFilterSidebarOpen}
            />
            {isTicketDetailPage && (
              <div
                className="fixed top-0 bottom-0 z-50 overflow-hidden transition-[width] duration-300 ease-out"
                style={{
                  right: 0,
                  width: isFilterSidebarOpen ? "14rem" : 0,
                }}
                aria-hidden={!isFilterSidebarOpen}
              >
                <aside
                  className="absolute inset-y-0 right-0 flex h-full w-56 flex-col bg-[#E8F0F2] shadow-xl border-l border-gray-200/80 rounded-l-xl"
                  style={{
                    scrollbarWidth: "thin",
                    scrollbarColor: "#9CA3AF #E8F0F2",
                  }}
                  aria-label="Filters"
                >
                  <div className="flex h-12 sm:h-14 items-center justify-between border-b border-gray-300/30 px-3 shrink-0 bg-white/50 rounded-tl-xl">
                    <span className="text-sm font-semibold text-gray-800 tracking-tight">Filters</span>
                    <button
                      type="button"
                      onClick={() => filterSidebar?.closeFilterSidebar()}
                      className="p-2 rounded-lg text-gray-500 hover:bg-gray-200/80 hover:text-gray-900 transition-colors"
                      aria-label="Close filters"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                    <TicketFilters variant="sidebar" dark={false} />
                  </div>
                </aside>
              </div>
            )}
          </div>
        </div>
          </MerchantsSearchProvider>
      </RightSidebarProvider>
    </div>
    </LeftSidebarMobileProvider>
  );
}
