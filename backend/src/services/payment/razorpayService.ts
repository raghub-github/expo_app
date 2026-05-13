import Razorpay from "razorpay";
import crypto from "crypto";
import { getEnv } from "../../config/env.js";

/**
 * Razorpay Service
 * 
 * Handles payment creation, verification, and webhook processing.
 */

let razorpayInstance: Razorpay | null = null;

function getRazorpayInstance(): Razorpay {
  if (razorpayInstance) return razorpayInstance;

  const env = getEnv();

  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay credentials not configured");
  }

  razorpayInstance = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });

  return razorpayInstance;
}

export interface CreateOrderParams {
  amount: number; // in paise (₹49 = 4900 paise)
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}

export interface CreateOrderResponse {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  attempts: number;
  notes: Record<string, string>;
  created_at: number;
}

/**
 * Create a Razorpay order with auto-capture enabled.
 *
 * `payment_capture: 1` is critical — without it the payment is only AUTHORIZED and
 * never captured automatically, which manifests in the customer app as the
 * "Confirming Payment" overlay hanging indefinitely (the webhook for `payment.captured`
 * never fires because Razorpay is waiting for an explicit /capture call).
 *
 * `partial_payment: false` ensures the customer must pay the full amount in one go
 * (no split payments — which would complicate refund/finalization flows).
 */
export async function createRazorpayOrder(params: CreateOrderParams): Promise<CreateOrderResponse> {
  const razorpay = getRazorpayInstance();

  const order = await razorpay.orders.create({
    amount: params.amount,
    currency: params.currency || "INR",
    receipt: params.receipt || `receipt_${Date.now()}`,
    notes: params.notes || {},
    payment_capture: true,
    partial_payment: false,
  } as Parameters<typeof razorpay.orders.create>[0]);

  return order as CreateOrderResponse;
}

/**
 * Verify Razorpay payment signature
 */
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const env = getEnv();

  // Allow simulated payments when in dummy mode OR in local development.
  // Dummy mode is the production-safe path (enable via PAYMENT_DUMMY_MODE=true)
  // for end-to-end testing without a Razorpay account.
  if (
    signature === "simulated_signature" &&
    (env.PAYMENT_DUMMY_MODE || env.NODE_ENV === "development")
  ) {
    return true;
  }

  if (!env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay key secret not configured");
  }

  const generatedSignature = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return generatedSignature === signature;
}

/**
 * Verify Razorpay webhook signature
 */
export function verifyRazorpayWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const env = getEnv();

  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    throw new Error("Razorpay webhook secret not configured");
  }

  const generatedSignature = crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");

  return generatedSignature === signature;
}

export async function verifyRazorpayPaymentDetails(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
  expectedAmountPaise: number,
  expectedCurrency = "INR"
): Promise<{ ok: true; paymentMethod: string } | { ok: false; code: string; message: string }> {
  const env = getEnv();

  if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    return { ok: false, code: "PAYMENT_NOT_VERIFIED", message: "Payment verification failed. Please try again." };
  }

  // Short-circuit for dummy/simulated payments — skip the live Razorpay fetch
  // since there's no real payment to verify on the gateway side. The pending
  // order's grand_total is still checked at the finalize step that called us.
  if (
    razorpaySignature === "simulated_signature" &&
    (env.PAYMENT_DUMMY_MODE || env.NODE_ENV === "development")
  ) {
    return { ok: true, paymentMethod: "simulated" };
  }

  try {
    const payment = await getPaymentDetails(razorpayPaymentId);
    if (String(payment.order_id ?? "").trim() !== String(razorpayOrderId).trim()) {
      return {
        ok: false,
        code: "PAYMENT_MISMATCH",
        message: "Payment does not match the checkout session.",
      };
    }

    if (String(payment.status ?? "").toLowerCase() !== "captured") {
      return {
        ok: false,
        code: "PAYMENT_NOT_CAPTURED",
        message: "Payment was not completed. Please try again.",
      };
    }

    const paidAmount = Number((payment as unknown as Record<string, unknown>).amount_paid ?? payment.amount ?? 0);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0 || paidAmount !== expectedAmountPaise) {
      return {
        ok: false,
        code: "PAYMENT_AMOUNT_MISMATCH",
        message: "Payment amount does not match the order total.",
      };
    }

    const currency = String(payment.currency ?? "").toUpperCase();
    if (currency !== String(expectedCurrency ?? "INR").toUpperCase()) {
      return {
        ok: false,
        code: "PAYMENT_CURRENCY_MISMATCH",
        message: "Payment currency does not match the order currency.",
      };
    }

    return { ok: true, paymentMethod: String(payment.method ?? "online") };
  } catch (err: unknown) {
    console.error("[razorpay] verifyRazorpayPaymentDetails error:", err);
    return {
      ok: false,
      code: "PAYMENT_VERIFICATION_FAILED",
      message: "Unable to verify payment with the payment gateway. Please contact support.",
    };
  }
}

/**
 * Fetch payment details from Razorpay
 */
export async function getPaymentDetails(paymentId: string) {
  const razorpay = getRazorpayInstance();
  return await razorpay.payments.fetch(paymentId);
}

