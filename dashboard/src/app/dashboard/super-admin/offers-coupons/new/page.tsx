import { requireSuperAdminAccess } from "@/lib/permissions/page-protection";
import { PlatformOfferEditorClient } from "@/components/super-admin/PlatformOfferEditorClient";

export const metadata = {
  title: "Create platform offer | Super Admin",
};

export default async function NewPlatformOfferPage() {
  await requireSuperAdminAccess();
  return <PlatformOfferEditorClient mode="create" />;
}
