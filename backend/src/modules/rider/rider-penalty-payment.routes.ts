import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createRiderPenaltyPaymentOrder,
  verifyRiderPenaltyPayment,
  recordRiderWalletPaymentAttempt,
  getRiderWalletPaymentHistory,
  reconcileRiderWalletPayments,
} from "../../lib/rider-penalty-payment.service.js";

function parseRiderIdFromAuth(sub: string): number | null {
  const match = sub.match(/usr_(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
}

export function registerRiderPenaltyPaymentRoutes(app: FastifyInstance) {
  app.post("/penalty/create-payment-order", async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    if (riderId == null) {
      return reply.code(403).send({ success: false, error: "rider_not_found" });
    }

    const result = await createRiderPenaltyPaymentOrder(riderId);
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
    });
  });

  app.post("/penalty/verify-payment", async (req, reply) => {
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

    const result = await verifyRiderPenaltyPayment({
      riderId,
      razorpayOrderId: body.razorpayOrderId,
      razorpayPaymentId: body.razorpayPaymentId,
      razorpaySignature: body.razorpaySignature,
    });

    if (!result.ok) {
      return reply.code(result.status).send({ success: false, error: result.error });
    }

    return reply.send({
      success: true,
      creditedAmount: result.creditedAmount,
      totalBalance: result.totalBalance,
      reactivatedServices: "reactivatedServices" in result ? result.reactivatedServices : [],
      idempotent: result.idempotent,
    });
  });

  // Record a cancelled / failed attempt (Razorpay sheet dismissed or gateway error).
  app.post("/penalty/attempt", async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    if (riderId == null) {
      return reply.code(403).send({ success: false, error: "rider_not_found" });
    }
    const body = z
      .object({
        razorpayOrderId: z.string().min(1),
        status: z.enum(["failed", "cancelled"]),
        reason: z.string().max(300).optional(),
      })
      .parse(req.body ?? {});

    await recordRiderWalletPaymentAttempt({
      riderId,
      razorpayOrderId: body.razorpayOrderId,
      status: body.status,
      reason: body.reason,
    });
    return reply.send({ success: true });
  });

  // Rider's own wallet-payment history. Reconcile any stuck orders first so a
  // captured-but-unconfirmed payment self-heals before the rider looks at it.
  app.get("/penalty/history", async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    if (riderId == null) {
      return reply.code(403).send({ success: false, error: "rider_not_found" });
    }
    try {
      await reconcileRiderWalletPayments(riderId);
    } catch {
      // best-effort — history must render even if reconciliation is unavailable
    }
    const payments = await getRiderWalletPaymentHistory(riderId);
    return reply.send({ success: true, payments });
  });

  // Explicit reconcile — the app can call this on foreground/return-from-payment to
  // confirm any pending/delayed Razorpay payment as success or failed.
  app.post("/penalty/reconcile", async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    if (riderId == null) {
      return reply.code(403).send({ success: false, error: "rider_not_found" });
    }
    const outcomes = await reconcileRiderWalletPayments(riderId);
    const settled = outcomes.filter(
      (o) => o.result === "settled" || o.result === "already_settled"
    ).length;
    return reply.send({ success: true, reconciled: outcomes.length, settled, outcomes });
  });
}
