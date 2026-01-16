import { requireDashboardAccess } from "@/lib/permissions/page-protection";

export default async function OrdersPage() {
  // Check if user has access to order dashboard
  await requireDashboardAccess("ORDER");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Order Management</h1>
        <p className="mt-2 text-gray-600">
          Search, view, and manage all orders across the platform
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-gray-500">Order management functionality coming soon...</p>
      </div>
    </div>
  );
}
