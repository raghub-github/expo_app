import { getAuthenticatedApiUser } from "@/lib/auth/api-session";
import { resolveSystemUserForSupabaseAuth } from "@/lib/auth/user-mapping";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantStoreById, type MerchantStoreRow } from "@/lib/db/operations/merchant-stores";

export type MerchantApiActor =
  | { ok: true; id: string; email: string }
  | { ok: false; error: string; status: 401 | 503 };

/**
 * Cookie-safe merchant actor (avoids raw getUser() 401/503 races under parallel loads).
 */
export async function resolveMerchantApiActor(): Promise<MerchantApiActor> {
  const auth = await getAuthenticatedApiUser();
  if (!auth.ok) {
    if (auth.status === 503 || auth.status === 499) {
      return { ok: false, error: "Service temporarily unavailable", status: 503 };
    }
    return { ok: false, error: auth.body.error || "Not authenticated", status: 401 };
  }
  const authUser = auth.user;
  let email = (authUser.email ?? "").trim();
  if (!email) {
    const mapped = await resolveSystemUserForSupabaseAuth(authUser.id, undefined);
    email = (mapped?.email ?? "").trim();
  }
  if (!email && !(await isSuperAdmin(authUser.id, undefined))) {
    return { ok: true, id: authUser.id, email: "" };
  }
  return { ok: true, id: authUser.id, email };
}

export type MerchantStoreAccessResult =
  | { error: string; status: 401 | 403 | 404 | 503 }
  | { store: MerchantStoreRow & { parent?: unknown }; user: { id: string; email: string } };

/** Dashboard store URL id = merchant_stores.id (internal bigint). */
export async function ensureMerchantStoreDashboardAccess(
  storeIdParam: number
): Promise<MerchantStoreAccessResult> {
  if (!Number.isFinite(storeIdParam)) {
    return { error: "Invalid store id", status: 404 };
  }

  const actor = await resolveMerchantApiActor();
  if (!actor.ok) {
    return { error: actor.error, status: actor.status };
  }

  const allowed =
    (await isSuperAdmin(actor.id, actor.email)) ||
    (await hasDashboardAccessByAuth(actor.id, actor.email, "MERCHANT"));
  if (!allowed) {
    return { error: "Merchant dashboard access required", status: 403 };
  }

  // Org-wide when MERCHANT_VIEW / admin merchant access; otherwise AM assignment scope.
  const areaManagerId = await resolveMerchantListAreaManagerId({
    supabaseAuthId: actor.id,
    email: actor.email,
  });
  const store = await getMerchantStoreById(storeIdParam, areaManagerId);
  if (!store) {
    return { error: "Store not found", status: 404 };
  }
  return { store, user: { id: actor.id, email: actor.email } };
}
