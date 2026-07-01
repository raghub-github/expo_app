import { getSupabase } from "../../lib/supabase.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";

const TABLE = "customer_menu_item_bookmarks";

function isTableMissingError(error: { code?: string; message?: string }): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  const code = error?.code ?? "";
  return (
    code === "42P01" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("relation")
  );
}

export type BookmarkedMenuItemDto = {
  storeId: string;
  menuItemId: number;
  itemId: string;
  name: string;
  imageUrl: string | null;
  price: number;
  isVeg: boolean;
  storeName: string;
};

export async function checkMenuItemBookmark(
  customerId: number,
  menuItemId: number
): Promise<boolean> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from(TABLE)
      .select("id")
      .eq("customer_id", customerId)
      .eq("menu_item_id", menuItemId)
      .maybeSingle();
    if (error) {
      if (isTableMissingError(error)) return false;
      throw error;
    }
    return data != null;
  } catch (err) {
    if (err && typeof err === "object" && isTableMissingError(err as { code?: string; message?: string })) {
      return false;
    }
    throw err;
  }
}

export async function listBookmarkedMenuItems(
  customerId: number,
  storePublicId?: string | null
): Promise<BookmarkedMenuItemDto[]> {
  try {
    const supabase = getSupabase();
    const { data: bookmarkRows, error } = await supabase
      .from(TABLE)
      .select("menu_item_id, store_id")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) {
      if (isTableMissingError(error)) return [];
      throw error;
    }
    if (!bookmarkRows?.length) return [];

    const menuItemIds = bookmarkRows
      .map((row) => Number((row as { menu_item_id?: number }).menu_item_id))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (menuItemIds.length === 0) return [];

    const { data: menuRows, error: menuErr } = await supabase
      .from("merchant_menu_items")
      .select("id, item_id, item_name, item_image_url, selling_price, food_type, store_id")
      .in("id", menuItemIds)
      .eq("is_deleted", false)
      .eq("is_locked_by_plan", false);
    if (menuErr) {
      if (isTableMissingError(menuErr)) return [];
      throw menuErr;
    }

    const items = (menuRows ?? []) as Array<{
      id: number;
      item_id?: string | null;
      item_name?: string | null;
      item_image_url?: string | null;
      selling_price?: string | number | null;
      food_type?: string | null;
      store_id?: number | null;
    }>;

    const storeInternalIds = [
      ...new Set(
        items
          .map((row) => Number(row.store_id))
          .filter((id) => Number.isFinite(id) && id > 0)
      ),
    ];
    if (storeInternalIds.length === 0) return [];

    const { data: storeRows, error: storeErr } = await supabase
      .from("merchant_stores")
      .select("id, store_id, store_name, store_display_name")
      .in("id", storeInternalIds);
    if (storeErr) {
      if (isTableMissingError(storeErr)) return [];
      throw storeErr;
    }

    const storeByInternalId = new Map(
      (storeRows ?? []).map((row) => {
        const r = row as {
          id?: number;
          store_id?: string;
          store_name?: string;
          store_display_name?: string | null;
        };
        return [Number(r.id), r] as const;
      })
    );

    const menuById = new Map(items.map((row) => [Number(row.id), row]));

    const out: BookmarkedMenuItemDto[] = [];
    for (const bookmark of bookmarkRows) {
      const menuItemId = Number((bookmark as { menu_item_id?: number }).menu_item_id);
      const menu = menuById.get(menuItemId);
      if (!menu) continue;

      const storeInternalId = Number(menu.store_id);
      const store = storeByInternalId.get(storeInternalId);
      if (!store?.store_id) continue;

      if (storePublicId?.trim() && store.store_id !== storePublicId.trim()) continue;

      const price = parseFloat(String(menu.selling_price ?? ""));
      if (!Number.isFinite(price)) continue;

      out.push({
        storeId: store.store_id,
        menuItemId,
        itemId: String(menu.item_id ?? menuItemId),
        name: String(menu.item_name ?? "Item"),
        imageUrl: toAbsoluteClientMediaUrl(menu.item_image_url ?? null),
        price,
        isVeg: (menu.food_type ?? "").toLowerCase().includes("veg"),
        storeName: (store.store_display_name ?? store.store_name ?? "Restaurant").trim(),
      });
    }

    return out;
  } catch (err) {
    if (err && typeof err === "object" && isTableMissingError(err as { code?: string; message?: string })) {
      return [];
    }
    throw err;
  }
}

export async function setMenuItemBookmark(
  customerId: number,
  storeInternalId: number,
  menuItemId: number,
  saved: boolean
): Promise<{ saved: boolean }> {
  try {
    const supabase = getSupabase();
    if (saved) {
      const { error } = await supabase.from(TABLE).upsert(
        {
          customer_id: customerId,
          menu_item_id: menuItemId,
          store_id: storeInternalId,
        },
        { onConflict: "customer_id,menu_item_id" }
      );
      if (error) {
        if (isTableMissingError(error)) return { saved: false };
        throw error;
      }
      return { saved: true };
    }

    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("customer_id", customerId)
      .eq("menu_item_id", menuItemId);
    if (error) {
      if (isTableMissingError(error)) return { saved: false };
      throw error;
    }
    return { saved: false };
  } catch (err) {
    if (err && typeof err === "object" && isTableMissingError(err as { code?: string; message?: string })) {
      return { saved: false };
    }
    throw err;
  }
}
