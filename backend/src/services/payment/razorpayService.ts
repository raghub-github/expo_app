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

export type RazorpayOrderPayment = {
  id: string;
  status: string; // created | authorized | captured | refunded | failed
  amount: number; // paise
  order_id?: string;
};

/**
 * Fetch all payment attempts Razorpay recorded against an order. Used by the
 * rider-wallet reconciler to learn the *authoritative* outcome of an order when
 * the client never confirmed (app died / lost network) and no webhook arrived —
 * so a captured-but-unverified payment can still be settled, and a genuinely
 * abandoned one can be marked failed.
 */
export async function fetchRazorpayOrderPayments(
  orderId: string
): Promise<RazorpayOrderPayment[]> {
  const razorpay = getRazorpayInstance();
  // The SDK exposes orders.fetchPayments(orderId) → { items: [...] }.
  const res = (await razorpay.orders.fetchPayments(orderId)) as unknown as {
    items?: Array<{ id?: unknown; status?: unknown; amount?: unknown; order_id?: unknown }>;
  };
  const items = Array.isArray(res?.items) ? res.items : [];
  return items.map((p) => ({
    id: String(p.id ?? ""),
    status: String(p.status ?? ""),
    amount: Number(p.amount ?? 0),
    order_id: p.order_id != null ? String(p.order_id) : undefined,
  }));
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
function clipRazorpayRefundError(err: unknown): string {
  if (err == null) return "unknown_error";
  if (typeof err === "string") return err.slice(0, 500);
  if (err instanceof Error && err.message && err.message !== "[object Object]") {
    return err.message.slice(0, 500);
  }
  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const nested =
      o.error != null && typeof o.error === "object"
        ? (o.error as Record<string, unknown>)
        : null;
    const parts: string[] = [];
    const code = nested?.code ?? o.code;
    const description = nested?.description ?? o.description ?? o.message;
    if (code != null && String(code).trim()) parts.push(String(code));
    if (description != null && String(description).trim()) parts.push(String(description));
    if (parts.length > 0) return parts.join(" | ").slice(0, 500);
  }
  return String(err).slice(0, 500);
}

function sanitizeRazorpayRefundNotes(
  notes?: Record<string, string>
): Record<string, string> | undefined {
  if (!notes) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(notes)) {
    out[key.slice(0, 64)] = String(value ?? "").slice(0, 256);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function createRazorpayRefund(params: RefundParams): Promise<RefundResponse> {
  const razorpay = getRazorpayInstance();
  const paymentRaw = await getPaymentDetails(params.paymentId);
  const payment = paymentRaw as unknown as Record<string, unknown>;
  const status = String(payment.status ?? "").toLowerCase();
  if (status !== "captured" && status !== "partially_refunded") {
    throw new Error(`payment_not_refundable_status_${status || "unknown"}`);
  }

  const amountRefundablePaise = Math.round(
    Number(payment.amount_refundable ?? payment.amount ?? 0)
  );
  let amountPaise: number | undefined;
  if (params.amountPaise != null) {
    const requested = Math.round(params.amountPaise);
    if (requested <= 0) throw new Error("refund_amount_must_be_positive");
    if (amountRefundablePaise <= 0) {
      throw new Error("refund_amount_exceeds_refundable_balance");
    }
    amountPaise = Math.min(requested, amountRefundablePaise);
    if (amountPaise <= 0) {
      throw new Error("refund_amount_exceeds_refundable_balance");
    }
  } else if (amountRefundablePaise > 0) {
    amountPaise = amountRefundablePaise;
  }

  const payload: Record<string, unknown> = {
    receipt: String(params.receipt).slice(0, 40),
    speed: params.speed ?? "normal",
  };
  if (amountPaise != null) payload.amount = amountPaise;
  const notes = sanitizeRazorpayRefundNotes(params.notes);
  if (notes) payload.notes = notes;

  try {
    const refund = await razorpay.payments.refund(
      params.paymentId,
      payload as Parameters<typeof razorpay.payments.refund>[1]
    );
    return refund as unknown as RefundResponse;
  } catch (err) {
    const msg = clipRazorpayRefundError(err);
    if (!/receipt has already been used/i.test(msg)) throw err;

    const listed = (await razorpay.payments.fetchMultipleRefund(params.paymentId, {
      count: 100,
    })) as unknown as { items?: Array<{ id?: unknown; receipt?: unknown }> };
    const items = Array.isArray(listed?.items) ? listed.items : [];
    const receipt = String(params.receipt).slice(0, 40);
    const existing = items.find((item) => String(item.receipt ?? "") === receipt);
    if (existing?.id) {
      const refund = await razorpay.payments.fetchRefund(
        params.paymentId,
        String(existing.id)
      );
      return refund as unknown as RefundResponse;
    }
    throw err;
  }
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

export interface CreateQrCodeParams {
  /** Fixed amount in paise (₹100 = 10000). Never send rupees here. */
  amountPaise: number;
  /** Label shown on Razorpay dashboard / QR entity. */
  name?: string;
  /** Human-readable description shown to the payer. */
  description: string;
  /**
   * Preferred expiry (epoch seconds). Applied only when Razorpay accepts
   * `single_use` (close_by is single_use-only). Clamped to [now+2m, now+2h].
   */
  closeBy: number;
  /** Reference id echoed back on the qr_code.credited webhook (notes). */
  notes: Record<string, string>;
}

export interface CreateQrCodeResponse {
  id: string; // qr_...
  entity: string;
  image_url: string;
  payment_amount: number;
  status: string;
  close_by: number | null;
  notes: Record<string, string>;
  /** Actual Razorpay usage that was accepted for this QR. */
  usage: "single_use" | "multiple_use";
  fixed_amount: boolean;
}

type RazorpayQrErrorBody = {
  error?: {
    code?: string;
    description?: string;
    reason?: string;
    source?: string;
    step?: string;
    metadata?: Record<string, unknown>;
  };
};

function razorpayBasicAuth(): string {
  const env = getEnv();
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw Object.assign(new Error("Razorpay credentials not configured"), {
      statusCode: 503,
      code: "RAZORPAY_NOT_CONFIGURED",
    });
  }
  return Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString(
    "base64"
  );
}

function clampQrCloseBy(preferredCloseBy: number): number {
  const nowSec = Math.floor(Date.now() / 1000);
  const minClose = nowSec + 2 * 60;
  const maxClose = nowSec + 2 * 60 * 60;
  const rounded = Math.round(preferredCloseBy);
  if (!Number.isFinite(rounded)) return maxClose;
  return Math.min(maxClose, Math.max(minClose, rounded));
}

function throwQrCreateFailed(
  status: number,
  text: string,
  requestId: string | null,
  usageAttempted: string
): never {
  let parsed: RazorpayQrErrorBody | null = null;
  try {
    parsed = JSON.parse(text) as RazorpayQrErrorBody;
  } catch {
    parsed = null;
  }
  const code = String(parsed?.error?.code ?? "QR_CREATE_FAILED");
  const description = String(
    parsed?.error?.description ?? text.slice(0, 200) ?? "QR create failed"
  );
  // Never log secrets — only status, Razorpay error code, and request id.
  console.warn(
    "[createRazorpayQrCode] failed",
    JSON.stringify({
      httpStatus: status,
      razorpayCode: code,
      description: description.slice(0, 160),
      requestId,
      usageAttempted,
    })
  );
  throw Object.assign(
    new Error(`Razorpay QR ${status}: ${JSON.stringify(parsed?.error ?? { description })}`),
    {
      statusCode: status === 400 || status === 401 || status === 403 ? status : 502,
      code: "QR_CREATE_FAILED",
      razorpayCode: code,
      razorpayRequestId: requestId,
    }
  );
}

async function postRazorpayQrCode(
  body: Record<string, unknown>
): Promise<{ res: Response; text: string; requestId: string | null }> {
  const res = await fetch("https://api.razorpay.com/v1/payments/qr_codes", {
    method: "POST",
    headers: {
      Authorization: `Basic ${razorpayBasicAuth()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => "");
  const requestId =
    res.headers.get("x-razorpay-request-id") ||
    res.headers.get("x-request-id") ||
    null;
  return { res, text, requestId };
}

/**
 * Create a Razorpay fixed-amount dynamic UPI QR for exact fare collection.
 *
 * Preferred: `usage=single_use` + `fixed_amount=true` + `close_by` (docs).
 * Observed on this merchant (test keys): Razorpay returns HTTP 500 SERVER_ERROR
 * for every `single_use` create, while `multiple_use` + `fixed_amount=true` succeeds.
 * We therefore fall back to multiple_use with the same fixed `payment_amount`, and
 * callers MUST close the QR after the first captured credit (see closeRazorpayQrCode).
 *
 * Settlement is finalized only by `qr_code.credited` / reconciler — never by the client.
 */
export async function createRazorpayQrCode(
  params: CreateQrCodeParams
): Promise<CreateQrCodeResponse> {
  const amountPaise = Math.round(params.amountPaise);
  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    throw Object.assign(new Error("QR amount must be at least ₹1 (100 paise)"), {
      statusCode: 400,
      code: "INVALID_QR_AMOUNT",
    });
  }

  const notes: Record<string, string> = {};
  for (const [k, v] of Object.entries(params.notes ?? {})) {
    if (!k || v == null) continue;
    notes[String(k).slice(0, 256)] = String(v).slice(0, 256);
  }

  const base = {
    type: "upi_qr" as const,
    name: (params.name || "GatiMitra").slice(0, 50),
    fixed_amount: true,
    payment_amount: amountPaise,
    description: params.description.slice(0, 200),
    notes,
  };

  const closeBy = clampQrCloseBy(params.closeBy);

  // 1) Preferred single_use (auto-closes after one payment).
  {
    const { res, text, requestId } = await postRazorpayQrCode({
      ...base,
      usage: "single_use",
      close_by: closeBy,
    });
    if (res.ok) {
      const json = JSON.parse(text) as CreateQrCodeResponse;
      if (!json.id || !String(json.image_url ?? "").trim()) {
        throw Object.assign(new Error("Razorpay QR response missing id/image_url"), {
          statusCode: 502,
          code: "QR_CREATE_FAILED",
        });
      }
      return {
        ...json,
        usage: "single_use",
        fixed_amount: true,
        close_by: json.close_by ?? closeBy,
        payment_amount: Number(json.payment_amount ?? amountPaise),
      };
    }
    // Only fall through on Razorpay-side 5xx / SERVER_ERROR — client errors stay hard fails.
    let razorpayCode = "";
    try {
      razorpayCode = String(
        (JSON.parse(text) as RazorpayQrErrorBody)?.error?.code ?? ""
      );
    } catch {
      razorpayCode = "";
    }
    const retryable =
      res.status >= 500 || razorpayCode === "SERVER_ERROR";
    if (!retryable) {
      throwQrCreateFailed(res.status, text, requestId, "single_use");
    }
    console.warn(
      "[createRazorpayQrCode] single_use rejected by Razorpay; using multiple_use+fixed_amount+close-after-credit",
      JSON.stringify({ httpStatus: res.status, razorpayCode, requestId })
    );
  }

  // 2) Production workaround: fixed-amount multiple_use (close after first credit).
  {
    const { res, text, requestId } = await postRazorpayQrCode({
      ...base,
      usage: "multiple_use",
    });
    if (!res.ok) {
      throwQrCreateFailed(res.status, text, requestId, "multiple_use");
    }
    const json = JSON.parse(text) as CreateQrCodeResponse;
    if (!json.id || !json.image_url) {
      throw Object.assign(new Error("Razorpay QR response missing id/image_url"), {
        statusCode: 502,
        code: "QR_CREATE_FAILED",
      });
    }
    return {
      ...json,
      usage: "multiple_use",
      fixed_amount: true,
      close_by: null,
      payment_amount: Number(json.payment_amount ?? amountPaise),
    };
  }
}

/**
 * Close a Razorpay QR so it cannot accept further payments.
 * Used after the first captured credit when usage was multiple_use.
 */
export async function closeRazorpayQrCode(qrId: string): Promise<void> {
  const id = String(qrId ?? "").trim();
  if (!id || id.startsWith("dummy_")) return;
  const res = await fetch(
    `https://api.razorpay.com/v1/payments/qr_codes/${encodeURIComponent(id)}/close`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${razorpayBasicAuth()}`,
        "content-type": "application/json",
      },
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Razorpay does not allow closing multiple_use QRs; single_use may already be closed/paid.
    if (
      res.status === 400 &&
      /already|closed|paid|multiple use|cannot be closed/i.test(text)
    ) {
      return;
    }
    console.warn(
      "[closeRazorpayQrCode] failed",
      JSON.stringify({ qrId: id, httpStatus: res.status, body: text.slice(0, 160) })
    );
  }
}

export type RazorpayQrCapturedPayment = {
  id: string;
  amount: number; // paise
  status: string; // "captured" | "authorized" | "failed" | ...
};

/**
 * Fetch the payments made against a QR code — used by the online-QR RECONCILER to close a
 * ride whose `qr_code.credited` webhook was missed/unconfigured. Returns [] in dummy mode or
 * when credentials are absent (the reconciler then skips). Only CAPTURED payments matter.
 */
export async function fetchRazorpayQrPayments(qrId: string): Promise<RazorpayQrCapturedPayment[]> {
  const env = getEnv();
  if (env.PAYMENT_DUMMY_MODE || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return [];
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(
    `https://api.razorpay.com/v1/payments/qr_codes/${encodeURIComponent(qrId)}/payments?count=10`,
    { method: "GET", headers: { Authorization: `Basic ${auth}` } }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(`Razorpay QR fetch ${res.status}: ${text.slice(0, 240)}`), {
      statusCode: res.status >= 500 ? 502 : res.status,
      code: "QR_FETCH_FAILED",
    });
  }
  const json = (await res.json()) as { items?: Array<Record<string, unknown>> };
  return (json.items ?? []).map((p) => ({
    id: String(p.id ?? ""),
    amount: Number(p.amount ?? 0),
    status: String(p.status ?? ""),
  }));
}

