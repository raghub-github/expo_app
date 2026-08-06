import { requireSuperAdminAccess } from "@/lib/permissions/page-protection";
import { PlatformOfferEditorClient } from "@/components/super-admin/PlatformOfferEditorClient";

export const metadata = {
  title: "Edit platform offer | Super Admin",
};

export default async function EditPlatformOfferPage({
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
        Invalid offer id.{" "}
        <a href="/dashboard/super-admin/offers-coupons" className="underline">
          Back
        </a>
      </div>
    );
  }
  return <PlatformOfferEditorClient mode="edit" offerId={id} />;
}
