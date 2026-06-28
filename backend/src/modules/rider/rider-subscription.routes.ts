import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { formatSubscriptionWalletError } from "../../lib/rider-subscription-wallet.js";
import {
  createRiderSubscriptionDuesPaymentOrder,
  verifyRiderSubscriptionDuesPayment,
} from "../../lib/rider-subscription-dues-payment.service.js";
import {
  createRiderSubscriptionPaymentOrder,
  getRiderSubscriptionStatus,
  listRiderSubscriptionPlans,
  payRiderSubscriptionDues,
  subscribeRiderViaWallet,
  updateRiderSubscriptionAutoRenewal,
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

const autoRenewBodySchema = z.object({
  enabled: z.boolean(),
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
      return reply.send({
        success: true,
        active: result.active,
        plan: result.plan,
        dues: result.dues,
      });
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
    return reply.send({ ...result, success: true });
  });

  app.post("/subscription/subscribe-wallet", async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    if (riderId == null) {
      return reply.code(403).send({ success: false, error: "rider_not_found" });
    }
    const body = subscribeBodySchema.parse(req.body ?? {});
    try {
      const result = await subscribeRiderViaWallet({
        riderId,
        planId: body.planId,
        billingCycle: body.billingCycle,
        autoWalletDeduction: body.autoWalletDeduction,
      });
      if (!result.ok) {
        return reply.code(result.status).send({ success: false, error: result.error });
      }
      return reply.send({ ...result, success: true });
    } catch (err) {
      app.log.error({ err }, "POST /rider/subscription/subscribe-wallet failed");
      const message = formatSubscriptionWalletError(err);
      return reply.code(500).send({ success: false, error: message });
    }
  });

  app.patch("/subscription/auto-renewal", async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    if (riderId == null) {
      return reply.code(403).send({ success: false, error: "rider_not_found" });
    }
    const body = autoRenewBodySchema.parse(req.body ?? {});
    const result = await updateRiderSubscriptionAutoRenewal({ riderId, enabled: body.enabled });
    if (!result.ok) {
      return reply.code(result.status).send({ success: false, error: result.error });
    }
    return reply.send({ success: true, ...result });
  });

  app.post("/subscription/dues/create-payment-order", async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    if (riderId == null) {
      return reply.code(403).send({ success: false, error: "rider_not_found" });
    }
    const result = await createRiderSubscriptionDuesPaymentOrder(riderId);
    if (!result.ok) {
      return reply.code(result.status).send({ success: false, error: result.error });
    }
    return reply.send({
      success: true,
      orderId: result.orderId,
      keyId: result.keyId,
      amount: result.amount,
      amountRupees: result.amountRupees,
      currency: result.currency,
      dummyMode: result.dummyMode,
      totalDue: result.totalDue,
    });
  });

  app.post("/subscription/dues/verify-payment", async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    if (riderId == null) {
      return reply.code(403).send({ success: false, error: "rider_not_found" });
    }
    const body = z
      .object({
        razorpayOrderId: z.string().min(1),
        razorpayPaymentId: z.string().min(1),
        razorpaySignature: z.string().min(1),
      })
      .parse(req.body ?? {});
    const result = await verifyRiderSubscriptionDuesPayment({
      riderId,
      razorpayOrderId: body.razorpayOrderId,
      razorpayPaymentId: body.razorpayPaymentId,
      razorpaySignature: body.razorpaySignature,
    });
    if (!result.ok) {
      return reply.code(result.status).send({ success: false, error: result.error });
    }
    return reply.send({ ...result, success: true });
  });

  app.post("/subscription/pay-dues", async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    if (riderId == null) {
      return reply.code(403).send({ success: false, error: "rider_not_found" });
    }
    const result = await payRiderSubscriptionDues(riderId);
    if (!result.ok) {
      return reply.code(result.status).send({
        success: false,
        error: result.error,
        needEarnings: result.needEarnings,
        totalDue: result.totalDue,
      });
    }
    return reply.send({ success: true, ...result });
  });
}
