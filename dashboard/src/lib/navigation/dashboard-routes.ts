/**
 * Dashboard Navigation Configuration
 * 
 * Defines all sub-routes for each dashboard type
 */

import {
  LayoutDashboard,
  User,
  Bike,
  ShoppingCart,
  Store,
  Ticket,
  Settings,
  BarChart3,
  Shield,
  MapPin,
  Wallet,
  DollarSign,
  Ban,
  TrendingUp,
  FileText,
  Gift,
  Zap,
  CreditCard,
  AlertCircle,
  UserCircle,
  UtensilsCrossed,
  Car,
  Box,
  MessageSquare,
  CheckCircle,
  UserPlus,
  History,
  Layers,
  ClipboardList,
} from "lucide-react";

/** For Area Manager sidebar: show only routes allowed for this manager type. */
export type AreaManagerTypeFilter = "MERCHANT" | "RIDER" | "BOTH";

export interface DashboardSubRoute {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  /** Only for Area Manager dashboard: limit to this manager type (BOTH = show to all). */
  areaManagerType?: AreaManagerTypeFilter;
}

export interface DashboardConfig {
  type: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  basePath: string;
  subRoutes: DashboardSubRoute[];
}

/**
 * Rider Dashboard Sub-Routes
 */
export const riderDashboardRoutes: DashboardSubRoute[] = [
  {
    name: "Rider Information",
    href: "/dashboard/riders",
    icon: User,
    description: "Search and view rider details",
  },
  {
    name: "Orders",
    href: "/dashboard/riders/orders",
    icon: ShoppingCart,
    description: "Orders accepted by the rider",
  },
  {
    name: "Wallet & Earnings",
    href: "/dashboard/riders/wallet",
    icon: Wallet,
    description: "Wallet history, balance, and earnings",
  },
  {
    name: "Pending Actions",
    href: "/dashboard/riders/pending-actions",
    icon: CheckCircle,
    description: "Wallet credit requests to approve or reject",
  },
  {
    name: "Blacklist/Whitelist Status",
    href: "/dashboard/riders/blacklist",
    icon: Ban,
    description: "Blacklisting and whitelisting history and status",
  },
  {
    name: "Tickets",
    href: "/dashboard/riders/tickets",
    icon: Ticket,
    description: "Rider support tickets",
  },
  {
    name: "Withdrawals",
    href: "/dashboard/riders/withdrawals",
    icon: CreditCard,
    description: "Withdrawal requests and history",
  },
  {
    name: "Referral Data",
    href: "/dashboard/riders/referrals",
    icon: UserPlus,
    description: "Referral information and data",
  },
  {
    name: "Activity Logs",
    href: "/dashboard/riders/activity-logs",
    icon: FileText,
    description: "Activity and audit logs",
  },
  {
    name: "Penalties",
    href: "/dashboard/riders/penalties",
    icon: AlertCircle,
    description: "Penalties and violations",
  },
  {
    name: "Incentives & Surges",
    href: "/dashboard/riders/incentives",
    icon: Gift,
    description: "Incentives, bonuses, and surge pricing",
  },
];

/**
 * Customer Dashboard Sub-Routes
 */
export const customerDashboardRoutes: DashboardSubRoute[] = [
  {
    name: "Overall Stats",
    href: "/dashboard/customers/all",
    icon: UserCircle,
    description: "View overall customer statistics",
  },
  {
    name: "Food Customers",
    href: "/dashboard/customers/food",
    icon: UtensilsCrossed,
    description: "Food service customers",
  },
  {
    name: "Parcel Customers",
    href: "/dashboard/customers/parcel",
    icon: Box,
    description: "Parcel service customers",
  },
  {
    name: "Person Ride Customers",
    href: "/dashboard/customers/person-ride",
    icon: Car,
    description: "Ride service customers",
  },
];

/**
 * Merchant Dashboard Sub-Routes
 */
export const merchantDashboardRoutes: DashboardSubRoute[] = [
  {
    name: "All Merchants",
    href: "/dashboard/merchants",
    icon: Store,
    description: "View all merchants",
  },
  {
    name: "Verifications",
    href: "/dashboard/merchants/verifications",
    icon: CheckCircle,
    description: "Verify store documents and approve/reject merchants",
  },
  {
    name: "Store Dashboard",
    href: "/dashboard/merchants/stores",
    icon: Store,
    description: "Store detail and dashboard",
  },
  {
    name: "Merchant Details",
    href: "/dashboard/merchants/details",
    icon: User,
    description: "Merchant information",
  },
  {
    name: "Orders",
    href: "/dashboard/merchants/orders",
    icon: ShoppingCart,
    description: "Merchant orders",
  },
  {
    name: "Menu Items",
    href: "/dashboard/merchants/menu",
    icon: UtensilsCrossed,
    description: "Menu management",
  },
  {
    name: "Offers",
    href: "/dashboard/merchants/offers",
    icon: Gift,
    description: "Merchant offers",
  },
  {
    name: "Tickets",
    href: "/dashboard/merchants/tickets",
    icon: Ticket,
    description: "Support tickets",
  },
  {
    name: "Payments",
    href: "/dashboard/merchants/payments",
    icon: CreditCard,
    description: "Payment history",
  },
  {
    name: "Analytics",
    href: "/dashboard/merchants/analytics",
    icon: BarChart3,
    description: "Performance analytics",
  },
];

/** Admin portal: top section shows only these two. */
export const adminPortalMerchantRoutes: DashboardSubRoute[] = [
  { name: "All Merchants", href: "/dashboard/merchants", icon: Store, description: "View all merchants" },
  { name: "Verifications", href: "/dashboard/merchants/verifications", icon: CheckCircle, description: "Verify store documents and approve/reject merchants" },
];

/** Merchant portal: sidebar from reference (Dashboard, Orders, Menu, Offers, Payments, User Insights, Settings, Profile). */
export const merchantPortalSidebarRoutes: DashboardSubRoute[] = [
  { name: "Dashboard", href: "/dashboard/merchants", icon: LayoutDashboard, description: "Order overview and store dashboard" },
  { name: "Orders", href: "/dashboard/merchants/orders", icon: ClipboardList, description: "Merchant orders" },
  { name: "Menu", href: "/dashboard/merchants/menu", icon: UtensilsCrossed, description: "Menu management" },
  { name: "Offers", href: "/dashboard/merchants/offers", icon: Zap, description: "Merchant offers" },
  { name: "Payments", href: "/dashboard/merchants/payments", icon: CreditCard, description: "Payment history" },
  { name: "User Insights", href: "/dashboard/merchants/analytics", icon: UserCircle, description: "Performance analytics" },
  { name: "Settings", href: "/dashboard/merchants/settings", icon: Settings, description: "Settings" },
  { name: "Profile", href: "/dashboard/merchants/details", icon: User, description: "Merchant profile" },
];

/**
 * Merchant Portal section (shown below existing merchant sidebar items when portal=admin).
 * Do not modify merchantDashboardRoutes; this is a separate section.
 */
export const merchantPortalRoutes: DashboardSubRoute[] = [
  {
    name: "Order Overview",
    href: "/dashboard/merchants/order-overview",
    icon: ShoppingCart,
    description: "Search parent or child store and open store dashboard",
  },
];

/** Store-scoped merchant portal sidebar (matches merchant portal: Dashboard, Orders, Menu, Offers, Payments, User Insights, Settings, Profile, Activity). */
export function getStoreScopedMerchantRoutes(storeId: string): DashboardSubRoute[] {
  const base = `/dashboard/merchants/stores/${storeId}`;
  return [
    { name: "Dashboard", href: base, icon: LayoutDashboard, description: "Store overview" },
    { name: "Orders", href: `${base}/orders`, icon: ClipboardList, description: "Order history and status" },
    { name: "Menu", href: `${base}/menu`, icon: UtensilsCrossed, description: "Categories and menu items" },
    { name: "Offers", href: `${base}/offers`, icon: Zap, description: "Discounts and promotions" },
    { name: "Payments", href: `${base}/payments`, icon: CreditCard, description: "Wallet, payouts, transactions" },
    { name: "User Insights", href: `${base}/user-insights`, icon: UserCircle, description: "Reviews and complaints (read-only)" },
    { name: "Settings", href: `${base}/store-settings`, icon: Settings, description: "Profile, timings, address" },
    { name: "Profile", href: `${base}/profile`, icon: User, description: "Store profile" },
    { name: "Activity Log", href: `${base}/activity`, icon: History, description: "Agent activity and audit history" },
  ];
}

/** When on a store page, return only store-scoped links (no All Merchants / Verifications / etc.). */
export function getMerchantSubRoutesForPath(pathname: string): DashboardSubRoute[] {
  const storeMatch = pathname.match(/^\/dashboard\/merchants\/stores\/(\d+)/);
  if (storeMatch) {
    const storeId = storeMatch[1];
    return getStoreScopedMerchantRoutes(storeId);
  }
  return merchantDashboardRoutes;
}

/**
 * Ticket Dashboard Sub-Routes
 */
export const ticketDashboardRoutes: DashboardSubRoute[] = [
  {
    name: "All Tickets",
    href: "/dashboard/tickets/all",
    icon: Ticket,
    description: "View all tickets",
  },
  {
    name: "Food Tickets",
    href: "/dashboard/tickets/food",
    icon: UtensilsCrossed,
    description: "Food service tickets",
  },
  {
    name: "Parcel Tickets",
    href: "/dashboard/tickets/parcel",
    icon: Box,
    description: "Parcel service tickets",
  },
  {
    name: "Person Ride Tickets",
    href: "/dashboard/tickets/person-ride",
    icon: Car,
    description: "Ride service tickets",
  },
  {
    name: "General Tickets",
    href: "/dashboard/tickets/general",
    icon: MessageSquare,
    description: "Non-order related tickets",
  },
  {
    name: "Customer Tickets",
    href: "/dashboard/tickets/customer",
    icon: UserCircle,
    description: "Customer support tickets",
  },
  {
    name: "Rider Tickets",
    href: "/dashboard/tickets/rider",
    icon: Bike,
    description: "Rider support tickets",
  },
  {
    name: "Merchant Tickets",
    href: "/dashboard/tickets/merchant",
    icon: Store,
    description: "Merchant support tickets",
  },
  {
    name: "Unified Tickets",
    href: "/dashboard/tickets/unified",
    icon: Layers,
    description: "Tickets from unified_tickets table",
  },
];

/**
 * Order Dashboard Sub-Routes
 */
export const orderDashboardRoutes: DashboardSubRoute[] = [
  {
    name: "Food Orders",
    href: "/dashboard/orders/food",
    icon: UtensilsCrossed,
    description: "Food delivery orders",
  },
  {
    name: "Parcel Orders",
    href: "/dashboard/orders/parcel",
    icon: Box,
    description: "Parcel delivery orders",
  },
  {
    name: "Person Ride Orders",
    href: "/dashboard/orders/person-ride",
    icon: Car,
    description: "Ride service orders",
  },
];

/**
 * Area Manager Dashboard Sub-Routes (filter by managerType in RightSidebar)
 */
export const areaManagerDashboardRoutes: DashboardSubRoute[] = [
  {
    name: "Dashboard",
    href: "/dashboard/area-managers",
    icon: LayoutDashboard,
    description: "Area manager overview and metrics",
    areaManagerType: "BOTH",
  },
  {
    name: "Stores",
    href: "/dashboard/area-managers/stores",
    icon: Store,
    description: "Stores onboarded by you (Merchant AM)",
    areaManagerType: "MERCHANT",
  },
  {
    name: "Riders",
    href: "/dashboard/area-managers/riders",
    icon: Bike,
    description: "Riders in your locality (Rider AM)",
    areaManagerType: "RIDER",
  },
  {
    name: "Rider Availability",
    href: "/dashboard/area-managers/availability",
    icon: MapPin,
    description: "Rider availability and coverage",
    areaManagerType: "BOTH",
  },
  {
    name: "Activity Logs",
    href: "/dashboard/area-managers/activity-logs",
    icon: History,
    description: "Who onboarded, verified, rejected",
    areaManagerType: "BOTH",
  },
];

/**
 * Main Dashboard Navigation Items
 */
export interface MainNavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  dashboardType?: string;
  requiresSuperAdmin?: boolean;
  subRoutes?: DashboardSubRoute[];
}

/**
 * Paths under the Super Admin hub — keep in sync with `adminOptions` on the super-admin page.
 * Sidebar "Super Admin" stays active on these routes (e.g. /dashboard/users).
 */
export const SUPER_ADMIN_NAV_PATH_PREFIXES = [
  "/dashboard/super-admin",
  "/dashboard/users",
  "/dashboard/payments",
  "/dashboard/offers",
  "/dashboard/agents",
] as const;

export function isSuperAdminNavPath(cleanPath: string): boolean {
  return SUPER_ADMIN_NAV_PATH_PREFIXES.some(
    (prefix) => cleanPath === prefix || cleanPath.startsWith(prefix + "/")
  );
}

export const mainNavigation: MainNavItem[] = [
  {
    name: "Home",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Super Admin",
    href: "/dashboard/super-admin",
    icon: Shield,
    requiresSuperAdmin: true,
  },
  {
    name: "Customers",
    href: "/dashboard/customers",
    icon: UserCircle,
    dashboardType: "CUSTOMER",
    subRoutes: customerDashboardRoutes,
  },
  {
    name: "Riders",
    href: "/dashboard/riders",
    icon: Bike,
    dashboardType: "RIDER",
    subRoutes: riderDashboardRoutes,
  },
  {
    name: "Merchants",
    href: "/dashboard/merchants",
    icon: Store,
    dashboardType: "MERCHANT",
    subRoutes: merchantDashboardRoutes,
  },
  {
    name: "Orders",
    href: "/dashboard/orders",
    icon: ShoppingCart,
    dashboardType: "ORDER_FOOD",
    subRoutes: orderDashboardRoutes,
  },
  {
    name: "Area Managers",
    href: "/dashboard/area-managers",
    icon: MapPin,
    dashboardType: "AREA_MANAGER",
    subRoutes: areaManagerDashboardRoutes,
  },
  {
    name: "Tickets",
    href: "/dashboard/tickets",
    icon: Ticket,
    dashboardType: "TICKET",
    subRoutes: ticketDashboardRoutes,
  },
  {
    name: "System",
    href: "/dashboard/system",
    icon: Settings,
    dashboardType: "SYSTEM",
  },
  {
    name: "Analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
    dashboardType: "ANALYTICS",
  },
];

/**
 * Get current dashboard type from pathname
 */
export function getCurrentDashboard(pathname: string): MainNavItem | null {
  // Remove query parameters and hash from pathname
  const cleanPath = pathname.split('?')[0].split('#')[0];

  const superAdminItem = mainNavigation.find((n) => n.href === "/dashboard/super-admin");
  if (superAdminItem && isSuperAdminNavPath(cleanPath)) {
    return superAdminItem;
  }
  
  // Sort navigation items by href length (longest first) to match more specific routes first
  // This prevents "/dashboard" from matching before "/dashboard/riders"
  const sortedNav = [...mainNavigation].sort((a, b) => b.href.length - a.href.length);
  
  for (const navItem of sortedNav) {
    // Exact match
    if (cleanPath === navItem.href) {
      return navItem;
    }
    // Check if path starts with dashboard href + "/" (for sub-routes)
    // This ensures we match "/dashboard/riders" before "/dashboard"
    if (cleanPath.startsWith(navItem.href + "/")) {
      return navItem;
    }
  }
  return null;
}

/**
 * Get sub-routes for current dashboard
 */
export function getCurrentDashboardSubRoutes(pathname: string): DashboardSubRoute[] {
  const currentDashboard = getCurrentDashboard(pathname);
  if (!currentDashboard || !currentDashboard.subRoutes) {
    return [];
  }
  return currentDashboard.subRoutes;
}

/**
 * Get the current page name from pathname
 * Returns the sub-route name if on a sub-route, otherwise returns the dashboard name
 */
export function getCurrentPageName(pathname: string): string {
  const cleanPath = pathname.split('?')[0].split('#')[0];
  
  // Get current dashboard
  const currentDashboard = getCurrentDashboard(cleanPath);
  
  if (!currentDashboard) {
    return "Dashboard";
  }
  
  // If on the main dashboard page
  if (cleanPath === currentDashboard.href) {
    return currentDashboard.name;
  }
  
  // Check if we're on a sub-route (most specific first: match longer hrefs so wallet-history → Wallet & Earnings)
  if (currentDashboard.subRoutes) {
    const sortedSubRoutes = [...currentDashboard.subRoutes].sort((a, b) => b.href.length - a.href.length);
    for (const subRoute of sortedSubRoutes) {
      const exactOrPrefix = cleanPath === subRoute.href || cleanPath.startsWith(subRoute.href + "/");
      const walletEarningsAlias =
        subRoute.href === "/dashboard/riders/wallet" &&
        (cleanPath === "/dashboard/riders/wallet-history" ||
          cleanPath.startsWith("/dashboard/riders/wallet-history/") ||
          cleanPath === "/dashboard/riders/earnings" ||
          cleanPath.startsWith("/dashboard/riders/earnings/"));
      if (exactOrPrefix || walletEarningsAlias) {
        return subRoute.name;
      }
    }
  }
  
  // Check for store: /dashboard/merchants/stores/[id] — show "Store" in header; store name is in StoreLayoutShell.
  if (/^\/dashboard\/merchants\/stores\/\d+$/.test(cleanPath)) return "Store";
  const storeMxMatch = cleanPath.match(/^\/dashboard\/merchants\/stores\/\d+\/(.+)$/);
  if (storeMxMatch) {
    const tab = storeMxMatch[1].replace(/\/.*$/, "");
    const tabNames: Record<string, string> = {
      menu: "Menu",
      orders: "Orders",
      "store-settings": "Store settings",
      payments: "Payments",
      offers: "Offers",
    };
    if (tabNames[tab]) return tabNames[tab];
  }

  // Check for special pages
  const pageNameMap: Record<string, string> = {
    "/dashboard/users": "User Management",
    "/dashboard/users/new": "Add User",
    "/dashboard/users/roles": "System roles",
    "/dashboard/users/roles/new": "Add Role",
    "/dashboard/agents": "Agents",
    "/dashboard/offers": "Offers",
    "/dashboard/payments": "Payments",
    "/dashboard/audit": "Audit Logs",
    "/dashboard/merchants/verifications": "Verifications",
    "/dashboard/merchants/order-overview": "Order Overview",
    "/dashboard/merchants/settings": "Settings",
    "/dashboard/merchants/stores": "Store Dashboard",
    "/dashboard/area-managers/stores": "Stores",
    "/dashboard/area-managers/riders": "Riders",
    "/dashboard/area-managers/availability": "Rider Availability",
    "/dashboard/area-managers/activity-logs": "Activity Logs",
  };
  
  // Check exact matches first
  if (pageNameMap[cleanPath]) {
    return pageNameMap[cleanPath];
  }
  
  if (/^\/dashboard\/users\/roles\/\d+\/edit$/.test(cleanPath)) {
    return "Edit Role";
  }

  // Check for dynamic routes (e.g., /dashboard/users/[id])
  if (
    cleanPath.startsWith("/dashboard/users/") &&
    !cleanPath.includes("/new") &&
    !cleanPath.includes("/access") &&
    !cleanPath.startsWith("/dashboard/users/roles")
  ) {
    return "User Details";
  }
  
  // Default to dashboard name
  return currentDashboard.name;
}
