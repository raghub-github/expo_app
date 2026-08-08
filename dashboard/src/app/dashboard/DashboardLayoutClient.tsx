"use client";
import { useAppPathname } from "@/hooks/useAppSearchParams";

import { Toaster } from "sonner";
import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, memo } from "react";

import { useQueryClient } from "@tanstack/react-query";
import {
  DashboardSearchParamsProvider,
  useDashboardSearchParams,
} from "@/context/DashboardSearchParamsContext";
import { HierarchicalSidebar } from "@/components/layout/HierarchicalSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { Header } from "@/components/layout/Header";
import {
  RightSidebarProvider,
  useRightSidebar,
  type TicketRightSidebarPanel,
  type TicketSettingsSection,
} from "@/context/RightSidebarContext";
import { MerchantsSearchProvider } from "@/context/MerchantsSearchContext";
import { StoreVerificationSheetProvider } from "@/context/StoreVerificationSheetContext";
import { LeftSidebarMobileProvider, useLeftSidebarMobile } from "@/context/LeftSidebarMobileContext";
import { TicketFilterSidebarProvider, useTicketFilterSidebar } from "@/context/TicketFilterSidebarContext";
import { getCurrentDashboard } from "@/lib/navigation/dashboard-routes";
import { isOrdersSectionPath } from "@/lib/navigation/orders-nav-href";
import {
  isStoreVerificationDetailPath,
  parseStoreVerificationStepParam,
} from "@/lib/merchants/store-verification-path";
import { queryKeys } from "@/lib/queryKeys";
import { prefetchDashboardSection } from "@/lib/dashboard-prefetch";
import {
  cleanDashboardHref,
  isDashboardNavAlreadyAtTarget,
  shouldShowDashboardNavOverlay,
} from "@/lib/navigation/dashboard-nav-transition";
import { TicketFilters } from "@/components/tickets/TicketFilters";
import { DashboardNavOverlay } from "@/components/layout/DashboardNavOverlay";
import { CurrentRouteProvider, useCurrentRoute } from "@/context/CurrentRouteContext";
import {
  isTicketsAppDetailPath,
  isTicketsQueueLayoutExperience,
  ticketDetailHasQueueContext,
  ticketsPathTicketId,
} from "@/lib/tickets/ticket-path-utils";
import { isCustomerDetailOpenedFromOrder } from "@/lib/navigation/customer-dashboard-from-order";
import type { TicketOtherAgentViewer } from "@/lib/tickets/ticket-presence";

const SIDEBAR_STATE_KEY = "dashboard-sidebar-open";

/**
 * Whether a control-app path *can* show a secondary (right) rail.
 */
function pathHasRightSidebar(pathname: string): boolean {
  const clean = cleanDashboardHref(pathname);
  if (clean.startsWith("/dashboard/customers")) return false;
  if (isOrdersSectionPath(clean)) return false;
  if (clean.startsWith("/dashboard/super-admin/notifications")) return true;
  if (clean === "/dashboard/riders" || clean.startsWith("/dashboard/riders/")) return true;
  const dashboard = getCurrentDashboard(clean);
  const isInSpecificDashboard = Boolean(dashboard && clean !== "/dashboard");
  return isInSpecificDashboard && (dashboard?.subRoutes?.length ?? 0) > 0;
}

/**
 * Whether the right rail is actually active (visible with content) for this URL.
 * Until then, the left sidebar must stay expanded — e.g. Riders before a search.
 */
function pathRightSidebarActive(
  pathname: string,
  searchParams?: { get: (key: string) => string | null } | null
): boolean {
  if (!pathHasRightSidebar(pathname)) return false;
  const clean = cleanDashboardHref(pathname);
  // Inside a store's verification flow — full-width content, no merchants right rail.
  if (isStoreVerificationDetailPath(clean, searchParams)) return false;
  if (clean === "/dashboard/riders" || clean.startsWith("/dashboard/riders/")) {
    return Boolean((searchParams?.get("search") || "").trim());
  }
  return true;
}
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

const LAST_ROUTE_STORAGE_KEY = "dashboard_last_visited_route";

function DashboardLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardSearchParamsProvider>
      <Toaster position="top-right" richColors closeButton />
      <DashboardLayoutClientInner>{children}</DashboardLayoutClientInner>
    </DashboardSearchParamsProvider>
  );
}

function DashboardLayoutClientInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = useAppPathname();
  const searchParams = useDashboardSearchParams();
  const queryClient = useQueryClient();

  // Cancel in-flight page queries as soon as route changes to avoid outdated requests
  // overwriting the newly navigated UI. Auth bootstrap is excluded so auth state
  // stays consistent.
  const lastPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastPathRef.current === null) {
      lastPathRef.current = pathname;
      return;
    }
    if (lastPathRef.current === pathname) return;
    const prevPath = lastPathRef.current;
    lastPathRef.current = pathname;

    const cleanPrev = (prevPath ?? "").split("?")[0].split("#")[0];
    const cleanNext = (pathname ?? "").split("?")[0].split("#")[0];
    // Main tickets list, queue workspace, CSAT, etc.: keep list/detail caches when moving within this area.
    if (cleanPrev.startsWith("/dashboard/tickets") && cleanNext.startsWith("/dashboard/tickets")) {
      return;
    }
    // Food orders list ↔ standalone order page: preserve orders list cache (same auth shell).
    if (
      (cleanPrev.startsWith("/dashboard/orders") && cleanNext.startsWith("/order")) ||
      (cleanPrev.startsWith("/order") && cleanNext.startsWith("/dashboard/orders"))
    ) {
      return;
    }
    // Rider dashboard sub-pages: keep rider summary/context when switching tabs.
    if (cleanPrev.startsWith("/dashboard/riders") && cleanNext.startsWith("/dashboard/riders")) {
      return;
    }
    // Order detail ↔ tickets: do not invalidate orders list or ticket caches on cross-nav.
    if (
      (cleanPrev.startsWith("/order") && cleanNext.startsWith("/dashboard/tickets")) ||
      (cleanPrev.startsWith("/dashboard/tickets") && cleanNext.startsWith("/order"))
    ) {
      return;
    }

    const getRouteKeyRoots = (p: string | null): string[] => {
      const clean = (p ?? "").split("?")[0].split("#")[0] ?? "";
      if (clean === "/dashboard") return [];
      if (clean.startsWith("/dashboard/customers")) return ["customers"];
      if (clean.startsWith("/dashboard/tickets")) return ["tickets", "unified-tickets"];
      if (clean.startsWith("/dashboard/orders")) return ["orders"];
      if (clean.startsWith("/dashboard/riders")) return ["rider"];
      if (clean.startsWith("/dashboard/merchants"))
        return ["merchant-stores", "merchant-store", "merchant-wallet-requests-summary"];
      return [];
    };

    const prevRoots = getRouteKeyRoots(prevPath);
    if (prevRoots.length === 0) return;

    queryClient.cancelQueries({
      predicate: (query) => {
        const key = query.queryKey as readonly unknown[];
        const root = key?.[0];

        // Keep auth/bootstrap + derived global auth state stable.
        if (key.includes("auth")) return false;
        if (key.includes("bootstrap")) return false;
        if (root === "permissions" || root === "dashboard-access") return false;

        return typeof root === "string" && prevRoots.includes(root);
      },
    });
  }, [pathname, queryClient]);

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
  const isAmResubmitOnboardingPage = useMemo(
    () =>
      /^\/dashboard\/area-managers\/stores\/resubmit-onboarding(\/|$)/.test(cleanPathname),
    [cleanPathname]
  );
  /** Full-bleed AM store wizard pages (add-child + resubmit). */
  const isAmStoreWizardPage = isAddChildPage || isAmResubmitOnboardingPage;
  const isAreaManagersSection = useMemo(
    () => /^\/dashboard\/area-managers(\/|$)/.test(cleanPathname),
    [cleanPathname]
  );
  const currentDashboard = useMemo(() => getCurrentDashboard(cleanPathname), [cleanPathname]);
  const isInSpecificDashboard: boolean = Boolean(currentDashboard && cleanPathname !== "/dashboard");

  const isOrderDetailPage =
    cleanPathname === "/order" || cleanPathname.startsWith("/order/");
  const isCustomerDetailFromOrder = useMemo(
    () => isCustomerDetailOpenedFromOrder(cleanPathname, searchParams),
    [cleanPathname, searchParams]
  );

  const hasRightSidebar = useMemo(
    () => pathHasRightSidebar(cleanPathname),
    [cleanPathname]
  );
  /** Right rail is showing real content — only then may the left rail collapse. */
  const rightSidebarActive = useMemo(
    () => pathRightSidebarActive(cleanPathname, searchParams),
    // riders: search; store verification: storeId
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cleanPathname, searchParams.get("search"), searchParams.get("storeId")]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LAST_ROUTE_STORAGE_KEY, cleanPathname);
    } catch {
      // ignore
    }
  }, [cleanPathname]);

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

  /** Queue ticket detail (?fromQueue=1): left queue rail collapsed; inner layout opens properties panel. */
  const isQueueTicketDetailForShell = useMemo(
    () =>
      isTicketsQueueLayoutExperience(cleanPathname, searchParams) &&
      isTicketsAppDetailPath(cleanPathname) &&
      ticketDetailHasQueueContext(searchParams),
    [cleanPathname, searchParams.toString()]
  );

  /** Single stable dep for layout-mode flags only — not every pathname — so nested
   * routes within the same shell mode do not collapse/expand the left rail. */
  const shellSidebarRouteKey = useMemo(
    () =>
      [
        hasRightSidebar ? "1" : "0",
        rightSidebarActive ? "1" : "0",
        isStoreOrdersPath ? "1" : "0",
        isSettingsPage ? "1" : "0",
        isQueueTicketDetailForShell ? "1" : "0",
        isCustomerDetailFromOrder ? "1" : "0",
        isAmStoreWizardPage ? "1" : "0",
      ].join("\0"),
    [
      hasRightSidebar,
      rightSidebarActive,
      isStoreOrdersPath,
      isSettingsPage,
      isQueueTicketDetailForShell,
      isCustomerDetailFromOrder,
      isAmStoreWizardPage,
    ]
  );

  // Deterministic initial state (no localStorage) so server and client match and hydration succeeds
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(() => {
    if (!rightSidebarActive) return true;
    if (isStoreOrdersPath) return false;
    return false;
  });
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(() => {
    if (!rightSidebarActive) return false;
    if (isStoreOrdersPath) return true;
    return true;
  });

  // Apply sidebar state on navigation:
  // - Right rail active → left collapsed, right expanded
  // - Right rail absent or not yet active → left expanded
  useEffect(() => {
    if (isCustomerDetailFromOrder || isAmStoreWizardPage) {
      setIsLeftSidebarOpen(false);
      setIsRightSidebarOpen(false);
      return;
    }
    if (isQueueTicketDetailForShell && rightSidebarActive) {
      setIsLeftSidebarOpen(false);
      setIsRightSidebarOpen(false);
      return;
    }
    if (isSettingsPage && rightSidebarActive) {
      setIsRightSidebarOpen(true);
      setIsLeftSidebarOpen(false);
      return;
    }
    if (isStoreOrdersPath && rightSidebarActive) {
      setIsLeftSidebarOpen(false);
      setIsRightSidebarOpen(true);
      return;
    }
    if (!rightSidebarActive) {
      setIsRightSidebarOpen(false);
      setIsLeftSidebarOpen(true);
      return;
    }
    // Right sidebar is active: left collapsed, right expanded
    setIsLeftSidebarOpen(false);
    setIsRightSidebarOpen(true);
  }, [shellSidebarRouteKey]);

  // Enforce: never leave left collapsed while the right rail is inactive.
  useEffect(() => {
    if (rightSidebarActive) return;
    if (isCustomerDetailFromOrder || isAmStoreWizardPage) return;
    if (!isLeftSidebarOpen) {
      setIsLeftSidebarOpen(true);
      setIsRightSidebarOpen(false);
    }
  }, [rightSidebarActive, isLeftSidebarOpen, isCustomerDetailFromOrder, isAmStoreWizardPage]);

  // Enforce only one sidebar open at a time (never both expanded)
  useEffect(() => {
    if (rightSidebarActive && isLeftSidebarOpen && isRightSidebarOpen) {
      setIsRightSidebarOpen(false);
    }
  }, [rightSidebarActive, isLeftSidebarOpen, isRightSidebarOpen]);

  /** Notify Home map (and others) to reflow after sidebar width/margin animation. */
  const notifyDashboardLayoutChange = () => {
    if (typeof window === "undefined") return;
    const fire = () => window.dispatchEvent(new Event("gm-dashboard-layout"));
    fire();
    window.setTimeout(fire, 50);
    window.setTimeout(fire, 180);
    window.setTimeout(fire, 320);
    window.setTimeout(fire, 450);
  };

  const handleLeftSidebarToggle = () => {
    // Right rail not active → left must stay expanded.
    if (!rightSidebarActive && isLeftSidebarOpen) {
      return;
    }
    const nextLeftOpen = !isLeftSidebarOpen;
    if (nextLeftOpen) {
      setIsRightSidebarOpen(false);
      setPersistedSidebar("left");
    } else {
      setPersistedSidebar("none");
    }
    setIsLeftSidebarOpen(nextLeftOpen);
    notifyDashboardLayoutChange();
  };

  const handleRightSidebarToggle = () => {
    if (!hasRightSidebar || !rightSidebarActive) return;
    const nextRightOpen = !isRightSidebarOpen;
    if (nextRightOpen) {
      setIsLeftSidebarOpen(false);
      setPersistedSidebar("right");
    } else {
      // Closing right: restore left so the shell is never empty.
      setIsLeftSidebarOpen(true);
      setPersistedSidebar("left");
    }
    setIsRightSidebarOpen(nextRightOpen);
    notifyDashboardLayoutChange();
  };

  return (
    <CurrentRouteProvider>
      <TicketFilterSidebarProvider>
        <DashboardLayoutContent
          isLeftSidebarOpen={isLeftSidebarOpen}
          isRightSidebarOpen={isRightSidebarOpen}
          setLeftSidebarOpen={setIsLeftSidebarOpen}
          setRightSidebarOpen={setIsRightSidebarOpen}
          hasRightSidebar={hasRightSidebar}
          handleRightSidebarToggle={handleRightSidebarToggle}
          handleLeftSidebarToggle={handleLeftSidebarToggle}
          isInSpecificDashboard={isInSpecificDashboard}
          isStoreOrdersPath={isStoreOrdersPath}
          isCustomerDetailFromOrder={isCustomerDetailFromOrder}
          isAddChildPage={isAmStoreWizardPage}
          isOrderDetailPage={isOrderDetailPage}
        >
          {children}
        </DashboardLayoutContent>
      </TicketFilterSidebarProvider>
    </CurrentRouteProvider>
  );
}

function DashboardLayoutContent({
  children,
  isLeftSidebarOpen,
  isRightSidebarOpen,
  setLeftSidebarOpen,
  setRightSidebarOpen,
  hasRightSidebar,
  handleRightSidebarToggle,
  handleLeftSidebarToggle,
  isInSpecificDashboard,
  isStoreOrdersPath,
  isCustomerDetailFromOrder,
  isAddChildPage,
  isOrderDetailPage,
}: {
  children: React.ReactNode;
  isLeftSidebarOpen: boolean;
  isRightSidebarOpen: boolean;
  setLeftSidebarOpen: (open: boolean) => void;
  setRightSidebarOpen: (open: boolean) => void;
  hasRightSidebar: boolean;
  handleRightSidebarToggle: () => void;
  handleLeftSidebarToggle: () => void;
  isInSpecificDashboard: boolean;
  isStoreOrdersPath: boolean;
  isCustomerDetailFromOrder: boolean;
  isAddChildPage: boolean;
  isOrderDetailPage: boolean;
}) {
  const pathname = useAppPathname();
  const searchParams = useDashboardSearchParams();
  const queryClient = useQueryClient();
  const filterSidebar = useTicketFilterSidebar();
  const cleanPathname = useMemo(() => pathname.split("?")[0].split("#")[0], [pathname]);
  const isTicketDetailPage = useMemo(() => isTicketsAppDetailPath(cleanPathname), [cleanPathname]);
  const isTicketsQueueWorkspace = useMemo(
    () => isTicketsQueueLayoutExperience(cleanPathname, searchParams),
    [cleanPathname, searchParams.toString()]
  );
  const isTicketsHubGreyPage =
    cleanPathname === "/dashboard/tickets/agent-activity" ||
    cleanPathname === "/dashboard/tickets/dashboard_snapshot";
  /** Customer profile (/customers/GM… or /customers/123) — sticky CTA must sit flush under app header. */
  const isCustomerDetailProfilePage = useMemo(() => {
    const match = cleanPathname.match(/^\/dashboard\/customers\/([^/]+)$/);
    if (!match) return false;
    const segment = match[1];
    return !["all", "food", "parcel", "person-ride", "deletion-requests"].includes(segment);
  }, [cleanPathname]);
  const isOrdersSectionPage =
    cleanPathname.startsWith("/dashboard/orders") || isOrderDetailPage;
  const isNotificationsModule =
    cleanPathname.startsWith("/dashboard/super-admin/notifications");
  /** Tickets list / queue / detail: fill space below header without main scroll (inner panes scroll). */
  const isTicketsFullBleedLayout =
    cleanPathname.startsWith("/dashboard/tickets") && !isTicketsHubGreyPage;
  const isFilterSidebarOpen = Boolean(isTicketDetailPage && filterSidebar?.isFilterSidebarOpen);

  const [ticketRightSidebarPanel, setTicketRightSidebarPanel] = useState<TicketRightSidebarPanel>("properties");
  const [ticketSettingsSection, setTicketSettingsSection] = useState<TicketSettingsSection>("activity");

  const ticketDetailSlug = useMemo(() => ticketsPathTicketId(cleanPathname), [cleanPathname]);

  const prevTicketSlugRef = useRef<string | null>(null);
  useEffect(() => {
    if (ticketDetailSlug == null) {
      prevTicketSlugRef.current = null;
      setTicketRightSidebarPanel("properties");
      setTicketSettingsSection("automation");
      return;
    }
    if (prevTicketSlugRef.current !== null && prevTicketSlugRef.current !== ticketDetailSlug) {
      setTicketRightSidebarPanel("properties");
      setTicketSettingsSection("automation");
    }
    prevTicketSlugRef.current = ticketDetailSlug;
  }, [ticketDetailSlug]);

  /** Ticket detail opened from queue list: left rail + properties are controlled separately (mutually exclusive). */
  const queueTicketDetailPage = useMemo(
    () =>
      isTicketsQueueWorkspace &&
      isTicketDetailPage &&
      ticketDetailHasQueueContext(searchParams),
    [isTicketsQueueWorkspace, isTicketDetailPage, searchParams.toString()]
  );
  const [queueTicketPropertiesOpen, setQueueTicketPropertiesOpen] = useState(false);

  /**
   * Queue ticket detail: properties open + left queue rail collapsed by default; changing ticket resets.
   * useLayoutEffect: avoids a frame where queue home left `isRightSidebarOpen` is still true and a plain
   * useEffect would run after paint and race with a "close properties if rail open" rule.
   * Mutual exclusivity when the user expands the rail is handled in `handleQueueTicketLeftRailToggle` only.
   */
  useLayoutEffect(() => {
    if (!queueTicketDetailPage) {
      setQueueTicketPropertiesOpen(false);
      return;
    }
    setQueueTicketPropertiesOpen(true);
    setRightSidebarOpen(false);
  }, [queueTicketDetailPage, ticketDetailSlug, setRightSidebarOpen]);

  const toggleQueueTicketProperties = useCallback(() => {
    if (queueTicketPropertiesOpen) {
      setQueueTicketPropertiesOpen(false);
    } else {
      setQueueTicketPropertiesOpen(true);
      setRightSidebarOpen(false);
    }
  }, [queueTicketPropertiesOpen, setRightSidebarOpen]);

  const setQueueTicketPropertiesOpenSafe = useCallback(
    (open: boolean) => {
      if (open) {
        setQueueTicketPropertiesOpen(true);
        setRightSidebarOpen(false);
      } else {
        setQueueTicketPropertiesOpen(false);
      }
    },
    [setRightSidebarOpen]
  );

  const handleQueueTicketLeftRailToggle = useCallback(() => {
    const next = !isRightSidebarOpen;
    setRightSidebarOpen(next);
    if (next) {
      setQueueTicketPropertiesOpen(false);
    }
  }, [isRightSidebarOpen, setRightSidebarOpen]);

  const [ticketCopresenceLive, setTicketCopresenceLive] = useState(false);
  const [ticketOtherAgentViewers, setTicketOtherAgentViewers] = useState<TicketOtherAgentViewer[]>([]);
  useEffect(() => {
    if (!isTicketDetailPage) {
      setTicketCopresenceLive(false);
      setTicketOtherAgentViewers([]);
    }
  }, [isTicketDetailPage, ticketDetailSlug]);

  const rightSidebarContextValue = useMemo(
    () =>
      queueTicketDetailPage
        ? {
            isOpen: queueTicketPropertiesOpen,
            onToggle: toggleQueueTicketProperties,
            setOpen: setQueueTicketPropertiesOpenSafe,
            ticketCopresenceLive,
            setTicketCopresenceLive,
            ticketOtherAgentViewers,
            setTicketOtherAgentViewers,
            ticketRightSidebarPanel,
            setTicketRightSidebarPanel,
            ticketSettingsSection,
            setTicketSettingsSection,
          }
        : {
            isOpen: isRightSidebarOpen,
            onToggle: handleRightSidebarToggle,
            setOpen: setRightSidebarOpen,
            ticketCopresenceLive,
            setTicketCopresenceLive,
            ticketOtherAgentViewers,
            setTicketOtherAgentViewers,
            ticketRightSidebarPanel,
            setTicketRightSidebarPanel,
            ticketSettingsSection,
            setTicketSettingsSection,
          },
    [
      queueTicketDetailPage,
      queueTicketPropertiesOpen,
      toggleQueueTicketProperties,
      setQueueTicketPropertiesOpenSafe,
      isRightSidebarOpen,
      handleRightSidebarToggle,
      setRightSidebarOpen,
      ticketCopresenceLive,
      setTicketCopresenceLive,
      ticketOtherAgentViewers,
      setTicketOtherAgentViewers,
      ticketRightSidebarPanel,
      setTicketRightSidebarPanel,
      ticketSettingsSection,
      setTicketSettingsSection,
    ]
  );

  const currentRouteCtx = useCurrentRoute();
  const isNavigating = currentRouteCtx?.isNavigating ?? false;
  const pendingNavHref = currentRouteCtx?.pendingNavHref ?? null;

  const cancelInFlightPageQueries = useCallback(() => {
    queryClient.cancelQueries({
      predicate: (query) => {
        const key = query.queryKey as readonly unknown[];
        const root = key?.[0];
        if (key.includes("auth") || key.includes("bootstrap")) return false;
        if (root === "permissions" || root === "dashboard-access") return false;
        return true;
      },
    });
  }, [queryClient]);

  const handleSidebarNavigationStart = useCallback(
    (targetHref: string) => {
      const cleanTarget = cleanDashboardHref(targetHref);
      if (isDashboardNavAlreadyAtTarget(cleanPathname, cleanTarget)) return;

      // Already navigating to this exact target — keep overlay; let <Link> proceed.
      // A different target replaces pending via startNavigation (latest click wins).
      const alreadyPendingSameTarget = currentRouteCtx?.pendingNavHref === cleanTarget;
      const showNavOverlay = shouldShowDashboardNavOverlay(cleanPathname, cleanTarget);

      if (!isDashboardNavAlreadyAtTarget(cleanPathname, cleanTarget)) {
        prefetchDashboardSection(queryClient, cleanTarget);
      }

      if (showNavOverlay && !alreadyPendingSameTarget) {
        currentRouteCtx?.startNavigation(cleanTarget);
        cancelInFlightPageQueries();
      }

      // Instantly clear the right rail from the main area when leaving via left nav
      // to a left-only / not-yet-active-right page (no collapsed strip during load).
      if (pathRightSidebarActive(cleanTarget, null)) {
        setLeftSidebarOpen(false);
        setRightSidebarOpen(true);
      } else {
        setRightSidebarOpen(false);
        setLeftSidebarOpen(true);
      }
    },
    [
      queryClient,
      currentRouteCtx,
      cleanPathname,
      cancelInFlightPageQueries,
      setLeftSidebarOpen,
      setRightSidebarOpen,
    ]
  );

  const isRiderDashboardLayout =
    cleanPathname === "/dashboard/riders" || cleanPathname.startsWith("/dashboard/riders/");
  const hasRiderSidebarContent =
    isRiderDashboardLayout && Boolean((searchParams.get("search") || "").trim());

  const hasRightSidebarEligible =
    hasRightSidebar && (!isRiderDashboardLayout || hasRiderSidebarContent);

  /** While left-nav is in flight to a page without an active right rail, hide right immediately. */
  const pendingSuppressesRight =
    pendingNavHref != null && !pathRightSidebarActive(pendingNavHref, null);
  const isStoreVerificationDetail = isStoreVerificationDetailPath(
    cleanPathname,
    searchParams
  );
  const isStoreVerificationStepView =
    isStoreVerificationDetail &&
    parseStoreVerificationStepParam(searchParams.get("step")) != null;

  /** Store overview / menu / settings / etc. — flush shell (no main white padding). */
  const isMerchantStorePath = useMemo(
    () => /^\/dashboard\/merchants\/stores\/\d+(\/|$)/.test(cleanPathname),
    [cleanPathname]
  );

  /** Ticket detail mounts the properties rail via RightSidebar; list/hub pages use filters/sub-nav instead.
   * Keep the rail mounted when merely collapsed so the expand chevron stays available. */
  const shouldRenderRightSidebar =
    !isAddChildPage &&
    !isCustomerDetailFromOrder &&
    !isStoreVerificationDetail &&
    (hasRightSidebarEligible || isTicketDetailPage) &&
    !pendingSuppressesRight;

  const showWorkspaceOverlay = isNavigating;

  const mainLgMarginLeft = isCustomerDetailFromOrder || isAddChildPage
    ? ""
    : isTicketsQueueWorkspace
      ? isRightSidebarOpen
        ? "lg:ml-56"
        : "lg:ml-14"
      : isLeftSidebarOpen
        ? "lg:ml-56"
        : "lg:ml-16";

  /** Ticket detail + queue workspace: TicketViewClient applies its own `lg:pr-*` — do not add `mr-*` here or space is doubled. */
  const mainLgMarginRight =
    isTicketsQueueWorkspace || isTicketDetailPage
      ? ""
      : !shouldRenderRightSidebar
        ? ""
      : isRightSidebarOpen
        ? isFilterSidebarOpen
          ? "lg:mr-[28rem]"
          : "lg:mr-56"
        : "lg:mr-14";

  /** Left sidebar stays visible; overlay sits above fixed right rail (z-40). */

  /** Left sidebar is a persistent shell — hide with CSS for full-bleed layouts; never unmount. */
  const leftSidebarShellHidden =
    isTicketsQueueWorkspace || isCustomerDetailFromOrder || isAddChildPage;

  return (
    <LeftSidebarMobileProvider>
      <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#E6F6F5" }}>
        <HierarchicalSidebar
          isOpen={isLeftSidebarOpen}
          onToggle={handleLeftSidebarToggle}
          isInSpecificDashboard={isInSpecificDashboard}
          onNavigationStart={handleSidebarNavigationStart}
          shellHidden={leftSidebarShellHidden}
        />
        <RightSidebarProvider value={rightSidebarContextValue}>
          <StoreVerificationSheetProvider>
          <MerchantsSearchProvider>
            <SyncSidebarsOnMobile />
            <div className="relative flex min-w-0 flex-1 min-h-0">
              <div
                className={`flex flex-1 flex-col overflow-hidden w-full min-w-0 ${mainLgMarginLeft} ${mainLgMarginRight}`}
                style={
                  showWorkspaceOverlay
                    ? undefined
                    : { transition: "margin 0.3s ease-out" }
                }
              >
                {isAddChildPage ? null : <Header />}
                <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden w-full">
                  <main
                    className={`flex-1 transition-all duration-300 w-full flex flex-col min-h-0 relative text-gray-900 ${
                      isAddChildPage
                        ? "overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 p-0"
                        : isOrderDetailPage
                        ? "overflow-hidden bg-transparent p-0"
                        : isTicketsFullBleedLayout
                        ? "overflow-hidden bg-white px-2 pb-3 pt-2 sm:px-3 sm:pb-4 sm:pt-2.5"
                        : isStoreOrdersPath
                          ? "overflow-hidden bg-white p-0 sm:p-0"
                        : isMerchantStorePath
                          ? "overflow-hidden bg-[#f8fafc] p-0 sm:p-0"
                        : isTicketsHubGreyPage
                          ? "overflow-y-auto bg-[#f4f5f7] p-4 sm:p-6"
                          : isOrdersSectionPage
                            ? "overflow-y-auto bg-[#f3f5f7] p-3 sm:p-4"
                          : isNotificationsModule
                            ? "overflow-hidden bg-slate-50 p-0"
                          : isCustomerDetailProfilePage
                            ? "overflow-y-auto bg-[#f4f6f8] px-3 pb-4 pt-0 sm:px-5 sm:pb-5 sm:pt-0"
                          : isStoreVerificationStepView
                            ? "overflow-y-auto bg-[#f4f5f7] px-3 pb-3 pt-0 sm:px-4 sm:pb-4 sm:pt-0"
                          : "overflow-y-auto bg-white p-3 sm:p-4"
                    }`}
                  >
                    <div
                      className={`relative flex min-h-0 w-full max-w-full min-w-0 flex-1 flex-col ${
                        isAddChildPage ? "h-full" : ""
                      }`}
                    >
                      {children}
                      <DashboardNavOverlay
                        visible={showWorkspaceOverlay}
                        scope="main"
                        pendingHref={pendingNavHref}
                      />
                    </div>
                  </main>
                </div>
              </div>

              {shouldRenderRightSidebar && (
                <RightSidebar
                  isOpen={isRightSidebarOpen}
                  onToggle={
                    queueTicketDetailPage ? handleQueueTicketLeftRailToggle : handleRightSidebarToggle
                  }
                  filterSidebarOpen={isFilterSidebarOpen}
                  dockSide={isTicketsQueueWorkspace ? "left" : "right"}
                  ticketPropertiesRailOpen={
                    queueTicketDetailPage ? queueTicketPropertiesOpen : undefined
                  }
                />
              )}

              <div
                id="gm-map-stash"
                aria-hidden
                className="pointer-events-none fixed opacity-0"
                style={{ left: -10000, top: 0, width: 520, height: 520 }}
              />

              {isTicketDetailPage && (
                <div
                  className="fixed inset-y-0 z-50 overflow-hidden transition-[width] duration-300 ease-out"
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
                    <div className="flex h-14 min-h-14 items-center justify-between border-b border-gray-300/30 px-3 shrink-0 bg-white/50 rounded-tl-xl">
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
          </MerchantsSearchProvider>
          </StoreVerificationSheetProvider>
        </RightSidebarProvider>
      </div>
    </LeftSidebarMobileProvider>
  );
}

const MemoizedDashboardLayoutClient = memo(DashboardLayoutClient);

export default MemoizedDashboardLayoutClient;

