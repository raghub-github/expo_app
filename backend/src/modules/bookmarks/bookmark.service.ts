import { getSupabase } from "../../lib/supabase.js";

const TABLE = "customer_store_bookmarks";

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

/**
 * Check if a customer has bookmarked a store.
 * customerId = numeric customers.id from main app DB; storeId = numeric merchant_stores.id.
 * Returns false if table is missing (run merchant_db migration 0047).
 */
export async function checkBookmark(customerId: number, storeId: number): Promise<boolean> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from(TABLE)
      .select("id")
      .eq("customer_id", customerId)
      .eq("store_id", storeId)
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

/**
 * Public merchant store_id strings bookmarked by this customer.
 */
export async function listBookmarkedStorePublicIds(customerId: number): Promise<string[]> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from(TABLE)
      .select("store_id")
      .eq("customer_id", customerId);
    if (error) {
      if (isTableMissingError(error)) return [];
      throw error;
    }
    const internalIds = (data ?? [])
      .map((row) => Number((row as { store_id?: number }).store_id))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (internalIds.length === 0) return [];

    const { data: stores, error: storeErr } = await supabase
      .from("merchant_stores")
      .select("store_id")
      .in("id", internalIds);
    if (storeErr) {
      if (isTableMissingError(storeErr)) return [];
      throw storeErr;
    }
    return (stores ?? [])
      .map((row) => (row as { store_id?: string }).store_id)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  } catch (err) {
    if (err && typeof err === "object" && isTableMissingError(err as { code?: string; message?: string })) {
      return [];
    }
    throw err;
  }
}

/**
 * Set bookmark state: insert if saved, delete if not.
 * Returns { saved: false } if table is missing (run merchant_db migration 0047).
 */
export async function setBookmark(
  customerId: number,
  storeId: number,
  saved: boolean
): Promise<{ saved: boolean }> {
  try {
    const supabase = getSupabase();
    if (saved) {
      const { error } = await supabase.from(TABLE).upsert(
        { customer_id: customerId, store_id: storeId },
        { onConflict: "customer_id,store_id" }
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
      .eq("store_id", storeId);
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
