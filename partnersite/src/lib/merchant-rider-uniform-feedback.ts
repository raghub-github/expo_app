import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadMerchantRiderUniformByOrderCoreIds(
  db: SupabaseClient,
  orderCoreIds: number[]
): Promise<Map<number, boolean | null>> {
  const out = new Map<number, boolean | null>();
  if (orderCoreIds.length === 0) return out;

  const { data, error } = await db
    .from("order_rider_assignments")
    .select(
      "order_core_id, order_id, merchant_rider_in_uniform, is_active, assignment_sequence, created_at"
    )
    .or(
      `order_core_id.in.(${orderCoreIds.join(",")}),order_id.in.(${orderCoreIds.join(",")})`
    )
    .order("is_active", { ascending: false })
    .order("assignment_sequence", { ascending: false })
    .order("created_at", { ascending: false });

  if (error || !data?.length) return out;

  const seen = new Set<number>();
  for (const row of data as Array<{
    order_core_id: number | null;
    order_id: number | null;
    merchant_rider_in_uniform: boolean | null;
  }>) {
    const coreId = Number(row.order_core_id ?? row.order_id);
    if (!Number.isFinite(coreId) || seen.has(coreId)) continue;
    if (row.merchant_rider_in_uniform == null) continue;
    seen.add(coreId);
    out.set(coreId, Boolean(row.merchant_rider_in_uniform));
  }

  return out;
}

export async function saveMerchantRiderUniformFeedback(
  db: SupabaseClient,
  orderCoreId: number,
  riderId: number | null,
  inUniform: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();

  let query = db
    .from("order_rider_assignments")
    .update({
      merchant_rider_in_uniform: inUniform,
      merchant_uniform_reported_at: now,
      updated_at: now,
    })
    .or(`order_core_id.eq.${orderCoreId},order_id.eq.${orderCoreId}`);

  if (riderId != null && Number.isFinite(riderId)) {
    query = query.eq("rider_id", riderId);
  }

  const { data, error } = await query
    .select("id")
    .order("is_active", { ascending: false })
    .order("assignment_sequence", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data?.length) {
    return { ok: false, error: "No rider assignment found for this order" };
  }
  return { ok: true };
}
