/**
 * A customer's IN-APP fare payment (Razorpay checkout / GatiCash) for a Person
 * Ride or Parcel that lands after the job was already paid another way — the
 * rider took cash, the passenger scanned the rider's QR, or a second checkout.
 *
 * Razorpay checkout captures before our confirm call runs, so answering "already
 * paid" without a refund kept the customer's money twice. Rules:
 *
 *   - the SAME payment again (double tap, webhook after the app confirmed,
 *     reconciler replay) is an idempotent success — never refunded;
 *   - a DIFFERENT payment for an already-paid job is refunded in full, and any
 *     GatiCash this attempt debited is credited back.
 *
 * The refund is safe to repeat: a fully refunded payment is "not refundable",
 * which counts as done.
 */
import { getSql } from "../db/client.js";
import { createRazorpayRefund } from "../services/payment/razorpayService.js";

export type FareService = "person_ride" | "parcel";

/** The paid capture row of this job, if the job was paid in-app. */
export async function findPaidFareCapture(orderIdText: string): Promise<{
  transactionId: string;
  source: string | null;
  paymentGateway: string | null;
} | null> {
  const sql = getSql();
  const rows = await sql<Array<{ transaction_id: string; source: string | null; payment_gateway: string | null }>>`
    SELECT transaction_id, gateway_response->>'source' AS source, payment_gateway
    FROM orders_core_payments
    WHERE order_id = ${orderIdText} AND upper(payment_status) = 'PAID'
    ORDER BY paid_at DESC NULLS LAST, id DESC
    LIMIT 5
  `;
  const row = rows[0];
  return row ? { transactionId: row.transaction_id, source: row.source, paymentGateway: row.payment_gateway } : null;
}

/** True when `razorpayPaymentId` is (one of) the payment(s) that paid this job. */
export async function isPaymentThatPaidJob(orderIdText: string, razorpayPaymentId: string): Promise<boolean> {
  const id = razorpayPaymentId.trim();
  if (!id) return false;
  const sql = getSql();
  const rows = await sql<Array<{ ok: number }>>`
    SELECT 1 AS ok FROM orders_core_payments
    WHERE order_id = ${orderIdText}
      AND upper(payment_status) = 'PAID'
      AND (transaction_id = ${id} OR gateway_response->>'razorpayPaymentId' = ${id})
    LIMIT 1
  `;
  return rows.length > 0;
}

async function recordEvent(args: {
  eventType: string;
  orderId: string;
  razorpayPaymentId: string | null;
  amountPaise: number | null;
  failureMessage?: string | null;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO payment_events (event_type, source, order_id, razorpay_payment_id, amount_paise, failure_message, payload)
      VALUES (${args.eventType}, 'in_app_fare', ${args.orderId}, ${args.razorpayPaymentId},
              ${args.amountPaise}, ${args.failureMessage ?? null}, ${JSON.stringify(args.payload)}::text::jsonb)
    `;
  } catch {
    /* audit best-effort */
  }
}

/** Refund a captured in-app fare payment that arrived after the job was paid. */
export async function refundLateFareCapture(args: {
  service: FareService;
  orderIdText: string;
  razorpayPaymentId: string;
  amountPaise?: number | null;
  reason: string;
}): Promise<{ refunded: boolean; refundId: string | null; error: string | null }> {
  const paymentId = args.razorpayPaymentId.trim();
  let result: { refunded: boolean; refundId: string | null; error: string | null };
  try {
    const refund = await createRazorpayRefund({
      paymentId,
      amountPaise: args.amountPaise && args.amountPaise > 0 ? args.amountPaise : undefined,
      receipt: `late_fare_${paymentId}`.slice(0, 40),
      notes: { reason: "fare_already_paid", orderRef: args.orderIdText, service: args.service },
    });
    result = { refunded: true, refundId: String((refund as { id?: unknown })?.id ?? "") || null, error: null };
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    result = /not_refundable_status_refunded/.test(message)
      ? { refunded: true, refundId: null, error: null }
      : { refunded: false, refundId: null, error: message };
  }
  await recordEvent({
    eventType: result.error ? "INAPP_LATE_CAPTURE_REFUND_FAILED" : "INAPP_LATE_CAPTURE_REFUNDED",
    orderId: args.orderIdText,
    razorpayPaymentId: paymentId,
    amountPaise: args.amountPaise ?? null,
    failureMessage: result.error,
    payload: { service: args.service, reason: args.reason, refundId: result.refundId },
  });
  return result;
}

/** Credit back GatiCash a losing fare-payment attempt debited. Idempotent per order. */
export async function restoreFareGatiCash(args: {
  service: FareService;
  customerPk: number;
  orderIdText: string;
  amount: number;
  gatiCashTxnId: string | null;
}): Promise<void> {
  const amount = Math.round((Number(args.amount) || 0) * 100) / 100;
  if (!(amount > 0.005)) return;
  const sql = getSql();
  const creditKey = `fare_gc_restore_${args.gatiCashTxnId ?? args.orderIdText}`.slice(0, 120);
  const existing = await sql`SELECT id FROM public.customer_wallet_transactions WHERE transaction_id = ${creditKey} LIMIT 1`;
  if (existing.length > 0) return;
  await sql`
    SELECT public.customer_wallet_credit(
      ${args.customerPk},
      ${amount},
      'REFUND'::public.wallet_transaction_type,
      ${args.orderIdText},
      ${args.service === "parcel" ? "parcel_fare_payment" : "ride_fare_payment"},
      ${"GatiCash returned — fare was already paid"},
      NULL,
      ${creditKey},
      ${JSON.stringify({ reason: "fare_already_paid", original_gati_cash_txn_id: args.gatiCashTxnId })}::text::jsonb
    )
  `;
  await recordEvent({
    eventType: "INAPP_LATE_GATICASH_RESTORED",
    orderId: args.orderIdText,
    razorpayPaymentId: null,
    amountPaise: Math.round(amount * 100),
    payload: { service: args.service, gatiCashTxnId: args.gatiCashTxnId },
  });
}

/** The Razorpay order was created by OUR fare checkout for this exact job. */
async function razorpayOrderBelongsToJob(razorpayOrderId: string, orderIdText: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql<Array<{ ok: number }>>`
    SELECT 1 AS ok FROM payment_events
    WHERE razorpay_order_id = ${razorpayOrderId}
      AND order_id = ${orderIdText}
      AND event_type IN ('RIDE_FARE_PAYMENT_INITIATED', 'PARCEL_FARE_PAYMENT_INITIATED')
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Called when an in-app payment finds the job already paid. Same payment →
 * idempotent success. Otherwise the capture is refunded — but only when it is
 * PROVEN to be this job's payment: a valid checkout signature AND a Razorpay
 * order our fare checkout created for this job. Anything unproven is recorded
 * for review, never refunded on a client's word (a forged id could otherwise
 * refund someone else's payment).
 */
export async function settleLateInAppFarePayment(args: {
  service: FareService;
  orderIdText: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  signatureValid: boolean;
  amountPaise: number | null;
}): Promise<{ samePayment: boolean; refunded: boolean }> {
  const paymentId = String(args.razorpayPaymentId ?? "").trim();
  if (paymentId && (await isPaymentThatPaidJob(args.orderIdText, paymentId))) {
    return { samePayment: true, refunded: false };
  }
  if (!paymentId) return { samePayment: false, refunded: false };
  const rzpOrderId = String(args.razorpayOrderId ?? "").trim();
  const proven =
    args.signatureValid && rzpOrderId !== "" && (await razorpayOrderBelongsToJob(rzpOrderId, args.orderIdText));
  if (!proven) {
    await recordEvent({
      eventType: "INAPP_LATE_CAPTURE_NEEDS_REVIEW",
      orderId: args.orderIdText,
      razorpayPaymentId: paymentId,
      amountPaise: args.amountPaise,
      payload: { service: args.service, razorpayOrderId: rzpOrderId || null, signatureValid: args.signatureValid },
    });
    return { samePayment: false, refunded: false };
  }
  const r = await refundLateFareCapture({
    service: args.service,
    orderIdText: args.orderIdText,
    razorpayPaymentId: paymentId,
    amountPaise: args.amountPaise,
    reason: "job already paid (cash / QR / another payment)",
  });
  return { samePayment: false, refunded: r.refunded };
}
