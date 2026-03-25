import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { MerchantsSearchClient } from "./MerchantsSearchClient";

export default async function MerchantsPage() {
  // Check if user has access to merchant dashboard
  await requireDashboardAccess("MERCHANT");

  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <MerchantsSearchClient />
    </div>
  );
}
