import { requireDashboardAccess } from "@/lib/permissions/page-protection";

export default async function TicketsPage() {
  // Check if user has access to ticket dashboard
  await requireDashboardAccess("TICKET");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Ticket Resolution</h1>
        <p className="mt-2 text-gray-600">
          Manage and resolve support tickets
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-gray-500">Ticket resolution functionality coming soon...</p>
      </div>
    </div>
  );
}
