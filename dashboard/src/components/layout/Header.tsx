"use client";

import { memo, useState, useEffect, useMemo, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useAppPathname, useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LogOut,
  Search,
  ChevronDown,
  Plus,
  Ticket,
  Mail,
  UserPlus,
  Building2,
  Menu,
  X,
  PanelRight,
  PanelLeft,
  User,
  ArrowLeft,
  IndianRupee,
  SlidersHorizontal,
  Bell,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useLogout } from "@/hooks/queries/useAuthQuery";
import { Logo } from "@/components/brand/Logo";
import { getUserAvatarUrl, getUserInitials } from "@/lib/user-avatar";
import {
  buildStoreVerificationHeaderBackHref,
  isStoreVerificationDetailPath,
  parseStoreVerificationStepParam,
  storeVerificationStepLabel,
} from "@/lib/merchants/store-verification-path";
import { getCurrentPageName, getCurrentDashboard, getCurrentDashboardSubRoutes, orderDashboardRoutes } from "@/lib/navigation/dashboard-routes";
import { DashboardSearch } from "./DashboardSearch";
import { GlobalSearch } from "@/components/search/GlobalSearch";
const AgentStatusToggle = dynamic(
  () => import("@/components/tickets/AgentStatusToggle").then((m) => m.AgentStatusToggle),
  {
    ssr: false,
    loading: () => <div className="h-10 w-40 shrink-0" aria-hidden />,
  }
);
const NewTicketSideSheet = dynamic(
  () => import("@/components/tickets/TicketsNewSideSheet").then((m) => m.TicketsNewSideSheet),
  { ssr: false }
);
import { ProfileStatusCard } from "@/components/profile/ProfileStatusCard";
import { useLeftSidebarMobile } from "@/context/LeftSidebarMobileContext";
import { useRightSidebar } from "@/context/RightSidebarContext";
import { useAuth } from "@/providers/AuthProvider";
import { usePermissions } from "@/hooks/usePermissions";
import { usePermission } from "@/hooks/usePermission";
import { getDashboardTypeFromPath } from "@/lib/permissions/path-mapping";
import { useDashboardAccessQuery } from "@/hooks/queries/useDashboardAccessQuery";
import { loadBootstrapFromStorage } from "@/lib/dashboard-bootstrap-storage";
import { HEADER_IDENTITY_CACHE_KEY } from "@/lib/dashboard-auth-client-state";
import { TicketsHubGearButton } from "@/components/tickets/TicketsHubGearButton";
import {
  isTicketsAppDetailPath,
  isTicketsQueueLayoutExperience,
  resolveTicketsQueueHeaderTitle,
  ticketDetailHasQueueContext,
  TICKETS_QUEUE_HOME_PATH,
} from "@/lib/tickets/ticket-path-utils";
import {
  parsePortalParam,
  writeStoredMerchantsPortal,
  resolveMerchantsPortal,
  type MerchantsPortal,
} from "@/lib/merchants/portal-preference";
import {
  PERSON_RIDE_SEARCH_TYPES,
  normalizePersonRideSearchType,
} from "@/lib/orders/person-ride-search";
import {
  PARCEL_SEARCH_TYPES,
  normalizeParcelSearchType,
} from "@/lib/orders/parcel-search";
import { resolveOrderTypeFromPublicId } from "@/lib/orders/resolve-order-type-from-public-id";

const ORDER_HUB_ACCENT = "#121212";
const ORDER_HUB_ACCENT_TEXT = "#FFFFFF";

/** Query keys that only make sense on a specific order hub — strip when switching. */
const FOOD_ONLY_QS_KEYS = [
  "statusFilter",
  "foodFilters",
  "listSort",
  "bulk",
  "deliveryType",
  "userType",
] as const;

function orderHubBasePath(href: string): "food" | "parcel" | "person-ride" | null {
  if (href.includes("/orders/person-ride")) return "person-ride";
  if (href.includes("/orders/parcel")) return "parcel";
  if (href.includes("/orders/food")) return "food";
  return null;
}

function buildOrderHubHref(href: string, currentQs: string): string {
  const target = orderHubBasePath(href);
  if (!target || !currentQs) return href;

  const params = new URLSearchParams(currentQs);
  // Drop food-only filters when leaving food.
  if (target !== "food") {
    for (const key of FOOD_ONLY_QS_KEYS) params.delete(key);
  }
  // Drop status tabs that don't map across hubs (food uses statusFilter; ride/parcel use status).
  if (target === "food") {
    params.delete("status");
  } else {
    params.delete("statusFilter");
    const status = params.get("status");
    const rideLike = new Set([
      "",
      "assigned",
      "accepted",
      "reached_store",
      "picked_up",
      "in_transit",
    ]);
    if (status && !rideLike.has(status)) params.delete("status");
  }
  // Reset search type when switching hubs — Merchant Id etc. don't apply to parcel/ride.
  const searchType = params.get("searchType");
  if (searchType) {
    if (target === "parcel" && !(PARCEL_SEARCH_TYPES as readonly string[]).includes(searchType)) {
      params.set("searchType", "Order Id");
    } else if (
      target === "person-ride" &&
      !(PERSON_RIDE_SEARCH_TYPES as readonly string[]).includes(searchType)
    ) {
      params.set("searchType", "Order Id");
    } else if (target === "food" && (PARCEL_SEARCH_TYPES as readonly string[]).includes(searchType)) {
      // Receiver Name etc. aren't food types — keep Order Id if coming from parcel.
      const foodTypes = new Set([
        "Order Id",
        "Merchant Id",
        "Customer Mobile",
        "Third Party Order Id",
        "ONDC Order Id",
        "Client Reference Id",
        "Partner Order Id",
        "Internal Order Id",
        "Rider Mobile",
        "Tracking Order Id",
        "Client Name",
      ]);
      if (!foodTypes.has(searchType)) params.set("searchType", "Order Id");
    }
  }
  params.delete("page");
  const qs = params.toString();
  return qs ? `${href}?${qs}` : href;
}

// Order type switcher — replaces the orders right sidebar (Food / Parcel / Person Ride)
function OrderTypeDropdown() {
  const pathname = useAppPathname();
  const router = useRouter();
  const searchParams = useAppSearchParams();
  const { hasDashboardAccess, isSuperAdmin, loading: permissionsLoading } = usePermission();
  const [showDropdown, setShowDropdown] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const routes = useMemo(() => {
    if (permissionsLoading) return orderDashboardRoutes;
    return orderDashboardRoutes.filter((route) => {
      if (isSuperAdmin) return true;
      const dashboardType = getDashboardTypeFromPath(route.href);
      if (!dashboardType) return true;
      return hasDashboardAccess(dashboardType);
    });
  }, [hasDashboardAccess, isSuperAdmin, permissionsLoading]);

  const cleanPath = useMemo(() => pathname.split("?")[0].split("#")[0], [pathname]);

  const currentRoute = useMemo(() => {
    if (cleanPath === "/order" || cleanPath.startsWith("/order/")) {
      const id = cleanPath.split("/")[2] ?? "";
      const orderType = resolveOrderTypeFromPublicId(id);
      if (orderType === "person_ride") {
        return (
          orderDashboardRoutes.find((r) => r.href.includes("person-ride")) ??
          orderDashboardRoutes[0]
        );
      }
      if (orderType === "parcel") {
        return (
          orderDashboardRoutes.find((r) => r.href.includes("parcel")) ??
          orderDashboardRoutes[0]
        );
      }
      return (
        orderDashboardRoutes.find((r) => r.href.includes("/food")) ??
        orderDashboardRoutes[0]
      );
    }
    return (
      orderDashboardRoutes.find(
        (route) => cleanPath === route.href || cleanPath.startsWith(`${route.href}/`)
      ) ?? orderDashboardRoutes[0]
    );
  }, [cleanPath]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdown]);

  const handleSelect = (href: string) => {
    router.push(buildOrderHubHref(href, searchParams.toString()));
    setShowDropdown(false);
  };

  if (!mounted) {
    return (
      <div className="relative flex h-10 shrink-0 items-center px-3" aria-hidden>
        <span className="text-sm font-semibold text-slate-700">{currentRoute.name}</span>
      </div>
    );
  }

  const CurrentIcon = currentRoute.icon;

  return (
    <div ref={dropdownRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setShowDropdown((prev) => !prev)}
        className="flex h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 cursor-pointer"
        aria-haspopup="listbox"
        aria-expanded={showDropdown}
        aria-label="Switch order dashboard"
      >
        {CurrentIcon ? <CurrentIcon className="h-4 w-4 shrink-0 text-gray-600" aria-hidden /> : null}
        <span className="whitespace-nowrap">{currentRoute.name}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${showDropdown ? "rotate-180" : ""}`}
        />
      </button>
      {showDropdown && (
        <div
          className="absolute top-full left-0 z-50 mt-1 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {routes.map((route) => {
            const Icon = route.icon;
            const isActive = route.href === currentRoute.href;
            return (
              <button
                key={route.href}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(route.href)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                  isActive ? "font-semibold" : "font-medium hover:bg-gray-50"
                }`}
                style={
                  isActive
                    ? { backgroundColor: ORDER_HUB_ACCENT, color: ORDER_HUB_ACCENT_TEXT }
                    : { color: "#000000" }
                }
              >
                {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                <span>{route.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Order Search Bar — syncs with URL so Food/Parcel/Ride order pages can read search params
const MOBILE_SEARCH_TYPES = new Set(["Customer Mobile", "Rider Mobile"]);

function normalizeOrderSearchInput(value: string, searchType: string): string {
  const trimmed = value.trim();
  if (MOBILE_SEARCH_TYPES.has(searchType)) {
    return trimmed.replace(/\s/g, "");
  }
  return trimmed.toUpperCase();
}

function OrderSearchBar() {
  const pathname = useAppPathname();
  const router = useRouter();
  const searchParams = useAppSearchParams();
  const cleanPath = useMemo(() => pathname.split("?")[0].split("#")[0], [pathname]);
  const isPersonRideOrders = cleanPath.startsWith("/dashboard/orders/person-ride");
  const isParcelOrders = cleanPath.startsWith("/dashboard/orders/parcel");

  const defaultSearchType = "Order Id";
  const urlSearch = searchParams.get("search") ?? "";
  const urlSearchType = isPersonRideOrders
    ? normalizePersonRideSearchType(searchParams.get("searchType"))
    : isParcelOrders
      ? normalizeParcelSearchType(searchParams.get("searchType"))
      : searchParams.get("searchType") ?? defaultSearchType;

  const [searchType, setSearchType] = useState(urlSearchType);
  const [searchValue, setSearchValue] = useState(urlSearch);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urlValue = searchParams.get("search") ?? "";
    const type = isPersonRideOrders
      ? normalizePersonRideSearchType(searchParams.get("searchType"))
      : isParcelOrders
        ? normalizeParcelSearchType(searchParams.get("searchType"))
        : searchParams.get("searchType") ?? "Order Id";
    setSearchValue(normalizeOrderSearchInput(urlValue, type));
    if (isPersonRideOrders) {
      setSearchType(normalizePersonRideSearchType(searchParams.get("searchType")));
    } else if (isParcelOrders) {
      setSearchType(normalizeParcelSearchType(searchParams.get("searchType")));
    } else {
      setSearchType(searchParams.get("searchType") ?? "Order Id");
    }
  }, [searchParams, isPersonRideOrders, isParcelOrders]);

  const foodSearchItems = [
    "Order Id",
    "Merchant Id",
    "Customer Mobile",
    "Third Party Order Id",
    "ONDC Order Id",
    "Client Reference Id",
    "Partner Order Id",
    "Internal Order Id",
    "Rider Mobile",
    "Tracking Order Id",
    "Client Name",
  ];

  const searchItems = isPersonRideOrders
    ? [...PERSON_RIDE_SEARCH_TYPES]
    : isParcelOrders
      ? [...PARCEL_SEARCH_TYPES]
      : foodSearchItems;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdown]);

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    const value = normalizeOrderSearchInput(searchValue, searchType);
    if (value) {
      params.set("search", value);
      params.set("searchType", searchType);
      params.delete("page");
    } else {
      params.delete("search");
      params.delete("searchType");
      params.delete("page");
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, searchType, searchValue]);

  return (
    <div className="flex h-10 min-w-0 flex-1 items-stretch rounded-lg border border-gray-300 bg-white">
      <div ref={dropdownRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setShowDropdown((prev) => !prev)}
          className="flex h-full items-center gap-1.5 rounded-l-lg border-r border-gray-300 bg-[#F0F2F5] px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 cursor-pointer"
          aria-haspopup="listbox"
          aria-expanded={showDropdown}
        >
          <SlidersHorizontal className="h-4 w-4 text-gray-500" aria-hidden />
          <span className="max-w-[110px] truncate whitespace-nowrap">{searchType}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-600" />
        </button>
        {showDropdown && (
          <div className="absolute top-full left-0 z-50 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {searchItems.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setSearchType(item);
                  setShowDropdown(false);
                  inputRef.current?.focus();
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-gray-900 transition-colors hover:bg-gray-100 cursor-pointer"
                style={
                  item === searchType
                    ? { backgroundColor: ORDER_HUB_ACCENT, color: ORDER_HUB_ACCENT_TEXT }
                    : undefined
                }
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="text"
        value={searchValue}
        onChange={(e) =>
          setSearchValue(normalizeOrderSearchInput(e.target.value, searchType))
        }
        placeholder={
          isPersonRideOrders
            ? "GMP10006, passenger, rider…"
            : isParcelOrders
              ? "GMC10006, receiver, rider…"
              : "Search here..."
        }
        className={`min-w-[12rem] flex-[2] border-r border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none ${
          MOBILE_SEARCH_TYPES.has(searchType) ? "" : "uppercase"
        }`}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSearch();
        }}
      />

      <button
        type="button"
        onClick={handleSearch}
        className="flex h-full shrink-0 items-center justify-center gap-1.5 rounded-r-lg px-3 cursor-pointer"
        style={{ backgroundColor: ORDER_HUB_ACCENT }}
        aria-label="Search orders"
      >
        <Search className="h-4 w-4 text-white" aria-hidden />
        <span className="text-xs font-semibold tracking-wide text-white">Search</span>
      </button>
    </div>
  );
}

const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Home",
  "/dashboard/customers": "Customers",
  "/dashboard/customers/deletion-requests": "Account deletion requests",
  "/dashboard/customers/users-by-state": "Users by State / UT",
  "/dashboard/riders": "Riders",
  "/dashboard/merchants": "Merchants",
  "/dashboard/orders": "Orders",
  "/dashboard/tickets": "Tickets",
  "/dashboard/area-managers": "Area Managers",
  "/dashboard/system": "System",
  "/dashboard/analytics": "Analytics",
  "/dashboard/super-admin": "Super Admin",
  "/dashboard/super-admin/verification": "Verification",
  "/dashboard/super-admin/verification/policies": "Policy Center",
  "/dashboard/super-admin/verification/analytics": "Verification analytics",
  "/dashboard/super-admin/verification/rider-queue": "Rider agent queue",
  "/dashboard/super-admin/verification/merchant-queue": "Merchant agent queue",
  "/dashboard/super-admin/store-onboarding-fee": "Onboarding fee & Mx Agreement",
  "/dashboard/super-admin/ticket-settings": "Ticket Management",
  "/dashboard/super-admin/order-acceptance": "Order acceptance settings",
  "/dashboard/super-admin/cancellation-reasons": "Cancellation reasons",
  "/dashboard/super-admin/rider-assignment-controls": "Rider Assignment Controls",
  "/dashboard/super-admin/rule-engine": "Financial Rule Engine",
  "/dashboard/super-admin/rule-engine/new": "Create rule",
  "/dashboard/super-admin/geo": "Geo & coverage",
  "/dashboard/super-admin/offers-coupons": "Offers & coupons",
  "/dashboard/super-admin/offers-coupons/analytics": "Platform offer analytics",
  "/dashboard/super-admin/offers-coupons/new": "Create platform offer",
  "/dashboard/super-admin/offers-coupons/coupons/new": "Create checkout coupon",
  "/dashboard/super-admin/cxapp-home": "CX App Home",
  "/dashboard/super-admin/customer-app-categories": "App Category",
  "/dashboard/super-admin/commission": "Commission Engine",
  "/dashboard/users": "User Management",
};

const SUPER_ADMIN_HUB_PATH = "/dashboard/super-admin";
const VERIFICATION_HUB_PATH = "/dashboard/super-admin/verification";
const GEO_LIST_PATH = "/dashboard/super-admin/geo";
const GEO_DETAIL_ROUTE_RE = /^\/dashboard\/super-admin\/geo\/[^/]+\/[^/]+$/;
const VERIFICATION_INNER_ROUTE_RE =
  /^\/dashboard\/super-admin\/verification\/(policies|analytics|rider-queue|merchant-queue)(\/.*)?$/;

/** One-step back within Super Admin nested routes (not always the hub). */
function resolveSuperAdminBackHref(cleanPath: string): string {
  if (/^\/dashboard\/super-admin\/cxapp-home\/[^/]+$/.test(cleanPath)) {
    return "/dashboard/super-admin/cxapp-home";
  }
  if (GEO_DETAIL_ROUTE_RE.test(cleanPath)) {
    return GEO_LIST_PATH;
  }
  // Offers & coupons nested pages → list
  if (
    cleanPath === "/dashboard/super-admin/offers-coupons/analytics" ||
    cleanPath === "/dashboard/super-admin/offers-coupons/new" ||
    cleanPath === "/dashboard/super-admin/offers-coupons/coupons/new" ||
    /^\/dashboard\/super-admin\/offers-coupons\/\d+\/edit$/.test(cleanPath) ||
    /^\/dashboard\/super-admin\/offers-coupons\/coupons\/\d+\/edit$/.test(cleanPath)
  ) {
    return "/dashboard/super-admin/offers-coupons";
  }
  // Policy Center / Analytics / queues → Verification hub (not Super Admin root)
  if (VERIFICATION_INNER_ROUTE_RE.test(cleanPath)) {
    return VERIFICATION_HUB_PATH;
  }
  return SUPER_ADMIN_HUB_PATH;
}

const STORE_ONBOARDING_FEE_PATH = "/dashboard/super-admin/store-onboarding-fee";
const TICKET_SETTINGS_PATH = "/dashboard/super-admin/ticket-settings";
const ORDER_ACCEPTANCE_SETTINGS_PATH = "/dashboard/super-admin/order-acceptance";
const RIDER_ASSIGNMENT_CONTROLS_PATH = "/dashboard/super-admin/rider-assignment-controls";
const RULE_ENGINE_PATH = "/dashboard/super-admin/rule-engine";
const PAYMENTS_PATH = "/dashboard/payments";
const USERS_PATH = "/dashboard/users";
const OFFERS_SUPER_ADMIN_PATH = "/dashboard/offers";
const OFFERS_MERCHANTS_PATH = "/dashboard/merchants/offers";

/** One-step back within User Management nested routes. */
function resolveUsersBackHref(cleanPath: string): string {
  if (cleanPath === USERS_PATH) return SUPER_ADMIN_HUB_PATH;
  if (/^\/dashboard\/users\/roles\/\d+\/edit$/.test(cleanPath)) {
    return `${USERS_PATH}/roles`;
  }
  if (cleanPath === `${USERS_PATH}/roles/new`) return `${USERS_PATH}/roles`;
  if (cleanPath === `${USERS_PATH}/roles`) return USERS_PATH;
  if (/^\/dashboard\/users\/[^/]+\/access$/.test(cleanPath)) {
    const id = cleanPath.split("/")[3];
    return id ? `${USERS_PATH}/${id}` : USERS_PATH;
  }
  // /dashboard/users/new, /dashboard/users/[id], etc.
  return USERS_PATH;
}

function HeaderComponent() {
  const pathname = useAppPathname();
  const router = useRouter();
  const searchParams = useAppSearchParams();
  const pathnameClean = useMemo(
    () => pathname.split("?")[0].split("#")[0],
    [pathname]
  );
  /** Actual URL for header chrome — spinner covers header during navigation so no optimistic title swap. */
  const effectivePathname = pathname;

  const pageName = useMemo(() => {
    const clean = effectivePathname.split("?")[0].split("#")[0];
    if (isStoreVerificationDetailPath(clean, searchParams)) {
      const step = parseStoreVerificationStepParam(searchParams.get("step"));
      if (step != null) return storeVerificationStepLabel(step);
      return "Verifications";
    }
    if (clean.startsWith("/dashboard/tickets/queue")) {
      return resolveTicketsQueueHeaderTitle(clean, searchParams.get("section"));
    }
    if (isTicketsAppDetailPath(clean) && ticketDetailHasQueueContext(searchParams)) {
      return "Queue";
    }
    if (ROUTE_TITLES[clean]) {
      if (clean === "/dashboard/super-admin/offers-coupons") {
        const tab = (searchParams.get("tab") ?? "").toLowerCase();
        if (tab === "incentive") return "Rider incentives";
      }
      return ROUTE_TITLES[clean];
    }
    if (/^\/dashboard\/super-admin\/rule-engine\/\d+\/edit$/.test(clean)) return "Edit rule";
    if (/^\/dashboard\/super-admin\/offers-coupons\/\d+\/edit$/.test(clean)) return "Edit platform offer";
    if (/^\/dashboard\/super-admin\/offers-coupons\/coupons\/\d+\/edit$/.test(clean)) {
      return "Edit checkout coupon";
    }
    if (GEO_DETAIL_ROUTE_RE.test(clean)) return "Geo & coverage";
    if (/^\/dashboard\/super-admin\/cxapp-home\/[^/]+$/.test(clean)) return "CX App Home";
    return getCurrentPageName(clean);
  }, [effectivePathname, searchParams]);
  const isStoreVerificationDetail = useMemo(
    () => isStoreVerificationDetailPath(pathnameClean, searchParams),
    [pathnameClean, searchParams]
  );
  const storeVerificationBackHref = useMemo(
    () =>
      isStoreVerificationDetail
        ? buildStoreVerificationHeaderBackHref(searchParams)
        : "/dashboard/merchants/verifications",
    [isStoreVerificationDetail, searchParams]
  );
  const isMerchantsAreaForDisplay = effectivePathname.startsWith("/dashboard/merchants");
  /** Actual URL only — portal sync must not run while pathname is still on Orders/etc. */
  const isMerchantsArea = pathnameClean.startsWith("/dashboard/merchants");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNewDropdown, setShowNewDropdown] = useState(false);
  const [newSheetType, setNewSheetType] = useState<"ticket" | "email" | "contact" | "company" | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const [identityReady, setIdentityReady] = useState(false);
  /** Avoid duplicate Image() preloads (they double-hit Google CDN → 429 in dev/HMR). */
  const gravatarUrlRef = useRef<string | null>(null);
  const primaryOauthUrlRef = useRef<string | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const { user: authUser, authReady, systemUser } = useAuth();
  const [cachedIdentity, setCachedIdentity] = useState<{
    fullName: string | null;
    email: string | null;
    avatarUrl: string | null;
    systemUserId: string | null;
  }>({
    fullName: null,
    email: null,
    avatarUrl: null,
    systemUserId: null,
  });
  const isLoading = !authReady && !authUser && !systemUser && !cachedIdentity.email;
  const logoutMutation = useLogout();
  const leftSidebarMobile = useLeftSidebarMobile();
  const rightSidebar = useRightSidebar();
  const cleanPathname = useMemo(() => effectivePathname.split("?")[0].split("#")[0], [effectivePathname]);
  const isGeoRiderAvailabilityPage =
    cleanPathname === "/dashboard/rx" ||
    cleanPathname.startsWith("/dashboard/rx/") ||
    cleanPathname === "/dashboard/geo-rider-availability" ||
    cleanPathname.startsWith("/dashboard/geo-rider-availability/") ||
    cleanPathname === "/dashboard/area-managers/availability" ||
    cleanPathname.startsWith("/dashboard/area-managers/availability/");
  const isAnalyticsPage =
    cleanPathname === "/dashboard/analytics" ||
    cleanPathname.startsWith("/dashboard/analytics/");
  const analyticsSegments = isAnalyticsPage
    ? cleanPathname.slice("/dashboard/analytics".length).split("/").filter(Boolean)
    : [];
  const analyticsCategoryLabels: Record<string, string> = {
    agents: "Agents",
    tickets: "Tickets",
    orders: "Orders",
    sessions: "Sessions",
  };
  const analyticsCategory = analyticsSegments[0]
    ? analyticsCategoryLabels[analyticsSegments[0]] ?? "Analytics"
    : null;
  const analyticsHeaderTitle = analyticsCategory ?? "Agent Analytics";
  const isAnalyticsDetailPage = analyticsSegments.length === 2;
  const isAnalyticsDayAuditPage = analyticsSegments.length >= 3;
  const analyticsDayLabel = isAnalyticsDayAuditPage
    ? (() => {
        const day = analyticsSegments[2] ?? "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "Day audit";
        return new Date(`${day}T12:00:00`).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      })()
    : null;
  const analyticsAuditViewLabel =
    analyticsSegments[3] === "sessions"
      ? "Login duration"
      : analyticsSegments[3] === "tickets"
        ? "Tickets worked"
        : analyticsSegments[3] === "orders"
          ? "Orders worked"
          : null;
  const analyticsBackHref = isAnalyticsDayAuditPage
    ? `/dashboard/analytics/${analyticsSegments[0]}/${analyticsSegments[1]}`
    : isAnalyticsDetailPage
      ? `/dashboard/analytics/${analyticsSegments[0]}`
      : analyticsCategory
        ? "/dashboard/analytics"
        : null;
  const isAmOnboardingFailedPage =
    cleanPathname.startsWith("/dashboard/area-managers/stores/onboarding-failed");
  const isUsersArea =
    cleanPathname === USERS_PATH || cleanPathname.startsWith(`${USERS_PATH}/`);
  const usersBackHref = isUsersArea ? resolveUsersBackHref(cleanPathname) : null;
  const isNotificationsArea = cleanPathname.startsWith(
    "/dashboard/super-admin/notifications"
  );
  const notificationsPageLabel = useMemo(() => {
    const segment = cleanPathname
      .slice("/dashboard/super-admin/notifications".length)
      .split("/")
      .filter(Boolean)[0];
    const labels: Record<string, string> = {
      templates: "Templates",
      campaigns: "Campaigns",
      scheduled: "Scheduled",
      history: "History",
      analytics: "Analytics",
      devices: "Devices",
      logs: "Logs / Failures",
      settings: "Settings",
    };
    return segment ? labels[segment] ?? "Notifications" : "Dashboard";
  }, [cleanPathname]);
  const notificationsBackHref = useMemo(() => {
    const rest = cleanPathname
      .slice("/dashboard/super-admin/notifications".length)
      .split("/")
      .filter(Boolean);
    // Deeper pages step up one level; the notifications hub goes back to Super Admin.
    if (rest.length > 1) return `/dashboard/super-admin/notifications/${rest[0]}`;
    if (rest.length === 1) return "/dashboard/super-admin/notifications";
    return SUPER_ADMIN_HUB_PATH;
  }, [cleanPathname]);
  const isSuperAdminSubRoute = useMemo(
    () =>
      cleanPathname.startsWith(`${SUPER_ADMIN_HUB_PATH}/`) &&
      cleanPathname !== SUPER_ADMIN_HUB_PATH &&
      !cleanPathname.startsWith(`${RULE_ENGINE_PATH}/`),
    [cleanPathname]
  );
  const isTicketsQueueWorkspace = useMemo(
    () => isTicketsQueueLayoutExperience(cleanPathname, searchParams),
    [cleanPathname, searchParams.toString()]
  );
  const currentDashboard = useMemo(() => getCurrentDashboard(cleanPathname), [cleanPathname]);
  const currentSubRoutes = useMemo(() => getCurrentDashboardSubRoutes(cleanPathname), [cleanPathname]);
  const hasRightSidebar = Boolean(
    isNotificationsArea ||
    (currentDashboard &&
      cleanPathname !== "/dashboard" &&
      currentSubRoutes.length > 0 &&
      !cleanPathname.startsWith("/dashboard/customers") &&
      !cleanPathname.startsWith("/dashboard/orders") &&
      !(cleanPathname === "/order" || cleanPathname.startsWith("/order/")))
  );
  const { canTogglePortal = false, isSuperAdmin = false } = usePermissions();
  const { data: dashboardAccessData } = useDashboardAccessQuery();
  /** Avoid SSR/client mismatch when React Query restores cached permissions before hydration. */
  const [queueLinkMounted, setQueueLinkMounted] = useState(false);
  const [portalToggleMounted, setPortalToggleMounted] = useState(false);
  useEffect(() => {
    setQueueLinkMounted(true);
    setPortalToggleMounted(true);
  }, []);
  const canOpenQueueFromTickets = useMemo(() => {
    if (isSuperAdmin) return true;
    const points = dashboardAccessData?.accessPoints ?? [];
    return points.some((ap) => {
      if (ap?.isActive === false) return false;
      if (String(ap.accessPointGroup).trim().toUpperCase() !== "TICKET_AGENT_STATUS_TOGGLE") {
        return false;
      }
      const actions = Array.isArray(ap.allowedActions) ? ap.allowedActions : [];
      // Active grant with no actions still unlocks Queue (same as server fallback).
      if (actions.length === 0) return true;
      return actions.some((action) => String(action).trim().toUpperCase() === "UPDATE");
    });
  }, [dashboardAccessData?.accessPoints, isSuperAdmin]);
  const showQueueLinkFromTickets = queueLinkMounted && canOpenQueueFromTickets;

  const portalParam = searchParams.get("portal");
  const portalFromUrl = parsePortalParam(portalParam);
  const [pendingPortal, setPendingPortal] = useState<MerchantsPortal | null>(null);
  const portal = pendingPortal
    ?? resolveMerchantsPortal({
      portalFromUrl,
      canTogglePortal,
    });

  useEffect(() => {
    if (pendingPortal != null && portalFromUrl === pendingPortal) {
      setPendingPortal(null);
    }
  }, [portalFromUrl, pendingPortal]);

  // Keep ?portal= in sync on Merchants sub-routes when the list omits it (e.g. old verification links).
  // Depend on portalParam (stable string), not searchParams object identity — avoids replace storms.
  useEffect(() => {
    if (!isMerchantsArea || !canTogglePortal) return;
    if (portalFromUrl) {
      writeStoredMerchantsPortal(portalFromUrl);
      return;
    }
    const target: MerchantsPortal = "admin";
    writeStoredMerchantsPortal(target);
    if (portalParam === target) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("portal", target);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : `${pathname}?portal=${target}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams.toString() via portalParam
  }, [isMerchantsArea, canTogglePortal, portalFromUrl, portalParam, pathname, router]);

  const setPortal = (value: MerchantsPortal) => {
    setPendingPortal(value);
    writeStoredMerchantsPortal(value);
    if (pathnameClean.startsWith("/dashboard/merchants/stores/")) {
      if (value === "admin") {
        router.replace("/dashboard/merchants?portal=admin");
        return;
      }
      const next = new URLSearchParams(searchParams.toString());
      next.set("portal", "merchant");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
      return;
    }
    // Stay on deep merchants routes (e.g. verifications?storeId=&step=) — only swap portal.
    if (
      pathnameClean.startsWith("/dashboard/merchants/") &&
      pathnameClean !== "/dashboard/merchants"
    ) {
      const next = new URLSearchParams(searchParams.toString());
      next.set("portal", value);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
      return;
    }
    router.replace(
      value === "admin"
        ? "/dashboard/merchants?portal=admin"
        : "/dashboard/merchants?portal=merchant"
    );
  };

  // Force merchant portal unless explicit portal toggle access is granted.
  // Never navigate away from the current merchants page (preserve storeId/step on reload).
  useEffect(() => {
    if (!isMerchantsArea) return;
    if (canTogglePortal) return;
    if (portal === "merchant") return;
    writeStoredMerchantsPortal("merchant");
    if (portalParam === "merchant") {
      setPendingPortal(null);
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    next.set("portal", "merchant");
    const qs = next.toString();
    setPendingPortal("merchant");
    router.replace(qs ? `${pathname}?${qs}` : `${pathname}?portal=merchant`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams via portalParam
  }, [isMerchantsArea, canTogglePortal, portal, portalParam, pathname, router]);
  const handleOpenRightPanel = () => {
    leftSidebarMobile?.setMobileMenuOpen(false);
    rightSidebar?.onToggle();
  };

  useEffect(() => {
    if (isTicketsQueueWorkspace) {
      setShowProfileCard(false);
    }
  }, [isTicketsQueueWorkspace]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      const el = userMenuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  useEffect(() => {
    if (!showNewDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      const el = newMenuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setShowNewDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNewDropdown]);

  useEffect(() => {
    setIdentityReady(true);
  }, []);

  useEffect(() => {
    const storageSnapshot = loadBootstrapFromStorage<{
      systemUser?: { fullName?: string; email?: string; systemUserId?: string } | null;
      session?: { user?: { email?: string } | null } | null;
    }>(24 * 60 * 60 * 1000);

    let headerIdentitySnapshot: {
      fullName?: string | null;
      email?: string | null;
      avatarUrl?: string | null;
      systemUserId?: string | null;
    } | null = null;
    try {
      const raw = window.localStorage.getItem(HEADER_IDENTITY_CACHE_KEY);
      headerIdentitySnapshot = raw
        ? (JSON.parse(raw) as {
            fullName?: string | null;
            email?: string | null;
            avatarUrl?: string | null;
            systemUserId?: string | null;
          })
        : null;
    } catch {
      headerIdentitySnapshot = null;
    }

    setCachedIdentity((prev) => ({
      fullName:
        headerIdentitySnapshot?.fullName ??
        storageSnapshot?.data?.systemUser?.fullName ??
        prev.fullName,
      email:
        headerIdentitySnapshot?.email ??
        storageSnapshot?.data?.systemUser?.email ??
        storageSnapshot?.data?.session?.user?.email ??
        prev.email,
      avatarUrl: headerIdentitySnapshot?.avatarUrl ?? prev.avatarUrl,
      systemUserId:
        headerIdentitySnapshot?.systemUserId ??
        storageSnapshot?.data?.systemUser?.systemUserId ??
        prev.systemUserId,
    }));
  }, []);

  useEffect(() => {
    if (!systemUser?.email && !systemUser?.fullName && !systemUser?.systemUserId) return;
    setCachedIdentity((prev) => ({
      fullName: systemUser?.fullName ?? prev.fullName,
      email: systemUser?.email ?? prev.email,
      avatarUrl: prev.avatarUrl,
      systemUserId: systemUser?.systemUserId ?? prev.systemUserId,
    }));
  }, [systemUser?.email, systemUser?.fullName, systemUser?.systemUserId]);

  // Extract user info from system user first, then auth session/cache fallback
  const userEmail = systemUser?.email ?? authUser?.email ?? cachedIdentity.email ?? null;
  const userMetadata = useMemo(
    () => ((authUser as any)?.user_metadata as Record<string, unknown> | undefined) ?? null,
    [authUser]
  );
  const avatarCandidateUrl = useMemo(() => {
    if (!userEmail) return null;
    const sessionUser = authUser as any;
    const possibleAvatarSources = [
      userMetadata?.avatar_url,
      userMetadata?.picture,
      userMetadata?.avatar,
      (sessionUser as { user_metadata?: Record<string, unknown> } | null)?.user_metadata?.avatar_url,
      (sessionUser as { user_metadata?: Record<string, unknown> } | null)?.user_metadata?.picture,
      (sessionUser as { user_metadata?: Record<string, unknown> } | null)?.user_metadata?.avatar,
      sessionUser?.app_metadata?.avatar_url,
      sessionUser?.app_metadata?.picture,
      sessionUser?.avatar_url,
      sessionUser?.picture,
    ].filter(Boolean);
    const primaryOauth =
      possibleAvatarSources.length > 0 ? (possibleAvatarSources[0] as string) : null;
    const gravatarUrl = getUserAvatarUrl(userEmail, userMetadata ?? {}, 40);
    gravatarUrlRef.current = gravatarUrl;
    primaryOauthUrlRef.current = primaryOauth;
    return primaryOauth ?? gravatarUrl;
  }, [authUser, userEmail, userMetadata]);
  const metaFullName = userMetadata?.full_name;
  const metaDisplayName = userMetadata?.name;
  const stringFromUnknown = (v: unknown): string | null => {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return null;
  };
  const userName: string | null =
    systemUser?.fullName ||
    cachedIdentity.fullName ||
    stringFromUnknown(metaFullName) ||
    stringFromUnknown(metaDisplayName) ||
    (userEmail ? userEmail.split("@")[0] : null) ||
    null;

  // Avatar: only update local avatar state when source identity actually changes.
  // This keeps the header image stable across unrelated re-renders.
  useEffect(() => {
    if (!userEmail || !avatarCandidateUrl) return;
    if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEBUG_HEADER === "true") {
      console.log("[Header] User metadata:", userMetadata);
      console.log("[Header] Session user:", authUser);
      console.log("[Header] App metadata:", (authUser as any)?.app_metadata);
      console.log("[Header] Resolved avatar:", avatarCandidateUrl);
    }
    setAvatarUrl((current) => {
      if (current === avatarCandidateUrl) return current;
      return avatarCandidateUrl;
    });
    setAvatarError(false);
  }, [authUser, avatarCandidateUrl, userEmail, userMetadata]);

  useEffect(() => {
    if (!userName && !userEmail && !avatarUrl && !systemUser?.systemUserId) return;
    try {
      window.localStorage.setItem(
        HEADER_IDENTITY_CACHE_KEY,
        JSON.stringify({
          fullName: userName ?? null,
          email: userEmail ?? null,
          avatarUrl: avatarUrl ?? cachedIdentity.avatarUrl ?? null,
          systemUserId: systemUser?.systemUserId ?? cachedIdentity.systemUserId ?? null,
        })
      );
    } catch {
      // ignore
    }
  }, [
    userName,
    userEmail,
    avatarUrl,
    cachedIdentity.avatarUrl,
    cachedIdentity.systemUserId,
    systemUser?.systemUserId,
  ]);

  const displayName = userName ?? "User";
  const displayEmail = typeof userEmail === "string" ? userEmail : "";
  const effectiveAvatarUrl = avatarUrl ?? cachedIdentity.avatarUrl;

  const handleAvatarImgError = useCallback(() => {
    setAvatarUrl((current) => {
      const primary = primaryOauthUrlRef.current;
      const gravatar = gravatarUrlRef.current;
      if (primary && current === primary && gravatar && gravatar !== primary) {
        return gravatar;
      }
      queueMicrotask(() => setAvatarError(true));
      return current;
    });
  }, []);

  const openLogoutConfirm = () => {
    setShowDropdown(false);
    setShowLogoutConfirm(true);
  };

  const handleLogoutConfirm = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        setShowLogoutConfirm(false);
      },
    });
  };

  const handleLogoutCancel = () => {
    if (logoutMutation.isPending) return;
    setShowLogoutConfirm(false);
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between bg-white px-4 sm:px-6 z-50 relative gap-2 sm:gap-4">
      {/* Mobile: Hamburger (left) + Logo + Page name. Desktop: no hamburger. */}
      <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
        {/* Hamburger - only on tablet/mobile (<1024px) */}
        {leftSidebarMobile && !isTicketsQueueWorkspace && (
          <button
            type="button"
            onClick={leftSidebarMobile.toggleMobileMenu}
            className="lg:hidden flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors duration-200 -ml-1"
            aria-label={leftSidebarMobile.isMobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={leftSidebarMobile.isMobileMenuOpen}
          >
            {leftSidebarMobile.isMobileMenuOpen ? (
              <X className="h-6 w-6" aria-hidden />
            ) : (
              <Menu className="h-6 w-6" aria-hidden />
            )}
          </button>
        )}
        {/* Mobile logo - icon only */}
        <Link href="/dashboard" className="sm:hidden flex-shrink-0">
          <Logo variant="icon-only" size="sm" className="transition-opacity hover:opacity-80" />
        </Link>
        {cleanPathname === STORE_ONBOARDING_FEE_PATH ? (
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <Link
              href="/dashboard/super-admin"
              className="shrink-0 cursor-pointer rounded-md p-1.5 text-gray-600 transition hover:bg-gray-100"
              aria-label="Back to Super Admin"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <IndianRupee className="h-5 w-5 shrink-0 text-violet-600" strokeWidth={2} aria-hidden />
            <h2 className="min-w-0 truncate text-base font-semibold text-gray-900 sm:text-lg">{pageName}</h2>
          </div>
        ) : cleanPathname === TICKET_SETTINGS_PATH ? (
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <Link
              href="/dashboard/super-admin"
              className="shrink-0 cursor-pointer rounded-md p-1.5 text-gray-600 transition hover:bg-gray-100"
              aria-label="Back to Super Admin"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h2 className="min-w-0 truncate text-base font-semibold text-gray-900 sm:text-lg">{pageName}</h2>
          </div>
        ) : cleanPathname === ORDER_ACCEPTANCE_SETTINGS_PATH ? (
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <Link
              href="/dashboard/super-admin"
              className="shrink-0 cursor-pointer rounded-md p-1.5 text-gray-600 transition hover:bg-gray-100"
              aria-label="Back to Super Admin"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h2 className="min-w-0 truncate text-base font-semibold text-gray-900 sm:text-lg">{pageName}</h2>
          </div>
        ) : cleanPathname === RIDER_ASSIGNMENT_CONTROLS_PATH ? (
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <Link
              href="/dashboard/super-admin"
              className="shrink-0 cursor-pointer rounded-md p-1.5 text-gray-600 transition hover:bg-gray-100"
              aria-label="Back to Super Admin"
              title="Back to Super Admin"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h2 className="min-w-0 truncate text-base font-semibold text-gray-900 sm:text-lg">
              Rider Assignment Controls
            </h2>
          </div>
        ) : cleanPathname === PAYMENTS_PATH ? (
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <Link
              href="/dashboard/super-admin"
              className="shrink-0 cursor-pointer rounded-md p-1.5 text-gray-600 transition hover:bg-gray-100"
              aria-label="Back to Super Admin"
              title="Back to Super Admin"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h2 className="min-w-0 truncate text-base font-semibold text-gray-900 sm:text-lg">{pageName}</h2>
          </div>
        ) : isUsersArea ? (
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <Link
              href={usersBackHref ?? SUPER_ADMIN_HUB_PATH}
              className="shrink-0 cursor-pointer rounded-md p-1.5 text-gray-600 transition hover:bg-gray-100"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h2 className="min-w-0 truncate text-base font-semibold text-gray-900 sm:text-lg">{pageName}</h2>
          </div>
        ) : cleanPathname === OFFERS_SUPER_ADMIN_PATH ? (
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <Link
              href="/dashboard/super-admin"
              className="shrink-0 cursor-pointer rounded-md p-1.5 text-gray-600 transition hover:bg-gray-100"
              aria-label="Back to Super Admin"
              title="Back to Super Admin"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h2 className="min-w-0 truncate text-base font-semibold text-gray-900 sm:text-lg">{pageName}</h2>
          </div>
        ) : cleanPathname === OFFERS_MERCHANTS_PATH ? (
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <Link
              href="/dashboard/merchants"
              className="shrink-0 cursor-pointer rounded-md p-1.5 text-gray-600 transition hover:bg-gray-100"
              aria-label="Back to Merchants"
              title="Back to Merchants"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h2 className="min-w-0 truncate text-base font-semibold text-gray-900 sm:text-lg">{pageName}</h2>
          </div>
        ) : cleanPathname.startsWith(`${RULE_ENGINE_PATH}/`) ? (
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <Link
              href={RULE_ENGINE_PATH}
              className="shrink-0 cursor-pointer rounded-md p-1.5 text-gray-600 transition hover:bg-gray-100"
              aria-label="Back to rules"
              title="Back to rules"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h2 className="min-w-0 truncate text-base font-semibold text-gray-900 sm:text-lg">{pageName}</h2>
          </div>
        ) : cleanPathname === RULE_ENGINE_PATH ? (
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <Link
              href="/dashboard/super-admin"
              className="shrink-0 cursor-pointer rounded-md p-1.5 text-gray-600 transition hover:bg-gray-100"
              aria-label="Back to Super Admin"
              title="Back to Super Admin"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h2 className="min-w-0 truncate text-base font-semibold text-gray-900 sm:text-lg">{pageName}</h2>
          </div>
        ) : isNotificationsArea ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              href={notificationsBackHref}
              className="shrink-0 cursor-pointer rounded-md p-1.5 text-gray-600 transition hover:bg-gray-100"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#121212] text-white">
              <Bell className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                Notifications
              </div>
              <h2 className="truncate text-base font-semibold text-[#121212]">
                {notificationsPageLabel}
              </h2>
            </div>
          </div>
        ) : isSuperAdminSubRoute ? (
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <Link
              href={resolveSuperAdminBackHref(cleanPathname)}
              className="shrink-0 cursor-pointer rounded-md p-1.5 text-gray-600 transition hover:bg-gray-100"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h2 className="min-w-0 truncate text-base font-semibold text-gray-900 sm:text-lg">{pageName}</h2>
          </div>
        ) : isStoreVerificationDetail ? (
          <div className="verification-typo flex min-w-0 items-center gap-2 sm:gap-2.5">
            <Link
              href={storeVerificationBackHref}
              className="shrink-0 cursor-pointer rounded-md p-1.5 text-gray-600 transition hover:bg-gray-100"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h2 className="min-w-0 truncate text-base font-semibold text-gray-900 sm:text-lg">
              {pageName}
            </h2>
          </div>
        ) : isAmOnboardingFailedPage ? (
          <div className="min-w-0 flex-shrink">
            <h2 className="min-w-0 truncate text-base font-semibold text-[#121212] sm:text-lg">
              Onboarding failed
            </h2>
            <p className="mt-0.5 hidden max-w-xl truncate text-xs text-gray-500 sm:block">
              Child stores with rejected verification steps. Fix and resubmit for admin review.
            </p>
          </div>
        ) : isAnalyticsPage ? (
          <div className="flex min-w-0 items-center gap-2">
            {analyticsBackHref && (
              <Link
                href={analyticsBackHref}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition hover:bg-gray-100 hover:text-black"
                aria-label="Go back to previous analytics page"
                title="Back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
            )}
            <div className="min-w-0 flex-shrink">
              <h2 className="min-w-0 truncate text-base font-semibold text-[#121212] sm:text-lg">
                {analyticsHeaderTitle}
              </h2>
              <nav
                className="mt-0.5 hidden min-w-0 items-center gap-1 truncate text-[11px] font-medium text-slate-600 sm:flex"
                aria-label="Analytics breadcrumb"
              >
                <Link href="/dashboard/analytics" className="text-blue-700 hover:text-blue-900">
                  Analytics
                </Link>
                <span className="text-slate-400">-</span>
                <Link href="/dashboard/analytics" className="text-blue-700 hover:text-blue-900">
                  Agent Analytics
                </Link>
                {analyticsCategory && (
                  <>
                    <span className="text-slate-400">-</span>
                    <Link
                      href={`/dashboard/analytics/${analyticsSegments[0]}`}
                      className={
                        isAnalyticsDetailPage || isAnalyticsDayAuditPage
                          ? "text-blue-700 hover:text-blue-900"
                          : "text-slate-800"
                      }
                    >
                      {analyticsCategory}
                    </Link>
                  </>
                )}
                {(isAnalyticsDetailPage || isAnalyticsDayAuditPage) && (
                  <>
                    <span className="text-slate-400">-</span>
                    {isAnalyticsDayAuditPage ? (
                      <Link
                        href={`/dashboard/analytics/${analyticsSegments[0]}/${analyticsSegments[1]}`}
                        className="text-blue-700 hover:text-blue-900"
                      >
                        Agent details
                      </Link>
                    ) : (
                      <span className="text-slate-800">Agent details</span>
                    )}
                  </>
                )}
                {isAnalyticsDayAuditPage && analyticsDayLabel && (
                  <>
                    <span className="text-slate-400">-</span>
                    <span className={analyticsAuditViewLabel ? "text-blue-700" : "text-slate-800"}>
                      {analyticsDayLabel}
                    </span>
                  </>
                )}
                {analyticsAuditViewLabel && (
                  <>
                    <span className="text-slate-400">-</span>
                    <span className="text-slate-800">{analyticsAuditViewLabel}</span>
                  </>
                )}
              </nav>
            </div>
          </div>
        ) : isGeoRiderAvailabilityPage ? (
          <div className="min-w-0 flex flex-col justify-center">
            <h2 className="min-w-0 truncate text-base font-semibold text-[#121212] sm:text-lg leading-tight">
              Geo Rx Availability
            </h2>
            <p className="hidden sm:block truncate text-[11px] text-slate-500 leading-tight mt-0.5">
              Search riders near any location within a radius — live fleet coverage.
            </p>
          </div>
        ) : (
          <h2
            className={`min-w-0 truncate text-base font-semibold text-[#121212] sm:text-lg flex-shrink ${
              cleanPathname.startsWith("/dashboard/orders") ||
              cleanPathname === "/order" ||
              cleanPathname.startsWith("/order/")
                ? "orders-typo"
                : ""
            }`}
          >
            {pageName}
          </h2>
        )}
        {/* Queue (new tab) + helpdesk gear — ticket list & related; status lives on Queue pages */}
        {effectivePathname.startsWith("/dashboard/tickets") &&
          !isTicketsQueueWorkspace &&
          // Hide Queue + helpdesk gear on the ticket detail inner page.
          !isTicketsAppDetailPath(cleanPathname) && (
            <div className="flex flex-shrink-0 items-center gap-2">
              {showQueueLinkFromTickets && (
                <Link
                  href={TICKETS_QUEUE_HOME_PATH}
                  prefetch
                  scroll={false}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-50"
                  title="Open agent queue in a new tab"
                  aria-label="Open agent queue in a new tab"
                >
                  Queue
                </Link>
              )}
              <TicketsHubGearButton />
            </div>
          )}
      </div>

      {/* Center: Order Search / Tickets search+New / Dashboard Search */}
      {effectivePathname.startsWith("/dashboard/orders") ? (
        <div className="hidden lg:flex min-w-0 flex-1 items-center justify-center gap-3 px-4">
          <OrderTypeDropdown />
          <div className="min-w-0 w-full max-w-[34rem]">
            <OrderSearchBar />
          </div>
        </div>
      ) : effectivePathname === "/order" ||
        effectivePathname.startsWith("/order/") ? (
        <div className="hidden lg:flex min-w-0 flex-1 items-center justify-center gap-3 px-4">
          <OrderTypeDropdown />
        </div>
      ) : effectivePathname.startsWith("/dashboard/tickets") && !isTicketsQueueWorkspace ? (
        <div
          className={`flex min-w-0 flex-1 items-center justify-end gap-2 ${
            rightSidebar?.isOpen ? "pr-5 sm:pr-8 lg:pr-10" : "pr-3 sm:pr-4"
          }`}
        >
          {/* Global search and + New — kept clear of the filters rail */}
          <div className="w-full min-w-0 max-w-[140px] sm:max-w-[200px] md:max-w-[240px]">
            <GlobalSearch />
          </div>
          <div ref={newMenuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowNewDropdown((prev) => !prev)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-400 transition-colors"
              aria-expanded={showNewDropdown}
              aria-haspopup="true"
            >
              <Plus className="h-4 w-4" />
              <span>New</span>
              <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${showNewDropdown ? "rotate-180" : ""}`} />
            </button>
            {showNewDropdown && (
              <div
                className="absolute right-0 top-full z-[100] mt-1 w-40 rounded-lg border border-gray-200 bg-white py-0.5 shadow-lg ring-1 ring-black/5"
                role="menu"
              >
                {(
                  [
                    { type: "ticket" as const, icon: Ticket, label: "Ticket", iconClass: "bg-amber-100 text-amber-700" },
                    { type: "email" as const, icon: Mail, label: "Email", iconClass: "bg-blue-100 text-blue-700" },
                    { type: "contact" as const, icon: UserPlus, label: "Contact", iconClass: "bg-emerald-100 text-emerald-700" },
                    { type: "company" as const, icon: Building2, label: "Company", iconClass: "bg-violet-100 text-violet-700" },
                  ] as const
                ).map(({ type, icon: Icon, label, iconClass }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setShowNewDropdown(false);
                      setNewSheetType(type);
                    }}
                    className="flex w-full items-center gap-2 px-2 py-1 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors"
                    role="menuitem"
                  >
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${iconClass}`}>
                      <Icon className="h-3 w-3" />
                    </div>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <NewTicketSideSheet type={newSheetType} onClose={() => setNewSheetType(null)} />
        </div>
      ) : !effectivePathname.startsWith("/dashboard/tickets") &&
        effectivePathname !== "/dashboard/area-managers" &&
        !isGeoRiderAvailabilityPage &&
        !isAmOnboardingFailedPage &&
        !effectivePathname.startsWith("/dashboard/merchants/verifications") ? (
        <div className="hidden lg:flex items-center justify-center flex-1 max-w-xl mx-4 min-w-0">
          <DashboardSearch compact={true} />
        </div>
      ) : null}

      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 min-w-0">
        {/* Admin | Merchant portal toggle: shown only for explicit portal-toggle access */}
        {isMerchantsAreaForDisplay &&
          portalToggleMounted &&
          canTogglePortal &&
          !isStoreVerificationDetail && (
          <div className="flex rounded-[10px] border border-[#121212]/10 bg-white p-0.5 shadow-sm" role="tablist" aria-label="Admin or Merchant portal">
            <button
              type="button"
              onClick={() => setPortal("admin")}
              className={`cursor-pointer rounded-[10px] px-2 py-1.5 text-xs font-medium transition ${portal === "admin" ? "bg-[#121212] text-white" : "text-[#121212]/70 hover:bg-[#F3F7FA]"}`}
              aria-pressed={portal === "admin"}
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => setPortal("merchant")}
              className={`cursor-pointer rounded-[10px] px-2 py-1.5 text-xs font-medium transition ${portal === "merchant" ? "bg-[#121212] text-white" : "text-[#121212]/70 hover:bg-[#F3F7FA]"}`}
              aria-pressed={portal === "merchant"}
            >
              Merchant
            </button>
          </div>
        )}
        {/* Right sidebar / panel toggle - mobile only when this dashboard has a right sidebar */}
        {hasRightSidebar && (
          <button
            type="button"
            onClick={handleOpenRightPanel}
            className="lg:hidden flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors duration-200"
            aria-label={rightSidebar?.isOpen ? "Close panel" : "Open panel"}
            aria-expanded={rightSidebar?.isOpen}
          >
            {isTicketsQueueWorkspace ? (
              <PanelLeft className="h-5 w-5" aria-hidden />
            ) : (
              <PanelRight className="h-5 w-5" aria-hidden />
            )}
          </button>
        )}
        {isTicketsQueueWorkspace && <AgentStatusToggle />}

        {/* User name + avatar + logout - hidden on mobile (moved to left sidebar) */}
        <div ref={userMenuRef} className="relative hidden lg:block">
          <button
            type="button"
            onClick={() => {
              if (!isTicketsQueueWorkspace) {
                setShowProfileCard(true);
              }
            }}
            className={`flex items-center space-x-2 rounded-lg px-3 py-2 text-gray-700 min-w-0 ${
              isTicketsQueueWorkspace ? "cursor-default" : "hover:bg-gray-100"
            }`}
          >
            {!identityReady ? (
              <>
                <div className="flex flex-col items-start min-w-0 max-w-[200px] gap-1.5" aria-hidden>
                  <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
                  <div className="h-3 w-32 rounded bg-gray-100 animate-pulse" />
                </div>
                <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gray-200 animate-pulse" />
              </>
            ) : (
              <>
                <div className="flex flex-col items-start min-w-0 max-w-[200px]">
                  <span className="text-sm font-medium text-gray-900 truncate w-full">
                    {displayName}
                  </span>
                  <span className="text-xs text-gray-500 truncate w-full">
                    {displayEmail}
                  </span>
                </div>
                {!isLoading && effectiveAvatarUrl && !avatarError ? (
                  <img
                    src={effectiveAvatarUrl}
                    alt={displayName || displayEmail || "User"}
                    className="h-8 w-8 flex-shrink-0 rounded-full object-cover border border-gray-200"
                    onError={handleAvatarImgError}
                  />
                ) : (
                  <div className="h-8 w-8 flex-shrink-0 rounded-full bg-[#121212] flex items-center justify-center text-white text-xs font-semibold shadow-sm">
                    {getUserInitials(userName ?? null, userEmail ?? null)}
                  </div>
                )}
              </>
            )}
          </button>

        </div>
      </div>

      {/* Sign out confirmation modal */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
          aria-describedby="logout-dialog-desc"
          onClick={logoutMutation.isPending ? undefined : handleLogoutCancel}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 sm:p-7">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 text-red-600">
                <LogOut className="h-6 w-6" />
              </div>
              <h2 id="logout-dialog-title" className="text-lg font-semibold text-gray-900 text-center">
                Sign out?
              </h2>
              <p id="logout-dialog-desc" className="mt-2 text-sm text-gray-500 text-center">
                Are you sure you want to sign out? You will need to sign in again to access the dashboard.
              </p>
              <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3 sm:gap-3">
                <button
                  type="button"
                  onClick={handleLogoutCancel}
                  disabled={logoutMutation.isPending}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLogoutConfirm}
                  disabled={logoutMutation.isPending}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {logoutMutation.isPending ? (
                    <>
                      <LoadingSpinner variant="button" size="sm" />
                      Signing out...
                    </>
                  ) : (
                    <>
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating profile status card (hidden on Queue workspace — status is in header) */}
      <ProfileStatusCard
        open={showProfileCard && !isTicketsQueueWorkspace}
        onClose={() => setShowProfileCard(false)}
        onSignOut={openLogoutConfirm}
      />
    </header>
  );
}

export const Header = memo(HeaderComponent);
