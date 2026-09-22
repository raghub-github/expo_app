/**
 * Rider onboarding-fee payment: webhook + reconciliation recovery.
 *
 * Before this module, onboarding completion depended ENTIRELY on the rider app
 * calling POST /v1/payment/onboarding/verify. If Razorpay captured the fee but
 * the app died / lost network before verify ran, the money was taken yet the
 * rider stayed stuck at "payment pending" forever — the webhook had no
 * onboarding branch and the reconciler never swept onboarding_payments.
 *
 * This adds the two server-authoritative recovery paths every reliable flow has:
 *   - finalizeOnboardingPaymentFromWebhook(): called by the Razorpay webhook
 *     (notes.type = "onboarding_fee") — idempotent with the client verify path.
 *   - reconcileOnboardingPayments(): sweeps stale pending rows and asks Razorpay
 *     the authoritative outcome (shared gateway-truth resolver). Captured →
 *     complete; gateway-confirmed-nothing → fail; unreachable/pending → leave.
 *
 * onboarding_payments.status is a pg enum {pending,completed,failed,refunded},
 * so "needs human review" is recorded in metadata + payment_events rather than a
 * new enum value (no migration). Captured money is never marked failed.
 */
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb } from "../db/client.js";
import { onboardingPayments, riders } from "../db/schema.js";
import { logPaymentEvent } from "../modules/orders/order.placement.service.js";
import { resolveGatewayTruth } from "./payment/gateway-truth.js";

type Db = PostgresJsDatabase<Record<string, unknown>>;

export type FinalizeOnboardingResult =
  | { ok: true; idempotent: boolean; activated: boolean; riderId: number }
  | { ok: false; code: string; message: string; riderId?: number };

/** Move the rider forward + create the verification ticket, then try activation. */
async function runOnboardingActivation(riderId: number): Promise<boolean> {
  const db = getDb();
  const [rider] = await db
    .select({ status: riders.status, onboardingStage: riders.onboardingStage })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);
  const alreadyActive =
    rider?.status === "ACTIVE" ||
    String(rider?.onboardingStage ?? "").toUpperCase() === "ACTIVE";
  if (!alreadyActive) {
    await db
      .update(riders)
      .set({ onboardingStage: "APPROVAL", updatedAt: new Date() })
      .where(and(eq(riders.id, riderId), sql`${riders.onboardingStage} <> 'ACTIVE'`));
  }
  try {
    const { ensureOnboardingVerificationPendingTicket } = await import(
      "./onboarding-verification-pending-ticket.js"
    );
    await ensureOnboardingVerificationPendingTicket(riderId);
  } catch {
    /* ticket best-effort */
  }
  let activated = false;
  try {
    const { tryActivateRiderIfEligible } = await import("./rider-onboarding-activation.js");
    activated = await tryActivateRiderIfEligible(riderId);
    const { ensureOnboardingVerificationPendingTicket } = await import(
      "./onboarding-verification-pending-ticket.js"
    );
    await ensureOnboardingVerificationPendingTicket(riderId);
  } catch {
    /* activation re-runs on next verify/reconcile */
  }
  return activated;
}

/**
 * Complete an onboarding-fee payment from a server-authoritative source (webhook
 * or reconciler). Idempotent: a row already `completed` re-runs activation only.
 * Amount mismatch is flagged (never completed). Never marks captured money failed.
 */
export async function finalizeOnboardingPaymentFromWebhook(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  /** Captured amount in paise, when known — validated against the row. */
  amountPaise?: number;
  notes?: Record<string, unknown> | null;
  source?: string;
}): Promise<FinalizeOnboardingResult> {
  const db = getDb();
  const razorpayOrderId = args.razorpayOrderId?.trim() ?? "";
  const razorpayPaymentId = args.razorpayPaymentId?.trim() ?? "";
  const source = args.source ?? "webhook";
  if (!razorpayOrderId || !razorpayPaymentId) {
    return { ok: false, code: "INVALID_PAYLOAD", message: "Missing order/payment id." };
  }

  // Locate the onboarding row by the gateway ORDER id. At create-order we store
  // the order id in both payment_id (until verify overwrites it with the payment
  // id) and metadata.razorpayOrderId (stable), so match on either.
  const notesRiderId = args.notes ? Number(args.notes.rider_id ?? args.notes.riderId) : NaN;
  const rows = await db
    .select()
    .from(onboardingPayments)
    .where(
      and(
        Number.isFinite(notesRiderId) ? eq(onboardingPayments.riderId, notesRiderId) : undefined,
        or(
          eq(onboardingPayments.paymentId, razorpayOrderId),
          sql`${onboardingPayments.metadata}->>'razorpayOrderId' = ${razorpayOrderId}`,
        ),
      ),
    )
    .orderBy(desc(onboardingPayments.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) {
    await logPaymentEvent(db, {
      eventType: "ONBOARDING_PAYMENT_RECORD_NOT_FOUND",
      source,
      razorpayOrderId,
      razorpayPaymentId,
      payload: { notesRiderId: Number.isFinite(notesRiderId) ? notesRiderId : null },
    });
    return { ok: false, code: "PAYMENT_RECORD_NOT_FOUND", message: "No onboarding payment for this order." };
  }

  const riderId = row.riderId;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;

  if (row.status === "completed") {
    const activated = await runOnboardingActivation(riderId);
    return { ok: true, idempotent: true, activated, riderId };
  }

  // Amount guard — never complete on a mismatched capture.
  const expectedPaise = Math.round(Number(row.amount) * 100);
  if (args.amountPaise != null && Number.isFinite(args.amountPaise) && args.amountPaise !== expectedPaise) {
    await db
      .update(onboardingPayments)
      .set({
        updatedAt: new Date(),
        metadata: {
          ...meta,
          reconciliationRequired: true,
          reconciliationCode: "PAYMENT_AMOUNT_MISMATCH",
          reconciliationMessage: `Captured ${args.amountPaise}p, expected ${expectedPaise}p.`,
          razorpayPaymentId,
          razorpayOrderId,
        },
      })
      .where(eq(onboardingPayments.id, row.id));
    await logPaymentEvent(db, {
      eventType: "RECONCILIATION_REQUIRED",
      source,
      razorpayOrderId,
      razorpayPaymentId,
      failureCode: "PAYMENT_AMOUNT_MISMATCH",
      amountPaise: args.amountPaise,
      payload: { riderId, expectedPaise },
    });
    return { ok: false, code: "PAYMENT_AMOUNT_MISMATCH", message: "Onboarding fee amount mismatch.", riderId };
  }

  // Complete idempotently: only flip a still-pending row.
  await db
    .update(onboardingPayments)
    .set({
      status: "completed",
      paymentId: razorpayPaymentId,
      updatedAt: new Date(),
      metadata: {
        ...meta,
        razorpayOrderId,
        razorpayPaymentId,
        paymentMethod: String((args.notes?.method ?? meta.paymentMethod) ?? "razorpay"),
        verifiedAt: new Date().toISOString(),
        verifiedBy: source,
        reconciliationRequired: false,
      },
    })
    .where(and(eq(onboardingPayments.id, row.id), eq(onboardingPayments.status, "pending")));

  const activated = await runOnboardingActivation(riderId);

  await logPaymentEvent(db, {
    eventType: "ONBOARDING_PAYMENT_SUCCESS",
    source,
    razorpayOrderId,
    razorpayPaymentId,
    payload: { riderId, activated, via: source, dbPaymentId: String(row.id) },
  });

  return { ok: true, idempotent: false, activated, riderId };
}

/** Only re-check a deferred row after this long (kept in metadata; no new column). */
const ONBOARDING_RECONCILE_RETRY_MS = 5 * 60 * 1000;
/** Ignore rows younger than this — give the client verify path a chance first. */
const ONBOARDING_RECONCILE_MIN_AGE_MS = 3 * 60 * 1000;

/**
 * Sweep stale pending onboarding payments and converge each against Razorpay.
 * Captured → complete (idempotent). Gateway-confirmed-nothing → fail. Unreachable
 * or still-live → leave pending (deferred). Never fails captured money.
 */
export async function reconcileOnboardingPayments(db: Db = getDb()): Promise<void> {
  const cutoff = new Date(Date.now() - ONBOARDING_RECONCILE_MIN_AGE_MS);
  let stale: (typeof onboardingPayments.$inferSelect)[] = [];
  try {
    stale = await db
      .select()
      .from(onboardingPayments)
      .where(
        and(
          eq(onboardingPayments.status, "pending"),
          eq(onboardingPayments.provider, "razorpay"),
          lt(onboardingPayments.createdAt, cutoff),
        ),
      )
      .limit(50);
  } catch {
    return; // DB unavailable; next tick
  }

  const now = Date.now();
  for (const row of stale) {
    try {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const deferUntil = Number(meta.reconcileDeferUntil ?? 0);
      if (deferUntil && now < deferUntil) continue;

      // The stable gateway order id lives in metadata.razorpayOrderId; a still
      // -pending row's payment_id also equals the order id (verify overwrites it).
      const orderId = String(meta.razorpayOrderId ?? row.paymentId ?? "");
      if (!orderId || orderId.startsWith("dummy_")) continue;

      const expectedPaise = Math.round(Number(row.amount) * 100);
      await logPaymentEvent(db, {
        eventType: "GATEWAY_RECONCILIATION_STARTED",
        source: "reconciler",
        razorpayOrderId: orderId,
        amountPaise: expectedPaise,
        payload: { riderId: row.riderId, flow: "onboarding" },
      });
      const truth = await resolveGatewayTruth({ orderId, expectedPaise });

      if (truth.state === "CAPTURED") {
        await logPaymentEvent(db, {
          eventType: "GATEWAY_RECONCILIATION_FOUND_PAYMENT",
          source: "reconciler",
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          amountPaise: truth.paidPaise,
          payload: { riderId: row.riderId, flow: "onboarding" },
        });
        await finalizeOnboardingPaymentFromWebhook({
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          amountPaise: truth.paidPaise,
          notes: { rider_id: row.riderId },
          source: "reconciler",
        });
        continue;
      }

      if (truth.state === "AMOUNT_MISMATCH") {
        await db
          .update(onboardingPayments)
          .set({
            updatedAt: new Date(),
            metadata: {
              ...meta,
              reconciliationRequired: true,
              reconciliationCode: "PAYMENT_AMOUNT_MISMATCH",
              reconciliationMessage: `Captured ${truth.paidPaise}p, expected ${truth.expectedPaise}p.`,
              razorpayPaymentId: truth.paymentId,
            },
          })
          .where(eq(onboardingPayments.id, row.id));
        await logPaymentEvent(db, {
          eventType: "RECONCILIATION_REQUIRED",
          source: "reconciler",
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          failureCode: "PAYMENT_AMOUNT_MISMATCH",
          payload: { riderId: row.riderId, expectedPaise, paidPaise: truth.paidPaise },
        });
        continue;
      }

      if (truth.state === "UNREACHABLE" || truth.state === "PENDING") {
        // Temporary gateway error or a still-live attempt — never fail. Defer.
        await db
          .update(onboardingPayments)
          .set({ metadata: { ...meta, reconcileDeferUntil: now + ONBOARDING_RECONCILE_RETRY_MS }, updatedAt: new Date() })
          .where(eq(onboardingPayments.id, row.id));
        await logPaymentEvent(db, {
          eventType: truth.state === "UNREACHABLE" ? "GATEWAY_UNREACHABLE" : "GATEWAY_RECONCILIATION_PENDING",
          source: "reconciler",
          razorpayOrderId: orderId,
          payload: {
            riderId: row.riderId,
            flow: "onboarding",
            ...(truth.state === "UNREACHABLE" ? { reason: truth.reason } : {}),
          },
        });
        continue;
      }

      // truth.state === "NONE": gateway reachable, no capture → genuinely abandoned.
      await db
        .update(onboardingPayments)
        .set({ status: "failed", updatedAt: new Date(), metadata: { ...meta, reconciledFailedAt: new Date().toISOString() } })
        .where(and(eq(onboardingPayments.id, row.id), eq(onboardingPayments.status, "pending")));
      await logPaymentEvent(db, {
        eventType: "GATEWAY_RECONCILIATION_FOUND_NO_PAYMENT",
        source: "reconciler",
        razorpayOrderId: orderId,
        failureCode: "PAYMENT_TIMEOUT",
        payload: { riderId: row.riderId, flow: "onboarding" },
      });
    } catch {
      // non-fatal: skip; retry next sweep
    }
  }
}
