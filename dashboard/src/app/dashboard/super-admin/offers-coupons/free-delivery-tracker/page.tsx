import { requireSuperAdminAccess } from "@/lib/permissions/page-protection";
import FreeDeliveryTrackerClient from "./FreeDeliveryTrackerClient";

export const metadata = {
  title: "Free Delivery tracker | Super Admin",
};

export default async function FreeDeliveryTrackerPage() {
  await requireSuperAdminAccess();
  return <FreeDeliveryTrackerClient />;
}
