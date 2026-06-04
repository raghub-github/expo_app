/**
 * Internal order hooks — prep-delay customer notify for dashboard/partnersite
 * paths that update Supabase directly instead of merchant-partner API.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getEnv } from "../../config/env.js";
import { getSql } from "../../db/client.js";
import { applyPrepDelayCustomerEffects } from "../../lib/customer-prep-delay-effects.js";

const prepDelayNotifyBody = z.object({
  orders_core_id: z.number().int().min(1),
  additional_minutes: z.union([z.literal(5), z.literal(10), z.literal(15)]),
  store_name: z.string().max(200).optional(),
});

export async function ordersInternalRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (req, reply) => {
    const env = getEnv();
    const expected = env.INTERNAL_API_TOKEN ?? "";
    if (!expected) {
      return reply.code(503).send({ ok: false, error: "internal_token_not_configured" });
    }
    const given = String(req.headers["x-internal-token"] ?? "");
    if (given !== expected) {
      return reply.code(401).send({ ok: false, error: "invalid_internal_token" });
    }
  });

  app.get("/orders/nearby-dispatch-riders", async (req, reply) => {
    const ordersCoreId = Number((req.query as { orders_core_id?: string }).orders_core_id);
    if (!Number.isInteger(ordersCoreId) || ordersCoreId < 1) {
      return reply.code(400).send({ ok: false, error: "invalid_orders_core_id" });
    }
    try {
      const { getNearbyDispatchRiderSummaryForOrderCoreId } = await import(
        "../../lib/merchant-nearby-dispatch-riders.js"
      );
      const summary = await getNearbyDispatchRiderSummaryForOrderCoreId(ordersCoreId);
      return reply.send({ ok: true, summary });
    } catch (err) {
      req.log.warn({ err, ordersCoreId }, "nearby-dispatch-riders failed");
      return reply.code(500).send({ ok: false, error: "nearby_riders_failed" });
    }
  });

  app.post("/orders/prep-delay-notify", async (req, reply) => {
    const parsed = prepDelayNotifyBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "validation_failed" });
    }
    const { orders_core_id, additional_minutes, store_name } = parsed.data;
    const sql = getSql();
    try {
      await applyPrepDelayCustomerEffects(sql, {
        ordersCoreId: orders_core_id,
        additionalMinutes: additional_minutes,
        storeName: store_name ?? null,
      });
      return reply.send({ ok: true });
    } catch (err) {
      req.log.warn({ err }, "prep-delay-notify failed");
      return reply.code(500).send({ ok: false, error: "notify_failed" });
    }
  });
}
