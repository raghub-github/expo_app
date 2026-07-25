import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulid } from "ulid";
import { getDb, getSql } from "../../db/client.js";
import { emitEvent } from "../notifications/eventBus.js";
import { riders, onboardingPayments, paymentWebhookEvents } from "../../db/schema.js";
import { eq, desc, and, or, sql } from "drizzle-orm";
import { auth } from "../../plugins/auth.js";
import { ensureRiderOnboardingStageForPayment } from "../../lib/rider-onboarding-progress.js";
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
        // Razorpay authenticates via X-Razorpay-Signature HMAC (verified in the
        // handler). It has no JWT to present. The auth plugin honors this flag
        // and returns immediately — see backend/src/plugins/auth.ts.
        skipAuth: true,
      },
    },
    async (req, reply) => {
      // Full lifecycle observability: log start → signature → dedup → handler → result,
      // each entry timestamped to `payment_events`. Lets ops trace a single webhook
      // through every state transition without having to grep server logs.
      const startedAtMs = Date.now();
      const signature = String(req.headers["x-razorpay-signature"] ?? "");
      const payloadObject = (req.body ?? {}) as Record<string, unknown>;
      const payload = JSON.stringify(payloadObject);
      const event = String(payloadObject.event ?? "");
      const headerEventId = String(req.headers["x-razorpay-event-id"] ?? "");
      const bodyEventId = String(payloadObject.id ?? "");
      const eventId = headerEventId || bodyEventId;
      const db = getDb();

      // 1. WEBHOOK_RECEIVED — first sign of life, before any validation.
      await logPaymentEvent(db, {
        eventType: "WEBHOOK_RECEIVED",
        source: "webhook",
        payload: { event, eventId, signaturePresent: signature.length > 0, timestamp: startedAtMs },
      });

      if (!signature) {
        await logPaymentEvent(db, {
          eventType: "WEBHOOK_REJECTED_MISSING_SIGNATURE",
          source: "webhook",
          payload: { event, eventId, durationMs: Date.now() - startedAtMs },
        });
        return reply.status(400).send({ error: "missing_signature" });
      }
      if (!verifyRazorpayWebhookSignature(payload, signature)) {
        await logPaymentEvent(db, {
          eventType: "WEBHOOK_REJECTED_INVALID_SIGNATURE",
          source: "webhook",
          payload: { event, eventId, durationMs: Date.now() - startedAtMs },
        });
        return reply.status(400).send({ error: "invalid_signature" });
      }

      // 2. WEBHOOK_VERIFIED — HMAC passed. From here on the payload is trusted.
      await logPaymentEvent(db, {
        eventType: "WEBHOOK_VERIFIED",
        source: "webhook",
        payload: { event, eventId, durationMs: Date.now() - startedAtMs },
      });

      // 3. Dedup against payment_webhook_events.event_id (UNIQUE constraint).
      // Razorpay re-delivers webhooks aggressively (every 5min for 24h) until 200,
      // so this is critical to prevent double-finalization of orders.
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
            await logPaymentEvent(db, {
              eventType: "WEBHOOK_DUPLICATE",
              source: "webhook",
              payload: { event, eventId, durationMs: Date.now() - startedAtMs },
            });
            return reply.send({ ok: true, duplicate: true });
          }
          // any other storage error → log and continue; don't block the business
          // logic just because audit insert failed.
          req.log.warn({ err }, "payment_webhook_events insert failed");
          await logPaymentEvent(db, {
            eventType: "WEBHOOK_DEDUP_INSERT_FAILED",
            source: "webhook",
            failureMessage: (err as Error)?.message ?? "unknown",
            payload: { event, eventId, durationMs: Date.now() - startedAtMs },
          });
        }
      }

      const payloadEnvelope = payloadObject.payload as Record<string, unknown> | undefined;

      const extractEntity = (key: "payment" | "refund") => {
        const node = payloadEnvelope?.[key] as Record<string, unknown> | undefined;
        return (node?.entity as Record<string, unknown> | undefined) ?? node;
      };

      // 4. WEBHOOK_DISPATCH — about to invoke the type-specific handler.
      await logPaymentEvent(db, {
        eventType: "WEBHOOK_DISPATCH",
        source: "webhook",
        payload: { event, eventId, durationMs: Date.now() - startedAtMs },
      });

      try {
        if (event === "payment.captured" || event === "order.paid") {
          const paymentEntity = extractEntity("payment");
          const razorpayOrderId = String(paymentEntity?.order_id ?? "");
          const razorpayPaymentId = String(paymentEntity?.id ?? "");
          if (!razorpayOrderId || !razorpayPaymentId) {
            await logPaymentEvent(db, {
              eventType: "WEBHOOK_REJECTED_INVALID_PAYLOAD",
              source: "webhook",
              payload: { event, eventId, reason: "missing order_id or payment id", durationMs: Date.now() - startedAtMs },
            });
            return reply.status(400).send({ error: "invalid_payload" });
          }

          // Merchant-subscription safety net — when the order was created for a
          // merchant plan (notes.merchant_store_pk is set by createMerchantSubscription
          // PaymentOrder), route to the merchant-sub activation. This covers the
          // "app crashed / phone died between capture and verify-payment" case
          // where the client never confirms the payment. Idempotent — a no-op
          // if the client already called verify-payment.
          const notes = (paymentEntity?.notes ?? {}) as Record<string, unknown>;
          if (notes && (notes.merchant_store_pk ?? notes.merchantStorePk)) {
            const { activateMerchantSubscriptionFromWebhook } = await import(
              "../merchant-partner/merchant-subscription.service.js"
            );
            const activation = await activateMerchantSubscriptionFromWebhook({
              razorpayOrderId,
              razorpayPaymentId,
              notes,
            });
            await markWebhookProcessed(db, eventId);
            await logPaymentEvent(db, {
              eventType: activation.ok ? "WEBHOOK_HANDLED_OK" : "WEBHOOK_HANDLER_FAILED",
              source: "webhook",
              razorpayOrderId,
              razorpayPaymentId,
              payload: {
                event,
                eventId,
                handler: "merchant_subscription",
                ok: activation.ok,
                subscriptionId: activation.ok ? activation.subscriptionId : null,
                idempotent: activation.ok ? activation.idempotent : null,
                errorCode: activation.ok ? null : activation.code,
                errorMessage: activation.ok ? null : activation.message,
                durationMs: Date.now() - startedAtMs,
              },
            });
            // ALWAYS 200 so Razorpay stops retrying — the error is logged for ops.
            return reply.send({ ok: activation.ok, handler: "merchant_subscription" });
          }

          const result = await finalizePendingOrderFromWebhook(db, {
            razorpayOrderId,
            razorpayPaymentId,
            paymentMethod: String(paymentEntity?.method ?? "online"),
            gatewayPayload: { verifiedBy: "razorpay_webhook", event, payload: payloadObject },
          });
          await markWebhookProcessed(db, eventId);
          await logPaymentEvent(db, {
            eventType: "WEBHOOK_HANDLED_OK",
            source: "webhook",
            razorpayOrderId,
            razorpayPaymentId,
            payload: { event, eventId, finalizedOk: result.ok, finalizeCode: result.code ?? null, durationMs: Date.now() - startedAtMs },
          });
          if (result.ok) {
            void (async () => {
              try {
                const sql = getSql();
                const rows = (await sql`
                  SELECT c.order_id, c.customer_id, c.grand_total
                  FROM public.orders_core c
                  WHERE c.razorpay_order_id = ${razorpayOrderId}
                  LIMIT 1
                `) as unknown as Array<{ order_id: string; customer_id: string; grand_total: number | string }>;
                const row = rows[0];
                if (row?.customer_id && row.order_id) {
                  emitEvent("payment.settled", {
                    orderId: String(row.order_id),
                    customerId: String(row.customer_id),
                    amount: Number(row.grand_total ?? 0),
                    status: "SUCCESS",
                  });
                }
              } catch { /* tolerated */ }
            })();
          }
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
            await logPaymentEvent(db, {
              eventType: "WEBHOOK_REJECTED_INVALID_PAYLOAD",
              source: "webhook",
              payload: { event, eventId, reason: "missing order_id", durationMs: Date.now() - startedAtMs },
            });
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
          await logPaymentEvent(db, {
            eventType: "WEBHOOK_HANDLED_OK",
            source: "webhook",
            razorpayOrderId,
            razorpayPaymentId,
            failureCode,
            failureMessage,
            payload: { event, eventId, durationMs: Date.now() - startedAtMs },
          });
          void (async () => {
            try {
              const sql = getSql();
              const rows = (await sql`
                SELECT c.order_id, c.customer_id, c.grand_total
                FROM public.orders_core c
                WHERE c.razorpay_order_id = ${razorpayOrderId}
                LIMIT 1
              `) as unknown as Array<{ order_id: string; customer_id: string; grand_total: number | string }>;
              const row = rows[0];
              if (row?.customer_id && row.order_id) {
                emitEvent("payment.settled", {
                  orderId: String(row.order_id),
                  customerId: String(row.customer_id),
                  amount: Number(row.grand_total ?? 0),
                  status: "FAILED",
                  reason: failureMessage,
                });
              }
            } catch { /* tolerated */ }
          })();
          return reply.send({ ok: true });
        }

        if (event === "refund.created" || event === "refund.processed" || event === "refund.failed") {
          const refundEntity = extractEntity("refund");
          const razorpayPaymentId = String(refundEntity?.payment_id ?? "");
          const refundId = String(refundEntity?.id ?? "");
          const refundStatus = refundEntity?.status != null ? String(refundEntity.status) : null;
          if (!razorpayPaymentId || !refundId) {
            await logPaymentEvent(db, {
              eventType: "WEBHOOK_REJECTED_INVALID_PAYLOAD",
              source: "webhook",
              payload: { event, eventId, reason: "missing refund payment_id or id", durationMs: Date.now() - startedAtMs },
            });
            return reply.status(400).send({ error: "invalid_payload" });
          }
          await applyRefundWebhook(db, {
            eventType: event,
            razorpayPaymentId,
            refundId,
            refundStatus,
            gatewayPayload: { verifiedBy: "razorpay_webhook", event, payload: payloadObject },
          });

          // Onboarding-fee refund reflection: match by razorpay payment id
          // against onboarding_payments.payment_id (set at verify). Keeps the
          // rider onboarding payment status in sync whether the refund was
          // triggered by our admin action or directly in the Razorpay dashboard.
          try {
            const obRows = await db
              .select()
              .from(onboardingPayments)
              .where(eq(onboardingPayments.paymentId, razorpayPaymentId))
              .limit(1);
            const ob = obRows[0];
            if (ob) {
              const meta = (ob.metadata ?? {}) as Record<string, unknown>;
              const totalPaise = Math.round(Number(ob.amount) * 100);
              const refundedPaise = Number(refundEntity?.amount ?? 0);
              const isPartial = refundedPaise > 0 && refundedPaise < totalPaise;
              // onboarding_payments.status has no "partially_refunded" — mark
              // "refunded" and record the partial flag/amount in metadata.
              const nextStatus =
                event === "refund.processed" ? "refunded" : ob.status;
              await db
                .update(onboardingPayments)
                .set({
                  status: nextStatus,
                  updatedAt: new Date(),
                  metadata: {
                    ...meta,
                    refundId,
                    refundStatus,
                    refundedAmountPaise: refundedPaise || meta.refundedAmountPaise,
                    refundPartial: isPartial,
                    refundEvent: event,
                    refundUpdatedAt: new Date().toISOString(),
                  },
                })
                .where(eq(onboardingPayments.id, ob.id));
              await logPaymentEvent(db, {
                eventType:
                  event === "refund.processed"
                    ? "ONBOARDING_REFUND_PROCESSED"
                    : event === "refund.failed"
                      ? "ONBOARDING_REFUND_FAILED"
                      : "ONBOARDING_REFUND_CREATED",
                source: "webhook",
                razorpayPaymentId,
                payload: { refundId, refundStatus, riderId: ob.riderId, refundedPaise, ts: Date.now() },
              });
            }
          } catch (err) {
            req.log.warn({ err }, "onboarding refund webhook reflection failed");
          }

          // Also try the merchant-subscription refund handler — idempotent and
          // scoped (matches by payment_gateway_id in subscription_payments). If
          // this refund was for a customer order, this is a no-op (matched=false).
          // Only run the confirmation on "processed" — created/failed do not
          // mean money has moved yet.
          let merchantSubMatched = false;
          if (event === "refund.processed") {
            try {
              const { handleMerchantSubscriptionRefundWebhook } = await import(
                "../merchant-partner/merchant-subscription.service.js"
              );
              const r = await handleMerchantSubscriptionRefundWebhook({
                razorpayPaymentId,
                razorpayRefundId: refundId,
              });
              merchantSubMatched = r.matched;
            } catch (err) {
              // Don't block the customer-order refund path if the merchant-sub
              // handler blows up — log and continue.
              req.log.warn({ err }, "merchant subscription refund webhook handler failed");
            }
          }

          await markWebhookProcessed(db, eventId);
          await logPaymentEvent(db, {
            eventType: "WEBHOOK_HANDLED_OK",
            source: "webhook",
            razorpayPaymentId,
            payload: { event, eventId, refundId, refundStatus, merchantSubMatched, durationMs: Date.now() - startedAtMs },
          });
          return reply.send({ ok: true, merchantSubMatched });
        }

        // Unhandled event type: ack + keep for audit.
        await logPaymentEvent(db, {
          eventType: "WEBHOOK_UNHANDLED",
          source: "webhook",
          payload: { event, eventId, payload: payloadObject, durationMs: Date.now() - startedAtMs },
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
        await logPaymentEvent(db, {
          eventType: "WEBHOOK_HANDLER_ERROR",
          source: "webhook",
          failureMessage: message,
          payload: { event, eventId, durationMs: Date.now() - startedAtMs },
        });
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

      // Dummy mode: bypass Razorpay entirely. Returns synthetic order/key IDs
      // that the customer app recognizes (keyId starting with "dummy_") and
      // renders the Simulate Success / Failure sheet. The pending row still
      // gets razorpayOrderId set so the existing finalize flow + reconciler
      // continue to work unchanged.
      const dummyModeActive =
        env.PAYMENT_DUMMY_MODE ||
        !env.RAZORPAY_KEY_ID ||
        !env.RAZORPAY_KEY_SECRET;

      if (dummyModeActive) {
        if (!env.PAYMENT_DUMMY_MODE && env.NODE_ENV !== "development") {
          // In production without PAYMENT_DUMMY_MODE, missing Razorpay keys is fatal.
          throw new Error("Razorpay is not configured");
        }
        const orderId = `dummy_${ulid()}`;
        if (pendingId) {
          await markPendingOrderPaymentStarted(getDb(), {
            pendingId,
            razorpayOrderId: orderId,
          });
        }
        return {
          orderId,
          keyId: "dummy_key",
          amount,
          currency: currency ?? "INR",
        };
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

  /**
   * Dummy-mode failure endpoint — the customer app calls this when the user
   * taps "Simulate Failure" in the dummy payment sheet. Marks the pending
   * order as FAILED via the same path used by the real payment.failed webhook,
   * so the reconciler / refund flow / activeOrder unlock logic all behave
   * identically to a real Razorpay failure.
   *
   * Guarded — only works when PAYMENT_DUMMY_MODE is enabled.
   */
  app.post(
    "/dummy/fail",
    {
      schema: {
        body: z.object({
          pendingId: z.string().min(1),
          razorpayOrderId: z.string().min(1),
          reason: z.string().max(200).optional(),
        }),
        response: {
          200: z.object({
            ok: z.boolean(),
            code: z.string().optional(),
            message: z.string().optional(),
          }),
        },
      },
    },
    async (req, reply) => {
      const env = getEnv();
      if (!env.PAYMENT_DUMMY_MODE && env.NODE_ENV !== "development") {
        return reply.send({
          ok: false,
          code: "DUMMY_MODE_DISABLED",
          message: "Dummy payment failure is not enabled.",
        });
      }

      const { pendingId, razorpayOrderId, reason } = req.body as {
        pendingId: string;
        razorpayOrderId: string;
        reason?: string;
      };

      const db = getDb();
      await markPendingOrderFailedFromWebhook(db, {
        razorpayOrderId,
        razorpayPaymentId: null,
        failureCode: "DUMMY_USER_DECLINED",
        failureMessage: reason || "User chose Simulate Failure in dummy payment.",
        gatewayPayload: {
          verifiedBy: "dummy_mode",
          pendingId,
          razorpayOrderId,
          ts: new Date().toISOString(),
        },
      });

      await logPaymentEvent(db, {
        eventType: "DUMMY_PAYMENT_FAILED",
        source: "client",
        pendingId,
        razorpayOrderId,
        failureCode: "DUMMY_USER_DECLINED",
        failureMessage: reason || "User chose Simulate Failure.",
        payload: { ts: Date.now() },
      });

      return reply.send({ ok: true });
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
            subtotalPaise: z.number(),
            gstAmountPaise: z.number(),
            gstPercentApplied: z.number(),
            currency: z.string(),
            key: z.string(),
            paymentId: z.string(),
          }),
        },
      },
    },
    async (req, reply) => {
      const { riderId } = req.body as { riderId: string };
      const db = getDb();
      const env = getEnv();

      const riderIdInt = parseInt(riderId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rep = reply as any;
      if (isNaN(riderIdInt)) {
        return rep.code(400).send({ error: "invalid_rider_id", message: "Invalid rider ID" });
      }

      const riderRows = await db.select().from(riders).where(eq(riders.id, riderIdInt)).limit(1);
      if (riderRows.length === 0) {
        return rep.code(404).send({ error: "rider_not_found", message: "Rider not found" });
      }

      const rider = riderRows[0]!;

      const paymentReady = await ensureRiderOnboardingStageForPayment(riderIdInt);
      if (!paymentReady.ready) {
        return rep.code(409).send({
          error: "documents_required",
          message: paymentReady.message ?? "Please complete document submission first",
        });
      }

      if (rider.onboardingStage === "ACTIVE") {
        return rep.code(409).send({ error: "already_active", message: "Rider already approved" });
      }

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
        return rep.code(409).send({ error: "payment_completed", message: "Payment already completed" });
      }

      const { getRiderOnboardingCommissionConfig, computeRiderOnboardingCheckoutPaise } =
        await import("../../lib/rider-onboarding-commission-config.js");
      const commission = await getRiderOnboardingCommissionConfig();
      const { subtotalPaise, gstPercentApplied, gstAmountPaise, totalPaise, standardAmountPaise } =
        computeRiderOnboardingCheckoutPaise(commission);

      const order = await createRazorpayOrder({
        amount: totalPaise,
        currency: "INR",
        receipt: `onboarding_${riderId}_${Date.now()}`,
        notes: {
          rider_id: riderId,
          type: "onboarding_fee",
        },
      });

      // Supersede stale pending attempts so verify always matches the latest order.
      await db
        .update(onboardingPayments)
        .set({ status: "failed", updatedAt: new Date() })
        .where(
          and(
            eq(onboardingPayments.riderId, riderIdInt),
            eq(onboardingPayments.status, "pending"),
          ),
        );

      const refId = `rpay_${ulid()}`;
      await db.insert(onboardingPayments).values({
        riderId: riderIdInt,
        amount: (totalPaise / 100).toString(),
        subtotalPaise,
        gstPercentApplied: String(gstPercentApplied),
        gstAmountPaise,
        provider: "razorpay",
        refId: refId,
        paymentId: order.id,
        status: "pending",
        metadata: {
          currency: order.currency,
          razorpayOrderId: order.id,
          standardAmountPaise,
          discountedAmountPaise: subtotalPaise,
          gstPercentApplied,
          gstAmountPaise,
        },
      });

      await logPaymentEvent(db, {
        eventType: "ONBOARDING_PAYMENT_INITIATED",
        source: "client",
        razorpayOrderId: order.id,
        payload: { riderId, refId, totalPaise, subtotalPaise, gstAmountPaise },
      });

      return {
        orderId: order.id,
        amount: order.amount,
        subtotalPaise,
        gstAmountPaise,
        gstPercentApplied,
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

      const paymentRows = await db
        .select()
        .from(onboardingPayments)
        .where(
          and(
            eq(onboardingPayments.riderId, riderIdInt),
            or(
              eq(onboardingPayments.paymentId, razorpayOrderId),
              sql`${onboardingPayments.metadata}->>'razorpayOrderId' = ${razorpayOrderId}`,
            ),
          ),
        )
        .orderBy(desc(onboardingPayments.createdAt))
        .limit(1);

      if (paymentRows.length === 0) {
        throw new Error("Payment record not found");
      }

      const payment = paymentRows[0]!;
      const metadata = (payment.metadata ?? {}) as Record<string, unknown>;

      if (payment.status === "completed") {
        return {
          success: true,
          paymentId: String(payment.id),
        };
      }

      if (payment.status === "failed") {
        throw new Error("Payment order expired. Please start payment again.");
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

      // If payment successful, move rider to approval queue and activate when docs are already verified
      if (paymentStatus === "captured") {
        await db
          .update(riders)
          .set({
            onboardingStage: "APPROVAL",
            updatedAt: new Date(),
          })
          .where(eq(riders.id, riderIdInt));

        const { tryActivateRiderIfEligible } = await import("../../lib/rider-onboarding-activation.js");
        await tryActivateRiderIfEligible(riderIdInt);
      }

      await logPaymentEvent(db, {
        eventType:
          paymentStatus === "captured"
            ? "ONBOARDING_PAYMENT_SUCCESS"
            : "ONBOARDING_PAYMENT_FAILED",
        source: "client",
        razorpayOrderId,
        razorpayPaymentId,
        payload: { riderId, paymentMethod, paymentStatus, dbPaymentId: String(payment.id) },
      });

      return {
        success: paymentStatus === "captured",
        paymentId: String(payment.id),
      };
    },
  );

  // Record a failed / abandoned onboarding payment attempt (client-reported on
  // Razorpay cancel or gateway error). Keeps the lifecycle auditable: marks the
  // still-pending row FAILED and appends a payment_events entry. Never touches a
  // completed/refunded row. Best-effort — the client fires this and forgets.
  app.post(
    "/onboarding/attempt",
    {
      schema: {
        body: z.object({
          riderId: z.string(),
          razorpayOrderId: z.string(),
          status: z.literal("failed"),
          reason: z.string().max(300).optional(),
        }),
        response: {
          200: z.object({ ok: z.boolean() }),
        },
      },
    },
    async (req) => {
      const { riderId, razorpayOrderId, reason } = req.body as {
        riderId: string;
        razorpayOrderId: string;
        status: "failed";
        reason?: string;
      };
      const db = getDb();
      const riderIdInt = parseInt(riderId);
      if (isNaN(riderIdInt)) return { ok: false };

      await db
        .update(onboardingPayments)
        .set({ status: "failed", updatedAt: new Date() })
        .where(
          and(
            eq(onboardingPayments.riderId, riderIdInt),
            eq(onboardingPayments.status, "pending"),
            or(
              eq(onboardingPayments.paymentId, razorpayOrderId),
              sql`${onboardingPayments.metadata}->>'razorpayOrderId' = ${razorpayOrderId}`,
            ),
          ),
        );

      await logPaymentEvent(db, {
        eventType: "ONBOARDING_PAYMENT_ATTEMPT_FAILED",
        source: "client",
        razorpayOrderId,
        failureMessage: reason ?? "cancelled",
        payload: { riderId, reason: reason ?? "cancelled", ts: Date.now() },
      });

      return { ok: true };
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

  // Full onboarding payment details for the rider profile "Payment details"
  // page. Returns the latest onboarding payment with breakdown + refund info.
  app.get(
    "/onboarding/:riderId/details",
    {
      schema: {
        params: z.object({ riderId: z.string() }),
        response: {
          200: z.object({
            hasPayment: z.boolean(),
            status: z.string().optional(),
            provider: z.string().optional(),
            refId: z.string().optional(),
            amountPaise: z.number().optional(),
            subtotalPaise: z.number().nullable().optional(),
            gstAmountPaise: z.number().nullable().optional(),
            gstPercentApplied: z.number().nullable().optional(),
            razorpayOrderId: z.string().nullable().optional(),
            razorpayPaymentId: z.string().nullable().optional(),
            paidAt: z.string().nullable().optional(),
            refund: z
              .object({
                status: z.string().nullable(),
                refundId: z.string().nullable(),
                amountPaise: z.number().nullable(),
                partial: z.boolean(),
                at: z.string().nullable(),
              })
              .nullable()
              .optional(),
            createdAt: z.string().optional(),
            updatedAt: z.string().optional(),
          }),
        },
      },
    },
    async (req) => {
      const { riderId } = req.params as { riderId: string };
      const db = getDb();
      const riderIdInt = parseInt(riderId);
      if (isNaN(riderIdInt)) {
        throw new Error("Invalid rider ID");
      }

      const rows = await db
        .select()
        .from(onboardingPayments)
        .where(eq(onboardingPayments.riderId, riderIdInt))
        .orderBy(desc(onboardingPayments.createdAt))
        .limit(1);

      if (rows.length === 0) {
        return { hasPayment: false };
      }

      const p = rows[0]!;
      const meta = (p.metadata ?? {}) as Record<string, unknown>;
      const asStr = (v: unknown): string | null =>
        typeof v === "string" && v.length > 0 ? v : null;
      const asNum = (v: unknown): number | null =>
        typeof v === "number" && Number.isFinite(v) ? v : null;

      const hasRefund = p.status === "refunded" || meta.refundId != null;

      return {
        hasPayment: true,
        status: p.status,
        provider: p.provider,
        refId: p.refId,
        amountPaise: Math.round(Number(p.amount) * 100),
        subtotalPaise: p.subtotalPaise ?? null,
        gstAmountPaise: p.gstAmountPaise ?? null,
        gstPercentApplied: p.gstPercentApplied != null ? Number(p.gstPercentApplied) : null,
        razorpayOrderId: asStr(meta.razorpayOrderId),
        razorpayPaymentId:
          asStr(meta.razorpayPaymentId) ?? (p.status === "completed" ? p.paymentId : null),
        paidAt: asStr(meta.verifiedAt),
        refund: hasRefund
          ? {
              status: asStr(meta.refundStatus),
              refundId: asStr(meta.refundId),
              amountPaise: asNum(meta.refundedAmountPaise),
              partial: meta.refundPartial === true,
              at: asStr(meta.refundUpdatedAt),
            }
          : null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };
    },
  );
}

