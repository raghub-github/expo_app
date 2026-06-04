import { getSql } from "../db/client.js";
import {
  executeOrderCancellationFinancials,
  isFinancialRuleEngineAvailable,
} from "./financial-rule-executor.js";

export type ApplyCancellationPaymentInput = {
  orderCoreId: number;
  ordersFoodId: number;
  merchantStoreId: number;
  previousStatus: string;
  cancelledByType: string;
  orderGross: number;
  coreOrderId?: string | null;
  serviceType?: string;
  cancellationReasonId?: number | null;
  actorSystemUserId?: number | null;
  wasDelivered?: boolean;
};

/** @deprecated Use executeOrderCancellationFinancials directly. */
export async function applyPaymentCancellationPayment(
  input: ApplyCancellationPaymentInput,
  sql = getSql()
) {
  const result = await executeOrderCancellationFinancials(
    {
      orderCoreId: input.orderCoreId,
      ordersFoodId: input.ordersFoodId,
      coreOrderId: input.coreOrderId,
      merchantStoreId: input.merchantStoreId,
      previousStatus: input.previousStatus,
      cancelledByType: input.cancelledByType,
      orderGross: input.orderGross,
      serviceType: input.serviceType,
      cancellationReasonId: input.cancellationReasonId,
      actorSystemUserId: input.actorSystemUserId,
      wasDelivered: input.wasDelivered,
    },
    sql
  );
  return {
    applied: result.applied,
    result: result.raw,
    error: result.error,
  };
}

export { isFinancialRuleEngineAvailable, executeOrderCancellationFinancials };
