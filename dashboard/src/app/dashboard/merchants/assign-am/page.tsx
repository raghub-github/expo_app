import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import AssignAreaManagerPageClient from "./AssignAreaManagerPageClient";

export default async function AssignAreaManagerPage() {
  await requireDashboardAccess("MERCHANT");
  return <AssignAreaManagerPageClient />;
}

