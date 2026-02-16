import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { AreaManagerDashboardClient } from "./AreaManagerDashboardClient";

export default async function AreaManagersPage() {
  await requireDashboardAccess("AREA_MANAGER");
  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <AreaManagerDashboardClient />
    </div>
  );
}
