import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import PersonRideOrdersClient from "./PersonRideOrdersClient";

export default async function PersonRideOrdersPage() {
  await requireDashboardAccess("ORDER_PERSON_RIDE");
  return <PersonRideOrdersClient />;
}
