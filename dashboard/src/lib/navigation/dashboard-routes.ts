/**
 * Dashboard Navigation Configuration
 * 
 * Defines all sub-routes for each dashboard type
 */

import {
  LayoutDashboard,
  User,
  Package,
  ShoppingCart,
  Store,
  Ticket,
  Settings,
  BarChart3,
  UserCog,
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
  Users,
  UtensilsCrossed,
  Car,
  Box,
  MessageSquare,
  CheckCircle,
  UserPlus,
  History,
} from "lucide-react";

export interface DashboardSubRoute {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
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
    name: "All Customers",
    href: "/dashboard/customers/all",
    icon: Users,
    description: "View all customers",
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
    icon: Users,
    description: "Customer support tickets",
  },
  {
    name: "Rider Tickets",
    href: "/dashboard/tickets/rider",
    icon: Package,
    description: "Rider support tickets",
  },
  {
    name: "Merchant Tickets",
    href: "/dashboard/tickets/merchant",
    icon: Store,
    description: "Merchant support tickets",
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

export const mainNavigation: MainNavItem[] = [
  {
    name: "Home",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Super Admin",
    href: "/dashboard/super-admin",
    icon: UserCog,
    requiresSuperAdmin: true,
  },
  {
    name: "Customers",
    href: "/dashboard/customers",
    icon: Users,
    dashboardType: "CUSTOMER",
    subRoutes: customerDashboardRoutes,
  },
  {
    name: "Riders",
    href: "/dashboard/riders",
    icon: Package,
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
  
  // Check if we're on a sub-route
  if (currentDashboard.subRoutes) {
    for (const subRoute of currentDashboard.subRoutes) {
      if (cleanPath === subRoute.href || cleanPath.startsWith(subRoute.href + "/")) {
        return subRoute.name;
      }
    }
  }
  
  // Check for special pages
  const pageNameMap: Record<string, string> = {
    "/dashboard/users": "User Management",
    "/dashboard/users/new": "Add User",
    "/dashboard/agents": "Agents",
    "/dashboard/offers": "Offers",
    "/dashboard/payments": "Payments",
    "/dashboard/audit": "Audit Logs",
  };
  
  // Check exact matches first
  if (pageNameMap[cleanPath]) {
    return pageNameMap[cleanPath];
  }
  
  // Check for dynamic routes (e.g., /dashboard/users/[id])
  if (cleanPath.startsWith("/dashboard/users/") && !cleanPath.includes("/new") && !cleanPath.includes("/access")) {
    return "User Details";
  }
  
  // Default to dashboard name
  return currentDashboard.name;
}
