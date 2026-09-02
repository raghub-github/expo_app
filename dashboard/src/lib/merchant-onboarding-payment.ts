import { getStoreOnboardingCommissionConfig } from "@/lib/db/operations/store-onboarding-commission-config";
import { getSql } from "@/lib/db/client";
import { createRazorpayUpiQr, getRazorpayPublicKeyId } from "@/lib/payment/razorpay-qr";

const FALLBACK_PROMO_AMOUNT_PAISE = 100;
const FALLBACK_STANDARD_AMOUNT_PAISE = 9900;
const FALLBACK_GST_PERCENT = 18;

function parseGstPercent(gstPercent: string | undefined): number {
  const n = Number(gstPercent);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, n);
}

export type CreateMerchantOnboardingOrderInput = {
  merchantParentId: number;
  merchantStoreInternalId: number;
  merchantStorePublicId: string;
  planId?: string;
  planName?: string;
};

export type CreateMerchantOnboardingOrderResult =
  | {
      ok: true;
      orderId: string;
      keyId: string;
      amountPaise: number;
      subtotalPaise: number;
      gstAmountPaise: number;
      gstPercentApplied: number;
      qrImageUrl: string | null;
      qrId: string | null;
    }
  | { ok: false; status: number; error: string; code?: string };

export async function createMerchantOnboardingOrder(
  input: CreateMerchantOnboardingOrderInput
): Promise<CreateMerchantOnboardingOrderResult> {
  const razorpayKeyId = getRazorpayPublicKeyId();
  const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!razorpayKeyId || !razorpayKeySecret) {
    return {
      ok: false,
      status: 503,
      error: "Payment not configured. Proceed without payment.",
      code: "SERVICE_UNAVAILABLE",
    };
  }

  const commission = await getStoreOnboardingCommissionConfig();
  const discountedRupee = commission
    ? Number(commission.discountedOnboardingFee)
    : FALLBACK_PROMO_AMOUNT_PAISE / 100;
  const standardRupee = commission
    ? Number(commission.standardOnboardingFee)
    : FALLBACK_STANDARD_AMOUNT_PAISE / 100;
  const subtotalPaise = Math.max(0, Math.round(discountedRupee * 100));
  const standardAmountPaise = Math.max(0, Math.round(standardRupee * 100));
  const gstPercentApplied = parseGstPercent(commission?.gstPercent);
  const gstAmountPaise = Math.round((subtotalPaise * gstPercentApplied) / 100);
  const totalPaise =
    Number.isFinite(subtotalPaise + gstAmountPaise) && subtotalPaise + gstAmountPaise > 0
      ? subtotalPaise + gstAmountPaise
      : FALLBACK_PROMO_AMOUNT_PAISE;

  const planId = input.planId ?? "FREE";
  const planName = input.planName ?? commission?.planName ?? "Starter Plan";
  const receipt = `onboard_${input.merchantParentId}_store_${input.merchantStoreInternalId}_${Date.now()}`;

  const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Basic " + Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64"),
    },
    body: JSON.stringify({
      amount: totalPaise,
      currency: "INR",
      receipt,
      notes: {
        purpose: "merchant_onboarding",
        merchant_store_public_id: input.merchantStorePublicId,
        merchant_parent_id: String(input.merchantParentId),
      },
    }),
  });

  if (!orderRes.ok) {
    const errText = await orderRes.text().catch(() => "");
    console.error("[merchant-onboarding-payment] Razorpay order error:", orderRes.status, errText);
    return { ok: false, status: 502, error: "Could not create payment order" };
  }

  const order = (await orderRes.json()) as { id?: string };
  const razorpayOrderId = order.id;
  if (!razorpayOrderId) {
    return { ok: false, status: 502, error: "Could not create payment order" };
  }

  const promoLabel =
    gstPercentApplied > 0
      ? `₹${discountedRupee} + ${gstPercentApplied}% GST`
      : `₹${discountedRupee} today`;

  const sql = getSql();
  await sql`
    INSERT INTO merchant_onboarding_payments (
      merchant_parent_id,
      merchant_store_id,
      amount_paise,
      currency,
      plan_id,
      plan_name,
      standard_amount_paise,
      promo_amount_paise,
      promo_label,
      razorpay_order_id,
      status,
      razorpay_status,
      subtotal_paise,
      gst_percent_applied,
      gst_amount_paise
    ) VALUES (
      ${input.merchantParentId},
      ${input.merchantStoreInternalId},
      ${totalPaise},
      'INR',
      ${planId},
      ${planName},
      ${standardAmountPaise || FALLBACK_STANDARD_AMOUNT_PAISE},
      ${subtotalPaise},
      ${promoLabel},
      ${razorpayOrderId},
      'created',
      'created',
      ${subtotalPaise},
      ${gstPercentApplied},
      ${gstAmountPaise}
    )
  `;

  let qrImageUrl: string | null = null;
  let qrId: string | null = null;
  try {
    const qr = await createRazorpayUpiQr({
      amountPaise: totalPaise,
      description: `GatiMitra store onboarding ${input.merchantStorePublicId}`,
      closeBySec: Math.floor(Date.now() / 1000) + 30 * 60,
      notes: {
        purpose: "merchant_onboarding",
        razorpay_order_id: razorpayOrderId,
        merchant_store_public_id: input.merchantStorePublicId,
        merchant_parent_id: String(input.merchantParentId),
      },
    });
    qrImageUrl = qr.imageUrl;
    qrId = qr.id;
  } catch (e) {
    console.warn("[merchant-onboarding-payment] QR create failed (checkout still available):", e);
  }

  return {
    ok: true,
    orderId: razorpayOrderId,
    keyId: razorpayKeyId,
    amountPaise: totalPaise,
    subtotalPaise,
    gstAmountPaise,
    gstPercentApplied,
    qrImageUrl,
    qrId,
  };
}

export async function getMerchantOnboardingPaymentCaptured(
  merchantParentId: number,
  merchantStoreInternalId: number
): Promise<boolean> {
  const sql = getSql();
  const rows = await sql<{ id: number }[]>`
    SELECT id
    FROM merchant_onboarding_payments
    WHERE merchant_parent_id = ${merchantParentId}
      AND merchant_store_id = ${merchantStoreInternalId}
      AND status = 'captured'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const row = Array.isArray(rows) ? rows[0] : null;
  return Boolean(row);
}

export async function getMerchantOnboardingPaymentByOrderId(orderId: string) {
  const sql = getSql();
  const rows = await sql<
    { id: number; status: string | null; captured_at: string | null; merchant_store_id: number | null }[]
  >`
    SELECT id, status, captured_at::text AS captured_at, merchant_store_id
    FROM merchant_onboarding_payments
    WHERE razorpay_order_id = ${orderId}
    LIMIT 1
  `;
  return Array.isArray(rows) ? rows[0] ?? null : null;
}
