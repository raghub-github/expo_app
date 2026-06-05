import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createRiderSubscriptionPaymentOrder,
  getRiderSubscriptionStatus,
  listRiderSubscriptionPlans,
  verifyRiderSubscriptionPayment,
} from "./rider-subscription.service.js";

function parseRiderIdFromAuth(sub: string): number | null {
  const match = sub.match(/usr_(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
}

const billingCycleSchema = z.enum(["daily", "monthly", "semi_yearly", "yearly"]);

const subscribeBodySchema = z.object({
  planId: z.coerce.number().int().positive(),
  billingCycle: billingCycleSchema.optional(),
  autoWalletDeduction: z.boolean().optional(),
});

const paymentBodySchema = subscribeBodySchema.extend({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export function registerRiderSubscriptionRoutes(app: FastifyInstance) {
  app.get("/subscription/plans", async (_req, reply) => {
    try {
      const result = await listRiderSubscriptionPlans();
      return reply.send({ success: true, plans: result.plans });
    } catch (err) {
      app.log.error({ err }, "GET /rider/subscription/plans failed");
      return reply.code(500).send({ success: false, plans: [], error: "Failed to load plans" });
    }
  });

  app.get("/subscription/status", async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    if (riderId == null) {
      return reply.code(403).send({ success: false, error: "rider_not_found" });
    }
    try {
      const result = await getRiderSubscriptionStatus(riderId);
      return reply.send({ success: true, active: result.active, plan: result.plan });
    } catch (err) {
      app.log.error({ err }, "GET /rider/subscription/status failed");
      return reply.code(500).send({ success: false, active: false, plan: null });
    }
  });

  app.post("/subscription/create-payment-order", async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    if (riderId == null) {
      return reply.code(403).send({ success: false, error: "rider_not_found" });
    }
    const body = subscribeBodySchema.parse(req.body ?? {});
    const result = await createRiderSubscriptionPaymentOrder({
      riderId,
      planId: body.planId,
      billingCycle: body.billingCycle,
      autoWalletDeduction: body.autoWalletDeduction,
    });
    if (!result.ok) {
      return reply.code(result.status).send({ success: false, error: result.error });
    }
    return reply.send({ success: true, ...result });
  });

  app.post("/subscription/verify-payment", async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    if (riderId == null) {
      return reply.code(403).send({ success: false, error: "rider_not_found" });
    }
    const body = paymentBodySchema.parse(req.body ?? {});
    const result = await verifyRiderSubscriptionPayment({
      riderId,
      planId: body.planId,
      billingCycle: body.billingCycle,
      autoWalletDeduction: body.autoWalletDeduction,
      razorpayOrderId: body.razorpayOrderId,
      razorpayPaymentId: body.razorpayPaymentId,
      razorpaySignature: body.razorpaySignature,
    });
    if (!result.ok) {
      return reply.code(result.status).send({ success: false, error: result.error });
    }
    return reply.send({ success: true, ...result });
  });
}
