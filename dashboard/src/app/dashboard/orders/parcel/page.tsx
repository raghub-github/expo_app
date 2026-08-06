import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import ParcelOrdersClient from "./ParcelOrdersClient";

export default async function ParcelOrdersPage() {
  await requireDashboardAccess("ORDER_PARCEL");
  return <ParcelOrdersClient />;
}
