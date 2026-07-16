/**
 * /dashboard/merchants/subscription-refunds
 *
 * Access model:
 *   - PAGE VIEW: MERCHANT dashboard access (agents who work with merchants
 *     can see the payment list — read-only for those without refund action).
 *   - REFUND ACTION: MERCHANT dashboard access + REFUND action permission
 *     (or super_admin). Agents without REFUND cannot see or click the button.
 *
 * The client component receives `canRefund` as a prop and hides the button
 * for view-only agents. The API proxies re-check permission so the client
 * hint cannot be spoofed.
 */
import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { canPerformActionByAuth } from "@/lib/permissions/actions";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SubscriptionRefundsClient } from "@/components/merchants/SubscriptionRefundsClient";

export default async function MerchantSubscriptionRefundsPage() {
  // Gate: MERCHANT dashboard access (any agent with merchant permissions).
  // Super admins are auto-allowed inside requireDashboardAccess.
  await requireDashboardAccess("MERCHANT");

  // Server-side compute `canRefund` so the client renders correctly on first
  // paint. Client re-fetches this via /api/... anyway, but SSR avoids a flash
  // of a wrong button state on load.
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let canRefund = false;
  let callerIsSuperAdmin = false;
  if (user?.email) {
    callerIsSuperAdmin = await isSuperAdmin(user.id, user.email);
    canRefund =
      callerIsSuperAdmin ||
      (await canPerformActionByAuth(user.id, user.email, "MERCHANT", "REFUND"));
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden px-4 pt-1 pb-4 sm:px-6 sm:pt-2">
      <SubscriptionRefundsClient
        initialCanRefund={canRefund}
        initialCallerIsSuperAdmin={callerIsSuperAdmin}
      />
    </div>
  );
}
