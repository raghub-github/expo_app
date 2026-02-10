import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { AreaManagerRidersClient } from "./AreaManagerRidersClient";

export default async function AreaManagerRidersPage() {
  await requireDashboardAccess("AREA_MANAGER");
  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <AreaManagerRidersClient />
    </div>
  );
}
