import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { AreaManagerAvailabilityClient } from "./AreaManagerAvailabilityClient";

export default async function AreaManagerAvailabilityPage() {
  await requireDashboardAccess("AREA_MANAGER");
  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <AreaManagerAvailabilityClient />
    </div>
  );
}
