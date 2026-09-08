import { getSupabase } from "../../lib/supabase.js";

const TABLE = "customer_hidden_stores";

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

export async function listHiddenStorePublicIds(customerId: number): Promise<string[]> {
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

export async function setHiddenStore(
  customerId: number,
  storeId: number,
  hidden: boolean
): Promise<{ hidden: boolean }> {
  try {
    const supabase = getSupabase();
    if (hidden) {
      const { error } = await supabase.from(TABLE).upsert(
        { customer_id: customerId, store_id: storeId },
        { onConflict: "customer_id,store_id" }
      );
      if (error) {
        if (isTableMissingError(error)) return { hidden: false };
        throw error;
      }
      return { hidden: true };
    }
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("customer_id", customerId)
      .eq("store_id", storeId);
    if (error) {
      if (isTableMissingError(error)) return { hidden: false };
      throw error;
    }
    return { hidden: false };
  } catch (err) {
    if (err && typeof err === "object" && isTableMissingError(err as { code?: string; message?: string })) {
      return { hidden: false };
    }
    throw err;
  }
}
