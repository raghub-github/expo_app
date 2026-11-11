import { cookies } from "next/headers";
import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { MerchantsSearchClient } from "./MerchantsSearchClient";

export default async function MerchantsPage() {
  // Check if user has access to merchant dashboard
  await requireDashboardAccess("MERCHANT");
  const cookieStore = await cookies();
  const canTogglePortal = cookieStore.get("gm_portal_toggle_access")?.value === "1";

  return (
    <div className="merchants-typo flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden">
      <MerchantsSearchClient canTogglePortal={canTogglePortal} />
    </div>
  );
}
