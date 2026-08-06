import { requireAnyDashboardAccess } from "@/lib/permissions/page-protection";
import { AreaManagerAvailabilityClient } from "@/app/dashboard/area-managers/availability/AreaManagerAvailabilityClient";

export default async function RxPage() {
  await requireAnyDashboardAccess();
  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <AreaManagerAvailabilityClient />
    </div>
  );
}
