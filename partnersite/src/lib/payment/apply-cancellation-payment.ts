import { executeOrderCancellationFinancials } from "@/lib/financial-rule-executor";

export async function applyPaymentCancellationPayment(input: {
  orderCoreId: number;
  ordersFoodId: number;
  merchantStoreId: number;
  previousStatus: string;
  cancelledByType: string;
  orderGross: number;
  coreOrderId?: string | null;
  serviceType?: string;
  cancellationReasonId?: number | null;
}) {
  const result = await executeOrderCancellationFinancials({
    orderCoreId: input.orderCoreId,
    ordersFoodId: input.ordersFoodId,
    coreOrderId: input.coreOrderId,
    merchantStoreId: input.merchantStoreId,
    previousStatus: input.previousStatus,
    cancelledByType: input.cancelledByType,
    orderGross: input.orderGross,
    serviceType: input.serviceType,
    cancellationReasonId: input.cancellationReasonId,
  });
  return { applied: result.applied, result: result.raw, error: result.error };
}

export {
  executeOrderCancellationFinancials,
  executeRtoFinancials,
  lookupOrderContext,
} from "@/lib/financial-rule-executor";
