import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSql } from "../../db/client.js";
import {
  executeFinancialRule,
  executeOrderCancellationFinancials,
  isFinancialRuleEngineAvailable,
} from "../../lib/financial-rule-executor.js";

const executeSchema = z.object({
  scenarioType: z.enum([
    "CANCELLATION",
    "POST_DELIVERY_CANCELLATION",
    "PARTIAL_REFUND",
    "RTO",
    "COD_FAILURE",
    "CHARGEBACK",
    "COMPENSATION",
    "DISPUTE_RESOLUTION",
  ]),
  orderCoreId: z.number().int().positive(),
  ordersFoodId: z.number().int().optional(),
  coreOrderId: z.string().optional(),
  serviceType: z.string().optional(),
  orderStage: z.string(),
  triggeredBy: z.string(),
  cancellationReasonId: z.number().int().optional().nullable(),
  orderGross: z.number().nonnegative(),
  simulateOnly: z.boolean().optional(),
});

export async function registerFinancialRulesRoutes(app: FastifyInstance) {
  app.get("/v1/internal/financial-rules/status", async () => {
    const available = await isFinancialRuleEngineAvailable();
    return { available };
  });

  app.post("/v1/internal/financial-rules/execute", async (req, reply) => {
    const { getEnv } = await import("../../config/env.js");
    const env = getEnv();
    const expected = env.INTERNAL_API_TOKEN ?? "";
    if (expected) {
      const given = String(req.headers["x-internal-token"] ?? "");
      if (given !== expected) {
        return reply.status(401).send({ error: "invalid_internal_token" });
      }
    }
    const parsed = executeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "validation_failed", details: parsed.error.flatten() });
    }
    const d = parsed.data;
    const sql = getSql();
    const result = d.scenarioType === "CANCELLATION"
      ? await executeOrderCancellationFinancials(
          {
            orderCoreId: d.orderCoreId,
            ordersFoodId: d.ordersFoodId ?? d.orderCoreId,
            coreOrderId: d.coreOrderId,
            previousStatus: d.orderStage,
            cancelledByType: d.triggeredBy,
            orderGross: d.orderGross,
            serviceType: d.serviceType,
            cancellationReasonId: d.cancellationReasonId,
          },
          sql
        )
      : await executeFinancialRule(
          {
            scenarioType: d.scenarioType,
            orderCoreId: d.orderCoreId,
            ordersFoodId: d.ordersFoodId,
            coreOrderId: d.coreOrderId,
            serviceType: d.serviceType,
            orderStage: d.orderStage,
            triggeredBy: d.triggeredBy,
            cancellationReasonId: d.cancellationReasonId,
            orderGross: d.orderGross,
            simulateOnly: d.simulateOnly,
          },
          sql
        );
    return { success: result.applied || Boolean(result.raw?.ok), result };
  });
}
