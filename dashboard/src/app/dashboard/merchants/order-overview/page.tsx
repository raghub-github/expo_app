import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { OrderOverviewClient } from "./OrderOverviewClient";

export default async function OrderOverviewPage() {
  await requireDashboardAccess("MERCHANT");
  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <OrderOverviewClient />
    </div>
  );
}
