import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import {
  hasAccessPoint,
  isSuperAdmin,
} from "@/lib/permissions/engine";

/**
 * Resolve area_manager_id scope for Merchant Dashboard list/search APIs.
 *
 * - Super admin / Admin Merchant access / MERCHANT_VIEW → no AM filter (org-wide lookup)
 * - Otherwise, if the user is an area manager → only their assigned stores
 *
 * MERCHANT_VIEW ("View Merchant Details") must be able to search any store ID
 * and open read-only store details, even when the actor is also an area manager.
 */
export async function resolveMerchantListAreaManagerId(args: {
  supabaseAuthId: string;
  email: string;
}): Promise<number | null> {
  const email = args.email?.trim();
  if (!email) return null;

  if (await isSuperAdmin(args.supabaseAuthId, email)) {
    return null;
  }

  const systemUser = await getSystemUserByEmail(email);
  if (!systemUser) return null;

  const canLookupAllMerchants =
    Boolean((systemUser as { can_toggle_portal?: boolean }).can_toggle_portal) ||
    (await hasAccessPoint(systemUser.id, "MERCHANT", "MERCHANT_VIEW")) ||
    (await hasAccessPoint(systemUser.id, "MERCHANT", "MERCHANT_ADMIN_MERCHANT_ACCESS"));

  if (canLookupAllMerchants) {
    return null;
  }

  const am = await getAreaManagerByUserId(systemUser.id);
  return am?.id ?? null;
}
