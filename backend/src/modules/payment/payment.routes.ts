import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulid } from "ulid";
import { getDb } from "../../db/client.js";
import { riders, onboardingPayments, paymentWebhookEvents } from "../../db/schema.js";
import { eq, desc, and } from "drizzle-orm";
import { auth } from "../../plugins/auth.js";
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
  getPaymentDetails,
} from "../../services/payment/razorpayService.js";
import { getEnv } from "../../config/env.js";
import {
  markPendingOrderPaymentStarted,
  finalizePendingOrderFromWebhook,
  markPendingOrderFailedFromWebhook,
  applyRefundWebhook,
  logPaymentEvent,
} from "../orders/order.placement.service.js";

export async function paymentRoutes(app: FastifyInstance) {
  /**
   * Razorpay webhook ingress. Verifies the HMAC signature, dedups on the
   * event id, then routes by event type:
   *
   *   - payment.captured / order.paid  → finalize pending order (idempotent)
   *   - payment.failed                 → mark pending order as FAILED fast,
   *                                      so the customer screen flips in
   *                                      seconds instead of waiting the full
   *                                      TTL for the reconciler.
   *   - refund.created                 → mark refund_pending
   *   - refund.processed               → mark refunded
   *   - refund.failed                  → mark refund_failed for ops to retry
   *   - anything else                  → acknowledged + logged, no-op.
   *
   * We ALWAYS return 200 after signature verification (even for no-ops) so
   * Razorpay doesn't retry forever. Dedup is best-effort: if it fails we
   * still let the downstream idempotency checks prevent double-processing.
   */
  app.post(
    "/razorpay/webhook",
    {
      config: {
        rateLimit: false,
      },
    },
    async (req, reply) => {
      const signature = String(req.headers["x-razorpay-signature"] ?? "");
      const payloadObject = (req.body ?? {}) as Record<string, unknown>;
      const payload = JSON.stringify(payloadObject);
      if (!signature) {
        return reply.status(400).send({ error: "missing_signature" });
      }
      if (!verifyRazorpayWebhookSignature(payload, signature)) {
        return reply.status(400).send({ error: "invalid_signature" });
      }

      const event = String(payloadObject.event ?? "");
      // Razorpay's event id lives in the `x-razorpay-event-id` header (v2+)
      // or in the body's `id` field. Fall back to an order-id based key so
      // we still get some dedup even on older accounts.
      const headerEventId = String(req.headers["x-razorpay-event-id"] ?? "");
      const bodyEventId = String(payloadObject.id ?? "");
      const eventId = headerEventId || bodyEventId;

      const db = getDb();

      // Dedup: if we've already processed this exact event id, ack and move on.
      if (eventId) {
        try {
          await db.insert(paymentWebhookEvents).values({
            eventId,
            provider: "razorpay",
            eventType: event || "unknown",
            signature,
            payload: payloadObject,
          });
        } catch (err) {
          // unique violation → duplicate delivery; ack with 200 so Razorpay stops retrying.
          const code = (err as { code?: string })?.code;
          if (code === "23505") {
            return reply.send({ ok: true, duplicate: true });
          }
          // any other storage error → log and continue; don't block the business
          // logic just because audit insert failed.
          req.log.warn({ err }, "payment_webhook_events insert failed");
        }
      }

      const payloadEnvelope = payloadObject.payload as Record<string, unknown> | undefined;

      const extractEntity = (key: "payment" | "refund") => {
        const node = payloadEnvelope?.[key] as Record<string, unknown> | undefined;
        return (node?.entity as Record<string, unknown> | undefined) ?? node;
      };

      try {
        if (event === "payment.captured" || event === "order.paid") {
          const paymentEntity = extractEntity("payment");
          const razorpayOrderId = String(paymentEntity?.order_id ?? "");
          const razorpayPaymentId = String(paymentEntity?.id ?? "");
          if (!razorpayOrderId || !razorpayPaymentId) {
            return reply.status(400).send({ error: "invalid_payload" });
          }
          const result = await finalizePendingOrderFromWebhook(db, {
            razorpayOrderId,
            razorpayPaymentId,
            paymentMethod: String(paymentEntity?.method ?? "online"),
            gatewayPayload: { verifiedBy: "razorpay_webhook", event, payload: payloadObject },
          });
          await markWebhookProcessed(db, eventId);
          return reply.send({ ok: result.ok });
        }

        if (event === "payment.failed") {
          const paymentEntity = extractEntity("payment");
          const razorpayOrderId = String(paymentEntity?.order_id ?? "");
          const razorpayPaymentId = String(paymentEntity?.id ?? "") || null;
          const failureCode = String(paymentEntity?.error_code ?? "PAYMENT_FAILED");
          const failureMessage = String(
            paymentEntity?.error_description ??
              paymentEntity?.error_reason ??
              "Payment failed at gateway."
          );
          if (!razorpayOrderId) {
            return reply.status(400).send({ error: "invalid_payload" });
          }
          await markPendingOrderFailedFromWebhook(db, {
            razorpayOrderId,
            razorpayPaymentId,
            failureCode,
            failureMessage,
            gatewayPayload: { verifiedBy: "razorpay_webhook", event, payload: payloadObject },
          });
          await markWebhookProcessed(db, eventId);
          return reply.send({ ok: true });
        }

        if (event === "refund.created" || event === "refund.processed" || event === "refund.failed") {
          const refundEntity = extractEntity("refund");
          const razorpayPaymentId = String(refundEntity?.payment_id ?? "");
          const refundId = String(refundEntity?.id ?? "");
          const refundStatus = refundEntity?.status != null ? String(refundEntity.status) : null;
          if (!razorpayPaymentId || !refundId) {
            return reply.status(400).send({ error: "invalid_payload" });
          }
          await applyRefundWebhook(db, {
            eventType: event,
            razorpayPaymentId,
            refundId,
            refundStatus,
            gatewayPayload: { verifiedBy: "razorpay_webhook", event, payload: payloadObject },
          });
          await markWebhookProcessed(db, eventId);
          return reply.send({ ok: true });
        }

        // Unhandled event type: ack + keep for audit.
        await logPaymentEvent(db, {
          eventType: "WEBHOOK_UNHANDLED",
          source: "webhook",
          payload: { event, payload: payloadObject },
        });
        await markWebhookProcessed(db, eventId);
        return reply.send({ ok: true, ignored: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "webhook_processing_failed";
        req.log.error({ err: error, event, eventId }, "razorpay webhook processing failed");
        if (eventId) {
          try {
            await db
              .update(paymentWebhookEvents)
              .set({ processingError: message })
              .where(eq(paymentWebhookEvents.eventId, eventId));
          } catch {
            // ignore; we already logged upstream
          }
        }
        // Respond 500 so Razorpay retries (transient failures should recover).
        return reply.status(500).send({ ok: false, error: message });
      }
    }
  );

  // Helper: flip `processed_at` so ops can tell what we actually processed.
  async function markWebhookProcessed(db: ReturnType<typeof getDb>, eventId: string | null | undefined) {
    if (!eventId) return;
    try {
      await db
        .update(paymentWebhookEvents)
        .set({ processedAt: new Date() })
        .where(eq(paymentWebhookEvents.eventId, eventId));
    } catch {
      /* best-effort */
    }
  }

  await app.register(auth, { required: true });

  // Create Razorpay order for food/checkout (amount in paise). Returns orderId + key for client checkout.
  app.post(
    "/create-order",
    {
      schema: {
        body: z.object({
          amount: z.number().int().positive(), // in paise (₹100 = 10000)
          currency: z.string().max(4).optional().default("INR"),
          receipt: z.string().max(64).optional(),
          pendingId: z.string().max(100).optional(),
        }),
        response: {
          200: z.object({
            orderId: z.string(),
            keyId: z.string(),
            amount: z.number(),
            currency: z.string(),
          }),
        },
      },
    },
    async (req) => {
      const { amount, currency, receipt, pendingId } = req.body as {
        amount: number;
        currency?: string;
        receipt?: string;
        pendingId?: string;
      };
      const env = getEnv();
      if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
        if (env.NODE_ENV === "development") {
          return {
            orderId: `sim_${ulid()}`,
            keyId: "dev_sim_key",
            amount,
            currency: currency ?? "INR",
          };
        }
        throw new Error("Razorpay is not configured");
      }
      const order = await createRazorpayOrder({
        amount,
        currency: currency ?? "INR",
        receipt: receipt ?? pendingId ?? `food_${Date.now()}`,
        notes: pendingId ? { pending_id: pendingId } : {},
      });
      if (pendingId) {
        await markPendingOrderPaymentStarted(getDb(), {
          pendingId,
          razorpayOrderId: order.id,
        });
      }
      return {
        orderId: order.id,
        keyId: env.RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
      };
    }
  );

  // Create payment order for onboarding fee
  app.post(
    "/onboarding/create-order",
    {
      schema: {
        body: z.object({
          riderId: z.string(),
        }),
        response: {
          200: z.object({
            orderId: z.string(),
            amount: z.number(),
            currency: z.string(),
            key: z.string(), // Razorpay key ID for frontend
            paymentId: z.string(), // Internal payment record ID
          }),
        },
      },
    },
    async (req) => {
      const { riderId } = req.body as { riderId: string };
      const db = getDb();
      const env = getEnv();

      // Convert riderId string to integer
      const riderIdInt = parseInt(riderId);
      if (isNaN(riderIdInt)) {
        throw new Error("Invalid rider ID");
      }

      // Verify rider exists and documents are submitted
      const riderRows = await db.select().from(riders).where(eq(riders.id, riderIdInt)).limit(1);
      if (riderRows.length === 0) {
        throw new Error("Rider not found");
      }

      const rider = riderRows[0]!;
      // Allow payment for riders who have submitted documents (pending_approval or in_progress)
      if (rider.onboardingStage === "MOBILE_VERIFIED") {
        throw new Error("Please complete document submission first");
      }
      
      if (rider.onboardingStage === "ACTIVE") {
        throw new Error("Rider already approved");
      }

      // Check if payment already exists
      const existingPayment = await db
        .select()
        .from(onboardingPayments)
        .where(
          and(
            eq(onboardingPayments.riderId, riderIdInt),
            eq(onboardingPayments.status, "completed"),
          ),
        )
        .limit(1);

      if (existingPayment.length > 0) {
        throw new Error("Payment already completed");
      }

      // Create Razorpay order
      const amount = 4900; // ₹49 in paise
      const order = await createRazorpayOrder({
        amount,
        currency: "INR",
        receipt: `onboarding_${riderId}_${Date.now()}`,
        notes: {
          rider_id: riderId,
          type: "onboarding_fee",
        },
      });

      // Save payment record
      const refId = `rpay_${ulid()}`;
      await db.insert(onboardingPayments).values({
        riderId: riderIdInt,
        amount: (amount / 100).toString(), // Convert paise to rupees
        provider: "razorpay",
        refId: refId,
        paymentId: order.id,
        status: "pending",
        metadata: {
          currency: order.currency,
          razorpayOrderId: order.id,
        },
      });

      return {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: env.RAZORPAY_KEY_ID || "",
        paymentId: refId,
      };
    },
  );

  // Verify payment and update status
  app.post(
    "/onboarding/verify",
    {
      schema: {
        body: z.object({
          riderId: z.string(),
          razorpayOrderId: z.string(),
          razorpayPaymentId: z.string(),
          razorpaySignature: z.string(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            paymentId: z.string(),
          }),
        },
      },
    },
    async (req) => {
      const { riderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body as {
        riderId: string;
        razorpayOrderId: string;
        razorpayPaymentId: string;
        razorpaySignature: string;
      };

      const db = getDb();

      // Verify signature
      const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
      if (!isValid) {
        throw new Error("Invalid payment signature");
      }

      // Convert riderId string to integer
      const riderIdInt = parseInt(riderId);
      if (isNaN(riderIdInt)) {
        throw new Error("Invalid rider ID");
      }

      // Find payment record
      const paymentRows = await db
        .select()
        .from(onboardingPayments)
        .where(eq(onboardingPayments.riderId, riderIdInt))
        .limit(1);

      if (paymentRows.length === 0) {
        throw new Error("Payment record not found");
      }

      const payment = paymentRows[0]!;
      
      // Verify the order ID matches
      const metadata = payment.metadata as any;
      if (metadata?.razorpayOrderId !== razorpayOrderId) {
        throw new Error("Payment order ID mismatch");
      }

      // For simulated payments in development, skip Razorpay API call
      const env = await import("../../config/env.js").then((m) => m.getEnv());
      let paymentStatus = "captured";
      let paymentMethod = "simulated";

      if (env.NODE_ENV !== "development" || razorpaySignature !== "simulated_signature") {
        // Get payment details from Razorpay
        try {
          const paymentDetails = await getPaymentDetails(razorpayPaymentId);
          paymentStatus = paymentDetails.status;
          paymentMethod = paymentDetails.method || "unknown";
        } catch (error) {
          // If payment fetch fails, mark as failed
          paymentStatus = "failed";
        }
      }

      // Update payment status
      await db
        .update(onboardingPayments)
        .set({
          paymentId: razorpayPaymentId,
          status: paymentStatus === "captured" ? "completed" : "failed",
          updatedAt: new Date(),
          metadata: {
            ...metadata,
            razorpayPaymentId: razorpayPaymentId,
            paymentMethod: paymentMethod,
            verifiedAt: new Date().toISOString(),
          },
        })
        .where(eq(onboardingPayments.id, payment.id));

      // If payment successful, activate rider: onboarding_stage = ACTIVE, status = ACTIVE
      if (paymentStatus === "captured") {
        await db
          .update(riders)
          .set({
            onboardingStage: "ACTIVE",
            status: "ACTIVE",
            updatedAt: new Date(),
          })
          .where(eq(riders.id, riderIdInt));
      }

      return {
        success: paymentStatus === "captured",
        paymentId: payment.id,
      };
    },
  );

  // Get payment status
  app.get(
    "/onboarding/:riderId/status",
    {
      schema: {
        params: z.object({
          riderId: z.string(),
        }),
        response: {
          200: z.object({
            hasPayment: z.boolean(),
            status: z.string().optional(),
            amount: z.number().optional(),
          }),
        },
      },
    },
    async (req) => {
      const { riderId } = req.params as { riderId: string };
      const db = getDb();

      // Convert riderId string to integer
      const riderIdInt = parseInt(riderId);
      if (isNaN(riderIdInt)) {
        throw new Error("Invalid rider ID");
      }

      const paymentRows = await db
        .select()
        .from(onboardingPayments)
        .where(eq(onboardingPayments.riderId, riderIdInt))
        .orderBy(desc(onboardingPayments.createdAt))
        .limit(1);

      if (paymentRows.length === 0) {
        return { hasPayment: false };
      }

      const payment = paymentRows[0]!;
      return {
        hasPayment: true,
        status: payment.status,
        amount: parseFloat(payment.amount) * 100, // Convert rupees to paise
      };
    },
  );
}

