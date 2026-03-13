import Link from "next/link";
import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { MerchantsSearchClient } from "./MerchantsSearchClient";

export default async function MerchantsPage() {
  // Check if user has access to merchant dashboard
  await requireDashboardAccess("MERCHANT");

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <div className="flex items-center justify-end gap-4">
        <Link
          href="/dashboard/merchants/menu-requests"
          className="text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          Menu change requests
        </Link>
      </div>
      <MerchantsSearchClient />
    </div>
  );
}
