import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { OnboardingFailedListClient } from "./OnboardingFailedListClient";

export default async function OnboardingFailedPage() {
  await requireDashboardAccess("AREA_MANAGER");
  return <OnboardingFailedListClient />;
}
