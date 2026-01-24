import { requireDashboardAccess } from "@/lib/permissions/page-protection";

export default async function RiderIncentivesPage() {
  await requireDashboardAccess("RIDER");

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="w-full">
        <p className="text-sm sm:text-base text-gray-600">View and manage rider incentives, bonuses, and surge pricing</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="space-y-4">
          <div className="border-b pb-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Incentives</h2>
            <p className="text-gray-500">Incentives and bonuses</p>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Surges & Offers</h2>
            <p className="text-gray-500">Surge pricing and special offers</p>
          </div>
        </div>
      </div>
    </div>
  );
}
