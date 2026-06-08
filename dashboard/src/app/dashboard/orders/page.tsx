import {
  requireSuperAdminAccess,
  getDefaultOrdersDashboardHref,
} from "@/lib/permissions/page-protection";
import { redirect } from "next/navigation";

export default async function OrdersPage() {
  const defaultDashboard = await getDefaultOrdersDashboardHref();

  if (defaultDashboard) {
    redirect(defaultDashboard);
  }

  // No order dashboard access — super admins still land on food orders.
  await requireSuperAdminAccess();
  redirect("/dashboard/orders/food");
}
