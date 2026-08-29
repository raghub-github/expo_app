"use client";

import { useMemo, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { DarkSidebarMeshBackground } from "@/components/layout/DarkSidebarMeshBackground";
import { useAppPathname, useAppSearchParams } from "@/hooks/useAppSearchParams";

import {
  Zap,
  LineChart,
  LayoutDashboard,
  Home,
  Users,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileUp,
  Bell,
  Star,
} from "lucide-react";
import {
  getCurrentDashboard,
  getCurrentDashboardSubRoutes,
  getStoreScopedMerchantRoutes,
  adminPortalMerchantRoutes,
  notificationDashboardRoutes,
  type DashboardSubRoute,
  type AreaManagerTypeFilter,
} from "@/lib/navigation/dashboard-routes";
import { TicketFilters } from "@/components/tickets/TicketFilters";
import { TicketPropertiesPanel } from "@/components/tickets/ticket-view/TicketPropertiesPanel";
import { TicketRightSidebarSettingsPanel } from "@/components/tickets/TicketRightSidebarSettingsPanel";
import { useRightSidebar } from "@/context/RightSidebarContext";
import {
  AGENT_ACTIVITY_PATH,
  TICKETS_HELPDESK_DASHBOARD_PATH,
  TICKETS_QUEUE_HOME_PATH,
  TICKETS_QUEUE_MANAGER_PATH,
  TICKETS_QUEUE_SUPERVISOR_PATH,
  isTicketsAppDetailPath,
  ticketDetailHasQueueContext,
  ticketsPathTicketId,
} from "@/lib/tickets/ticket-path-utils";
import { normalizeQueueManagerSection, type QueueManagerSection } from "@/lib/tickets/queue-manager-sections";
import {
  normalizeQueueSupervisorSection,
  type QueueSupervisorSection,
} from "@/lib/tickets/queue-supervisor-sections";
import { queueSupervisorHref } from "@/lib/tickets/queue-supervisor-paths";
import { usePermission } from "@/hooks/usePermission";
import { usePermissions } from "@/hooks/usePermissions";
import { useMerchantDashboardAccess } from "@/hooks/useMerchantDashboardAccess";
import {
  parsePortalParam,
  readStoredMerchantsPortal,
  resolveMerchantsPortal,
} from "@/lib/merchants/portal-preference";
import { getDashboardTypeFromPath } from "@/lib/permissions/path-mapping";
import { StoreInfoCard, StoreInfoCardSkeleton, type StoreInfoCardData } from "@/components/layout/StoreInfoCard";
import { WalletRequestsSummarySidebar } from "@/components/merchants/WalletRequestsSummarySidebar";
import { OnboardingFailedSummarySidebar } from "@/components/area-manager/OnboardingFailedSummarySidebar";
import { useStore } from "@/hooks/useStore";
import { useMerchantsSearch } from "@/context/MerchantsSearchContext";
import { useCurrentRoute } from "@/context/CurrentRouteContext";
import { isDashboardNavAlreadyAtTarget } from "@/lib/navigation/dashboard-nav-transition";
import { prefetchDashboardSection } from "@/lib/dashboard-prefetch";
import { getQueryClient } from "@/lib/react-query";
import { EXPIRED_RESUBMITTED_DOCS_LABEL } from "@/lib/merchants/expired-resubmitted-docs-label";
import { MERCHANT_RESUBMITTED_DOCS_REFRESH_EVENT } from "@/lib/merchants/merchant-resubmitted-docs-refresh";
import { MERCHANT_MENU_REVIEW_QUEUE_REFRESH_EVENT } from "@/lib/merchant/menu-review-queue";
import {
  readLastMerchantStoreId,
  storeIdFromPathname,
  writeLastMerchantStoreId,
} from "@/lib/merchants/effective-store-id";
interface RightSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  /** When true, this (Properties) sidebar shifts left so Filters can sit at right: 0 */
  filterSidebarOpen?: boolean;
  /** Queue workspace: dock this rail on the left (global icon sidebar is hidden). */
  dockSide?: "left" | "right";
  /**
   * Queue ticket detail only: visibility of the fixed-right properties panel.
   * When set, `isOpen` controls only the left queue rail (mutually exclusive with this).
   */
  ticketPropertiesRailOpen?: boolean;
}

export function RightSidebar({
  isOpen,
  onToggle,
  filterSidebarOpen,
  dockSide = "right",
  ticketPropertiesRailOpen,
}: RightSidebarProps) {
  const pathname = useAppPathname();
  const searchParams = useAppSearchParams();
  const router = useRouter();
  const currentRoute = useCurrentRoute();
  const rightSidebarCtx = useRightSidebar();
  const { hasDashboardAccess, isSuperAdmin, canPerformAction } = usePermission();
  const { canTogglePortal = false } = usePermissions();
  const {
    hasAdminMerchantAccess,
    filterStoreRoutes,
  } = useMerchantDashboardAccess();
  
  // Remove query parameters for comparison
  const cleanPathname = useMemo(() => pathname.split('?')[0].split('#')[0], [pathname]);

  const handleSidebarNavClickCapture = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement).closest("a[href]");
      if (!anchor || !(anchor instanceof HTMLAnchorElement)) return;
      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("http") || rawHref.startsWith("#")) return;
      const target = rawHref.split("?")[0].split("#")[0];

      // Store tab nav: overlay is off — never startNavigation (re-render drops first Link click).
      const onStoreTab =
        /^\/dashboard\/merchants\/stores\/\d+(\/|$)/.test(cleanPathname) &&
        /^\/dashboard\/merchants\/stores\/\d+(\/|$)/.test(target);
      if (onStoreTab) {
        if (!isDashboardNavAlreadyAtTarget(cleanPathname, target)) {
          prefetchDashboardSection(getQueryClient(), rawHref);
        }
        return;
      }

      if (isDashboardNavAlreadyAtTarget(cleanPathname, target)) return;
      window.setTimeout(() => {
        currentRoute?.startNavigation(target);
      }, 0);
    },
    [cleanPathname, currentRoute]
  );

  // Get current dashboard
  const currentDashboard = useMemo(
    () => getCurrentDashboard(cleanPathname),
    [cleanPathname]
  );

  const isStorePath = /^\/dashboard\/merchants\/stores\/\d+/.test(cleanPathname);
  const portal = resolveMerchantsPortal({
    portalFromUrl: parsePortalParam(searchParams.get("portal")),
    canTogglePortal: hasAdminMerchantAccess || canTogglePortal,
    storedPortal: typeof window !== "undefined" ? readStoredMerchantsPortal() : null,
  });
  const effectiveMerchantPortal =
    hasAdminMerchantAccess || isSuperAdmin ? portal : "merchant";

  // Sub-routes for current dashboard. When on merchants: admin portal = only All Merchants + Verifications; merchant portal = store-scoped after search. When on a store page, show access-filtered store links.
  const rawSubRoutes = useMemo(() => {
    if (cleanPathname.startsWith("/dashboard/super-admin/notifications")) {
      return notificationDashboardRoutes;
    }
    const dashboard = getCurrentDashboard(cleanPathname);
    if (dashboard?.href === "/dashboard/merchants") {
      const pathId = storeIdFromPathname(cleanPathname);
      const onStoreArea = /\/dashboard\/merchants\/stores/.test(cleanPathname);
      const recoveredId =
        pathId ?? (onStoreArea ? readLastMerchantStoreId() : null);
      if (recoveredId) {
        return filterStoreRoutes(getStoreScopedMerchantRoutes(recoveredId));
      }
      if (effectiveMerchantPortal === "merchant" || !hasAdminMerchantAccess) {
        // No store open: do not show Dashboard / Subscription / Settings / Wallet.
        // Store-scoped links appear only after a store is opened.
        return [];
      }
      return adminPortalMerchantRoutes;
    }
    return getCurrentDashboardSubRoutes(cleanPathname);
  }, [
    cleanPathname,
    effectiveMerchantPortal,
    filterStoreRoutes,
    hasAdminMerchantAccess,
  ]);
  const isAreaManagerDashboard =
    currentDashboard?.dashboardType === "AREA_MANAGER";
  const isOrderDashboard =
    currentDashboard?.dashboardType === "ORDER_FOOD" ||
    currentDashboard?.dashboardType === "ORDER_PARCEL" ||
    currentDashboard?.dashboardType === "ORDER_PERSON_RIDE" ||
    cleanPathname.startsWith("/dashboard/orders");
  const [areaManagerType, setAreaManagerType] =
    useState<AreaManagerTypeFilter | null>(null);
  const [pendingMenuRequestsCount, setPendingMenuRequestsCount] = useState<number>(0);
  const [storeMenuReviewPendingCount, setStoreMenuReviewPendingCount] = useState<number>(0);
  const [resubmittedDocsCount, setResubmittedDocsCount] = useState<number>(0);

  const refreshResubmittedDocsCount = useCallback(() => {
    fetch("/api/merchant/stores/stats")
      .then((res) => res.json())
      .then((body) => {
        if (!body?.success) return;
        const count = Number(body.resubmitted ?? 0);
        setResubmittedDocsCount(Number.isFinite(count) ? count : 0);
      })
      .catch(() => setResubmittedDocsCount(0));
  }, []);

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

  const refreshReviewQueueSummary = useCallback(() => {
    const storeMatch = cleanPathname.match(/^\/dashboard\/merchants\/stores\/(\d+)/);
    const storeId = storeMatch ? storeMatch[1] : null;
    const isAdminMerchantsArea =
      cleanPathname.startsWith("/dashboard/merchants") &&
      hasAdminMerchantAccess &&
      effectiveMerchantPortal === "admin";

    if (isAdminMerchantsArea) {
      fetch("/api/merchant-menu/review-queue-summary")
        .then((res) => res.json())
        .then((body) => {
          if (!body?.success) return;
          const total = Number(body.total_pending ?? 0);
          setPendingMenuRequestsCount(Number.isFinite(total) ? total : 0);
        })
        .catch(() => setPendingMenuRequestsCount(0));
      refreshResubmittedDocsCount();
    } else {
      setPendingMenuRequestsCount(0);
      setResubmittedDocsCount(0);
    }

    if (storeId) {
      fetch(`/api/merchant-menu/review-queue-summary?storeId=${encodeURIComponent(storeId)}`)
        .then((res) => res.json())
        .then((body) => {
          if (!body?.success) return;
          const total = Number(body.total_pending ?? 0);
          setStoreMenuReviewPendingCount(Number.isFinite(total) ? total : 0);
        })
        .catch(() => setStoreMenuReviewPendingCount(0));
    } else {
      setStoreMenuReviewPendingCount(0);
    }
  }, [
    cleanPathname,
    effectiveMerchantPortal,
    hasAdminMerchantAccess,
    refreshResubmittedDocsCount,
  ]);

  useEffect(() => {
    refreshReviewQueueSummary();
  }, [refreshReviewQueueSummary]);

  useEffect(() => {
    const onRefresh = () => refreshReviewQueueSummary();
    window.addEventListener(MERCHANT_MENU_REVIEW_QUEUE_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(MERCHANT_MENU_REVIEW_QUEUE_REFRESH_EVENT, onRefresh);
  }, [refreshReviewQueueSummary]);

  useEffect(() => {
    const onRefresh = () => refreshResubmittedDocsCount();
    window.addEventListener(MERCHANT_RESUBMITTED_DOCS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(MERCHANT_RESUBMITTED_DOCS_REFRESH_EVENT, onRefresh);
  }, [refreshResubmittedDocsCount]);

  // Partner resubmits from another app — poll so the sidebar badge updates without a hard refresh.
  useEffect(() => {
    const isAdminMerchantsArea =
      cleanPathname.startsWith("/dashboard/merchants") &&
      hasAdminMerchantAccess &&
      effectiveMerchantPortal === "admin";
    if (!isAdminMerchantsArea) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      refreshResubmittedDocsCount();
    }, 12_000);
    return () => window.clearInterval(id);
  }, [
    cleanPathname,
    effectiveMerchantPortal,
    hasAdminMerchantAccess,
    refreshResubmittedDocsCount,
  ]);

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

  const ticketIdFromPath = useMemo(() => ticketsPathTicketId(cleanPathname), [cleanPathname]);
  const isTicketDetailPage = isTicketsAppDetailPath(cleanPathname);

  // Store ID when on a merchant store page (for Store Information Card in sidebar)
  const storeIdFromPath = useMemo(() => storeIdFromPathname(cleanPathname), [cleanPathname]);

  useEffect(() => {
    writeLastMerchantStoreId(storeIdFromPath);
  }, [storeIdFromPath]);

  /** Unmount store card immediately on navigation — do not rely on query/context clearing (avoids stale flash). */
  const showRightSidebarStoreCard = useMemo(() => {
    const p = cleanPathname;
    return (
      p === "/dashboard/orders" ||
      p.startsWith("/dashboard/orders/") ||
      p === "/dashboard/merchants" ||
      p.startsWith("/dashboard/merchants/")
    );
  }, [cleanPathname]);

  const storeIdForSidebarStoreQuery = showRightSidebarStoreCard ? storeIdFromPath : null;
  const { store: sidebarStoreData } = useStore(storeIdForSidebarStoreQuery);
  const merchantsSearch = useMerchantsSearch();

  const sidebarStore: StoreInfoCardData | null = useMemo(() => {
    if (!sidebarStoreData) return null;
    return {
      storeId: sidebarStoreData.id,
      name: sidebarStoreData.name ?? "",
      store_id: sidebarStoreData.store_id ?? "",
      full_address: sidebarStoreData.full_address ?? null,
      approval_status: sidebarStoreData.approval_status ?? null,
      delisted_at: sidebarStoreData.delisted_at ?? null,
      created_at: sidebarStoreData.created_at ?? null,
    };
  }, [sidebarStoreData]);

  const isMerchantsListPage = cleanPathname === "/dashboard/merchants";
  /** Merchants home (search list only): never show `useStore` cache here — it can be stale from a previous store page and desync from search. */
  const isMerchantsSearchListRoot =
    isMerchantsListPage && effectiveMerchantPortal === "merchant" && !storeIdFromPath;
  const showMerchantSearchSkeleton =
    showRightSidebarStoreCard &&
    isMerchantsListPage &&
    effectiveMerchantPortal === "merchant" &&
    Boolean(merchantsSearch?.isLoading);
  const merchantSearchResultStore: StoreInfoCardData | null = useMemo(() => {
    if (
      !showRightSidebarStoreCard ||
      !merchantsSearch?.searchResultStore ||
      !isMerchantsListPage ||
      effectiveMerchantPortal !== "merchant"
    )
      return null;
    const s = merchantsSearch.searchResultStore;
    return {
      storeId: s.storeId,
      name: s.name,
      store_id: s.store_id,
      full_address: s.full_address ?? null,
      approval_status: s.approval_status ?? null,
      delisted_at: (s as { delisted_at?: string | null }).delisted_at ?? null,
    };
  }, [
    merchantsSearch?.searchResultStore,
    isMerchantsListPage,
    effectiveMerchantPortal,
    showRightSidebarStoreCard,
  ]);

  const isTicketsDashboard = currentDashboard?.href === "/dashboard/tickets";
  const queueDetailFromHome = isTicketDetailPage && ticketDetailHasQueueContext(searchParams);
  /** Queue routes or ticket detail opened from queue home (`?fromQueue=1`). */
  const isTicketsQueuePath =
    cleanPathname.startsWith("/dashboard/tickets/queue") || queueDetailFromHome;
  /** Queue workspace always docks on the left edge of the viewport. */
  const dockLeft = dockSide === "left" || isTicketsQueuePath;
  const queueLeftRail = isTicketsQueuePath;
  const ticketDetailQueueLeftRail =
    isTicketDetailPage && dockLeft && queueLeftRail;
  const showQueueDetailPropertiesPanel =
    queueDetailFromHome &&
    ticketIdFromPath != null &&
    (ticketPropertiesRailOpen !== undefined ? ticketPropertiesRailOpen : isOpen);

  /** Light right-rail nav (Merchants / Riders / etc.) — matches left sidebar language on #F3F7FA. */
  const rsbNavActive = "bg-white text-[#121212] shadow-sm";
  const rsbNavIdle = "text-[#121212]/75 hover:bg-white/80 hover:text-[#121212]";
  const rsbNavCtaIdle =
    "border border-[#121212]/10 bg-white/60 text-[#121212] hover:bg-white hover:border-[#121212]/15";
  const rsbNavCtaActive = "border border-[#121212]/15 bg-white text-[#121212] shadow-sm";

  /** Queue left rail — black chrome like control dashboard; light rail elsewhere. */
  const queueNavActive = queueLeftRail
    ? "bg-gradient-to-r from-teal-500/20 via-teal-600/10 to-transparent text-white"
    : rsbNavActive;
  const queueNavInactive = queueLeftRail
    ? "text-slate-300 hover:bg-white/[0.06] hover:text-white"
    : rsbNavIdle;
  const queueNavCollapsedActive = queueLeftRail
    ? "bg-gradient-to-r from-teal-500/20 via-teal-600/10 to-transparent text-white"
    : rsbNavActive;
  const queueNavParentFaded = queueLeftRail
    ? "bg-gradient-to-r from-teal-500/15 via-teal-600/8 to-transparent text-white/80"
    : rsbNavCtaActive;
  const queueNavCollapsedParentFaded = queueLeftRail
    ? "bg-gradient-to-r from-teal-500/20 via-teal-600/10 to-transparent text-white/90"
    : rsbNavCtaActive;

  const onAgentActivityPage = cleanPathname === AGENT_ACTIVITY_PATH;
  const onTicketsHelpdeskDashboard = cleanPathname === TICKETS_HELPDESK_DASHBOARD_PATH;
  const onCsatAnalysisPage =
    cleanPathname === "/dashboard/tickets/csat" ||
    cleanPathname.startsWith("/dashboard/tickets/csat/");
  const onTicketsHubSectionsPage =
    onAgentActivityPage || onTicketsHelpdeskDashboard || onCsatAnalysisPage;
  const agentActivitySection = searchParams.get("section") === "automation" ? "automation" : "activity";
  const onQueueHome =
    cleanPathname === TICKETS_QUEUE_HOME_PATH ||
    cleanPathname === "/dashboard/tickets/queue" ||
    queueDetailFromHome;
  const onQueueSupervisor = cleanPathname === TICKETS_QUEUE_SUPERVISOR_PATH;
  const onQueueManager = cleanPathname === TICKETS_QUEUE_MANAGER_PATH;
  const queueSupervisorSection: QueueSupervisorSection | null = onQueueSupervisor
    ? normalizeQueueSupervisorSection(searchParams.get("section"))
    : null;
  const queueSupervisorAgentInUrl = (searchParams.get("agentId") ?? "").trim();
  const queueManagerSection: QueueManagerSection | null = onQueueManager
    ? normalizeQueueManagerSection(searchParams.get("section"))
    : null;
  const canViewQueueSupervisor = isSuperAdmin
    || canPerformAction("TICKET", "VIEW", { access_point_group: "TICKET_QUEUE_SUPERVISOR" });
  const canViewQueueManager = isSuperAdmin
    || canPerformAction("TICKET", "VIEW", { access_point_group: "TICKET_QUEUE_MANAGER" });
  const showQueueSupervisorNav = canViewQueueSupervisor;
  const showQueueManagerNav = canViewQueueManager;

  const [supervisorNavOpen, setSupervisorNavOpen] = useState(true);
  const [managerNavOpen, setManagerNavOpen] = useState(true);

  useEffect(() => {
    if (!isTicketsQueuePath) return;
    router.prefetch(TICKETS_QUEUE_HOME_PATH);
    router.prefetch(queueSupervisorHref("updated-agents"));
    router.prefetch(`${TICKETS_QUEUE_MANAGER_PATH}?section=max-open`);
  }, [isTicketsQueuePath, router]);

  const isRiderDashboard =
    cleanPathname === "/dashboard/riders" ||
    cleanPathname.startsWith("/dashboard/riders/");
  const isMerchantsDashboard = currentDashboard?.href === "/dashboard/merchants";

  const selectedRiderSearch = (searchParams.get("search") || "").trim();
  const merchantsRailHasContent =
    isMerchantsDashboard &&
    (currentSubRoutes.length > 0 ||
      Boolean(storeIdFromPath) ||
      (hasAdminMerchantAccess && effectiveMerchantPortal === "admin") ||
      Boolean(merchantSearchResultStore) ||
      Boolean(showMerchantSearchSkeleton));

  // Don't show right sidebar if not in a specific dashboard.
  // Riders: only after search. Merchants: only when admin CTAs, store nav, or search card exist.
  if (
    !isInSpecificDashboard ||
    (isRiderDashboard && !selectedRiderSearch) ||
    (isMerchantsDashboard && !merchantsRailHasContent) ||
    (!isRiderDashboard && !isMerchantsDashboard && !currentSubRoutes.length)
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

  const appendMerchantPortal = (href: string) => {
    if (!isMerchantsDashboard || effectiveMerchantPortal !== "merchant") return href;
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
        onClickCapture={handleSidebarNavClickCapture}
        className={`fixed z-40 flex flex-col overflow-hidden shadow-none transition-[transform,width] duration-300 ease-out ${
          queueLeftRail ? "left-0 right-auto" : dockLeft ? "left-0 right-auto" : "right-0 left-auto"
        } ${
          /* Queue left rail: full viewport height (matches queue home). Right-docked ticket detail: start below header row. */
          isTicketDetailPage && !(queueLeftRail && dockLeft)
            ? "bottom-0 top-14"
            : "inset-y-0 h-dvh max-h-dvh"
        }
          ${isOpen ? (isTicketDetailPage && !queueDetailFromHome ? "w-64" : "w-56") : "w-14"}
          max-lg:w-72 ${isOpen ? "max-lg:translate-x-0" : dockLeft ? "max-lg:-translate-x-full" : "max-lg:translate-x-full"}
          ${queueLeftRail ? "dark-sidebar-chrome border-r border-white/10" : ""}`}
        style={
          queueLeftRail
            ? {
                left: filterSidebarOpen ? "14rem" : 0,
                right: "auto",
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(255,255,255,0.2) transparent",
              }
            : {
                ...(dockLeft
                  ? { left: filterSidebarOpen ? "14rem" : 0, right: "auto" as const }
                  : { right: filterSidebarOpen ? "14rem" : 0, left: "auto" as const }),
                backgroundColor: "#F3F7FA",
                scrollbarWidth: "thin",
                scrollbarColor: "#9CA3AF #F3F7FA",
              }
        }
      >
        {queueLeftRail ? <DarkSidebarMeshBackground /> : null}
        {(!isTicketDetailPage || queueDetailFromHome) && (
          <div
            className={`relative z-20 flex h-14 min-h-14 w-full min-w-0 shrink-0 items-center border-b ${
              queueLeftRail
                ? "border-white/10 bg-transparent px-2 sm:px-3"
                : "border-gray-300/30 bg-[#F3F7FA] px-2 sm:px-3"
            } ${isOpen ? "gap-2" : "justify-center"}`}
          >
            {queueLeftRail ? (
              isOpen ? (
                <Link
                  href="/dashboard"
                  scroll={false}
                  className="flex min-w-0 flex-1 items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-xl"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[#121212]/80 ring-1 ring-white/10 backdrop-blur-sm">
                    <Image
                      src="/onlylogo.png"
                      alt="GatiMitra"
                      width={28}
                      height={28}
                      className="size-7 object-contain"
                      priority
                    />
                  </span>
                  <span className="min-w-0 flex flex-col overflow-hidden">
                    <span className="truncate text-sm font-semibold leading-tight text-white">GatiMitra</span>
                    <span className="truncate text-[10px] font-medium uppercase tracking-[0.06em] text-slate-400">
                      Queue
                    </span>
                  </span>
                </Link>
              ) : (
                <Link
                  href="/dashboard"
                  scroll={false}
                  className="flex size-9 items-center justify-center rounded-[10px] bg-[#121212]/80 ring-1 ring-white/10 backdrop-blur-sm"
                  title="GatiMitra Queue"
                >
                  <Image
                    src="/onlylogo.png"
                    alt="GatiMitra"
                    width={28}
                    height={28}
                    className="size-7 object-contain"
                    priority
                  />
                </Link>
              )
            ) : isOpen ? (
              <>
                {cleanPathname.startsWith("/dashboard/super-admin/notifications") ? (
                  <div className="flex shrink-0 items-center justify-center rounded-[10px] bg-[#121212] p-1.5">
                    <Bell className="h-4 w-4 text-white" aria-hidden />
                  </div>
                ) : currentDashboard?.icon ? (
                  <div className="flex shrink-0 items-center justify-center rounded-[10px] bg-[#121212] p-1.5">
                    <currentDashboard.icon className="h-4 w-4 text-white" aria-hidden />
                  </div>
                ) : null}
                <h2 className="min-w-0 flex-1 truncate text-left text-xs font-bold leading-snug text-[#121212]">
                  {cleanPathname.startsWith("/dashboard/super-admin/notifications")
                    ? "Notifications"
                    : currentDashboard?.name}
                </h2>
              </>
            ) : (
              cleanPathname.startsWith("/dashboard/super-admin/notifications") ? (
                <div className="rounded-[10px] bg-[#121212] p-1.5">
                  <Bell className="h-4 w-4 text-white" aria-hidden />
                </div>
              ) : currentDashboard?.icon ? (
                <div className="rounded-[10px] bg-[#121212] p-1.5">
                  <currentDashboard.icon className="h-4 w-4 text-white" aria-hidden />
                </div>
              ) : null
            )}
          </div>
        )}

        {/* Body: flex-1 scroll */}
        <div
          className={`relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden ${
            isTicketDetailPage
              ? dockLeft
                ? ticketDetailQueueLeftRail
                  ? "border-r border-white/10 bg-transparent"
                  : "border-r-0 bg-[#F3F7FA]"
                : "border-l-0 bg-[#F3F7FA]"
              : ""
          }`}
        >
          <div
            className={`min-h-0 flex-1 overflow-x-hidden overscroll-y-contain ${
              isTicketDetailPage && !ticketDetailQueueLeftRail ? "overflow-y-hidden" : "overflow-y-auto"
            }`}
          >
            {isTicketsDashboard && ticketIdFromPath != null && isOpen && !queueDetailFromHome ? (
              <div className="h-full min-h-0">
                {rightSidebarCtx?.ticketRightSidebarPanel === "settings" ? (
                  <TicketRightSidebarSettingsPanel />
                ) : (
                  <TicketPropertiesPanel ticketId={ticketIdFromPath} />
                )}
              </div>
            ) : isTicketsDashboard && isTicketsQueuePath && isOpen ? (
              <div className="flex h-full min-h-0 flex-col">
                <nav className="dark-sidebar-chrome__nav flex-1 min-h-0 overflow-y-auto px-2.5 py-4" aria-label="Queue sections">
                  <div className="space-y-1">
                    <Link
                      href={TICKETS_QUEUE_HOME_PATH}
                      scroll={false}
                      prefetch
                      className={`group relative flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                        onQueueHome ? queueNavActive : queueNavInactive
                      }`}
                    >
                      <Home className="h-5 w-5 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">Queue</span>
                    </Link>
                    {showQueueSupervisorNav ? (
                      <div
                        className={`flex items-stretch rounded-[10px] ${
                          onQueueSupervisor ? queueNavParentFaded : ""
                        }`}
                      >
                        <Link
                          href={queueSupervisorHref("updated-agents", queueSupervisorAgentInUrl || undefined)}
                          scroll={false}
                          prefetch
                          className={`group relative flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-l-[10px] px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                            onQueueSupervisor ? queueNavParentFaded : queueNavInactive
                          }`}
                        >
                          <Users className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">Supervisor</span>
                        </Link>
                        <button
                          type="button"
                          aria-expanded={supervisorNavOpen}
                          aria-label={supervisorNavOpen ? "Collapse Supervisor menu" : "Expand Supervisor menu"}
                          onClick={() => setSupervisorNavOpen((open) => !open)}
                          className={`inline-flex shrink-0 cursor-pointer items-center rounded-r-[10px] px-2.5 transition-colors duration-150 ${
                            onQueueSupervisor ? "text-white/70 hover:text-white" : queueNavInactive
                          }`}
                        >
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${
                              supervisorNavOpen ? "rotate-0" : "-rotate-90"
                            }`}
                            aria-hidden
                          />
                        </button>
                      </div>
                    ) : null}
                    {showQueueSupervisorNav && supervisorNavOpen ? (
                      <div className="mt-2 space-y-1.5 border-l border-white/15 pl-3 ml-1">
                        {(
                          [
                            ["updated-agents", "Updated agents"],
                            ["agent-tickets", "Agent tickets"],
                            ["status-history", "Status history"],
                          ] as const
                        ).map(([id, label]) => {
                          const active = queueSupervisorSection === id;
                          return (
                            <Link
                              key={id}
                              href={queueSupervisorHref(id, queueSupervisorAgentInUrl || undefined)}
                              scroll={false}
                              prefetch
                              className={`group relative flex min-h-[2.25rem] cursor-pointer items-center rounded-[10px] px-3 py-2 text-xs font-medium transition-colors duration-150 ${
                                active ? queueNavActive : queueNavInactive
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate pl-0.5">{label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                    {showQueueManagerNav ? (
                      <div
                        className={`flex items-stretch rounded-[10px] ${
                          onQueueManager ? queueNavParentFaded : ""
                        }`}
                      >
                        <Link
                          href={TICKETS_QUEUE_MANAGER_PATH}
                          scroll={false}
                          prefetch
                          className={`group relative flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-l-[10px] px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                            onQueueManager ? queueNavParentFaded : queueNavInactive
                          }`}
                        >
                          <Zap className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">Manager</span>
                        </Link>
                        <button
                          type="button"
                          aria-expanded={managerNavOpen}
                          aria-label={managerNavOpen ? "Collapse Manager menu" : "Expand Manager menu"}
                          onClick={() => setManagerNavOpen((open) => !open)}
                          className={`inline-flex shrink-0 cursor-pointer items-center rounded-r-[10px] px-2.5 transition-colors duration-150 ${
                            onQueueManager ? "text-white/70 hover:text-white" : queueNavInactive
                          }`}
                        >
                          <ChevronDown
                            className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${
                              managerNavOpen ? "rotate-0" : "-rotate-90"
                            }`}
                            aria-hidden
                          />
                        </button>
                      </div>
                    ) : null}
                    {showQueueManagerNav && managerNavOpen ? (
                      <div className="mt-2 space-y-1.5 border-l border-white/15 pl-3 ml-1">
                        {(
                          [
                            ["max-open", "Queue settings"],
                            ["agent-capacity", "Agent capacity"],
                            ["assignment-sound", "Queue alert sound"],
                            ["workflow-rules", "Workflow rules"],
                            ["email-assigned", "Email: assigned"],
                            ["email-reopened", "Email: reopened"],
                            ["response-templates", "Response library"],
                          ] as const
                        ).map(([id, label]) => {
                          const active = queueManagerSection === id;
                          return (
                            <Link
                              key={id}
                              href={`${TICKETS_QUEUE_MANAGER_PATH}?section=${id}`}
                              scroll={false}
                              prefetch
                              className={`group relative flex min-h-[2.25rem] cursor-pointer items-center rounded-[10px] px-3 py-2 text-xs font-medium transition-colors duration-150 ${
                                active ? queueNavActive : queueNavInactive
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate pl-0.5">{label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </nav>
                {showQueueDetailPropertiesPanel ? (
                  <div className="flex min-h-0 flex-1 flex-col border-t border-[#121212]/08 bg-[#F3F7FA] lg:hidden">
                    {rightSidebarCtx?.ticketRightSidebarPanel === "settings" ? (
                      <TicketRightSidebarSettingsPanel />
                    ) : (
                      <TicketPropertiesPanel ticketId={ticketIdFromPath!} />
                    )}
                  </div>
                ) : null}
              </div>
            ) : isTicketsDashboard && onTicketsHubSectionsPage && isOpen ? (
              <div className="flex h-full min-h-0 flex-col">
                <nav className="flex flex-col gap-1 p-2 pt-3" aria-label="Tickets hub sections">
                  <Link
                    href={TICKETS_HELPDESK_DASHBOARD_PATH}
                    scroll={false}
                    className={`flex cursor-pointer items-center gap-2 rounded-[10px] px-2 py-2 text-xs font-medium transition-colors ${
                      onTicketsHelpdeskDashboard ? rsbNavActive : rsbNavIdle
                    }`}
                  >
                    <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
                    Dashboard
                  </Link>
                  <Link
                    href={`${AGENT_ACTIVITY_PATH}?section=activity`}
                    scroll={false}
                    className={`flex cursor-pointer items-center gap-2 rounded-[10px] px-2 py-2 text-xs font-medium transition-colors ${
                      onAgentActivityPage && agentActivitySection === "activity"
                        ? rsbNavActive
                        : rsbNavIdle
                    }`}
                  >
                    <LineChart className="h-4 w-4 shrink-0" aria-hidden />
                    Activity track
                  </Link>
                  <Link
                    href="/dashboard/tickets/csat"
                    scroll={false}
                    className={`flex cursor-pointer items-center gap-2 rounded-[10px] px-2 py-2 text-xs font-medium transition-colors ${
                      onCsatAnalysisPage ? rsbNavActive : rsbNavIdle
                    }`}
                  >
                    <Star className="h-4 w-4 shrink-0" aria-hidden />
                    C&D SAT Analysis
                  </Link>
                </nav>
              </div>
            ) : isTicketsDashboard && isTicketsQueuePath && !isOpen ? (
              <nav className="dark-sidebar-chrome__nav flex flex-col px-2.5 py-4" aria-label="Queue sections">
                <div className="space-y-1">
                  <Link
                    href={TICKETS_QUEUE_HOME_PATH}
                    className={`group relative flex w-full cursor-pointer items-center justify-center rounded-[10px] p-2.5 transition-colors duration-150 ${
                      onQueueHome ? queueNavCollapsedActive : queueNavInactive
                    }`}
                    title="Queue"
                  >
                    <Home className="h-5 w-5 shrink-0" aria-hidden />
                  </Link>
                  {showQueueSupervisorNav ? (
                    <Link
                      href={queueSupervisorHref("updated-agents", queueSupervisorAgentInUrl || undefined)}
                      className={`group relative flex w-full cursor-pointer items-center justify-center rounded-[10px] p-2.5 transition-colors duration-150 ${
                        onQueueSupervisor ? queueNavCollapsedParentFaded : queueNavInactive
                      }`}
                      title="Supervisor"
                    >
                      <Users className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
                    </Link>
                  ) : null}
                  {showQueueManagerNav ? (
                    <Link
                      href={TICKETS_QUEUE_MANAGER_PATH}
                      className={`group relative flex w-full cursor-pointer items-center justify-center rounded-[10px] p-2.5 transition-colors duration-150 ${
                        onQueueManager ? queueNavCollapsedParentFaded : queueNavInactive
                      }`}
                      title="Manager"
                    >
                      <Zap className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
                    </Link>
                  ) : null}
                </div>
              </nav>
            ) : isTicketsDashboard && isOpen ? (
              <div className="min-h-0">
                <TicketFilters variant="sidebar" dark={false} />
              </div>
            ) : isTicketsDashboard ? (
              <div className="min-h-0" aria-hidden />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
              <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-y-contain px-2.5 pb-4 pt-2" dir="ltr">
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
                const isAmOnboardingFailedPath =
                  cleanPathname.startsWith("/dashboard/area-managers/stores/onboarding-failed") ||
                  cleanPathname.startsWith("/dashboard/area-managers/stores/resubmit-onboarding");
                const activeHref =
                  cleanPathname === "/dashboard/merchants/assign-am" || isAmOnboardingFailedPath
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
                  const isAllMerchantsRoute = route.href === "/dashboard/merchants";
                  const isMenuChangeRequestsRoute = route.href.endsWith("/menu-change-requests");
                  const menuReviewBadgeCount = isMenuChangeRequestsRoute ? storeMenuReviewPendingCount : 0;
                  const showMenuReviewBadge = menuReviewBadgeCount > 0;
                  const isActive =
                    activeHref === route.href &&
                    !(isResubmittedActive && isAllMerchantsRoute);
                  const Icon = route.icon;
                  return (
                    <Link
                      key={route.href}
                      href={appendMerchantPortal(appendRiderSearch(route.href))}
                      prefetch
                      onMouseEnter={() => {
                        const href = appendMerchantPortal(appendRiderSearch(route.href));
                        prefetchDashboardSection(getQueryClient(), href);
                      }}
                      className={`group relative cursor-pointer rounded-[10px] transition-colors duration-200 ${
                        isOpen
                          ? `grid min-h-10 w-full min-w-0 ${
                              showMenuReviewBadge
                                ? "grid-cols-[1.25rem_minmax(0,1fr)_auto]"
                                : "grid-cols-[1.25rem_minmax(0,1fr)]"
                            } items-center gap-x-2.5 px-3 py-2.5 text-xs font-medium ${
                              isActive ? rsbNavActive : rsbNavIdle
                            }`
                          : `flex min-h-10 justify-center px-2 py-2.5 ${
                              isActive ? rsbNavActive : rsbNavIdle
                            }`
                      }`}
                      title={
                        !isOpen
                          ? showMenuReviewBadge
                            ? `${route.name} (${menuReviewBadgeCount} pending)`
                            : route.name
                          : route.description
                      }
                    >
                      {isOpen ? (
                        <>
                          <span className="flex size-5 items-center justify-center justify-self-start text-current">
                            <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          </span>
                          <span className="relative min-w-0 truncate text-left">
                            {route.name}
                          </span>
                          {showMenuReviewBadge ? (
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                                isActive ? "bg-[#121212]/10 text-[#121212]" : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {menuReviewBadgeCount}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <Icon className="h-5 w-5 shrink-0" aria-hidden />
                          {showMenuReviewBadge ? (
                            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">
                              {menuReviewBadgeCount > 9 ? "9+" : menuReviewBadgeCount}
                            </span>
                          ) : null}
                        </>
                      )}
                      {!isOpen && (
                        <div className="absolute right-full mr-2 px-2 py-1 bg-[#121212] text-white text-xs rounded-[10px] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
                          {showMenuReviewBadge
                            ? `${route.name} (${menuReviewBadgeCount} pending)`
                            : route.name}
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 border-4 border-transparent border-l-[#121212]"></div>
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
                const showWalletRequests =
                  isMerchantsDashboard &&
                  !effectiveStoreId &&
                  hasAdminMerchantAccess &&
                  effectiveMerchantPortal === "admin";
                const showAdminMerchantCtas =
                  isMerchantsDashboard &&
                  hasAdminMerchantAccess &&
                  effectiveMerchantPortal === "admin";
                const isMenuRequestsActive = cleanPathname === "/dashboard/merchants/menu-requests";
                const isResubmittedActive =
                  cleanPathname === "/dashboard/merchants" &&
                  searchParams.get("category") === "resubmitted";
                return (
                  <>
                    {currentSubRoutes.map((route) => linkEl(route))}
                    {isAreaManagerDashboard &&
                      (areaManagerType === "MERCHANT" ||
                        areaManagerType === null ||
                        isSuperAdmin) && (
                      <div className={isOpen ? "mt-2 min-w-0" : "mt-1"}>
                        <OnboardingFailedSummarySidebar collapsed={!isOpen} />
                      </div>
                    )}
                    {/* Assign AM link for admin portal merchants dashboard (shown open and collapsed) */}
                    {showAdminMerchantCtas && (
                      isOpen ? (
                        <Link
                          href="/dashboard/merchants/assign-am"
                          className={`mt-1 grid w-full min-w-0 cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-2 rounded-[10px] px-2 py-2 text-xs font-medium transition-colors duration-200 ${
                            isAssignAmActive ? rsbNavActive : rsbNavIdle
                          }`}
                        >
                          <span className="flex size-5 items-center justify-center justify-self-start text-current">
                            <Users className="h-4 w-4 shrink-0" aria-hidden />
                          </span>
                          <span className="min-w-0 truncate text-left">Assign AM to Stores</span>
                        </Link>
                      ) : (
                        <Link
                          href="/dashboard/merchants/assign-am"
                          title="Assign AM to Stores"
                          className={`group relative mt-1 flex cursor-pointer items-center justify-center rounded-[10px] px-2 py-2.5 transition-colors duration-200 ${
                            isAssignAmActive ? rsbNavActive : rsbNavIdle
                          }`}
                        >
                          <Users className="h-5 w-5 flex-shrink-0" />
                          <div className="absolute right-full mr-2 px-2 py-1 bg-[#121212] text-white text-xs rounded-[10px] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
                            Assign AM to Stores
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 border-4 border-transparent border-l-[#121212]" />
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
                    {/* Menu change requests CTA in right sidebar (admin portal) - placed below Assign AM + Wallet Requests */}
                    {showAdminMerchantCtas && (
                      isOpen ? (
                        <Link
                          href="/dashboard/merchants/menu-requests"
                          className={`mt-2 grid w-full min-w-0 cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-[10px] px-2 py-2 text-xs font-semibold transition-colors duration-200 ${
                            isMenuRequestsActive ? rsbNavCtaActive : rsbNavCtaIdle
                          }`}
                        >
                          <span className="flex size-5 items-center justify-center justify-self-start text-current">
                            <ClipboardList className="h-4 w-4 shrink-0" aria-hidden />
                          </span>
                          <span className="min-w-0 truncate text-left">Menu change requests</span>
                          {pendingMenuRequestsCount > 0 && (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                              {pendingMenuRequestsCount} Pending
                            </span>
                          )}
                        </Link>
                      ) : (
                        <Link
                          href="/dashboard/merchants/menu-requests"
                          title={pendingMenuRequestsCount > 0 ? `Menu change requests (${pendingMenuRequestsCount} pending)` : "Menu change requests"}
                          className={`group relative mt-2 flex cursor-pointer items-center justify-center rounded-[10px] px-2 py-2.5 transition-colors duration-200 ${
                            isMenuRequestsActive ? rsbNavCtaActive : rsbNavCtaIdle
                          }`}
                        >
                          <ClipboardList className="h-5 w-5 flex-shrink-0" />
                          {pendingMenuRequestsCount > 0 && (
                            <span className="absolute -top-1 -right-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {pendingMenuRequestsCount}
                            </span>
                          )}
                          <div className="absolute right-full mr-2 px-2 py-1 bg-[#121212] text-white text-xs rounded-[10px] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
                            {pendingMenuRequestsCount > 0
                              ? `Menu change requests (${pendingMenuRequestsCount} pending)`
                              : "Menu change requests"}
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 border-4 border-transparent border-l-[#121212]" />
                          </div>
                        </Link>
                      )
                    )}
                    {showAdminMerchantCtas && (
                      isOpen ? (
                        <Link
                          href="/dashboard/merchants?portal=admin&category=resubmitted"
                          className={`mt-2 grid w-full min-w-0 cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-[10px] px-2 py-2 text-xs font-semibold transition-colors duration-200 ${
                            isResubmittedActive ? rsbNavCtaActive : rsbNavCtaIdle
                          }`}
                        >
                          <span className="flex size-5 items-center justify-center justify-self-start text-current">
                            <FileUp className="h-4 w-4 shrink-0" aria-hidden />
                          </span>
                          <span className="min-w-0 truncate text-left">{EXPIRED_RESUBMITTED_DOCS_LABEL}</span>
                          {resubmittedDocsCount > 0 && (
                            <span className="rounded-full bg-[#121212]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#121212]">
                              {resubmittedDocsCount}
                            </span>
                          )}
                        </Link>
                      ) : (
                        <Link
                          href="/dashboard/merchants?portal=admin&category=resubmitted"
                          title={
                            resubmittedDocsCount > 0
                              ? `${EXPIRED_RESUBMITTED_DOCS_LABEL} (${resubmittedDocsCount})`
                              : EXPIRED_RESUBMITTED_DOCS_LABEL
                          }
                          className={`group relative mt-2 flex cursor-pointer items-center justify-center rounded-[10px] px-2 py-2.5 transition-colors duration-200 ${
                            isResubmittedActive ? rsbNavCtaActive : rsbNavCtaIdle
                          }`}
                        >
                          <FileUp className="h-5 w-5 flex-shrink-0" />
                          {resubmittedDocsCount > 0 && (
                            <span className="absolute -top-1 -right-1 rounded-full bg-[#121212] px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {resubmittedDocsCount}
                            </span>
                          )}
                          <div className="absolute right-full mr-2 px-2 py-1 bg-[#121212] text-white text-xs rounded-[10px] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
                            {EXPIRED_RESUBMITTED_DOCS_LABEL}
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 border-4 border-transparent border-l-[#121212]" />
                          </div>
                        </Link>
                      )
                    )}
                  </>
                );
              })()}
              </nav>
              {isOpen && effectiveMerchantPortal === "merchant" && showRightSidebarStoreCard ? (
                <div className="relative z-10 flex shrink-0 items-center border-t border-gray-300/50 bg-[#F3F7FA] px-2 py-2.5">
                  {showMerchantSearchSkeleton ? (
                    <StoreInfoCardSkeleton />
                  ) : isMerchantsSearchListRoot ? (
                    merchantSearchResultStore ? (
                      <StoreInfoCard store={merchantSearchResultStore} compact />
                    ) : null
                  ) : sidebarStore ? (
                    <StoreInfoCard store={sidebarStore} compact />
                  ) : merchantSearchResultStore ? (
                    <StoreInfoCard store={merchantSearchResultStore} compact />
                  ) : null}
                </div>
              ) : null}
              </div>
            )}
          </div>
        </div>

        {!isTicketsDashboard && (
          <div className="relative z-30 mt-auto shrink-0 border-t border-[#121212]/08 bg-[#F3F7FA] p-2">
            <button
              type="button"
              onClick={onToggle}
              className={`flex h-10 w-full cursor-pointer items-center justify-center rounded-[10px] border border-[#121212]/10 bg-white text-[#121212] shadow-sm transition-colors duration-200 hover:bg-white/90 ${
                isOpen ? "gap-2 px-3" : ""
              }`}
              title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
              aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <ChevronRight
                className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
              {isOpen ? <span className="text-xs font-semibold tracking-wide">Hide</span> : null}
            </button>
          </div>
        )}
      </aside>

      {/* Queue-origin ticket detail: properties live on the right; left rail stays queue nav */}
      {showQueueDetailPropertiesPanel && isTicketsDashboard ? (
        <aside
          className="fixed z-40 bottom-0 top-14 hidden w-64 flex-col border-l-0 bg-[#F3F7FA] lg:flex"
          style={{
            right: filterSidebarOpen ? "14rem" : 0,
            transition: "right 0.3s ease-out",
          }}
          aria-label="Ticket properties"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {rightSidebarCtx?.ticketRightSidebarPanel === "settings" ? (
              <TicketRightSidebarSettingsPanel />
            ) : (
              <TicketPropertiesPanel ticketId={ticketIdFromPath!} />
            )}
          </div>
        </aside>
      ) : null}
    </>
  );
}
