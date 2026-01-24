import { requireSuperAdminAccess } from "@/lib/permissions/page-protection";

export default async function AgentsPage() {
  await requireSuperAdminAccess();
  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="w-full">
        <p className="text-sm sm:text-base text-gray-600">
          Track all agent actions and performance metrics
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-gray-500">Agent tracking functionality coming soon...</p>
      </div>
    </div>
  );
}
