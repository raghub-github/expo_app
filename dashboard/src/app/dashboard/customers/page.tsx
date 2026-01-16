import { requireDashboardAccess } from "@/lib/permissions/page-protection";

export default async function CustomersPage() {
  await requireDashboardAccess("CUSTOMER");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Customer Dashboard</h1>
        <p className="mt-2 text-gray-600">
          View and manage customer data, orders, payments, and analytics
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-gray-500">Customer dashboard functionality coming soon...</p>
      </div>
    </div>
  );
}
