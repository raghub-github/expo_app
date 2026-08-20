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

export interface RefundParams {
  paymentId: string;
  /** Amount in paise. Omit for a full refund. */
  amountPaise?: number;
  /** "normal" (T+7 banking) or "optimum" (instant if available). Defaults to "normal". */
  speed?: "normal" | "optimum";
  /**
   * Idempotency guard — Razorpay dedupes refunds by this receipt within a payment.
   * We pass a stable string derived from our internal payment record id.
   */
  receipt: string;
  notes?: Record<string, string>;
}

export interface RefundResponse {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  payment_id: string;
  receipt: string | null;
  status: string;
  speed_requested?: string;
  speed_processed?: string;
  created_at: number;
}

/**
 * Initiate a refund on a Razorpay payment. Returns the refund object.
 *
 * The webhook `refund.processed` will fire when Razorpay actually moves the
 * money back to the customer's method (may take minutes for UPI, days for
 * cards). Our admin-refund path marks the subscription REFUNDED eagerly and
 * treats the webhook as idempotent confirmation.
 *
 * On duplicate receipt Razorpay throws with statusCode 400 and description
 * "The receipt has already been used" — the caller should catch that and
 * treat it as "refund already exists" rather than a hard error.
 */
export async function createRazorpayRefund(params: RefundParams): Promise<RefundResponse> {
  const razorpay = getRazorpayInstance();
  const payload: Record<string, unknown> = {
    receipt: params.receipt,
    speed: params.speed ?? "normal",
  };
  if (params.amountPaise != null) payload.amount = params.amountPaise;
  if (params.notes) payload.notes = params.notes;
  const refund = await razorpay.payments.refund(
    params.paymentId,
    payload as Parameters<typeof razorpay.payments.refund>[1]
  );
  return refund as unknown as RefundResponse;
}

function extractUpiIntentUrl(payload: Record<string, unknown>): string | null {
  const asString = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;
  const direct =
    asString(payload.link) ??
    asString(payload.intent_url) ??
    asString(payload.intentUrl);
  if (direct) return direct;
  const data = payload.data as Record<string, unknown> | undefined;
  if (data) {
    const nested = asString(data.link) ?? asString(data.intent_url);
    if (nested) return nested;
  }
  const upi = payload.upi as Record<string, unknown> | undefined;
  if (upi) {
    const nested = asString(upi.link) ?? asString(upi.intent_url);
    if (nested) return nested;
  }
  const next = payload.next;
  if (Array.isArray(next)) {
    for (const step of next) {
      if (!step || typeof step !== "object") continue;
      const url = asString((step as Record<string, unknown>).url);
      if (url) return url;
    }
  }
  return null;
}

function isRazorpayRouteMissing(status: number, json: Record<string, unknown>): boolean {
  if (status === 404) return true;
  const err = json.error as { description?: string; code?: string } | undefined;
  const desc = String(err?.description ?? json.message ?? "").toLowerCase();
  return desc.includes("requested url was not found") || desc.includes("not found on the server");
}

/**
 * Create a UPI Intent payment on an existing Razorpay order.
 * Prefer POST /v1/payments/create/upi; if that route is not enabled on the
 * account, fall back to POST /v1/payments/create/json (same body).
 * Returns the `upi://pay?…` link the customer app opens in PhonePe / GPay / Paytm.
 */
export async function createRazorpayUpiIntent(params: {
  orderId: string;
  amountPaise: number;
  contact: string;
  email: string;
  ip: string;
  userAgent: string;
  notes?: Record<string, string>;
}): Promise<{ paymentId: string | null; intentUrl: string | null }> {
  const env = getEnv();
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay credentials not configured");
  }

  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const body = JSON.stringify({
    amount: params.amountPaise,
    currency: "INR",
    order_id: params.orderId,
    email: params.email,
    contact: params.contact,
    method: "upi",
    ip: params.ip,
    referer: "https://gatimitra.app",
    user_agent: params.userAgent,
    description: "Food order",
    notes: params.notes ?? {},
    upi: { flow: "intent" },
  });

  const postCreate = async (url: string) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { res, json };
  };

  let { res, json } = await postCreate("https://api.razorpay.com/v1/payments/create/upi");
  if (!res.ok && isRazorpayRouteMissing(res.status, json)) {
    console.warn("[razorpay] create/upi unavailable, falling back to create/json", {
      status: res.status,
      error: json.error ?? json,
    });
    ({ res, json } = await postCreate("https://api.razorpay.com/v1/payments/create/json"));
  }

  if (!res.ok) {
    const err = json.error as { description?: string; code?: string } | undefined;
    console.warn("[razorpay] UPI intent create failed", {
      status: res.status,
      error: err ?? json,
    });
    // Account does not expose S2S UPI Intent — caller should open Checkout instead.
    if (isRazorpayRouteMissing(res.status, json)) {
      return { paymentId: null, intentUrl: null };
    }
    throw new Error(err?.description || `Razorpay UPI intent ${res.status}`);
  }

  const paymentId =
    (typeof json.razorpay_payment_id === "string" && json.razorpay_payment_id) ||
    (typeof json.id === "string" && json.id) ||
    null;

  return { paymentId, intentUrl: extractUpiIntentUrl(json) };
}

/**
 * Fetch enabled payment methods for this Razorpay account.
 * Docs: GET https://api.razorpay.com/v1/methods with Basic KEY_ID: (no secret).
 * Falls back to KEY_ID:SECRET if the key-only call is rejected.
 */
export async function fetchRazorpayAccountMethods(): Promise<unknown> {
  const env = getEnv();
  if (!env.RAZORPAY_KEY_ID) {
    throw new Error("Razorpay key id not configured");
  }

  const tryFetch = async (password: string) => {
    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${password}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/methods", {
      headers: { Authorization: `Basic ${auth}` },
    });
    return res;
  };

  let res = await tryFetch("");
  if (res.status === 401 && env.RAZORPAY_KEY_SECRET) {
    res = await tryFetch(env.RAZORPAY_KEY_SECRET);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Razorpay methods ${res.status}: ${text.slice(0, 240)}`);
  }
  return res.json();
}

