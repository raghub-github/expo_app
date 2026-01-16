import { requireDashboardAccess } from "@/lib/permissions/page-protection";

export default async function MerchantsPage() {
  // Check if user has access to merchant dashboard
  await requireDashboardAccess("MERCHANT");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Merchant Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Manage merchants, stores, menus, orders, and settlements
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-gray-500">Merchant dashboard functionality coming soon...</p>
      </div>
    </div>
  );
}
