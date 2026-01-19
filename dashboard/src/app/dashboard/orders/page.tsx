import { requireSuperAdminAccess, checkDashboardAccess } from "@/lib/permissions/page-protection";
import Link from "next/link";
import { UtensilsCrossed, Car, Package } from "lucide-react";

export default async function OrdersPage() {
  // Check if user has access to at least one order dashboard
  const hasFoodAccess = await checkDashboardAccess("ORDER_FOOD");
  const hasRideAccess = await checkDashboardAccess("ORDER_PERSON_RIDE");
  const hasParcelAccess = await checkDashboardAccess("ORDER_PARCEL");

  // If user has no access to any order dashboard, redirect
  if (!hasFoodAccess && !hasRideAccess && !hasParcelAccess) {
    await requireSuperAdminAccess();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Order Management</h1>
        <p className="mt-2 text-gray-600">
          Select an order type to manage orders
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Food Orders Card */}
        {hasFoodAccess && (
          <Link
            href="/dashboard/orders/food"
            className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:border-blue-300"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="rounded-lg bg-orange-100 p-2">
                    <UtensilsCrossed className="h-6 w-6 text-orange-600" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">Food Orders</h2>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Manage food delivery orders, track preparation time, and handle restaurant-related operations
                </p>
                <div className="flex items-center text-sm font-medium text-blue-600 group-hover:text-blue-700">
                  View Food Orders
                  <svg
                    className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* Person Ride Orders Card */}
        {hasRideAccess && (
          <Link
            href="/dashboard/orders/person-ride"
            className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:border-blue-300"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="rounded-lg bg-blue-100 p-2">
                    <Car className="h-6 w-6 text-blue-600" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">Person Ride Orders</h2>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Manage person ride bookings, track passenger details, and handle ride-related operations
                </p>
                <div className="flex items-center text-sm font-medium text-blue-600 group-hover:text-blue-700">
                  View Ride Orders
                  <svg
                    className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* Parcel Orders Card */}
        {hasParcelAccess && (
          <Link
            href="/dashboard/orders/parcel"
            className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:border-blue-300"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="rounded-lg bg-green-100 p-2">
                    <Package className="h-6 w-6 text-green-600" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">Parcel Orders</h2>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Manage parcel delivery orders, track COD collections, and handle package-related operations
                </p>
                <div className="flex items-center text-sm font-medium text-blue-600 group-hover:text-blue-700">
                  View Parcel Orders
                  <svg
                    className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        )}
      </div>

      {!hasFoodAccess && !hasRideAccess && !hasParcelAccess && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-gray-500 text-center">
            You don't have access to any order dashboards. Please contact an administrator.
          </p>
        </div>
      )}
    </div>
  );
}
