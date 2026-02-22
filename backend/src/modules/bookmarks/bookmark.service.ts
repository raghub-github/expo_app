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
