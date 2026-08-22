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

const merchantAcceptNotifyBody = z.object({
  orders_core_id: z.number().int().min(1),
  from_status: z.string().max(64).optional(),
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

  const riderCancelBody = z.object({
    orders_core_id: z.number().int().min(1),
    rider_id: z.number().int().min(1),
    reason_code: z.string().min(1).max(120),
    reason_text: z.string().max(500).optional(),
    actor_email: z.string().email().optional(),
    actor_id: z.string().max(120).optional(),
  });

  app.post("/orders/rider-cancel-only", async (req, reply) => {
    const parsed = riderCancelBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "validation_failed" });
    }
    const body = parsed.data;
    try {
      const sql = getSql();
      const rows = (await sql`
        SELECT oc.id, oc.order_id AS "orderIdText"
        FROM orders_core oc
        WHERE oc.id = ${body.orders_core_id}
        LIMIT 1
      `) as Array<{ id: number; orderIdText: string }>;
      const row = rows[0];
      if (!row?.orderIdText) {
        return reply.code(404).send({ ok: false, error: "order_not_found" });
      }

      const { adminCancelFoodRiderFromOrder } = await import(
        "../../lib/food-rider-unassign.service.js"
      );
      await adminCancelFoodRiderFromOrder({
        orderCorePk: body.orders_core_id,
        orderIdText: String(row.orderIdText),
        riderId: body.rider_id,
        reasonCode: body.reason_code,
        reasonText: body.reason_text ?? null,
        removedBy: body.actor_email ?? body.actor_id ?? null,
        actorType: "admin",
        actorId: body.actor_id ?? body.actor_email ?? undefined,
        mode: "hold",
      });
      return reply.send({ ok: true });
    } catch (err) {
      req.log.warn({ err, body }, "rider-cancel-only failed");
      return reply.code(400).send({
        ok: false,
        error: err instanceof Error ? err.message : "rider_cancel_failed",
      });
    }
  });

  app.post("/orders/rider-cancel-reassign", async (req, reply) => {
    const parsed = riderCancelBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "validation_failed" });
    }
    const body = parsed.data;
    try {
      const sql = getSql();
      const rows = (await sql`
        SELECT oc.id, oc.order_id AS "orderIdText"
        FROM orders_core oc
        WHERE oc.id = ${body.orders_core_id}
        LIMIT 1
      `) as Array<{ id: number; orderIdText: string }>;
      const row = rows[0];
      if (!row?.orderIdText) {
        return reply.code(404).send({ ok: false, error: "order_not_found" });
      }

      const { adminCancelFoodRiderFromOrder } = await import(
        "../../lib/food-rider-unassign.service.js"
      );
      await adminCancelFoodRiderFromOrder({
        orderCorePk: body.orders_core_id,
        orderIdText: String(row.orderIdText),
        riderId: body.rider_id,
        reasonCode: body.reason_code,
        reasonText: body.reason_text ?? null,
        removedBy: body.actor_email ?? body.actor_id ?? null,
        actorType: "admin",
        actorId: body.actor_id ?? body.actor_email ?? undefined,
        mode: "reassign",
      });
      return reply.send({ ok: true });
    } catch (err) {
      req.log.warn({ err, body }, "rider-cancel-reassign failed");
      return reply.code(400).send({
        ok: false,
        error: err instanceof Error ? err.message : "rider_reassign_failed",
      });
    }
  });

  app.post("/orders/rider-manual-assign", async (req, reply) => {
    const parsed = z
      .object({
        orders_core_id: z.number().int().min(1),
        actor_email: z.string().email().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "validation_failed" });
    }
    try {
      const { manualAssignRiderForFoodOrder } = await import(
        "../../lib/food-rider-unassign.service.js"
      );
      const result = await manualAssignRiderForFoodOrder(parsed.data.orders_core_id);
      return reply.send({ ok: true, ...result });
    } catch (err) {
      req.log.warn({ err, body: parsed.data }, "rider-manual-assign failed");
      const message = err instanceof Error ? err.message : "manual_assign_failed";
      const statusCode =
        typeof (err as { statusCode?: unknown })?.statusCode === "number"
          ? Number((err as { statusCode: number }).statusCode)
          : 400;
      return reply.code(statusCode >= 400 && statusCode < 600 ? statusCode : 400).send({
        ok: false,
        error: message,
      });
    }
  });

  app.get("/orders/eligible-riders", async (req, reply) => {
    const ordersCoreId = Number((req.query as { orders_core_id?: string }).orders_core_id);
    if (!Number.isInteger(ordersCoreId) || ordersCoreId < 1) {
      return reply.code(400).send({ ok: false, error: "invalid_orders_core_id" });
    }
    try {
      const { listAdminSelectableRidersForOrder } = await import(
        "../../lib/force-assignment.service.js"
      );
      const riders = await listAdminSelectableRidersForOrder(ordersCoreId);
      return reply.send({ ok: true, riders });
    } catch (err) {
      req.log.warn({ err, ordersCoreId }, "eligible-riders failed");
      return reply.code(500).send({ ok: false, error: "eligible_riders_failed" });
    }
  });

  app.get("/orders/force-assignment", async (req, reply) => {
    const ordersCoreId = Number((req.query as { orders_core_id?: string }).orders_core_id);
    if (!Number.isInteger(ordersCoreId) || ordersCoreId < 1) {
      return reply.code(400).send({ ok: false, error: "invalid_orders_core_id" });
    }
    try {
      const { getForceAssignmentState } = await import("../../lib/force-assignment.service.js");
      const state = await getForceAssignmentState(ordersCoreId);
      return reply.send({ ok: true, forceAssignment: state });
    } catch (err) {
      req.log.warn({ err, ordersCoreId }, "force-assignment get failed");
      return reply.code(500).send({ ok: false, error: "force_assignment_get_failed" });
    }
  });

  app.post("/orders/force-assignment/start", async (req, reply) => {
    const parsed = z
      .object({
        orders_core_id: z.number().int().min(1),
        new_rider_id: z.number().int().min(1),
        reason_code: z.string().min(1).max(120),
        reason_text: z.string().min(1).max(500),
        catalog_reason_id: z.number().int().min(1).optional().nullable(),
        actor_email: z.string().email().optional(),
        actor_id: z.string().max(120).optional(),
        offer_seconds: z.number().int().min(30).max(300).optional(),
        /** Admin Force Assignment radius (km). Defaults to 10 on the service. */
        radius_km: z.number().min(0.5).max(10).optional().nullable(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "validation_failed" });
    }
    try {
      const { startForceAssignment } = await import("../../lib/force-assignment.service.js");
      const state = await startForceAssignment({
        orderCoreId: parsed.data.orders_core_id,
        newRiderId: parsed.data.new_rider_id,
        reasonCode: parsed.data.reason_code,
        reasonText: parsed.data.reason_text,
        catalogReasonId: parsed.data.catalog_reason_id ?? null,
        adminEmail: parsed.data.actor_email ?? null,
        adminUserId: parsed.data.actor_id ?? null,
        offerSeconds: parsed.data.offer_seconds,
        radiusKm: parsed.data.radius_km ?? null,
      });
      return reply.send({ ok: true, forceAssignment: state });
    } catch (err) {
      req.log.warn({ err, body: parsed.data }, "force-assignment start failed");
      const message = err instanceof Error ? err.message : "force_assignment_failed";
      const statusCode =
        typeof (err as { statusCode?: unknown })?.statusCode === "number"
          ? Number((err as { statusCode: number }).statusCode)
          : 400;
      return reply.code(statusCode >= 400 && statusCode < 600 ? statusCode : 400).send({
        ok: false,
        error: message,
      });
    }
  });

  app.post("/orders/force-assignment/cancel", async (req, reply) => {
    const parsed = z
      .object({
        orders_core_id: z.number().int().min(1),
        actor_email: z.string().email().optional(),
        actor_id: z.string().max(120).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "validation_failed" });
    }
    try {
      const { cancelForceAssignment } = await import("../../lib/force-assignment.service.js");
      const state = await cancelForceAssignment({
        orderCoreId: parsed.data.orders_core_id,
        adminEmail: parsed.data.actor_email ?? null,
        adminUserId: parsed.data.actor_id ?? null,
      });
      return reply.send({ ok: true, forceAssignment: state });
    } catch (err) {
      req.log.warn({ err, body: parsed.data }, "force-assignment cancel failed");
      const message = err instanceof Error ? err.message : "force_assignment_cancel_failed";
      const statusCode =
        typeof (err as { statusCode?: unknown })?.statusCode === "number"
          ? Number((err as { statusCode: number }).statusCode)
          : 400;
      return reply.code(statusCode >= 400 && statusCode < 600 ? statusCode : 400).send({
        ok: false,
        error: message,
      });
    }
  });

  app.post("/orders/rider-hard-assign", async (req, reply) => {
    const parsed = z
      .object({
        orders_core_id: z.number().int().min(1),
        rider_id: z.number().int().min(1),
        actor_email: z.string().email().optional(),
        actor_id: z.string().max(120).optional(),
        radius_km: z.number().min(0.5).max(10).optional().nullable(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "validation_failed" });
    }
    try {
      const { adminHardAssignSpecificRider } = await import(
        "../../lib/force-assignment.service.js"
      );
      await adminHardAssignSpecificRider({
        orderCoreId: parsed.data.orders_core_id,
        riderId: parsed.data.rider_id,
        adminEmail: parsed.data.actor_email ?? null,
        adminUserId: parsed.data.actor_id ?? null,
        radiusKm: parsed.data.radius_km ?? null,
      });
      return reply.send({ ok: true });
    } catch (err) {
      req.log.warn({ err, body: parsed.data }, "rider-hard-assign failed");
      const message = err instanceof Error ? err.message : "hard_assign_failed";
      const statusCode =
        typeof (err as { statusCode?: unknown })?.statusCode === "number"
          ? Number((err as { statusCode: number }).statusCode)
          : 400;
      return reply.code(statusCode >= 400 && statusCode < 600 ? statusCode : 400).send({
        ok: false,
        error: message,
      });
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

  /** Partnersite accept path — emit ORDER_ACCEPTED customer push + live-progress. */
  app.post("/orders/merchant-accept-notify", async (req, reply) => {
    const parsed = merchantAcceptNotifyBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "validation_failed" });
    }
    const { orders_core_id, from_status, store_name } = parsed.data;
    const sql = getSql();
    try {
      const preferredStore = store_name?.trim() || null;
      const rows = (await sql`
        SELECT
          oc.order_id,
          oc.formatted_order_id,
          oc.current_status,
          oc.status,
          c.customer_id AS customer_user_id,
          ms.id AS merchant_store_id,
          COALESCE(
            ${preferredStore},
            NULLIF(TRIM(ms.store_display_name), ''),
            'Store'
          ) AS store_name
        FROM public.orders_core oc
        LEFT JOIN public.customers c ON c.id = oc.customer_id
        LEFT JOIN public.merchant_stores ms ON ms.id = oc.merchant_store_id
        WHERE oc.id = ${orders_core_id}
        LIMIT 1
      `) as unknown as Array<{
        order_id: string | null;
        formatted_order_id: string | null;
        current_status: string | null;
        status: string | null;
        customer_user_id: string | null;
        merchant_store_id: number | null;
        store_name: string | null;
      }>;
      const row = rows[0];
      const orderIdText = row?.order_id?.trim();
      if (!orderIdText) {
        return reply.code(404).send({ ok: false, error: "order_not_found" });
      }
      const { emitEvent } = await import("../notifications/eventBus.js");
      emitEvent("order.status_changed", {
        orderId: orderIdText,
        orderShortId: row.formatted_order_id?.trim() || orderIdText,
        fromStatus: (from_status ?? row.current_status ?? row.status ?? "CREATED").toUpperCase(),
        toStatus: "ACCEPTED",
        customerId: row.customer_user_id ?? null,
        merchantStoreId: row.merchant_store_id ?? null,
        merchantName: row.store_name ?? "Store",
      });
      return reply.send({ ok: true });
    } catch (err) {
      req.log.warn({ err }, "merchant-accept-notify failed");
      return reply.code(500).send({ ok: false, error: "notify_failed" });
    }
  });

  app.post("/eta/live-tick", async (req, reply) => {
    try {
      const { runLiveEtaTick } = await import("../../modules/eta/eta.live-tick.js");
      const limit = Number((req.query as { limit?: string }).limit ?? 200);
      const result = await runLiveEtaTick(Number.isFinite(limit) ? limit : 200);
      return reply.send({ ok: true, ...result });
    } catch (err) {
      req.log.warn({ err }, "eta live-tick failed");
      return reply.code(500).send({ ok: false, error: "eta_live_tick_failed" });
    }
  });

  app.get("/eta/analytics-summary", async (req, reply) => {
    try {
      const days = Number((req.query as { days?: string }).days ?? 30);
      const { getEtaAnalyticsSummary } = await import("../../modules/eta/eta.analytics.js");
      const summary = await getEtaAnalyticsSummary(days);
      return reply.send({ ok: true, summary });
    } catch (err) {
      req.log.warn({ err }, "eta analytics-summary failed");
      return reply.code(500).send({ ok: false, error: "eta_analytics_failed" });
    }
  });

  const clearPaymentHoldBody = z.object({
    orders_core_id: z.number().int().min(1),
    actor_email: z.string().email().optional(),
  });

  app.post("/orders/clear-rider-payment-hold", async (req, reply) => {
    const parsed = clearPaymentHoldBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: "validation_failed" });
    }
    try {
      const { adminClearRiderPaymentHoldForOrder } = await import(
        "../../modules/rides/ride-payment.service.js"
      );
      const result = await adminClearRiderPaymentHoldForOrder({
        orderCoreId: parsed.data.orders_core_id,
        actorEmail: parsed.data.actor_email ?? null,
      });
      return reply.send({ ok: true, credited: result.credited });
    } catch (err) {
      req.log.warn({ err, body: parsed.data }, "clear-rider-payment-hold failed");
      return reply.code(400).send({
        ok: false,
        error: err instanceof Error ? err.message : "clear_payment_hold_failed",
      });
    }
  });
}
