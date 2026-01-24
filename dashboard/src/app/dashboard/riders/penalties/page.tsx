import { requireDashboardAccess } from "@/lib/permissions/page-protection";

export default async function RiderPenaltiesPage() {
  await requireDashboardAccess("RIDER");

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="w-full">
        <p className="text-sm sm:text-base text-gray-600">View and manage rider penalties and violations</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-gray-500">Penalties functionality coming soon...</p>
      </div>
    </div>
  );
}
