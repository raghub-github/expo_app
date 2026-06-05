import { settleMerchantOrderOnDelivered } from "./payment-settlement.js";

export type CreditOrderEarningInput = {
  merchantStoreId: number;
  ordersFoodId: number;
  ordersCoreId: number;
  amount: number;
  newStatus: string;
  previousStatus: string;
};

export async function creditMerchantOrderEarningOnDelivered(
  input: CreditOrderEarningInput
): Promise<{ credited: boolean; error?: string }> {
  return settleMerchantOrderOnDelivered({
    merchantStoreId: input.merchantStoreId,
    ordersFoodId: input.ordersFoodId,
    ordersCoreId: input.ordersCoreId,
    merchantGross: input.amount,
    newStatus: input.newStatus,
    previousStatus: input.previousStatus,
  });
}
