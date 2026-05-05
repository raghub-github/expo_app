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
 * Create Razorpay order.
 *
 * We set `payment_capture: 1` explicitly so Razorpay auto-captures the payment
 * as soon as the customer completes it. Leaving this unset falls back to the
 * merchant account default, which some accounts ship as "authorize only"
 * (late authorization). In that mode payments end up in `authorized` state
 * forever and `finalize` will never see `status = captured` → orders never
 * place. Forcing auto-capture is the safe default for B2C food orders.
 */
export async function createRazorpayOrder(params: CreateOrderParams): Promise<CreateOrderResponse> {
  const razorpay = getRazorpayInstance();

  const order = await razorpay.orders.create({
    amount: params.amount,
    currency: params.currency || "INR",
    receipt: params.receipt || `receipt_${Date.now()}`,
    payment_capture: 1,
    notes: params.notes || {},
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

  // Allow simulated payments in development
  if (env.NODE_ENV === "development" && signature === "simulated_signature") {
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

  if (env.NODE_ENV === "development" && razorpaySignature === "simulated_signature") {
    return { ok: true, paymentMethod: "simulated" };
  }

  try {
    const payment = await getPaymentDetails(razorpayPaymentId);
    const paymentRecord = payment as unknown as Record<string, unknown>;
    if (String(payment.order_id ?? "").trim() !== String(razorpayOrderId).trim()) {
      return {
        ok: false,
        code: "PAYMENT_MISMATCH",
        message: "Payment does not match the checkout session.",
      };
    }

    const status = String(payment.status ?? "").toLowerCase();
    if (status !== "captured") {
      // In some flows (esp. netbanking) Razorpay can redirect back quickly while the
      // payment is still moving from authorized/created → captured. Treat this as a
      // transient state and let our reconciler/webhook finalize.
      if (["authorized", "created", "pending", "processed"].includes(status)) {
        return {
          ok: false,
          code: "PAYMENT_PENDING_CONFIRMATION",
          message: "Payment received. Waiting for final confirmation from the payment gateway.",
        };
      }
      return {
        ok: false,
        code: "PAYMENT_NOT_CAPTURED",
        message: "Payment was not completed. Please try again.",
      };
    }

    const paidAmount = Number(paymentRecord.amount_paid ?? payment.amount ?? 0);
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

export async function getOrderPayments(orderId: string): Promise<Array<Record<string, unknown>>> {
  const razorpay = getRazorpayInstance() as unknown as {
    orders: { fetchPayments: (orderId: string) => Promise<{ items?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>> };
  };
  const response = await razorpay.orders.fetchPayments(orderId);
  if (Array.isArray(response)) return response;
  return response?.items ?? [];
}

export async function createRazorpayRefund(params: {
  paymentId: string;
  amountPaise?: number;
  notes?: Record<string, string>;
}) {
  const razorpay = getRazorpayInstance() as unknown as {
    payments: {
      refund: (
        paymentId: string,
        payload: { amount?: number; speed?: string; notes?: Record<string, string> }
      ) => Promise<Record<string, unknown>>;
    };
  };
  return await razorpay.payments.refund(params.paymentId, {
    ...(params.amountPaise != null ? { amount: params.amountPaise } : {}),
    speed: "normal",
    notes: params.notes ?? {},
  });
}

