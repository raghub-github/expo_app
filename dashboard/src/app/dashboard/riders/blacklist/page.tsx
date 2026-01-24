import { requireDashboardAccess } from "@/lib/permissions/page-protection";

export default async function RiderBlacklistPage() {
  await requireDashboardAccess("RIDER");

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="w-full">
        <p className="text-sm sm:text-base text-gray-600">View blacklisting and whitelisting history and status for riders</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="space-y-4">
          <div className="border-b pb-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Blacklisting Status</h2>
            <p className="text-gray-500">Blacklisting history and status</p>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Whitelisting Status</h2>
            <p className="text-gray-500">Whitelisting history and status</p>
          </div>
        </div>
      </div>
    </div>
  );
}
