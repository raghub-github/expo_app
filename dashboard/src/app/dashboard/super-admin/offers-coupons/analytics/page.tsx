import { requireSuperAdminAccess } from "@/lib/permissions/page-protection";
import PlatformOfferAnalyticsPage from "./PlatformOfferAnalyticsClient";

export const metadata = {
  title: "Platform offer analytics | Super Admin",
};

export default async function AnalyticsPage() {
  await requireSuperAdminAccess();
  return <PlatformOfferAnalyticsPage />;
}
