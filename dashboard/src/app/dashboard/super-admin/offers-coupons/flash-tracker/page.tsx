import { requireSuperAdminAccess } from "@/lib/permissions/page-protection";
import FlashSaleTrackerClient from "./FlashSaleTrackerClient";

export const metadata = {
  title: "Flash Sale tracker | Super Admin",
};

export default async function FlashSaleTrackerPage() {
  await requireSuperAdminAccess();
  return <FlashSaleTrackerClient />;
}
