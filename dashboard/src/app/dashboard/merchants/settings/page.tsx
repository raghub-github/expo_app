import { requireDashboardAccess } from "@/lib/permissions/page-protection";

export default async function MerchantSettingsPage() {
  await requireDashboardAccess("MERCHANT");
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
      <p className="mt-2 text-sm text-gray-500">Merchant settings and preferences. Configure store-level settings from a store dashboard.</p>
    </div>
  );
}
