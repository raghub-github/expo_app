import { requireSuperAdminAccess } from "@/lib/permissions/page-protection";
import { CheckoutCouponEditorClient } from "@/components/super-admin/CheckoutCouponEditorClient";

export const metadata = {
  title: "Create checkout coupon | Super Admin",
};

export default async function NewCheckoutCouponPage() {
  await requireSuperAdminAccess();
  return <CheckoutCouponEditorClient mode="create" />;
}
