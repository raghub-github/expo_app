/**
 * Generic recovery for "notes-anchored" Razorpay payment flows that previously
 * depended ONLY on the client verify callback (no webhook branch, no gateway-truth
 * reconciler): customer subscription, rider subscription, rider subscription dues.
 *
 * Each such flow creates a Razorpay order whose `notes` carry the business
 * context and is finalized by an EXISTING idempotent verify function. This module
 * adds the two missing server-authoritative paths without duplicating any
 * finalizer or state machine:
 *   - handleAnchoredPaymentCaptured(): called by the Razorpay webhook.
 *   - reconcileAnchoredPayments(): sweeps PAYMENT_ATTEMPT_INITIATED anchor events.
 * Both validate the captured amount against the anchor (gateway is authoritative)
 * before dispatching to the flow's own verify — closing the amount-security gap
 * these flows had (their verify checks the signature but not the amount).
 *
 * No new table: the durable anchor is a PAYMENT_ATTEMPT_INITIATED row in the
 * append-only payment_events spine, written at create-order.
 */
import { createHmac } from "node:crypto";
import { getDb, getSql } from "../../db/client.js";
import { getEnv } from "../../config/env.js";
import { logPaymentEvent } from "../../modules/orders/order.placement.service.js";
import { resolveGatewayTruth } from "./gateway-truth.js";

type FinalizeResult = { ok: boolean; idempotent?: boolean; code?: string };
type Finalizer = (
  notes: Record<string, unknown>,
  orderId: string,
  paymentId: string,
  signature: string,
) => Promise<FinalizeResult>;

const asNum = (v: unknown): number => Number(v);
const asStr = (v: unknown): string => (v == null ? "" : String(v));

/**
 * notes.type -> finalizer. Each reuses the flow's EXISTING idempotent verify with
 * a synthesized signature (the same server-authoritative pattern the merchant-sub,
 * rider-wallet, and ride-fare webhook paths use).
 */
const FINALIZERS: Record<string, Finalizer> = {
  customer_subscription: async (notes, orderId, paymentId, signature) => {
    const { verifyCustomerSubscriptionPayment } = await import(
      "../../modules/subscription/customer-subscription.service.js"
    );
    const r = await verifyCustomerSubscriptionPayment({
      customerId: asNum(notes.customer_id),
      planId: asNum(notes.plan_id),
      billingCycle: asStr(notes.billing_cycle) as "weekly" | "monthly" | "yearly",
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    });
    return { ok: r.ok, code: r.ok ? undefined : r.error };
  },
  rider_subscription: async (notes, orderId, paymentId, signature) => {
    const { verifyRiderSubscriptionPayment } = await import(
      "../../modules/rider/rider-subscription.service.js"
    );
    const r = await verifyRiderSubscriptionPayment({
      riderId: asNum(notes.rider_id),
      planId: asNum(notes.plan_id),
      billingCycle: (asStr(notes.billing_cycle) || undefined) as never,
      autoWalletDeduction: asStr(notes.auto_wallet) === "true",
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    });
    return { ok: r.ok, code: r.ok ? undefined : r.error };
  },
  rider_subscription_dues_payment: async (notes, orderId, paymentId, signature) => {
    const { verifyRiderSubscriptionDuesPayment } = await import(
      "../rider-subscription-dues-payment.service.js"
    );
    const r = await verifyRiderSubscriptionDuesPayment({
      riderId: asNum(notes.rider_id),
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    });
    return { ok: r.ok, code: r.ok ? undefined : r.error };
  },
};

export function isAnchoredPaymentType(t: string | null | undefined): boolean {
  return !!t && Object.prototype.hasOwnProperty.call(FINALIZERS, t);
}

/** Write the durable anchor at create-order. Best-effort — never blocks checkout. */
export async function logAnchoredPaymentInitiated(args: {
  flow: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency?: string;
  notes: Record<string, unknown>;
}): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO payment_events (
        razorpay_order_id, event_type, source, amount_paise, currency, payload
      ) VALUES (
        ${args.razorpayOrderId}, 'PAYMENT_ATTEMPT_INITIATED', 'client', ${args.amountPaise},
        ${args.currency ?? "INR"},
        ${JSON.stringify({ flow: args.flow, ...args.notes })}::text::jsonb
      )
    `;
  } catch {
    /* anchor best-effort; webhook notes still enable recovery */
  }
}

const synthSignature = (orderId: string, paymentId: string): string =>
  createHmac("sha256", getEnv().RAZORPAY_KEY_SECRET ?? "")
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

async function dispatchFinalize(
  flow: string,
  notes: Record<string, unknown>,
  orderId: string,
  paymentId: string,
): Promise<FinalizeResult> {
  const fin = FINALIZERS[flow];
  if (!fin) return { ok: false, code: "UNKNOWN_FLOW" };
  return fin(notes, orderId, paymentId, synthSignature(orderId, paymentId));
}

/** Load the anchor for an order: expected amount + the initiation notes. */
async function loadAnchor(
  orderId: string,
): Promise<{ expectedPaise?: number; notes: Record<string, unknown>; flow: string } | null> {
  const sql = getSql();
  const rows = await sql<Array<{ amount_paise: number | null; payload: Record<string, unknown> | null }>>`
    SELECT amount_paise, payload FROM payment_events
    WHERE razorpay_order_id = ${orderId} AND event_type = 'PAYMENT_ATTEMPT_INITIATED'
    ORDER BY created_at DESC LIMIT 1
  `;
  if (!rows.length) return null;
  const payload = (rows[0]!.payload ?? {}) as Record<string, unknown>;
  return {
    expectedPaise: rows[0]!.amount_paise != null ? Number(rows[0]!.amount_paise) : undefined,
    notes: payload,
    flow: String(payload.flow ?? ""),
  };
}

/**
 * Webhook entry for an anchored payment.captured/order.paid. Validates the
 * captured amount against the anchor (never trust the flow's amount-blind verify)
 * then dispatches to the flow finalizer. Idempotent via each verify.
 */
export async function handleAnchoredPaymentCaptured(args: {
  notesType: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  capturedPaise?: number;
  notes: Record<string, unknown>;
  source?: string;
}): Promise<FinalizeResult> {
  const db = getDb();
  const { notesType, razorpayOrderId, razorpayPaymentId } = args;
  if (!razorpayOrderId || !razorpayPaymentId) return { ok: false, code: "INVALID_PAYLOAD" };

  // Merge webhook notes with the durable anchor (anchor is the amount authority).
  const anchor = await loadAnchor(razorpayOrderId);
  const notes = { ...(anchor?.notes ?? {}), ...args.notes };
  const flow = notesType || anchor?.flow || "";
  if (!isAnchoredPaymentType(flow)) return { ok: false, code: "UNKNOWN_FLOW" };

  // Amount security: if we know the expected amount and the capture differs, never
  // finalize — flag for review. (These flows' verify checks signature, not amount.)
  if (anchor?.expectedPaise != null && args.capturedPaise != null && args.capturedPaise !== anchor.expectedPaise) {
    await logPaymentEvent(db, {
      eventType: "RECONCILIATION_REQUIRED",
      source: args.source ?? "webhook",
      razorpayOrderId,
      razorpayPaymentId,
      failureCode: "PAYMENT_AMOUNT_MISMATCH",
      amountPaise: args.capturedPaise,
      payload: { flow, expectedPaise: anchor.expectedPaise },
    });
    return { ok: false, code: "PAYMENT_AMOUNT_MISMATCH" };
  }

  return dispatchFinalize(flow, notes, razorpayOrderId, razorpayPaymentId);
}

/** Give the client verify a chance before reconciling. */
const MIN_AGE_MS = 3 * 60 * 1000;
/** Re-check a deferred attempt no more often than this. */
const RETRY_MS = 5 * 60 * 1000;

/**
 * Sweep PAYMENT_ATTEMPT_INITIATED anchors and converge each against Razorpay via
 * the shared resolver. CAPTURED -> finalize (idempotent verify); AMOUNT_MISMATCH
 * -> reconciliation_required; PENDING/UNREACHABLE -> defer; NONE -> terminal fail.
 */
export async function reconcileAnchoredPayments(): Promise<void> {
  const sql = getSql();
  const db = getDb();
  const cutoffIso = new Date(Date.now() - MIN_AGE_MS).toISOString();

  let candidates: Array<{ razorpay_order_id: string; amount_paise: number | null; payload: Record<string, unknown> | null }>;
  try {
    candidates = await sql`
      SELECT DISTINCT ON (razorpay_order_id) razorpay_order_id, amount_paise, payload
      FROM payment_events
      WHERE event_type = 'PAYMENT_ATTEMPT_INITIATED' AND razorpay_order_id IS NOT NULL AND created_at < ${cutoffIso}
      ORDER BY razorpay_order_id, created_at DESC
      LIMIT 50
    `;
  } catch {
    return;
  }

  const now = Date.now();
  for (const c of candidates) {
    try {
      const orderId = c.razorpay_order_id;
      if (!orderId || orderId.startsWith("dummy_")) continue;
      const payload = (c.payload ?? {}) as Record<string, unknown>;
      const flow = String(payload.flow ?? "");
      if (!isAnchoredPaymentType(flow)) continue;

      const last = await sql<Array<{ event_type: string; created_at: string }>>`
        SELECT event_type, created_at FROM payment_events
        WHERE razorpay_order_id = ${orderId}
          AND event_type IN ('ANCHORED_PAYMENT_SETTLED','ANCHORED_PAYMENT_FAILED','RECONCILIATION_REQUIRED','ANCHORED_PAYMENT_DEFERRED')
        ORDER BY created_at DESC LIMIT 1
      `;
      if (last.length > 0) {
        const ev = last[0]!;
        if (ev.event_type === "ANCHORED_PAYMENT_SETTLED" || ev.event_type === "ANCHORED_PAYMENT_FAILED" || ev.event_type === "RECONCILIATION_REQUIRED") continue;
        if (ev.event_type === "ANCHORED_PAYMENT_DEFERRED" && now - new Date(ev.created_at).getTime() < RETRY_MS) continue;
      }

      const expectedPaise = Number(c.amount_paise ?? 0) || undefined;
      await logPaymentEvent(db, {
        eventType: "GATEWAY_RECONCILIATION_STARTED",
        source: "reconciler",
        razorpayOrderId: orderId,
        amountPaise: expectedPaise ?? null,
        payload: { flow },
      });
      const truth = await resolveGatewayTruth({ orderId, expectedPaise });

      if (truth.state === "CAPTURED") {
        const res = await dispatchFinalize(flow, payload, orderId, truth.paymentId);
        await logPaymentEvent(db, {
          eventType: res.ok ? "ANCHORED_PAYMENT_SETTLED" : "ANCHORED_PAYMENT_FAILED",
          source: "reconciler",
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          failureCode: res.ok ? null : res.code,
          payload: { flow, ok: res.ok },
        });
      } else if (truth.state === "AMOUNT_MISMATCH") {
        await logPaymentEvent(db, {
          eventType: "RECONCILIATION_REQUIRED",
          source: "reconciler",
          razorpayOrderId: orderId,
          razorpayPaymentId: truth.paymentId,
          failureCode: "PAYMENT_AMOUNT_MISMATCH",
          payload: { flow, expectedPaise: truth.expectedPaise, paidPaise: truth.paidPaise },
        });
      } else if (truth.state === "UNREACHABLE" || truth.state === "PENDING") {
        await logPaymentEvent(db, {
          eventType: "ANCHORED_PAYMENT_DEFERRED",
          source: "reconciler",
          razorpayOrderId: orderId,
          payload: { flow, gatewayState: truth.state, ...(truth.state === "UNREACHABLE" ? { reason: truth.reason } : {}) },
        });
      } else {
        await logPaymentEvent(db, {
          eventType: "ANCHORED_PAYMENT_FAILED",
          source: "reconciler",
          razorpayOrderId: orderId,
          failureCode: "NO_CAPTURE",
          payload: { flow },
        });
      }
    } catch {
      // non-fatal; retry next sweep
    }
  }
}
