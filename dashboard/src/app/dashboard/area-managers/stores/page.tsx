import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { AreaManagerStoresClient } from "./AreaManagerStoresClient";

export default async function AreaManagerStoresPage() {
  await requireDashboardAccess("AREA_MANAGER");
  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <AreaManagerStoresClient />
    </div>
  );
}
