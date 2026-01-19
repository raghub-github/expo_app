"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  Store,
  Ticket,
  CreditCard,
  Gift,
  Settings,
  BarChart3,
  UserCog,
  MapPin,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { useDashboardAccess } from "@/hooks/useDashboardAccess";
import { usePermissions } from "@/hooks/usePermissions";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  dashboardType?: string; // Dashboard type for access control
  requiresSuperAdmin?: boolean; // If true, only show for super admin
}

const navigation: NavItem[] = [
  { name: "Home", href: "/dashboard", icon: LayoutDashboard },
  { name: "Super Admin", href: "/dashboard/super-admin", icon: UserCog, requiresSuperAdmin: true },
  { name: "Customers", href: "/dashboard/customers", icon: Users, dashboardType: "CUSTOMER" },
  { name: "Riders", href: "/dashboard/riders", icon: Package, dashboardType: "RIDER" },
  { name: "Merchants", href: "/dashboard/merchants", icon: Store, dashboardType: "MERCHANT" },
  { name: "Orders", href: "/dashboard/orders", icon: ShoppingCart, dashboardType: "ORDER_FOOD" }, // Check for any order type access
  { name: "Area Managers", href: "/dashboard/area-managers", icon: MapPin, dashboardType: "AREA_MANAGER" },
  { name: "Tickets", href: "/dashboard/tickets", icon: Ticket, dashboardType: "TICKET" },
  { name: "System", href: "/dashboard/system", icon: Settings, dashboardType: "SYSTEM" },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3, dashboardType: "ANALYTICS" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { dashboards, loading: accessLoading } = useDashboardAccess();
  const { isSuperAdmin, loading: permissionsLoading } = usePermissions();

  // Create a set of accessible dashboard types - memoized for performance
  const accessibleDashboards = useMemo(() => {
    return new Set(
      dashboards.filter((d) => d.isActive).map((d) => d.dashboardType)
    );
  }, [dashboards]);

  // Filter navigation items based on access - memoized to prevent unnecessary re-renders
  const filteredNavigation = useMemo(() => {
    return navigation.filter((item) => {
      // Always show Home
      if (item.href === "/dashboard") {
        return true;
      }

      // Check super admin requirement
      if (item.requiresSuperAdmin) {
        return isSuperAdmin;
      }

      // Check dashboard access
      if (item.dashboardType) {
        // Super admin has access to all dashboards
        if (isSuperAdmin) {
          return true;
        }
        
        // Special handling for Orders - show if user has access to any order type
        if (item.dashboardType === "ORDER_FOOD") {
          return accessibleDashboards.has("ORDER_FOOD") || 
                 accessibleDashboards.has("ORDER_PERSON_RIDE") || 
                 accessibleDashboards.has("ORDER_PARCEL");
        }
        
        // Check dashboard access directly (CUSTOMER and TICKET are now consolidated)
        return accessibleDashboards.has(item.dashboardType);
        
        return accessibleDashboards.has(item.dashboardType);
      }

      // Default: show if no specific requirements
      return true;
    });
  }, [isSuperAdmin, accessibleDashboards]);

  // Don't render navigation while loading (to prevent flash)
  if (accessLoading || permissionsLoading) {
    return (
      <div className="flex h-screen w-full flex-col bg-gray-900 sm:w-64">
        <div className="flex h-16 items-center justify-center border-b border-gray-800 px-4">
          <Link href="/dashboard" className="flex items-center justify-center">
            <Logo 
              variant="icon-only" 
              size="xl" 
              showText={true}
              className="transition-opacity hover:opacity-80"
            />
          </Link>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
          <div className="px-3 py-2 text-sm text-gray-400">Loading...</div>
        </nav>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col bg-gray-900 sm:w-64">
      {/* Sidebar Header with Logo - Icon only with text */}
      <div className="flex h-16 items-center justify-center border-b border-gray-800 px-4">
        <Link href="/dashboard" className="flex items-center justify-center">
          <Logo 
            variant="icon-only" 
            size="xl" 
            showText={true}
            className="transition-opacity hover:opacity-80"
          />
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {filteredNavigation.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-gray-800 text-white shadow-md"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span className="truncate">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
