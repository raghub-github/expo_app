import type { Sql } from "postgres";
import {
  type FinancialRuleExecutionInput,
  type FinancialRuleExecutionResult,
  buildIdempotencyKey,
  mapActorToTriggeredBy,
  parseEngineResult,
  resolvePaymentCancellationMilestone,
  scenarioForOrderStatus,
} from "@gatimitra/financial-rules";
import { getSql } from "../db/client.js";

export type {
  FinancialRuleExecutionInput,
  FinancialRuleExecutionResult,
} from "@gatimitra/financial-rules";

export {
  mapActorToTriggeredBy,
  refundFieldsFromEngineResult,
  resolvePaymentCancellationMilestone,
  scenarioForOrderStatus,
} from "@gatimitra/financial-rules";

export async function isFinancialRuleEngineAvailable(sql: Sql = getSql()): Promise<boolean> {
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
  input: FinancialRuleExecutionInput,
  sql: Sql = getSql()
): Promise<FinancialRuleExecutionResult> {
  const gross = Number(input.orderGross);
  if (!Number.isFinite(gross) || gross < 0) {
    return { applied: false, error: "invalid_order_gross" };
  }

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

  if (await isFinancialRuleEngineAvailable(sql)) {
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
      const raw = (rows[0] as { result?: Record<string, unknown> } | undefined)?.result;
      const parsed = parseEngineResult(raw);
      if (parsed.applied || parsed.error !== "empty_result") {
        return parsed;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("gm_execute_rule") && !msg.includes("does not exist")) {
        console.warn("[executeFinancialRule]", msg);
        return { applied: false, error: msg };
      }
    }
  }

  if (input.scenarioType === "CANCELLATION" && !input.simulateOnly) {
    return executeLegacyPaymentCancellation(
      {
        orderCoreId: input.orderCoreId,
        ordersFoodId: input.ordersFoodId ?? input.orderCoreId,
        previousStatus: input.orderStage,
        triggeredBy,
        orderGross: gross,
        actorSystemUserId: input.actorSystemUserId,
        idempotencyKey,
      },
      sql
    );
  }

  return { applied: false, error: "no_rule_engine" };
}

async function executeLegacyPaymentCancellation(
  input: {
    orderCoreId: number;
    ordersFoodId: number;
    previousStatus: string;
    triggeredBy: string;
    orderGross: number;
    actorSystemUserId?: number | null;
    idempotencyKey: string;
  },
  sql: Sql
): Promise<FinancialRuleExecutionResult> {
  const { orderMilestone, cancelledBy } = resolvePaymentCancellationMilestone({
    previousStatus: input.previousStatus,
    cancelledByType: input.triggeredBy,
  });

  try {
    const rows = await sql`
      SELECT payment_apply_cancellation(
        ${input.orderCoreId}::bigint,
        ${input.ordersFoodId}::bigint,
        ${orderMilestone}::payment_order_milestone,
        ${cancelledBy ?? "SYSTEM"}::payment_cancelled_by,
        ${input.orderGross}::numeric,
        ${input.actorSystemUserId ?? null}::bigint,
        ${input.idempotencyKey}::text
      )::jsonb AS result
    `;
    const raw = (rows[0] as { result?: Record<string, unknown> } | undefined)?.result;
    const parsed = parseEngineResult(raw);
    return { ...parsed, engine: parsed.engine ?? "legacy_payment" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("payment_apply_cancellation") || msg.includes("does not exist")) {
      return { applied: false, error: "payment_engine_not_migrated" };
    }
    return { applied: false, error: msg };
  }
}

/** Primary entry for order cancellation across all apps. */
export async function executeOrderCancellationFinancials(
  input: {
    orderCoreId: number;
    ordersFoodId: number;
    coreOrderId?: string | null;
    merchantStoreId?: number | null;
    previousStatus: string;
    cancelledByType: string;
    orderGross: number;
    serviceType?: string;
    cancellationReasonId?: number | null;
    actorSystemUserId?: number | null;
    wasDelivered?: boolean;
  },
  sql: Sql = getSql()
): Promise<FinancialRuleExecutionResult> {
  const { orderMilestone, cancelledBy } = resolvePaymentCancellationMilestone({
    previousStatus: input.previousStatus,
    cancelledByType: input.cancelledByType,
    wasDelivered: input.wasDelivered,
  });

  const scenario =
    input.wasDelivered || String(input.previousStatus).toUpperCase() === "DELIVERED"
      ? "POST_DELIVERY_CANCELLATION"
      : "CANCELLATION";

  return executeFinancialRule(
    {
      scenarioType: scenario,
      orderCoreId: input.orderCoreId,
      ordersFoodId: input.ordersFoodId,
      coreOrderId: input.coreOrderId,
      merchantStoreId: input.merchantStoreId,
      serviceType: input.serviceType,
      orderStage: orderMilestone,
      triggeredBy: cancelledBy ?? mapActorToTriggeredBy(input.cancelledByType),
      cancellationReasonId: input.cancellationReasonId,
      orderGross: input.orderGross,
      actorSystemUserId: input.actorSystemUserId,
    },
    sql
  );
}

/** RTO financial processing. */
export async function executeRtoFinancials(
  input: {
    orderCoreId: number;
    ordersFoodId: number;
    coreOrderId?: string | null;
    merchantStoreId?: number | null;
    previousStatus: string;
    triggeredByType: string;
    orderGross: number;
    cancellationReasonId?: number | null;
    actorSystemUserId?: number | null;
  },
  sql: Sql = getSql()
): Promise<FinancialRuleExecutionResult> {
  const { orderMilestone, cancelledBy } = resolvePaymentCancellationMilestone({
    previousStatus: input.previousStatus,
    cancelledByType: input.triggeredByType,
  });

  return executeFinancialRule(
    {
      scenarioType: "RTO",
      orderCoreId: input.orderCoreId,
      ordersFoodId: input.ordersFoodId,
      coreOrderId: input.coreOrderId,
      merchantStoreId: input.merchantStoreId,
      orderStage: orderMilestone || "FAILED_DELIVERY",
      triggeredBy: cancelledBy ?? mapActorToTriggeredBy(input.triggeredByType),
      cancellationReasonId: input.cancellationReasonId,
      orderGross: input.orderGross,
      actorSystemUserId: input.actorSystemUserId,
    },
    sql
  );
}

/** Partial / admin refund processing. */
export async function executePartialRefundFinancials(
  input: {
    orderCoreId: number;
    ordersFoodId?: number | null;
    coreOrderId?: string | null;
    orderStage: string;
    triggeredBy: string;
    orderGross: number;
    refundAmount: number;
    cancellationReasonId?: number | null;
    actorSystemUserId?: number | null;
    postDelivery?: boolean;
  },
  sql: Sql = getSql()
): Promise<FinancialRuleExecutionResult> {
  return executeFinancialRule(
    {
      scenarioType: input.postDelivery ? "POST_DELIVERY_CANCELLATION" : "PARTIAL_REFUND",
      orderCoreId: input.orderCoreId,
      ordersFoodId: input.ordersFoodId,
      coreOrderId: input.coreOrderId,
      orderStage: input.orderStage,
      triggeredBy: mapActorToTriggeredBy(input.triggeredBy),
      cancellationReasonId: input.cancellationReasonId,
      orderGross: input.refundAmount > 0 ? input.refundAmount : input.orderGross,
      actorSystemUserId: input.actorSystemUserId,
      idempotencyKey: buildIdempotencyKey("gm:partial_refund", [
        input.coreOrderId ?? input.orderCoreId,
        input.refundAmount,
        input.cancellationReasonId,
      ]),
    },
    sql
  );
}

export async function lookupStoreServiceType(
  storeId: number,
  sql: Sql = getSql()
): Promise<string> {
  try {
    const rows = await sql`
      SELECT service_type::text AS st
      FROM merchant_store_services
      WHERE store_id = ${storeId} AND is_enabled = TRUE
      ORDER BY CASE service_type WHEN 'FOOD'::service_type THEN 0 ELSE 1 END
      LIMIT 1
    `;
    const st = (rows[0] as { st?: string } | undefined)?.st;
    if (st) return st.toUpperCase();
  } catch {
    /* optional */
  }
  return "FOOD";
}

export async function lookupOrderContext(
  orderCoreId: number,
  sql: Sql = getSql()
): Promise<{
  coreOrderId: string | null;
  grandTotal: number;
  serviceType: string;
  ordersFoodId: number | null;
  merchantStoreId: number | null;
}> {
  const rows = await sql`
    SELECT
      c.order_id AS core_order_id,
      c.grand_total,
      c.merchant_store_id,
      f.id AS orders_food_id,
      f.merchant_store_id AS food_store_id
    FROM orders_core c
    LEFT JOIN orders_food f ON f.order_id = c.id OR f.core_order_id = c.order_id
    WHERE c.id = ${orderCoreId}
    LIMIT 1
  `;
  const row = rows[0] as {
    core_order_id?: string;
    grand_total?: unknown;
    merchant_store_id?: number | null;
    orders_food_id?: number | null;
    food_store_id?: number | null;
  } | undefined;

  const storeId = row?.food_store_id ?? row?.merchant_store_id ?? null;
  const serviceType = storeId ? await lookupStoreServiceType(Number(storeId), sql) : "FOOD";

  return {
    coreOrderId: row?.core_order_id ?? null,
    grandTotal: Number(row?.grand_total ?? 0),
    serviceType,
    ordersFoodId: row?.orders_food_id != null ? Number(row.orders_food_id) : null,
    merchantStoreId: storeId != null ? Number(storeId) : null,
  };
}
