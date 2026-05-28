import type { SupabaseClient } from "@supabase/supabase-js";
import { getSql } from "@/lib/db/client";
import { settleMerchantOrderOnDelivered } from "@/lib/payment/settle-order-on-delivered";

export type CreditOrderEarningInput = {
  merchantStoreId: number;
  ordersFoodId: number;
  ordersCoreId: number;
  amount: number;
  newStatus: string;
  previousStatus: string;
};

/** Credits merchant via super-admin payment rules (0239) when available. */
export async function creditMerchantOrderEarningOnDelivered(
  db: SupabaseClient,
  input: CreditOrderEarningInput
): Promise<{ credited: boolean; ledgerId?: number; error?: string }> {
  void db;
  const sql = getSql();
  const result = await settleMerchantOrderOnDelivered(sql, {
    merchantStoreId: input.merchantStoreId,
    ordersFoodId: input.ordersFoodId,
    ordersCoreId: input.ordersCoreId,
    merchantGross: input.amount,
    newStatus: input.newStatus,
    previousStatus: input.previousStatus,
  });
  return {
    credited: result.credited,
    ledgerId: result.ledgerId,
    error: result.error,
  };
}
