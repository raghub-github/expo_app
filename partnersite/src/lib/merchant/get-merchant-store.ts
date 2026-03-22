import type { SupabaseClient } from "@supabase/supabase-js";

/** Store row plus `merchant_parents.id` string for R2 (`docs/merchants/{id}/stores/{store_id}/...`). */
export type MerchantStoreForMedia = {
  id: number;
  store_id: string;
  parent_id: number;
  area_manager_id: number | null;
  parentPrimaryKeySegment: string;
};

/**
 * Resolve `area_managers.id` for the logged-in user when they map to `system_users` by email.
 * Used so assigned area managers can act on stores where `merchant_stores.area_manager_id` matches.
 */
export async function getAreaManagerRecordIdForAuthUser(
  db: SupabaseClient,
  email: string | null | undefined
): Promise<number | null> {
  const e = email?.trim();
  if (!e) return null;
  const { data: row, error } = await db
    .from("system_users")
    .select("id")
    .ilike("email", e)
    .maybeSingle();
  if (error || row == null || (row as { id?: unknown }).id == null) return null;
  const uid = (row as { id: number }).id;
  const { data: am, error: amErr } = await db
    .from("area_managers")
    .select("id")
    .eq("user_id", uid)
    .maybeSingle();
  if (amErr || am == null || (am as { id?: unknown }).id == null) return null;
  return Number((am as { id: number }).id);
}

/**
 * Load a merchant store by public `store_id` (e.g. GMMC1015) and enforce access:
 * - Parent merchant owns the store (`parent_id` matches session merchant), or
 * - User is the assigned area manager (`area_manager_id` on the store).
 */
export async function getMerchantStoreById(
  db: SupabaseClient,
  storePublicId: string,
  access: { merchantParentId: number | null; areaManagerId: number | null }
): Promise<MerchantStoreForMedia | null> {
  const sid = String(storePublicId || "").trim();
  if (!sid) return null;

  const { data: store, error } = await db
    .from("merchant_stores")
    .select("id, store_id, parent_id, area_manager_id")
    .eq("store_id", sid)
    .maybeSingle();

  if (error || !store) return null;

  const parentId = (store as { parent_id: number }).parent_id;
  const amOnStore = (store as { area_manager_id?: number | null }).area_manager_id;

  const parentOk =
    access.merchantParentId != null && parentId === access.merchantParentId;
  const amOk =
    access.areaManagerId != null &&
    amOnStore != null &&
    Number(amOnStore) === access.areaManagerId;

  if (!parentOk && !amOk) return null;

  return {
    id: (store as { id: number }).id,
    store_id: (store as { store_id: string }).store_id,
    parent_id: parentId,
    area_manager_id: amOnStore != null && amOnStore !== undefined ? Number(amOnStore) : null,
    parentPrimaryKeySegment: String(parentId),
  };
}
