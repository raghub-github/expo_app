import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createRiderPenaltyPaymentOrder,
  verifyRiderPenaltyPayment,
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
      idempotent: result.idempotent,
    });
  });
}
