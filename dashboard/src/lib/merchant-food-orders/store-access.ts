import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById, type MerchantStoreRow } from "@/lib/db/operations/merchant-stores";

export type MerchantStoreAccessResult =
  | { error: string; status: 401 | 403 | 404 }
  | { store: MerchantStoreRow & { parent?: unknown } };

/** Dashboard store URL id = merchant_stores.id (internal bigint). */
export async function ensureMerchantStoreDashboardAccess(
  storeIdParam: number
): Promise<MerchantStoreAccessResult> {
  if (!Number.isFinite(storeIdParam)) {
    return { error: "Invalid store id", status: 404 };
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.email) {
    return { error: "Not authenticated", status: 401 };
  }
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) {
    return { error: "Merchant dashboard access required", status: 403 };
  }
  let areaManagerId: number | null = null;
  if (!(await isSuperAdmin(user.id, user.email))) {
    const systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }
  }
  const store = await getMerchantStoreById(storeIdParam, areaManagerId);
  if (!store) {
    return { error: "Store not found", status: 404 };
  }
  return { store };
}
