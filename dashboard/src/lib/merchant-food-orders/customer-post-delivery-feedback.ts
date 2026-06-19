import type { SupabaseClient } from "@supabase/supabase-js";

export type CustomerPackagingFeedback = "good" | "not_good";

export async function loadCustomerRiderUniformByOrderCoreIds(
  db: SupabaseClient,
  orderCoreIds: number[]
): Promise<Map<number, boolean | null>> {
  const out = new Map<number, boolean | null>();
  if (orderCoreIds.length === 0) return out;

  const { data, error } = await db
    .from("order_rider_assignments")
    .select(
      "order_core_id, order_id, customer_rider_in_uniform, is_active, assignment_sequence, created_at"
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
    customer_rider_in_uniform: boolean | null;
  }>) {
    const coreId = Number(row.order_core_id ?? row.order_id);
    if (!Number.isFinite(coreId) || seen.has(coreId)) continue;
    if (row.customer_rider_in_uniform == null) continue;
    seen.add(coreId);
    out.set(coreId, Boolean(row.customer_rider_in_uniform));
  }

  return out;
}
