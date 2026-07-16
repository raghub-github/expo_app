/**
 * /dashboard/merchants/subscription-refunds
 *
 * Admin view: browse merchant subscription payments and issue refunds.
 * Auth: PAYMENT dashboard access (which is super-admin-only per page-
 * protection.ts:120). Any other role → redirect.
 */
import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { SubscriptionRefundsClient } from "@/components/merchants/SubscriptionRefundsClient";

export default async function MerchantSubscriptionRefundsPage() {
  await requireDashboardAccess("PAYMENT");

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden px-4 pt-1 pb-4 sm:px-6 sm:pt-2">
      <SubscriptionRefundsClient />
    </div>
  );
}
