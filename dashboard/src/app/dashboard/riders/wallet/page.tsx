import { requireDashboardAccess } from "@/lib/permissions/page-protection";

export default async function RiderWalletPage() {
  await requireDashboardAccess("RIDER");

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="w-full">
        <p className="text-sm sm:text-base text-gray-600">View wallet history, balance, and earnings</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="space-y-4">
          <div className="border-b pb-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Wallet Balance</h2>
            <p className="text-gray-500">Current wallet balance and amount details</p>
          </div>
          <div className="border-b pb-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Wallet History</h2>
            <p className="text-gray-500">Transaction history and wallet activity</p>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Earnings</h2>
            <p className="text-gray-500">Earnings and performance metrics</p>
          </div>
        </div>
      </div>
    </div>
  );
}
