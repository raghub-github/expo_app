import { requireDashboardAccess } from "@/lib/permissions/page-protection";

export default async function PaymentsPage() {
  // Check if user has access to payment dashboard (super admin only)
  await requireDashboardAccess("PAYMENT");

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="w-full">
        <p className="text-sm sm:text-base text-gray-600">
          Manage rider and merchant withdrawals and payments
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-gray-500">Payment management functionality coming soon...</p>
      </div>
    </div>
  );
}
