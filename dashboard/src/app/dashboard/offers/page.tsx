import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { OffersClient } from "@/components/offers/OffersClient";

export default async function OffersPage() {
  await requireDashboardAccess("OFFER");
  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <OffersClient />
    </div>
  );
}
