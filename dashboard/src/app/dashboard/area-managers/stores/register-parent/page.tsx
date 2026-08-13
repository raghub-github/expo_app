import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { RegisterParentClient } from "./RegisterParentClient";

export default async function RegisterParentPage() {
  await requireDashboardAccess("AREA_MANAGER");
  return <RegisterParentClient />;
}
