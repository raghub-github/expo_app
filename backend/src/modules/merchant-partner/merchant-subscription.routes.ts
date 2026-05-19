import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPartnerParentId } from "./merchant-subscription.routes.helpers.js";
import {
  activateFreeMerchantPlan,
  createMerchantSubscriptionPaymentOrder,
  upgradeMerchantSubscription,
  verifyMerchantSubscriptionPayment,
} from "./merchant-subscription.service.js";

const planBodySchema = z.object({
  planId: z.coerce.number().int().positive(),
});

const paymentBodySchema = z.object({
  planId: z.coerce.number().int().positive(),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

const upgradeBodySchema = z.object({
  newPlanId: z.coerce.number().int().positive(),
  razorpay_order_id: z.string().optional(),
  razorpay_payment_id: z.string().optional(),
  razorpay_signature: z.string().optional(),
  skipPayment: z.boolean().optional(),
});

export function registerMerchantSubscriptionRoutes(protectedApp: FastifyInstance) {
  protectedApp.post<{ Params: { storeId: string }; Body: unknown }>(
    "/stores/:storeId/subscription/create-payment-order",
    async (req, reply) => {
      if (req.auth?.role !== "merchant" || !req.auth?.sub) {
        return reply.code(401).send({ success: false, error: "merchant_required" });
      }
      const storeId = Number(req.params.storeId);
      if (!Number.isInteger(storeId) || storeId < 1) {
        return reply.code(400).send({ success: false, error: "invalid_store_id" });
      }
      const parentId = await getPartnerParentId(req.auth.sub);
      if (!parentId) return reply.code(403).send({ success: false, error: "merchant_not_found" });

      const body = planBodySchema.parse(req.body ?? {});
      const result = await createMerchantSubscriptionPaymentOrder({
        storeId,
        parentId,
        planId: body.planId,
      });

      if (!result.ok) {
        return reply.code(result.status).send({ success: false, error: result.error });
      }
      return reply.send({ success: true, ...result });
    }
  );

  protectedApp.post<{ Params: { storeId: string }; Body: unknown }>(
    "/stores/:storeId/subscription/verify-payment",
    async (req, reply) => {
      if (req.auth?.role !== "merchant" || !req.auth?.sub) {
        return reply.code(401).send({ success: false, error: "merchant_required" });
      }
      const storeId = Number(req.params.storeId);
      const parentId = await getPartnerParentId(req.auth.sub);
      if (!parentId) return reply.code(403).send({ success: false, error: "merchant_not_found" });

      const body = paymentBodySchema.parse(req.body ?? {});
      const result = await verifyMerchantSubscriptionPayment({
        storeId,
        parentId,
        planId: body.planId,
        razorpayOrderId: body.razorpay_order_id,
        razorpayPaymentId: body.razorpay_payment_id,
        razorpaySignature: body.razorpay_signature,
      });

      if (!result.ok) {
        return reply.code(result.status).send({ success: false, error: result.error });
      }
      return reply.send({ success: true, ...result });
    }
  );

  protectedApp.post<{ Params: { storeId: string }; Body: unknown }>(
    "/stores/:storeId/subscription/upgrade",
    async (req, reply) => {
      if (req.auth?.role !== "merchant" || !req.auth?.sub) {
        return reply.code(401).send({ success: false, error: "merchant_required" });
      }
      const storeId = Number(req.params.storeId);
      const parentId = await getPartnerParentId(req.auth.sub);
      if (!parentId) return reply.code(403).send({ success: false, error: "merchant_not_found" });

      const body = upgradeBodySchema.parse(req.body ?? {});
      const result = await upgradeMerchantSubscription({
        storeId,
        parentId,
        newPlanId: body.newPlanId,
        razorpayOrderId: body.razorpay_order_id,
        razorpayPaymentId: body.razorpay_payment_id,
        razorpaySignature: body.razorpay_signature,
        skipPayment: body.skipPayment === true,
      });

      if (!result.ok) {
        return reply.code(result.status).send({ success: false, error: result.error });
      }
      return reply.send({ success: true, ...result });
    }
  );

  protectedApp.post<{ Params: { storeId: string }; Body: unknown }>(
    "/stores/:storeId/subscription/activate-free",
    async (req, reply) => {
      if (req.auth?.role !== "merchant" || !req.auth?.sub) {
        return reply.code(401).send({ success: false, error: "merchant_required" });
      }
      const storeId = Number(req.params.storeId);
      const parentId = await getPartnerParentId(req.auth.sub);
      if (!parentId) return reply.code(403).send({ success: false, error: "merchant_not_found" });

      const body = planBodySchema.parse(req.body ?? {});
      const result = await activateFreeMerchantPlan({
        storeId,
        parentId,
        planId: body.planId,
      });

      if (!result.ok) {
        return reply.code(result.status).send({ success: false, error: result.error });
      }
      return reply.send({ success: true, ...result });
    }
  );
}
