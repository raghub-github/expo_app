"use client";

import { memo, useState, useEffect, useMemo, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LogOut, Bell, Search, ChevronDown, Plus, Ticket, Mail, UserPlus, Building2, Menu, X, PanelRight, User } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useLogout } from "@/hooks/queries/useAuthQuery";
import { Logo } from "@/components/brand/Logo";
import { getUserAvatarUrl, getUserInitials } from "@/lib/user-avatar";
import { getCurrentPageName, getCurrentDashboard, getCurrentDashboardSubRoutes } from "@/lib/navigation/dashboard-routes";
import { DashboardSearch } from "./DashboardSearch";
import { GlobalSearch } from "@/components/search/GlobalSearch";
const AgentStatusToggle = dynamic(
  () => import("@/components/tickets/AgentStatusToggle").then((m) => m.AgentStatusToggle),
  {
    ssr: false,
    loading: () => <div className="h-7 w-[104px] shrink-0" aria-hidden />,
  }
);
import { ProfileStatusCard } from "@/components/profile/ProfileStatusCard";
import { useLeftSidebarMobile } from "@/context/LeftSidebarMobileContext";
import { useRightSidebar } from "@/context/RightSidebarContext";
import { useCurrentRoute } from "@/context/CurrentRouteContext";
import { useAuth } from "@/providers/AuthProvider";
import { usePermissions } from "@/hooks/usePermissions";
import { loadBootstrapFromStorage } from "@/lib/dashboard-bootstrap-storage";

const HEADER_IDENTITY_CACHE_KEY = "dashboard_header_identity_v1";
const MERCHANTS_PORTAL_STORAGE_KEY = "dashboard_merchants_portal_v1";

function readStoredMerchantsPortal(): "admin" | "merchant" | null {
  if (typeof window === "undefined") return null;
  try {
    const s = sessionStorage.getItem(MERCHANTS_PORTAL_STORAGE_KEY);
    return s === "admin" || s === "merchant" ? s : null;
  } catch {
    return null;
  }
}

function writeStoredMerchantsPortal(value: "admin" | "merchant") {
  try {
    sessionStorage.setItem(MERCHANTS_PORTAL_STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}
// Order Search Bar Component – syncs with URL so Food/Parcel/Ride order pages can read search params
function OrderSearchBar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get("search") ?? "";
  const urlSearchType = searchParams.get("searchType") ?? "Order Id";

  const [searchType, setSearchType] = useState(urlSearchType);
  const [searchValue, setSearchValue] = useState(urlSearch);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const MINT_GREEN = "#4EE5C1";

  // Sync from URL when URL changes (e.g. back/forward or external nav)
  useEffect(() => {
    setSearchValue(searchParams.get("search") ?? "");
    setSearchType(searchParams.get("searchType") ?? "Order Id");
  }, [searchParams.get("search"), searchParams.get("searchType")]);

  // All search items from the 3 dashboards
  const searchItems = [
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

  // Close dropdown when clicking outside
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

  const handleSearch = () => {
    const params = new URLSearchParams(searchParams.toString());
    const value = searchValue.trim();
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
  };

  return (
    <div className="flex items-center w-full max-w-md rounded-lg border" style={{ borderColor: "#D9DCE0" }}>
      {/* Dropdown Section */}
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-l-lg text-xs font-medium text-gray-700 cursor-pointer"
          style={{ backgroundColor: "#F0F2F5" }}
        >
          <span className="whitespace-nowrap">{searchType}</span>
          <ChevronDown className="h-3.5 w-3.5 text-gray-600" />
        </button>
        {showDropdown && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
            {searchItems.map((item) => (
              <button
                key={item}
                onClick={() => {
                  setSearchType(item);
                  setShowDropdown(false);
                }}
                onMouseEnter={() => setHoveredItem(item)}
                onMouseLeave={() => setHoveredItem(null)}
                className="w-full text-left px-3 py-1.5 text-xs cursor-pointer transition-colors"
                style={{
                  color: hoveredItem === item ? "#000000" : "#000000",
                  backgroundColor: hoveredItem === item ? MINT_GREEN : "transparent",
                }}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Input Section */}
      <input
        type="text"
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        placeholder="Search here..."
        className="flex-1 px-2.5 py-1.5 border-l border-r text-xs focus:outline-none"
        style={{ borderColor: "#D9DCE0" }}
        onKeyPress={(e) => {
          if (e.key === "Enter") {
            handleSearch();
          }
        }}
      />
      
      {/* Search Button */}
      <button
        onClick={handleSearch}
        className="px-2.5 py-1.5 rounded-r-lg flex items-center justify-center cursor-pointer"
        style={{ backgroundColor: MINT_GREEN }}
      >
        <Search className="h-3.5 w-3.5 text-gray-900" />
      </button>
    </div>
  );
}

const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "Home",
  "/dashboard/customers": "Customers",
  "/dashboard/riders": "Riders",
  "/dashboard/merchants": "Merchants",
  "/dashboard/orders": "Orders",
  "/dashboard/tickets": "Tickets",
  "/dashboard/area-managers": "Area Managers",
  "/dashboard/system": "System",
  "/dashboard/analytics": "Analytics",
  "/dashboard/super-admin": "Super Admin",
};

function HeaderComponent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentRouteCtx = useCurrentRoute();
  const effectivePathname = useMemo(() => {
    const optimistic = currentRouteCtx?.currentRoute;
    if (!optimistic) return pathname;
    return optimistic;
  }, [currentRouteCtx?.currentRoute, pathname]);

  const pageName = useMemo(() => {
    const clean = effectivePathname.split("?")[0].split("#")[0];
    if (ROUTE_TITLES[clean]) return ROUTE_TITLES[clean];
    return getCurrentPageName(clean);
  }, [effectivePathname]);
  const isMerchantsArea = effectivePathname.startsWith("/dashboard/merchants");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNewDropdown, setShowNewDropdown] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  /** Avoid duplicate Image() preloads (they double-hit Google CDN → 429 in dev/HMR). */
  const gravatarUrlRef = useRef<string | null>(null);
  const primaryOauthUrlRef = useRef<string | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const { user: authUser, authReady, systemUser } = useAuth();
  const [cachedIdentity, setCachedIdentity] = useState<{ fullName: string | null; email: string | null; avatarUrl: string | null }>({
    fullName: null,
    email: null,
    avatarUrl: null,
  });
  const isLoading = !authReady && !authUser && !systemUser && !cachedIdentity.email;
  const logoutMutation = useLogout();
  const leftSidebarMobile = useLeftSidebarMobile();
  const rightSidebar = useRightSidebar();
  const cleanPathname = useMemo(() => effectivePathname.split("?")[0].split("#")[0], [effectivePathname]);
  const currentDashboard = useMemo(() => getCurrentDashboard(cleanPathname), [cleanPathname]);
  const currentSubRoutes = useMemo(() => getCurrentDashboardSubRoutes(cleanPathname), [cleanPathname]);
  const hasRightSidebar = Boolean(currentDashboard && cleanPathname !== "/dashboard" && currentSubRoutes.length > 0);
  const { canTogglePortal = false } = usePermissions();

  const portalParam = searchParams.get("portal");
  const portalFromUrl = portalParam === "admin" || portalParam === "merchant" ? portalParam : null;
  const storedPortalFallback =
    typeof window !== "undefined" && canTogglePortal ? readStoredMerchantsPortal() : null;
  const portal = portalFromUrl ?? storedPortalFallback ?? "merchant";

  // Keep ?portal= in sync on Merchants sub-routes when the list omits it (e.g. old verification links).
  useEffect(() => {
    if (!isMerchantsArea || !canTogglePortal) return;
    if (portalFromUrl) {
      writeStoredMerchantsPortal(portalFromUrl);
      return;
    }
    const stored = readStoredMerchantsPortal();
    if (!stored) return;
    const next = new URLSearchParams(searchParams.toString());
    if (next.get("portal") === stored) return;
    next.set("portal", stored);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : `${pathname}?portal=${stored}`);
  }, [isMerchantsArea, canTogglePortal, portalFromUrl, pathname, router, searchParams]);

  const setPortal = (value: "admin" | "merchant") => {
    writeStoredMerchantsPortal(value);
    if (effectivePathname.startsWith("/dashboard/merchants/stores/")) {
      if (value === "admin") router.push("/dashboard/merchants?portal=admin");
      else {
        const next = new URLSearchParams(searchParams.toString());
        next.set("portal", "merchant");
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname);
      }
    } else {
      if (value === "merchant") {
        // Merchant portal: clear search/category so result list hides and tagline shows
        router.push("/dashboard/merchants?portal=merchant");
      } else {
        const next = new URLSearchParams(searchParams.toString());
        next.set("portal", value);
        router.push(`/dashboard/merchants?${next.toString()}`);
      }
    }
  };

  // Force merchant portal unless explicit portal toggle access is granted.
  useEffect(() => {
    if (!isMerchantsArea) return;
    if (canTogglePortal) return;
    if (portal === "merchant") return;
    setPortal("merchant");
  }, [isMerchantsArea, canTogglePortal, portal]);
  const handleOpenRightPanel = () => {
    leftSidebarMobile?.setMobileMenuOpen(false);
    rightSidebar?.onToggle();
  };

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
    const storageSnapshot = loadBootstrapFromStorage<{
      systemUser?: { fullName?: string; email?: string } | null;
      session?: { user?: { email?: string } | null } | null;
    }>(24 * 60 * 60 * 1000);

    let headerIdentitySnapshot: { fullName?: string | null; email?: string | null; avatarUrl?: string | null } | null = null;
    try {
      const raw = window.localStorage.getItem(HEADER_IDENTITY_CACHE_KEY);
      headerIdentitySnapshot = raw ? (JSON.parse(raw) as { fullName?: string | null; email?: string | null; avatarUrl?: string | null }) : null;
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
    }));
  }, []);

  useEffect(() => {
    if (!systemUser?.email && !systemUser?.fullName) return;
    setCachedIdentity((prev) => ({
      fullName: systemUser?.fullName ?? prev.fullName,
      email: systemUser?.email ?? prev.email,
      avatarUrl: prev.avatarUrl,
    }));
  }, [systemUser?.email, systemUser?.fullName]);

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
    if (!userName && !userEmail && !avatarUrl) return;
    try {
      window.localStorage.setItem(
        HEADER_IDENTITY_CACHE_KEY,
        JSON.stringify({
          fullName: userName ?? null,
          email: userEmail ?? null,
          avatarUrl: avatarUrl ?? cachedIdentity.avatarUrl ?? null,
        })
      );
    } catch {
      // ignore
    }
  }, [userName, userEmail, avatarUrl, cachedIdentity.avatarUrl]);

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
    setShowLogoutConfirm(false);
    logoutMutation.mutate();
  };

  const handleLogoutCancel = () => {
    setShowLogoutConfirm(false);
  };

  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-4 sm:px-6 z-50 relative gap-2 sm:gap-4">
      {/* Mobile: Hamburger (left) + Logo + Page name. Desktop: no hamburger. */}
      <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
        {/* Hamburger - only on tablet/mobile (<1024px) */}
        {leftSidebarMobile && (
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
        <h2 className="text-base font-semibold text-gray-900 sm:text-lg truncate flex-shrink min-w-0">{pageName}</h2>
        {/* Online/Offline/Break toggle + Settings - only on Tickets, always visible when on route */}
        {effectivePathname.startsWith("/dashboard/tickets") && (
          <AgentStatusToggle />
        )}
      </div>

      {/* Center: Order Search on orders; Dashboard Search only on main list pages (hide on verification, store detail, etc.) */}
      {effectivePathname.startsWith("/dashboard/orders") ? (
        <div className="hidden lg:flex items-center justify-center flex-1 max-w-xl mx-4">
          <OrderSearchBar />
        </div>
      ) : !effectivePathname.startsWith("/dashboard/tickets") &&
        effectivePathname !== "/dashboard/area-managers" &&
        !effectivePathname.startsWith("/dashboard/merchants/verifications") ? (
        <div className="hidden lg:flex items-center justify-center flex-1 max-w-xl mx-4 min-w-0">
          <DashboardSearch compact={true} />
        </div>
      ) : null}

      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 min-w-0">
        {/* Admin | Merchant portal toggle: shown only for explicit portal-toggle access */}
        {isMerchantsArea && canTogglePortal && (
          <div className="flex rounded-md border border-gray-200 bg-white p-0.5 shadow-sm" role="tablist" aria-label="Admin or Merchant portal">
            <button
              type="button"
              onClick={() => setPortal("admin")}
              className={`cursor-pointer rounded px-2 py-1.5 text-xs font-medium transition ${portal === "admin" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
              aria-pressed={portal === "admin"}
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => setPortal("merchant")}
              className={`cursor-pointer rounded px-2 py-1.5 text-xs font-medium transition ${portal === "merchant" ? "bg-orange-500 text-white" : "text-gray-600 hover:bg-gray-100"}`}
              aria-pressed={portal === "merchant"}
            >
              Merchant
            </button>
          </div>
        )}
        {/* Global search and + New: only on Tickets dashboard */}
        {effectivePathname.startsWith("/dashboard/tickets") && (
          <>
            <div className="w-full min-w-0 max-w-[160px] sm:max-w-[220px] md:max-w-[280px]">
              <GlobalSearch />
            </div>
            <div ref={newMenuRef} className="relative">
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
                  className="absolute right-0 top-full z-[100] mt-1.5 w-56 rounded-xl border border-gray-200 bg-white py-1.5 shadow-lg ring-1 ring-black/5"
                  role="menu"
                >
                  <Link
                    href="/dashboard/tickets/new"
                    onClick={() => setShowNewDropdown(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    role="menuitem"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                      <Ticket className="h-4 w-4" />
                    </div>
                    <span>Ticket</span>
                  </Link>
                  <Link
                    href="/dashboard/email"
                    onClick={() => setShowNewDropdown(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    role="menuitem"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                      <Mail className="h-4 w-4" />
                    </div>
                    <span>Email</span>
                  </Link>
                  <Link
                    href="/dashboard/contacts/new"
                    onClick={() => setShowNewDropdown(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    role="menuitem"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <UserPlus className="h-4 w-4" />
                    </div>
                    <span>Contact</span>
                  </Link>
                  <Link
                    href="/dashboard/companies/new"
                    onClick={() => setShowNewDropdown(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    role="menuitem"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <span>Company</span>
                  </Link>
                </div>
              )}
            </div>
          </>
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
            <PanelRight className="h-5 w-5" aria-hidden />
          </button>
        )}
        <button className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-colors" aria-label="Notifications">
          <Bell className="h-5 w-5" />
        </button>

        {/* User name + avatar + logout - hidden on mobile (moved to left sidebar) */}
        <div ref={userMenuRef} className="relative hidden lg:block">
          <button
            type="button"
            onClick={() => setShowProfileCard(true)}
            className="flex items-center space-x-2 rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-100 min-w-0"
          >
            <div className="flex flex-col items-start min-w-0 max-w-[200px]">
              <span suppressHydrationWarning className="text-sm font-medium text-gray-900 truncate w-full">
                {displayName}
              </span>
              <span suppressHydrationWarning className="text-xs text-gray-500 truncate w-full">
                {displayEmail}
              </span>
            </div>
            {/* Avatar or Fallback - show placeholder when loading so header doesn't pop in late */}
            {!isLoading && effectiveAvatarUrl && !avatarError ? (
              <img
                src={effectiveAvatarUrl}
                alt={displayName || displayEmail || "User"}
                className="h-8 w-8 flex-shrink-0 rounded-full object-cover border border-gray-200"
                onError={handleAvatarImgError}
              />
            ) : (
              <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm">
                {getUserInitials(userName ?? null, userEmail ?? null)}
              </div>
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
          onClick={handleLogoutCancel}
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

      {/* Floating profile status card */}
      <ProfileStatusCard
        open={showProfileCard}
        onClose={() => setShowProfileCard(false)}
        onSignOut={openLogoutConfirm}
      />
    </header>
  );
}

export const Header = memo(HeaderComponent);
