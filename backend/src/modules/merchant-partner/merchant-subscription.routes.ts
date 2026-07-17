import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPartnerParentId } from "./merchant-subscription.routes.helpers.js";
import {
  activateFreeMerchantPlan,
  createMerchantSubscriptionPaymentOrder,
  getMerchantStoreSubscription,
  listMerchantSubscriptionHistory,
  listMerchantSubscriptionRefunds,
  payMerchantSubscriptionFromWallet,
  updateMerchantSubscriptionAutoRenew,
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

const autoRenewBodySchema = z.object({
  autoRenew: z.boolean(),
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
    "/stores/:storeId/subscription/pay-with-wallet",
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
      const result = await payMerchantSubscriptionFromWallet({
        storeId,
        parentId,
        planId: body.planId,
      });

      if (!result.ok) {
        // 402 carries the "why" for the client so it can show the exact shortfall.
        const payload =
          result.error === "wallet_insufficient"
            ? {
                success: false,
                error: result.error,
                required: (result as { required?: number }).required,
                available: (result as { available?: number }).available,
              }
            : { success: false, error: result.error };
        return reply.code(result.status).send(payload);
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

  protectedApp.get<{ Params: { storeId: string } }>(
    "/stores/:storeId/subscription",
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

      const result = await getMerchantStoreSubscription({ storeId, parentId });
      if (!result.ok) {
        return reply.code(result.status).send({ success: false, error: result.error });
      }
      return reply.send({ success: true, ...result });
    }
  );

  /**
   * GET /stores/:storeId/subscription/history
   *   Query: limit=50 offset=0
   *
   * Combined merchant-visible subscription history — purchases + refunds
   * merged in one date-sorted stream. Refund events HAVE NO agent identity
   * (server-side stripped). Owns-store check enforced.
   */
  protectedApp.get<{
    Params: { storeId: string };
    Querystring: { limit?: string; offset?: string };
  }>(
    "/stores/:storeId/subscription/history",
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

      const { getSql } = await import("../../db/client.js");
      const sql = getSql();
      const [store] = await sql`
        SELECT id FROM merchant_stores
        WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
        LIMIT 1
      `;
      if (!store) return reply.code(404).send({ success: false, error: "store_not_found" });

      const result = await listMerchantSubscriptionHistory({
        storeId,
        merchantId: parentId,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
        includeActor: false,
      });
      return reply.send({ success: true, ...result });
    }
  );

  /**
   * GET /stores/:storeId/subscription/refunds
   *   Query: limit=50 offset=0
   *
   * Merchant-visible refund history for a single store. Actor identity
   * (agent who processed the refund) is INTENTIONALLY EXCLUDED — merchant
   * only sees what was refunded, when, and why. Admin identity stays private.
   */
  protectedApp.get<{
    Params: { storeId: string };
    Querystring: { limit?: string; offset?: string };
  }>(
    "/stores/:storeId/subscription/refunds",
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

      // Server-side scope check — merchant can only see refunds for stores
      // they own. Prevents storeId enumeration.
      const { getSql } = await import("../../db/client.js");
      const sql = getSql();
      const [store] = await sql`
        SELECT id FROM merchant_stores
        WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
        LIMIT 1
      `;
      if (!store) return reply.code(404).send({ success: false, error: "store_not_found" });

      const result = await listMerchantSubscriptionRefunds({
        storeId,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
        includeActor: false, // ← merchant view: no agent identity
      });
      return reply.send({ success: true, ...result });
    }
  );

  protectedApp.patch<{ Params: { storeId: string }; Body: unknown }>(
    "/stores/:storeId/subscription/auto-renew",
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

      const body = autoRenewBodySchema.parse(req.body ?? {});
      const result = await updateMerchantSubscriptionAutoRenew({
        storeId,
        parentId,
        autoRenew: body.autoRenew,
        actorUserId: req.auth.sub,
      });

      if (!result.ok) {
        return reply.code(result.status).send({ success: false, error: result.error });
      }
      return reply.send({ success: true, ...result });
    }
  );
}
