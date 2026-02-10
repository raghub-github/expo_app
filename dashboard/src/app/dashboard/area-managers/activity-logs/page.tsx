import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { AreaManagerActivityLogsClient } from "./AreaManagerActivityLogsClient";

export default async function AreaManagerActivityLogsPage() {
  await requireDashboardAccess("AREA_MANAGER");
  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <AreaManagerActivityLogsClient />
    </div>
  );
}
