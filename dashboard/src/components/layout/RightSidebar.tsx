"use client";

import { useMemo, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Zap,
  LineChart,
  LayoutDashboard,
  Home,
  Users,
  ChevronDown,
  ChevronRight,
  ClipboardList,
} from "lucide-react";
import {
  getCurrentDashboard,
  getCurrentDashboardSubRoutes,
  getMerchantSubRoutesForPath,
  adminPortalMerchantRoutes,
  merchantPortalSidebarRoutes,
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
import {
  parsePortalParam,
  readStoredMerchantsPortal,
  resolveMerchantsPortal,
} from "@/lib/merchants/portal-preference";
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rightSidebarCtx = useRightSidebar();
  const { hasDashboardAccess, isSuperAdmin, canPerformAction } = usePermission();
  const { canTogglePortal = false } = usePermissions();
  
  // Remove query parameters for comparison
  const cleanPathname = useMemo(() => pathname.split('?')[0].split('#')[0], [pathname]);

  // Get current dashboard
  const currentDashboard = useMemo(
    () => getCurrentDashboard(cleanPathname),
    [cleanPathname]
  );

  const isStorePath = /^\/dashboard\/merchants\/stores\/\d+/.test(cleanPathname);
  const portal = resolveMerchantsPortal({
    portalFromUrl: parsePortalParam(searchParams.get("portal")),
    canTogglePortal,
    storedPortal: typeof window !== "undefined" ? readStoredMerchantsPortal() : null,
  });

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
  const [pendingMenuRequestsCount, setPendingMenuRequestsCount] = useState<number>(0);

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

  useEffect(() => {
    const isAdminMerchantsHome =
      cleanPathname === "/dashboard/merchants" && portal === "admin";
    if (!isAdminMerchantsHome) {
      setPendingMenuRequestsCount(0);
      return;
    }

    let cancelled = false;
    fetch("/api/merchant-menu/change-requests?status=PENDING&limit=1&offset=0")
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        const total = Number(body?.total ?? 0);
        setPendingMenuRequestsCount(Number.isFinite(total) ? total : 0);
      })
      .catch(() => {
        if (!cancelled) setPendingMenuRequestsCount(0);
      });

    return () => {
      cancelled = true;
    };
  }, [cleanPathname, portal]);

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

  // Ticket identifier from path (supports numeric id and ticket number like TKT-2026-910001)
  const ticketIdFromPath = useMemo(() => ticketsPathTicketId(cleanPathname), [cleanPathname]);

  // Store ID when on a merchant store page (for Store Information Card in sidebar)
  const storeIdFromPath = useMemo(() => {
    const match = cleanPathname.match(/^\/dashboard\/merchants\/stores\/(\d+)/);
    return match ? match[1] : null;
  }, [cleanPathname]);

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
      created_at: sidebarStoreData.created_at ?? null,
    };
  }, [sidebarStoreData]);

  const isMerchantsListPage = cleanPathname === "/dashboard/merchants";
  /** Merchants home (search list only): never show `useStore` cache here — it can be stale from a previous store page and desync from search. */
  const isMerchantsSearchListRoot =
    isMerchantsListPage && portal === "merchant" && !storeIdFromPath;
  const showMerchantSearchSkeleton =
    showRightSidebarStoreCard &&
    isMerchantsListPage &&
    portal === "merchant" &&
    Boolean(merchantsSearch?.isLoading);
  const merchantSearchResultStore: StoreInfoCardData | null = useMemo(() => {
    if (
      !showRightSidebarStoreCard ||
      !merchantsSearch?.searchResultStore ||
      !isMerchantsListPage ||
      portal !== "merchant"
    )
      return null;
    const s = merchantsSearch.searchResultStore;
    return {
      storeId: s.storeId,
      name: s.name,
      store_id: s.store_id,
      full_address: s.full_address ?? null,
      approval_status: s.approval_status ?? null,
    };
  }, [merchantsSearch?.searchResultStore, isMerchantsListPage, portal, showRightSidebarStoreCard]);

  const dockLeft = dockSide === "left";

  const isTicketsDashboard = currentDashboard?.href === "/dashboard/tickets";
  const isTicketDetailPage = isTicketsAppDetailPath(cleanPathname);
  const queueDetailFromHome = isTicketDetailPage && ticketDetailHasQueueContext(searchParams);
  /** Queue routes or ticket detail opened from queue home (`?fromQueue=1`). */
  const isTicketsQueuePath =
    cleanPathname.startsWith("/dashboard/tickets/queue") || queueDetailFromHome;
  /** Match global `HierarchicalSidebar` chrome when queue rail is docked left. */
  const queueDarkLeftRail = isTicketsQueuePath && dockLeft;
  /** Ticket detail + queue context: dark gradient must show through (avoid light inner bg washing out white nav text). */
  const ticketDetailQueueDarkLeft =
    isTicketDetailPage && dockLeft && queueDarkLeftRail;
  const showQueueDetailPropertiesPanel =
    queueDetailFromHome &&
    ticketIdFromPath != null &&
    (ticketPropertiesRailOpen !== undefined ? ticketPropertiesRailOpen : isOpen);
  /** Same active / inactive treatment as `HierarchicalSidebar` main nav. */
  const queueNavActive = queueDarkLeftRail
    ? "bg-gradient-to-r from-blue-500/90 to-indigo-500/90 text-white shadow-lg shadow-blue-500/25"
    : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25";
  const queueNavInactive = queueDarkLeftRail
    ? "text-white/85 hover:bg-white/10 hover:text-white"
    : "text-gray-800 hover:bg-gray-200/80";
  const queueNavCollapsedActive = queueDarkLeftRail
    ? "bg-gradient-to-r from-blue-500/90 to-indigo-500/90 text-white shadow-lg"
    : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg";
  /** Manager row when a child section is selected — softer than full active. */
  const queueNavParentFaded = queueDarkLeftRail
    ? "bg-gradient-to-r from-blue-500/40 to-indigo-500/40 text-white/80 shadow-md shadow-blue-950/20 ring-1 ring-white/10"
    : "bg-gradient-to-r from-blue-500/50 to-indigo-500/50 text-white shadow-sm";
  const queueNavCollapsedParentFaded = queueDarkLeftRail
    ? "bg-gradient-to-r from-blue-500/40 to-indigo-500/40 text-white/90 shadow-md"
    : "bg-gradient-to-r from-blue-500/50 to-indigo-500/50 text-white shadow-sm";
  const onAgentActivityPage = cleanPathname === AGENT_ACTIVITY_PATH;
  const onTicketsHelpdeskDashboard = cleanPathname === TICKETS_HELPDESK_DASHBOARD_PATH;
  const onTicketsHubSectionsPage = onAgentActivityPage || onTicketsHelpdeskDashboard;
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
  /** Avoid SSR/client mismatch when React Query restores cached permissions before hydration. */
  const [queuePermissionsMounted, setQueuePermissionsMounted] = useState(false);
  useEffect(() => {
    setQueuePermissionsMounted(true);
  }, []);
  const showQueueSupervisorNav = queuePermissionsMounted && canViewQueueSupervisor;
  const showQueueManagerNav = queuePermissionsMounted && canViewQueueManager;

  const isRiderDashboard =
    cleanPathname === "/dashboard/riders" ||
    cleanPathname.startsWith("/dashboard/riders/");

  const selectedRiderSearch = (searchParams.get("search") || "").trim();

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
        className={`fixed z-40 flex flex-col ${isTicketDetailPage ? "shadow-none" : "shadow-xl"} transition-[transform,width] duration-300 ease-out ${
          /* Queue left rail: full viewport height (matches queue home). Right-docked ticket detail: start below header row. */
          isTicketDetailPage && !(queueDarkLeftRail && dockLeft) ? "bottom-0 top-14" : "inset-y-0"
        }
          ${isOpen ? (isTicketDetailPage && !queueDetailFromHome ? "w-64" : "w-56") : "w-14"}
          max-lg:w-72 ${isOpen ? "max-lg:translate-x-0" : dockLeft ? "max-lg:-translate-x-full" : "max-lg:translate-x-full"}
          ${queueDarkLeftRail ? "rounded-r-xl border-r border-white/10" : ""}`}
        style={
          queueDarkLeftRail
            ? {
                left: filterSidebarOpen ? "14rem" : 0,
                right: "auto",
                background: "linear-gradient(180deg, #0f2d42 0%, #12344D 50%, #0f2d42 100%)",
                boxShadow: "4px 0 24px rgba(0,0,0,0.15)",
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(255,255,255,0.2) transparent",
              }
            : {
                ...(dockLeft
                  ? { left: filterSidebarOpen ? "14rem" : 0, right: "auto" as const }
                  : { right: filterSidebarOpen ? "14rem" : 0, left: "auto" as const }),
                backgroundColor: isTicketDetailPage ? "#F5F7F9" : "#E8F0F2",
                scrollbarWidth: "thin",
                scrollbarColor: isTicketDetailPage ? "#9CA3AF #F5F7F9" : "#9CA3AF #E8F0F2",
              }
        }
      >
        {(!isTicketDetailPage || queueDetailFromHome) && (
          <div
            className={`relative z-20 flex h-14 min-h-14 w-full min-w-0 shrink-0 items-center border-b ${
              queueDarkLeftRail
                ? "border-white/10 bg-transparent px-3"
                : "border-gray-300/30 bg-[#E8F0F2] px-2 sm:px-3"
            } ${isOpen ? "gap-2" : "justify-center"}`}
          >
            {queueDarkLeftRail ? (
              isOpen ? (
                <Link
                  href="/dashboard"
                  scroll={false}
                  className="flex min-w-0 flex-1 items-center gap-2.5"
                >
                  <Image
                    src="/onlylogo.png"
                    alt="GatiMitra"
                    width={36}
                    height={36}
                    className="shrink-0 rounded-lg object-contain"
                    priority
                  />
                  <span className="truncate text-sm font-semibold text-white">GatiMitra</span>
                </Link>
              ) : (
                <Link
                  href="/dashboard"
                  scroll={false}
                  className="flex w-full items-center justify-center"
                  title="GatiMitra"
                >
                  <Image
                    src="/onlylogo.png"
                    alt="GatiMitra"
                    width={36}
                    height={36}
                    className="shrink-0 rounded-lg object-contain"
                    priority
                  />
                </Link>
              )
            ) : isOpen ? (
              <>
                {currentDashboard?.icon && (
                  <div className="flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 p-1.5">
                    <currentDashboard.icon className="h-4 w-4 text-white" aria-hidden />
                  </div>
                )}
                <h2 className="min-w-0 flex-1 truncate text-left text-xs font-bold leading-snug text-gray-800">
                  {currentDashboard?.name}
                </h2>
              </>
            ) : (
              currentDashboard?.icon && (
                <div className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 p-1.5">
                  <currentDashboard.icon className="h-4 w-4 text-white" aria-hidden />
                </div>
              )
            )}
          </div>
        )}

        {/* Body: flex-1 scroll */}
        <div
          className={`relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden ${
            isTicketDetailPage
              ? dockLeft
                ? ticketDetailQueueDarkLeft
                  ? "border-r border-white/10 bg-transparent"
                  : "border-r border-gray-200 bg-[#F5F7F9]"
                : "border-l border-gray-200 bg-[#F5F7F9]"
              : ""
          }`}
        >
          <div
            className={`min-h-0 flex-1 overflow-x-hidden overscroll-y-contain ${
              isTicketDetailPage && !ticketDetailQueueDarkLeft ? "overflow-y-hidden" : "overflow-y-auto"
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
                <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 py-4" aria-label="Queue sections">
                  <div className="space-y-1">
                    <Link
                      href={TICKETS_QUEUE_HOME_PATH}
                      scroll={false}
                      className={`group relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                        onQueueHome ? queueNavActive : queueNavInactive
                      }`}
                    >
                      {onQueueHome ? (
                        <span
                          className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-white/90"
                          aria-hidden
                        />
                      ) : null}
                      <Home className="h-5 w-5 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">Queue</span>
                      {onQueueHome ? (
                        <span
                          className="absolute right-2.5 h-1.5 w-1.5 animate-pulse rounded-full bg-white/90"
                          aria-hidden
                        />
                      ) : null}
                    </Link>
                    {showQueueSupervisorNav ? (
                      <Link
                        href={queueSupervisorHref("updated-agents", queueSupervisorAgentInUrl || undefined)}
                        scroll={false}
                        aria-expanded={onQueueSupervisor}
                        className={`group relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                          onQueueSupervisor ? queueNavParentFaded : queueNavInactive
                        }`}
                      >
                        {onQueueSupervisor ? (
                          <span
                            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-white/50"
                            aria-hidden
                          />
                        ) : null}
                        <Users className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">Supervisor</span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${
                            onQueueSupervisor ? "rotate-0" : "-rotate-90"
                          }`}
                          aria-hidden
                        />
                      </Link>
                    ) : null}
                    {showQueueSupervisorNav && onQueueSupervisor ? (
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
                              className={`group relative flex min-h-[2.25rem] cursor-pointer items-center rounded-xl px-3 py-2 text-xs font-medium transition-all duration-150 ${
                                active ? queueNavActive : queueNavInactive
                              }`}
                            >
                              {active ? (
                                <span
                                  className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-white/90"
                                  aria-hidden
                                />
                              ) : null}
                              <span className="min-w-0 flex-1 truncate pl-0.5">{label}</span>
                              {active ? (
                                <span
                                  className="absolute right-2.5 h-1.5 w-1.5 animate-pulse rounded-full bg-white/90"
                                  aria-hidden
                                />
                              ) : null}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                    {showQueueManagerNav ? (
                      <Link
                        href={TICKETS_QUEUE_MANAGER_PATH}
                        scroll={false}
                        aria-expanded={onQueueManager}
                        className={`group relative flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                          onQueueManager ? queueNavParentFaded : queueNavInactive
                        }`}
                      >
                        {onQueueManager ? (
                          <span
                            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-white/50"
                            aria-hidden
                          />
                        ) : null}
                        <Zap className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">Manager</span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${
                            onQueueManager ? "rotate-0" : "-rotate-90"
                          }`}
                          aria-hidden
                        />
                      </Link>
                    ) : null}
                    {showQueueManagerNav && onQueueManager ? (
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
                              className={`group relative flex min-h-[2.25rem] cursor-pointer items-center rounded-xl px-3 py-2 text-xs font-medium transition-all duration-150 ${
                                active ? queueNavActive : queueNavInactive
                              }`}
                            >
                              {active ? (
                                <span
                                  className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-white/90"
                                  aria-hidden
                                />
                              ) : null}
                              <span className="min-w-0 flex-1 truncate pl-0.5">{label}</span>
                              {active ? (
                                <span
                                  className="absolute right-2.5 h-1.5 w-1.5 animate-pulse rounded-full bg-white/90"
                                  aria-hidden
                                />
                              ) : null}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </nav>
                {showQueueDetailPropertiesPanel ? (
                  <div className="flex min-h-0 flex-1 flex-col border-t border-white/10 bg-[#F5F7F9] lg:hidden">
                    {rightSidebarCtx?.ticketRightSidebarPanel === "settings" ? (
                      <TicketRightSidebarSettingsPanel />
                    ) : (
                      <TicketPropertiesPanel ticketId={ticketIdFromPath} />
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
                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                      onTicketsHelpdeskDashboard
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-gray-800 hover:bg-gray-200/80"
                    }`}
                  >
                    <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
                    Dashboard
                  </Link>
                  <Link
                    href={`${AGENT_ACTIVITY_PATH}?section=activity`}
                    scroll={false}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                      onAgentActivityPage && agentActivitySection === "activity"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-gray-800 hover:bg-gray-200/80"
                    }`}
                  >
                    <LineChart className="h-4 w-4 shrink-0" aria-hidden />
                    Activity track
                  </Link>
                </nav>
              </div>
            ) : isTicketsDashboard && isTicketsQueuePath && !isOpen ? (
              <nav className="flex flex-col px-2.5 py-4" aria-label="Queue sections">
                <div className="space-y-1">
                  <Link
                    href={TICKETS_QUEUE_HOME_PATH}
                    className={`group relative flex w-full cursor-pointer items-center justify-center rounded-xl p-2.5 transition-all duration-150 ${
                      onQueueHome ? queueNavCollapsedActive : queueNavInactive
                    }`}
                    title="Queue"
                  >
                    {onQueueHome ? (
                      <span
                        className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-white/90"
                        aria-hidden
                      />
                    ) : null}
                    <Home className="h-5 w-5 shrink-0" aria-hidden />
                  </Link>
                  {showQueueSupervisorNav ? (
                    <Link
                      href={queueSupervisorHref("updated-agents", queueSupervisorAgentInUrl || undefined)}
                      className={`group relative flex w-full cursor-pointer items-center justify-center rounded-xl p-2.5 transition-all duration-150 ${
                        onQueueSupervisor ? queueNavCollapsedParentFaded : queueNavInactive
                      }`}
                      title="Supervisor"
                    >
                      {onQueueSupervisor ? (
                        <span
                          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-white/50"
                          aria-hidden
                        />
                      ) : null}
                      <Users className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
                    </Link>
                  ) : null}
                  {showQueueManagerNav ? (
                    <Link
                      href={TICKETS_QUEUE_MANAGER_PATH}
                      className={`group relative flex w-full cursor-pointer items-center justify-center rounded-xl p-2.5 transition-all duration-150 ${
                        onQueueManager ? queueNavCollapsedParentFaded : queueNavInactive
                      }`}
                      title="Manager"
                    >
                      {onQueueManager ? (
                        <span
                          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-white/50"
                          aria-hidden
                        />
                      ) : null}
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
              <nav className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain space-y-1.5 px-2 pb-2 pt-0" dir="ltr">
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
                      className={`group relative cursor-pointer rounded-lg transition-all duration-200 ${
                        isOpen
                          ? `grid w-full min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-2 px-2 py-2 text-xs font-medium ${
                              isActive
                                ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/20"
                                : "text-gray-900 hover:bg-gray-200/80 hover:text-gray-900 hover:-translate-x-1"
                            }`
                          : `flex justify-center px-2 py-2.5 ${
                              isActive
                                ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg"
                                : "text-gray-900 hover:bg-gray-200/80 hover:text-gray-900"
                            }`
                      }`}
                      title={!isOpen ? route.name : route.description}
                    >
                      {isOpen ? (
                        <>
                          <span className="flex size-5 items-center justify-center justify-self-start text-current">
                            <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          </span>
                          <span className="relative min-w-0 truncate pr-5 text-left">
                            {route.name}
                            {isActive && (
                              <span
                                className="pointer-events-none absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-white shadow-lg shadow-white/50 animate-pulse"
                                aria-hidden
                              />
                            )}
                          </span>
                        </>
                      ) : (
                        <Icon className="h-5 w-5 shrink-0" aria-hidden />
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
                const isMenuRequestsActive = cleanPathname === "/dashboard/merchants/menu-requests";
                return (
                  <>
                    {currentSubRoutes.map((route) => linkEl(route))}
                    {/* Assign AM link for admin portal merchants dashboard (shown open and collapsed) */}
                    {isMerchantsDashboard && portal === "admin" && (
                      isOpen ? (
                        <Link
                          href="/dashboard/merchants/assign-am"
                          className={`mt-1 grid w-full min-w-0 cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-2 rounded-lg px-2 py-2 text-xs font-medium transition-all duration-200 ${
                            isAssignAmActive
                              ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/20"
                              : "text-gray-900 hover:bg-gray-200/80 hover:text-gray-900 hover:-translate-x-1"
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
                    {/* Menu change requests CTA in right sidebar (admin portal) - placed below Assign AM + Wallet Requests */}
                    {isMerchantsDashboard && portal === "admin" && (
                      isOpen ? (
                        <Link
                          href="/dashboard/merchants/menu-requests"
                          className={`mt-2 grid w-full min-w-0 cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-lg border px-2 py-2 text-xs font-semibold transition-all duration-200 ${
                            isMenuRequestsActive
                              ? "border-purple-700 bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/20"
                              : "border-purple-200 bg-purple-50 text-purple-900 hover:border-purple-300 hover:bg-purple-100 hover:-translate-x-1"
                          }`}
                        >
                          <span className="flex size-5 items-center justify-center justify-self-start text-current">
                            <ClipboardList className="h-4 w-4 shrink-0" aria-hidden />
                          </span>
                          <span className="min-w-0 truncate text-left">Menu change requests</span>
                          {pendingMenuRequestsCount > 0 && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                              isMenuRequestsActive ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"
                            }`}>
                              {pendingMenuRequestsCount} Pending
                            </span>
                          )}
                        </Link>
                      ) : (
                        <Link
                          href="/dashboard/merchants/menu-requests"
                          title={pendingMenuRequestsCount > 0 ? `Menu change requests (${pendingMenuRequestsCount} pending)` : "Menu change requests"}
                          className={`group relative mt-2 flex cursor-pointer items-center justify-center rounded-lg border px-2 py-2.5 transition-all duration-200 ${
                            isMenuRequestsActive
                              ? "border-purple-700 bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg"
                              : "border-purple-200 bg-purple-50 text-purple-900 hover:border-purple-300 hover:bg-purple-100"
                          }`}
                        >
                          <ClipboardList className="h-5 w-5 flex-shrink-0" />
                          {pendingMenuRequestsCount > 0 && (
                            <span className="absolute -top-1 -right-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {pendingMenuRequestsCount}
                            </span>
                          )}
                          <div className="absolute right-full mr-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
                            {pendingMenuRequestsCount > 0
                              ? `Menu change requests (${pendingMenuRequestsCount} pending)`
                              : "Menu change requests"}
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 border-4 border-transparent border-l-gray-900" />
                          </div>
                        </Link>
                      )
                    )}
                  </>
                );
              })()}
              </nav>
              {isOpen && portal === "merchant" && showRightSidebarStoreCard ? (
                <div className="shrink-0 border-t border-gray-300/50 bg-[#E8F0F2] px-2 py-2 min-h-0 max-h-[34vh] overflow-y-auto overscroll-y-contain">
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
          <div className="relative z-20 shrink-0 border-t border-gray-300/40 bg-[#E8F0F2] p-2 shadow-[0_-4px_12px_-6px_rgba(15,23,42,0.1)]">
            <button
              type="button"
              onClick={onToggle}
              className={`flex w-full cursor-pointer items-center justify-center rounded-lg bg-gray-300/60 text-gray-800 transition-all hover:bg-gray-400/70 hover:shadow-md ${
                isOpen ? "gap-2 px-3 py-2" : "p-2"
              }`}
              title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <ChevronRight className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
              {isOpen && <span className="text-xs font-semibold">Hide</span>}
            </button>
          </div>
        )}
      </aside>

      {/* Queue-origin ticket detail: properties live on the right; left rail stays queue nav */}
      {showQueueDetailPropertiesPanel && isTicketsDashboard ? (
        <aside
          className="fixed z-40 bottom-0 top-14 hidden w-64 flex-col border-l border-gray-200/80 bg-[#F5F7F9] shadow-xl lg:flex"
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
              <TicketPropertiesPanel ticketId={ticketIdFromPath} />
            )}
          </div>
        </aside>
      ) : null}
    </>
  );
}
