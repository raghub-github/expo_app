import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { OffersClient } from "@/components/offers/OffersClient";

export default async function MerchantOffersPage() {
  await requireDashboardAccess("MERCHANT");
  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <OffersClient />
    </div>
  );
}
