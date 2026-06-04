import { refundFieldsFromEngineResult } from "@gatimitra/financial-rules";

export { refundFieldsFromEngineResult };

/** @deprecated Refund amounts must come from Financial Rule Engine execution. */
export function resolveOrderCancellationRefund(input: {
  engineResult?: Record<string, unknown>;
}): { refundStatus: string; refundAmount: number | null } {
  if (input.engineResult) return refundFieldsFromEngineResult(input.engineResult);
  return { refundStatus: "no_refund", refundAmount: null };
}
