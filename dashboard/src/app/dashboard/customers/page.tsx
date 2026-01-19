import { requireSuperAdminAccess, checkDashboardAccess } from "@/lib/permissions/page-protection";
import Link from "next/link";
import { UtensilsCrossed, Car, Package, Users } from "lucide-react";

export default async function CustomersPage() {
  // Check if user has access to CUSTOMER dashboard
  const hasCustomerAccess = await checkDashboardAccess("CUSTOMER");

  // If user has no access to customer dashboard, redirect
  if (!hasCustomerAccess) {
    await requireSuperAdminAccess();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Customer Management</h1>
        <p className="mt-2 text-gray-600">
          Manage all customers with granular access control. Use filters to view customers by order type (food, parcel, person_ride).
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-gray-600">
          The customer dashboard now uses a unified view with filtering options. Access to specific customer types and actions is controlled through granular access points configured in your user profile.
        </p>
        <p className="mt-4 text-sm text-gray-500">
          Filtering and access control will be implemented in the customer list component based on your assigned access points.
        </p>
      </div>
    </div>
  );
}
