import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMenuItemOosModePatch } from "@/lib/merchant-menu-item-stock";

type OosRow = {
  id: number;
  out_of_stock_manual: boolean | null;
  out_of_stock_until: string | null;
  out_of_stock_updated_at: string | null;
};

/**
 * Order reject flows pass merchant_menu_items.id (numeric PK); menu page passes item_id string.
 * Accept either identifier for the same store.
 */
export async function updateMerchantMenuItemOutOfStock(
  supabase: SupabaseClient,
  storeId: number,
  rawId: string | number,
  patch: { manual: boolean; until: Date | null },
  updatedAt: string
): Promise<{ data: OosRow | null; error: { message: string } | null }> {
  const idStr = String(rawId ?? "").trim();
  if (!idStr) return { data: null, error: { message: "item_id required" } };

  const itemPatch = buildMenuItemOosModePatch(patch.manual, patch.until, updatedAt);
  const selectCols = "id, out_of_stock_manual, out_of_stock_until, out_of_stock_updated_at";

  const byItemId = await supabase
    .from("merchant_menu_items")
    .update(itemPatch)
    .eq("store_id", storeId)
    .eq("item_id", idStr)
    .select(selectCols)
    .maybeSingle();

  if (byItemId.error) return { data: null, error: byItemId.error };
  if (byItemId.data) return { data: byItemId.data as OosRow, error: null };

  const pk = Number(rawId);
  if (!Number.isFinite(pk) || pk <= 0) {
    return { data: null, error: null };
  }

  const byPk = await supabase
    .from("merchant_menu_items")
    .update(itemPatch)
    .eq("store_id", storeId)
    .eq("id", pk)
    .select(selectCols)
    .maybeSingle();

  if (byPk.error) return { data: null, error: byPk.error };
  return { data: (byPk.data as OosRow | null) ?? null, error: null };
}
