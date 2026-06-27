import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auth } from "../../plugins/auth.js";
import { withSqlRetry } from "../../db/client.js";
import { resolveCustomerPkForRequest } from "../../lib/customer-auth.js";
import {
  createCustomerSubscriptionPaymentOrder,
  getActiveCustomerSubscription,
  listCustomerSubscriptionPlans,
  verifyCustomerSubscriptionPayment,
} from "./customer-subscription.service.js";

const billingCycleSchema = z.enum(["weekly", "monthly", "yearly"]);

const subscribeBodySchema = z.object({
  planId: z.coerce.number().int().positive(),
  billingCycle: billingCycleSchema,
});

const paymentBodySchema = subscribeBodySchema.extend({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

function registerCustomerSubscriptionRoutes(app: FastifyInstance) {
  app.get("/subscription-plans", async (req, reply) => {
    const query = req.query as { active?: string };
    const activeOnly = query.active === "true";
    try {
      const result = await listCustomerSubscriptionPlans(activeOnly);
      return reply.send({ success: true, plans: result.plans });
    } catch (err) {
      app.log.error({ err }, "GET /subscription-plans failed");
      return reply.code(500).send({ success: false, plans: [], error: "Failed to load plans" });
    }
  });

  app.get("/subscription-plans/active", async (_req, reply) => {
    try {
      const result = await listCustomerSubscriptionPlans(true);
      return reply.send({ success: true, plans: result.plans });
    } catch (err) {
      app.log.error({ err }, "GET /subscription-plans/active failed");
      return reply.code(500).send({ success: false, plans: [], error: "Failed to load plans" });
    }
  });

  app.get("/subscription/current", async (req, reply) => {
    if (!req.auth?.sub || req.auth?.role !== "customer") {
      return reply.code(401).send({ success: false, error: "Authentication required" });
    }
    const customerPk = await resolveCustomerPkForRequest(req.auth!, req);
    if (customerPk == null) {
      return reply.code(403).send({ success: false, error: "Customer not found" });
    }
    try {
      const result = await withSqlRetry(() => getActiveCustomerSubscription(customerPk));
      return reply.send({
        success: true,
        active: result.active,
        subscription: result.subscription,
        plan: result.plan,
      });
    } catch (err) {
      app.log.error({ err }, "GET /subscription/current failed");
      return reply.code(500).send({ success: false, active: false, subscription: null, plan: null });
    }
  });

  app.post("/subscription/subscribe", async (req, reply) => {
    if (!req.auth?.sub || req.auth?.role !== "customer") {
      return reply.code(401).send({ success: false, error: "Authentication required" });
    }
    const customerPk = await resolveCustomerPkForRequest(req.auth!);
    if (customerPk == null) {
      return reply.code(403).send({ success: false, error: "Customer not found" });
    }
    const body = subscribeBodySchema.parse(req.body ?? {});
    const result = await createCustomerSubscriptionPaymentOrder({
      customerId: customerPk,
      planId: body.planId,
      billingCycle: body.billingCycle,
    });
    if (!result.ok) {
      return reply.code(result.status).send({ success: false, error: result.error });
    }
    const { ok: _ok, ...payload } = result;
    return reply.send({ ...payload, success: true });
  });

  app.post("/subscription/verify-payment", async (req, reply) => {
    if (!req.auth?.sub || req.auth?.role !== "customer") {
      return reply.code(401).send({ success: false, error: "Authentication required" });
    }
    const customerPk = await resolveCustomerPkForRequest(req.auth!);
    if (customerPk == null) {
      return reply.code(403).send({ success: false, error: "Customer not found" });
    }
    const body = paymentBodySchema.parse(req.body ?? {});
    const result = await verifyCustomerSubscriptionPayment({
      customerId: customerPk,
      planId: body.planId,
      billingCycle: body.billingCycle,
      razorpayOrderId: body.razorpayOrderId,
      razorpayPaymentId: body.razorpayPaymentId,
      razorpaySignature: body.razorpaySignature,
    });
    if (!result.ok) {
      return reply.code(result.status).send({ success: false, error: result.error });
    }
    const { ok: _ok, ...payload } = result;
    return reply.send({ ...payload, success: true });
  });
}

export async function customerSubscriptionModule(app: FastifyInstance) {
  await app.register(auth, { required: false });
  registerCustomerSubscriptionRoutes(app);
}
