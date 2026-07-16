/**
 * Admin-only endpoints for merchant subscriptions.
 *
 * Registered in index.ts under prefix /v1/admin/merchant-subscriptions.
 * Follows the same encapsulation pattern as verification/routes/admin.routes.ts:
 *   - own auth plugin registration
 *   - preHandler that gates on admin/super_admin/manager/support roles
 *   - anything else → 403 forbidden
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { auth } from "../../plugins/auth.js";
import { refundMerchantSubscriptionPayment } from "./merchant-subscription.service.js";

function isAdminLikeRole(r: string): boolean {
  return r === "admin" || r === "super_admin" || r === "manager" || r === "support";
}

const refundBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

export const merchantSubscriptionAdminRoutes: FastifyPluginAsync = async (app) => {
  await app.register(async (admin) => {
    await admin.register(auth, { required: false });
    admin.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
      const role = req.auth?.role ?? "";
      if (!req.auth?.sub || !isAdminLikeRole(role)) {
        return reply.code(403).send({ error: "forbidden", reason: "admin_role_required" });
      }
    });

    /**
     * POST /v1/admin/merchant-subscriptions/payments/:paymentId/refund
     * Body: { reason?: string }
     *
     * Fully refunds a merchant-subscription payment AND eagerly revokes the
     * associated subscription.
     *
     *   Wallet payment  → merchant_wallet AVAILABLE is credited with a fresh
     *                     idempotent ledger entry, payment marked REFUNDED,
     *                     subscription → REFUNDED + is_active=false.
     *   Razorpay payment → Razorpay Refund API is called, payment marked
     *                     REFUND_PENDING (webhook confirms → REFUNDED),
     *                     subscription eagerly revoked to REFUNDED.
     *
     * Idempotent: calling twice on an already-refunded payment returns
     * { alreadyRefunded: true } without side effects.
     */
    admin.post<{ Params: { paymentId: string }; Body: unknown }>(
      "/payments/:paymentId/refund",
      async (req, reply) => {
        const paymentId = Number(req.params.paymentId);
        if (!Number.isInteger(paymentId) || paymentId < 1) {
          return reply.code(400).send({ success: false, error: "invalid_payment_id" });
        }
        const body = refundBodySchema.parse(req.body ?? {});

        const result = await refundMerchantSubscriptionPayment({
          paymentId,
          actorSubjectId: req.auth!.sub!,
          actorRole: req.auth!.role ?? "admin",
          reason: body.reason,
        });

        if (!result.ok) {
          return reply.code(result.status).send({ success: false, error: result.error });
        }
        return reply.send({
          success: true,
          paymentId: result.paymentId,
          subscriptionId: result.subscriptionId,
          gateway: result.gateway,
          refundReference: result.refundReference,
          alreadyRefunded: result.alreadyRefunded,
          message:
            result.gateway === "WALLET"
              ? "Refunded to wallet. Subscription revoked."
              : result.alreadyRefunded
              ? "Refund already recorded."
              : "Razorpay refund initiated. Subscription revoked. Webhook will confirm the payout.",
        });
      }
    );
  });
};
