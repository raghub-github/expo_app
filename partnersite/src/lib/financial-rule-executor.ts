import { client as pgClient } from "@/lib/drizzle";
import type { Sql } from "postgres";
import {
  type FinancialRuleExecutionInput,
  type FinancialRuleExecutionResult,
  buildIdempotencyKey,
  mapActorToTriggeredBy,
  parseEngineResult,
  resolvePaymentCancellationMilestone,
} from "@gatimitra/financial-rules";

export {
  mapActorToTriggeredBy,
  refundFieldsFromEngineResult,
  resolvePaymentCancellationMilestone,
} from "@gatimitra/financial-rules";

const sql = pgClient as unknown as Sql;

export async function isFinancialRuleEngineAvailable(): Promise<boolean> {
  try {
    const rows = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'gm_rule_master'
      ) AS ok
    `;
    return Boolean((rows[0] as { ok?: boolean })?.ok);
  } catch {
    return false;
  }
}

export async function executeFinancialRule(
  input: FinancialRuleExecutionInput
): Promise<FinancialRuleExecutionResult> {
  const gross = Number(input.orderGross);
  if (!Number.isFinite(gross) || gross < 0) return { applied: false, error: "invalid_order_gross" };

  const triggeredBy = mapActorToTriggeredBy(String(input.triggeredBy));
  const serviceType = String(input.serviceType ?? "FOOD").toUpperCase();
  const idempotencyKey =
    input.idempotencyKey ??
    buildIdempotencyKey(`gm:${input.scenarioType}`, [
      input.coreOrderId ?? input.orderCoreId,
      input.orderStage,
      triggeredBy,
      input.cancellationReasonId,
    ]);

  if (await isFinancialRuleEngineAvailable()) {
    try {
      const rows = await sql`
        SELECT gm_execute_rule(
          ${input.scenarioType}::gm_rule_scenario_type,
          ${input.orderCoreId}::bigint,
          ${input.ordersFoodId ?? null}::bigint,
          ${input.coreOrderId ?? null}::text,
          ${serviceType}::text,
          ${input.orderStage}::text,
          ${input.cancellationReasonId ?? null}::bigint,
          ${triggeredBy}::text,
          ${gross}::numeric,
          ${input.actorSystemUserId ?? null}::bigint,
          ${idempotencyKey}::text,
          ${Boolean(input.simulateOnly)}::boolean
        )::jsonb AS result
      `;
      return parseEngineResult((rows[0] as { result?: Record<string, unknown> })?.result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("gm_execute_rule") && !msg.includes("does not exist")) {
        return { applied: false, error: msg };
      }
    }
  }

  if (input.scenarioType === "CANCELLATION" && !input.simulateOnly) {
    const { orderMilestone, cancelledBy } = resolvePaymentCancellationMilestone({
      previousStatus: input.orderStage,
      cancelledByType: triggeredBy,
    });
    try {
      const rows = await sql`
        SELECT payment_apply_cancellation(
          ${input.orderCoreId}::bigint,
          ${input.ordersFoodId ?? input.orderCoreId}::bigint,
          ${orderMilestone}::payment_order_milestone,
          ${cancelledBy ?? "SYSTEM"}::payment_cancelled_by,
          ${gross}::numeric,
          NULL::bigint,
          ${idempotencyKey}::text
        )::jsonb AS result
      `;
      const parsed = parseEngineResult((rows[0] as { result?: Record<string, unknown> })?.result);
      return { ...parsed, engine: parsed.engine ?? "legacy_payment" };
    } catch {
      return { applied: false, error: "payment_engine_not_migrated" };
    }
  }
  return { applied: false, error: "no_rule_engine" };
}

export async function executeOrderCancellationFinancials(input: {
  orderCoreId: number;
  ordersFoodId: number;
  coreOrderId?: string | null;
  merchantStoreId?: number | null;
  previousStatus: string;
  cancelledByType: string;
  orderGross: number;
  serviceType?: string;
  cancellationReasonId?: number | null;
}) {
  const { orderMilestone, cancelledBy } = resolvePaymentCancellationMilestone({
    previousStatus: input.previousStatus,
    cancelledByType: input.cancelledByType,
  });
  return executeFinancialRule({
    scenarioType: "CANCELLATION",
    orderCoreId: input.orderCoreId,
    ordersFoodId: input.ordersFoodId,
    coreOrderId: input.coreOrderId,
    merchantStoreId: input.merchantStoreId,
    serviceType: input.serviceType,
    orderStage: orderMilestone,
    triggeredBy: cancelledBy ?? mapActorToTriggeredBy(input.cancelledByType),
    cancellationReasonId: input.cancellationReasonId,
    orderGross: input.orderGross,
  });
}

export async function executeRtoFinancials(input: {
  orderCoreId: number;
  ordersFoodId: number;
  coreOrderId?: string | null;
  previousStatus: string;
  triggeredByType: string;
  orderGross: number;
}) {
  const { orderMilestone, cancelledBy } = resolvePaymentCancellationMilestone({
    previousStatus: input.previousStatus,
    cancelledByType: input.triggeredByType,
  });
  return executeFinancialRule({
    scenarioType: "RTO",
    orderCoreId: input.orderCoreId,
    ordersFoodId: input.ordersFoodId,
    coreOrderId: input.coreOrderId,
    orderStage: orderMilestone || "FAILED_DELIVERY",
    triggeredBy: cancelledBy ?? mapActorToTriggeredBy(input.triggeredByType),
    orderGross: input.orderGross,
  });
}

export async function lookupOrderContext(orderCoreId: number) {
  const rows = await sql`
    SELECT c.order_id AS core_order_id, c.grand_total, f.id AS orders_food_id,
           f.merchant_store_id AS food_store_id
    FROM orders_core c
    LEFT JOIN orders_food f ON f.order_id = c.id OR f.core_order_id = c.order_id
    WHERE c.id = ${orderCoreId}
    LIMIT 1
  `;
  const row = rows[0] as {
    core_order_id?: string;
    grand_total?: unknown;
    orders_food_id?: number | null;
    food_store_id?: number | null;
  } | undefined;
  let serviceType = "FOOD";
  if (row?.food_store_id) {
    try {
      const st = await sql`
        SELECT service_type::text AS st FROM merchant_store_services
        WHERE store_id = ${row.food_store_id} AND is_enabled = TRUE LIMIT 1
      `;
      serviceType = String((st[0] as { st?: string })?.st ?? "FOOD").toUpperCase();
    } catch {
      /* optional */
    }
  }
  return {
    coreOrderId: row?.core_order_id ?? null,
    grandTotal: Number(row?.grand_total ?? 0),
    serviceType,
    ordersFoodId: row?.orders_food_id != null ? Number(row.orders_food_id) : null,
    merchantStoreId: row?.food_store_id ?? null,
  };
}
