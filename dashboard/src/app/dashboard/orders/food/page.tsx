import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import FoodOrdersClient from "./FoodOrdersClient";

export default async function FoodOrdersPage() {
  await requireDashboardAccess("ORDER_FOOD");

  return <FoodOrdersClient />;
}
