import { requireSuperAdminAccess } from "@/lib/permissions/page-protection";
import { CheckoutCouponEditorClient } from "@/components/super-admin/CheckoutCouponEditorClient";

export const metadata = {
  title: "Edit checkout coupon | Super Admin",
};

export default async function EditCheckoutCouponPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdminAccess();
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id < 1) {
    return (
      <div className="p-8 text-sm text-rose-700">
        Invalid coupon id.{" "}
        <a href="/dashboard/super-admin/offers-coupons" className="underline">
          Back
        </a>
      </div>
    );
  }
  return <CheckoutCouponEditorClient mode="edit" couponId={id} />;
}
