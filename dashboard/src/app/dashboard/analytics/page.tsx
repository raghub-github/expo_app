import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { AnalyticsHubClient } from "@/components/analytics/AnalyticsHubClient";

export default async function AnalyticsPage() {
  await requireDashboardAccess("ANALYTICS");
  return <AnalyticsHubClient />;
}
