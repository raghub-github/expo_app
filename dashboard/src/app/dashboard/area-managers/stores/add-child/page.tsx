import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { AddChildStoreClient } from "./AddChildStoreClient";

export default async function AddChildStorePage() {
  await requireDashboardAccess("AREA_MANAGER");
  return <AddChildStoreClient />;
}
