import type { SupabaseClient } from '@supabase/supabase-js';
import { client as pgClient } from '@/lib/drizzle';
import { settleMerchantOrderOnDelivered } from '@/lib/payment/settle-order-on-delivered';

export type CreditOrderEarningInput = {
  merchantStoreId: number;
  ordersFoodId: number;
  ordersCoreId: number;
  amount: number;
  newStatus: string;
  previousStatus: string;
};

/** Credits via super-admin payment rules (0239) when migration is applied. */
export async function creditMerchantOrderEarningOnDelivered(
  _db: SupabaseClient,
  input: CreditOrderEarningInput
): Promise<{ credited: boolean; ledgerId?: number; error?: string }> {
  const result = await settleMerchantOrderOnDelivered(pgClient, {
    merchantStoreId: input.merchantStoreId,
    ordersFoodId: input.ordersFoodId,
    ordersCoreId: input.ordersCoreId,
    merchantGross: input.amount,
    newStatus: input.newStatus,
    previousStatus: input.previousStatus,
  });
  return { credited: result.credited, ledgerId: result.ledgerId, error: result.error };
}
