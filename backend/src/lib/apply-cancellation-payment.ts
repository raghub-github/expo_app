import type { Sql } from "postgres";
import { getSql } from "../db/client.js";
import { resolvePaymentCancellationMilestone } from "./payment-cancellation-milestone.js";

export type ApplyCancellationPaymentInput = {
  orderCoreId: number;
  ordersFoodId: number;
  merchantStoreId: number;
  previousStatus: string;
  cancelledByType: string;
  orderGross: number;
  actorSystemUserId?: number | null;
};

export async function applyPaymentCancellationPayment(
  input: ApplyCancellationPaymentInput,
  sql: Sql = getSql()
): Promise<{ applied: boolean; result?: Record<string, unknown>; error?: string }> {
  const { orderMilestone, cancelledBy } = resolvePaymentCancellationMilestone({
    previousStatus: input.previousStatus,
    cancelledByType: input.cancelledByType,
  });

  const gross = Number(input.orderGross);
  if (!Number.isFinite(gross) || gross < 0) {
    return { applied: false, error: "invalid_order_gross" };
  }

  try {
    const rows = await sql`
      SELECT payment_apply_cancellation(
        ${input.orderCoreId}::bigint,
        ${input.ordersFoodId}::bigint,
        ${orderMilestone}::payment_order_milestone,
        ${cancelledBy}::payment_cancelled_by,
        ${gross}::numeric,
        ${input.actorSystemUserId ?? null}::bigint,
        ${`cancel:${input.orderCoreId}:${orderMilestone}:${cancelledBy ?? "any"}`}::text
      )::jsonb AS result
    `;
    const result = (rows[0] as { result?: Record<string, unknown> } | undefined)?.result;
    return { applied: Boolean(result?.ok), result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("payment_apply_cancellation") || msg.includes("does not exist")) {
      return { applied: false, error: "payment_engine_not_migrated" };
    }
    console.warn("[applyPaymentCancellationPayment]", msg);
    return { applied: false, error: msg };
  }
}
