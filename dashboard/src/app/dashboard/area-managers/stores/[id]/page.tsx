import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { AreaManagerStoreDetailClient } from "./AreaManagerStoreDetailClient";

export default async function AreaManagerStoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireDashboardAccess("AREA_MANAGER");
  const { id } = await params;
  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <AreaManagerStoreDetailClient storeId={id} />
    </div>
  );
}
