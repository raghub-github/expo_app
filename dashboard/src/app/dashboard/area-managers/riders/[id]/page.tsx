import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { AreaManagerRiderDetailClient } from "./AreaManagerRiderDetailClient";

export default async function AreaManagerRiderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireDashboardAccess("AREA_MANAGER");
  const { id } = await params;
  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <AreaManagerRiderDetailClient riderId={id} />
    </div>
  );
}
