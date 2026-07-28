import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { AmResubmitOnboardingClient } from "./AmResubmitOnboardingClient";

export default async function AmResubmitOnboardingPage() {
  await requireDashboardAccess("AREA_MANAGER");
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <AmResubmitOnboardingClient />
    </div>
  );
}
