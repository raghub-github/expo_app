"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Package,
  Store,
  ShoppingCart,
  UserCog,
  MapPin,
  Ticket,
  CreditCard,
  Gift,
  Settings,
  BarChart3,
  AlertCircle,
} from "lucide-react";

interface DashboardCard {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  color: string;
}

const dashboards: DashboardCard[] = [
  {
    name: "Super Admin",
    href: "/dashboard/super-admin",
    icon: UserCog,
    description: "Manage users, roles, and permissions",
    color: "bg-red-500",
  },
  {
    name: "Customers",
    href: "/dashboard/customers",
    icon: Users,
    description: "View and manage customer data",
    color: "bg-blue-500",
  },
  {
    name: "Riders",
    href: "/dashboard/riders",
    icon: Package,
    description: "Manage riders and their activities",
    color: "bg-green-500",
  },
  {
    name: "Merchants",
    href: "/dashboard/merchants",
    icon: Store,
    description: "Manage merchants and stores",
    color: "bg-purple-500",
  },
  {
    name: "Orders",
    href: "/dashboard/orders",
    icon: ShoppingCart,
    description: "View and manage all orders",
    color: "bg-orange-500",
  },
  {
    name: "Area Managers",
    href: "/dashboard/area-managers",
    icon: MapPin,
    description: "Manage area managers and zones",
    color: "bg-pink-500",
  },
  {
    name: "Tickets",
    href: "/dashboard/tickets",
    icon: Ticket,
    description: "Resolve support tickets",
    color: "bg-yellow-500",
  },
  {
    name: "Payments",
    href: "/dashboard/payments",
    icon: CreditCard,
    description: "Manage payments and withdrawals",
    color: "bg-indigo-500",
  },
  {
    name: "Offers",
    href: "/dashboard/offers",
    icon: Gift,
    description: "Manage offers and banners",
    color: "bg-teal-500",
  },
  {
    name: "System",
    href: "/dashboard/system",
    icon: Settings,
    description: "System configuration",
    color: "bg-gray-500",
  },
  {
    name: "Analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
    description: "View analytics and reports",
    color: "bg-cyan-500",
  },
];

interface UserPermissions {
  exists: boolean;
  systemUserId?: number;
  isSuperAdmin?: boolean;
  message?: string;
}

export default function DashboardHome() {
  const [accessibleDashboards, setAccessibleDashboards] = useState<
    DashboardCard[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [userPerms, setUserPerms] = useState<UserPermissions | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDashboardAccess = async () => {
      try {
        setLoading(true);
        
        // First check user permissions to see if they exist and are super admin
        const permResponse = await fetch("/api/auth/permissions");
        const permResult = await permResponse.json();

        if (permResult.success) {
          setUserPerms(permResult.data);
          
          // If user doesn't exist in system_users, show warning and no dashboards
          if (!permResult.data.exists) {
            setAccessibleDashboards([]);
            return;
          }

          // If user is super admin, show all dashboards
          if (permResult.data.isSuperAdmin) {
            setAccessibleDashboards(dashboards);
            return;
          }
        }

        // For regular users, get dashboard access from dashboard-access API
        const accessResponse = await fetch("/api/auth/dashboard-access");
        const accessResult = await accessResponse.json();

        if (accessResult.success) {
          const userDashboards = accessResult.data.dashboards || [];
          const dashboardTypes = new Set(
            userDashboards.map((d: any) => d.dashboardType)
          );

          // Filter dashboards based on user's access
          const accessible: DashboardCard[] = dashboards.filter((dashboard) => {
            // Map dashboard href to dashboard type
            const hrefToType: Record<string, string> = {
              "/dashboard/super-admin": "SYSTEM",
              "/dashboard/customers": "CUSTOMER",
              "/dashboard/riders": "RIDER",
              "/dashboard/merchants": "MERCHANT",
              "/dashboard/orders": "ORDER",
              "/dashboard/area-managers": "AREA_MANAGER",
              "/dashboard/tickets": "TICKET",
              "/dashboard/payments": "PAYMENT",
              "/dashboard/offers": "OFFER",
              "/dashboard/system": "SYSTEM",
              "/dashboard/analytics": "ANALYTICS",
            };

            const dashboardType = hrefToType[dashboard.href];
            // Payment dashboard is super admin only, already handled above
            if (dashboard.href === "/dashboard/payments") {
              return false;
            }
            return dashboardType ? dashboardTypes.has(dashboardType) : false;
          });

          setAccessibleDashboards(accessible);
        } else {
          setError(accessResult.error || "Failed to fetch dashboard access");
          setAccessibleDashboards([]);
        }
      } catch (err) {
        console.error("Error fetching dashboard access:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setAccessibleDashboards([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardAccess();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Control Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Select a dashboard to manage different aspects of the platform
        </p>
      </div>

      {/* User not in system_users warning */}
      {userPerms && !userPerms.exists && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Account Setup Required
              </h3>
              <p className="mt-1 text-sm text-yellow-700">
                Your account is authenticated but not yet added to the system. 
                Please contact an administrator to complete your account setup.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Error Loading Permissions
              </h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-8">
          <p className="text-gray-500">Loading dashboard...</p>
        </div>
      )}

      {/* Dashboard cards */}
      {!loading && accessibleDashboards.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {accessibleDashboards.map((dashboard) => {
            const Icon = dashboard.icon;
            return (
              <Link
                key={dashboard.name}
                href={dashboard.href}
                className="group rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-center space-x-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-lg ${dashboard.color} text-white`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                      {dashboard.name}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {dashboard.description}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* No accessible dashboards message */}
      {!loading && accessibleDashboards.length === 0 && !error && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No Dashboards Available
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            {userPerms && !userPerms.exists
              ? "Your account is not yet set up in the system. Please contact an administrator to gain access."
              : "You don't have permission to access any dashboards. Please contact an administrator to request access."}
          </p>
        </div>
      )}
    </div>
  );
}
