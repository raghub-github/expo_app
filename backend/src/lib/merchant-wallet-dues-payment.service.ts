/**
 * Merchant outstanding-dues clear via Razorpay/UPI.
 * Credits merchant_wallet with description "Outstanding dues Cleared".
 * Idempotent on razorpay_payment_id (ledger + dues_payments audit).
 */
import { getEnv } from "../config/env.js";
import { getSql } from "../db/client.js";
import {
  createRazorpayOrder,
  fetchRazorpayOrderPayments,
  getPaymentDetails,
  verifyRazorpaySignature,
} from "../services/payment/razorpayService.js";
import crypto from "crypto";
import { getOrCreateWallet, getWalletSummary } from "./merchant-wallet-engine.js";

export const OUTSTANDING_DUES_CLEARED_DESCRIPTION = "Outstanding dues Cleared";
const LEDGER_DESCRIPTION = OUTSTANDING_DUES_CLEARED_DESCRIPTION;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function getOutstandingDuesFromAvailable(availableBalance: number): number {
  const avail = round2(Number(availableBalance) || 0);
  if (avail >= -0.005) return 0;
  return round2(-avail);
}

export async function getMerchantOutstandingDues(storeId: number): Promise<{
  duesAmount: number;
  availableBalance: number;
  walletId: number;
}> {
  const wallet = await getOrCreateWallet(storeId);
  const summary = await getWalletSummary(storeId, { lite: true });
  const availableBalance = round2(Number((summary as { available_balance?: number }).available_balance ?? 0));
  return {
    duesAmount: getOutstandingDuesFromAvailable(availableBalance),
    availableBalance,
    walletId: wallet.id,
  };
}

function duesIdempotencyKey(razorpayPaymentId: string): string {
  return `merchant_dues_rzp_${razorpayPaymentId}`;
}

async function findSettledByPaymentId(razorpayPaymentId: string): Promise<{
  settled: boolean;
  ledgerId: number | null;
  walletAfter: number | null;
}> {
  const sql = getSql();
  const key = duesIdempotencyKey(razorpayPaymentId);

  const [ledger] = await sql`
    SELECT id, balance_after
    FROM merchant_wallet_ledger
    WHERE idempotency_key = ${key}
    LIMIT 1
  `;
  if (ledger) {
    return {
      settled: true,
      ledgerId: Number((ledger as { id: number }).id),
      walletAfter: round2(Number((ledger as { balance_after?: number }).balance_after ?? 0)),
    };
  }

  try {
    const [paid] = await sql`
      SELECT id, ledger_id, wallet_after
      FROM merchant_wallet_dues_payments
      WHERE razorpay_payment_id = ${razorpayPaymentId}
        AND status IN ('success', 'captured')
      LIMIT 1
    `;
    if (paid) {
      return {
        settled: true,
        ledgerId:
          (paid as { ledger_id?: number | null }).ledger_id != null
            ? Number((paid as { ledger_id: number }).ledger_id)
            : null,
        walletAfter:
          (paid as { wallet_after?: number | null }).wallet_after != null
            ? round2(Number((paid as { wallet_after: number }).wallet_after))
            : null,
      };
    }
  } catch (err: unknown) {
    // Table may not exist yet — ledger idempotency still protects.
    if ((err as { code?: string })?.code !== "42P01") throw err;
  }

  return { settled: false, ledgerId: null, walletAfter: null };
}

async function insertDuesPaymentAttempt(args: {
  storeId: number;
  walletId: number;
  amountPaise: number;
  walletBefore: number;
  razorpayOrderId: string;
  status: string;
  source: string;
}): Promise<number | null> {
  const sql = getSql();
  try {
    const rows = await sql`
      INSERT INTO merchant_wallet_dues_payments (
        merchant_store_id, wallet_id, amount_paise, wallet_before,
        razorpay_order_id, status, metadata, created_by
      ) VALUES (
        ${args.storeId}, ${args.walletId}, ${args.amountPaise}, ${args.walletBefore},
        ${args.razorpayOrderId}, ${args.status},
        ${JSON.stringify({ source: args.source })}::jsonb,
        ${args.source}
      )
      RETURNING id
    `;
    return Number((rows[0] as { id: number }).id);
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "42P01") return null;
    throw err;
  }
}

async function markDuesPaymentSuccess(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  walletAfter: number;
  ledgerId: number;
  method?: string | null;
}): Promise<void> {
  const sql = getSql();
  try {
    await sql`
      UPDATE merchant_wallet_dues_payments
      SET
        razorpay_payment_id = ${args.razorpayPaymentId},
        razorpay_signature = ${args.razorpaySignature},
        status = 'success',
        wallet_after = ${args.walletAfter},
        ledger_id = ${args.ledgerId},
        method = ${args.method ?? null},
        updated_at = NOW()
      WHERE razorpay_order_id = ${args.razorpayOrderId}
    `;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "42P01") return;
    throw err;
  }
}

export async function createMerchantOutstandingDuesPaymentOrder(args: {
  storeId: number;
  /** When omitted (internal partnersite hop), ownership is not re-checked against parent. */
  parentId?: number | null;
  source?: string;
}) {
  const env = getEnv();
  const sql = getSql();

  const sc =
    args.parentId != null
      ? await sql`
          SELECT id, store_id, store_name
          FROM merchant_stores
          WHERE id = ${args.storeId}
            AND parent_id = ${args.parentId}
            AND deleted_at IS NULL
          LIMIT 1
        `
      : await sql`
          SELECT id, store_id, store_name
          FROM merchant_stores
          WHERE id = ${args.storeId}
            AND deleted_at IS NULL
          LIMIT 1
        `;
  if (sc.length === 0) {
    return { ok: false as const, status: 404, error: "Store not found" };
  }
  const store = sc[0] as { id: number; store_id: string; store_name: string };

  const { duesAmount, availableBalance, walletId } = await getMerchantOutstandingDues(store.id);
  if (duesAmount < 0.01) {
    return {
      ok: false as const,
      status: 400,
      error: "No outstanding dues to clear",
      duesAmount: 0,
      availableBalance,
    };
  }

  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return { ok: false as const, status: 503, error: "Payment gateway not configured" };
  }

  const amountPaise = Math.round(duesAmount * 100);
  if (amountPaise < 100) {
    return { ok: false as const, status: 400, error: "Minimum clear amount is ₹1.00" };
  }

  const receipt = `dues_${store.id}_${Date.now()}`.slice(0, 40);
  const order = await createRazorpayOrder({
    amount: amountPaise,
    currency: "INR",
    receipt,
    notes: {
      type: "merchant_outstanding_dues",
      merchant_store_pk: String(store.id),
      store_id: store.store_id,
      store_name: store.store_name,
      dues_amount: String(duesAmount),
    },
  });

  const source = args.source ?? "merchant_app";
  await insertDuesPaymentAttempt({
    storeId: store.id,
    walletId,
    amountPaise,
    walletBefore: availableBalance,
    razorpayOrderId: order.id,
    status: "initiated",
    source,
  });

  return {
    ok: true as const,
    orderId: order.id,
    keyId: env.RAZORPAY_KEY_ID,
    amount: amountPaise,
    currency: "INR",
    duesAmount,
    availableBalance,
    description: LEDGER_DESCRIPTION,
    /** True when using rzp_test_ keys — real UPI QR scan will not work. */
    testMode: String(env.RAZORPAY_KEY_ID).startsWith("rzp_test_"),
  };
}

export async function verifyMerchantOutstandingDuesPayment(args: {
  storeId: number;
  parentId?: number | null;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  source?: string;
}) {
  if (
    !verifyRazorpaySignature(
      args.razorpayOrderId,
      args.razorpayPaymentId,
      args.razorpaySignature
    )
  ) {
    return { ok: false as const, status: 400, error: "Invalid payment signature" };
  }

  const sql = getSql();
  const sc =
    args.parentId != null
      ? await sql`
          SELECT id, store_id, store_name
          FROM merchant_stores
          WHERE id = ${args.storeId}
            AND parent_id = ${args.parentId}
            AND deleted_at IS NULL
          LIMIT 1
        `
      : await sql`
          SELECT id, store_id, store_name
          FROM merchant_stores
          WHERE id = ${args.storeId}
            AND deleted_at IS NULL
          LIMIT 1
        `;
  if (sc.length === 0) {
    return { ok: false as const, status: 404, error: "Store not found" };
  }
  const store = sc[0] as { id: number; store_id: string; store_name: string };

  const already = await findSettledByPaymentId(args.razorpayPaymentId);
  if (already.settled) {
    const summary = await getWalletSummary(store.id, { lite: true });
    const availableBalance = round2(
      Number(
        (summary as { available_balance?: number }).available_balance ??
          already.walletAfter ??
          0
      )
    );
    return {
      ok: true as const,
      idempotent: true,
      paidAmount: 0,
      availableBalance,
      duesRemaining: getOutstandingDuesFromAvailable(availableBalance),
      ledgerId: already.ledgerId,
      description: LEDGER_DESCRIPTION,
    };
  }

  let payment: Awaited<ReturnType<typeof getPaymentDetails>>;
  try {
    payment = await getPaymentDetails(args.razorpayPaymentId);
  } catch {
    return { ok: false as const, status: 400, error: "Could not verify payment with gateway" };
  }

  const status = String((payment as { status?: string }).status ?? "").toLowerCase();
  if (status !== "captured" && status !== "authorized") {
    return { ok: false as const, status: 400, error: "Payment not completed" };
  }

  const paidPaise = Number((payment as { amount?: number }).amount ?? 0);
  const paidAmount = round2(paidPaise / 100);
  if (!(paidAmount > 0)) {
    return { ok: false as const, status: 400, error: "Invalid payment amount" };
  }

  const orderIdFromPayment = String((payment as { order_id?: string }).order_id ?? "");
  if (orderIdFromPayment && orderIdFromPayment !== args.razorpayOrderId) {
    return { ok: false as const, status: 400, error: "Payment order mismatch" };
  }

  const { duesAmount, availableBalance, walletId } = await getMerchantOutstandingDues(store.id);
  if (duesAmount < 0.01) {
    await markDuesPaymentSuccess({
      razorpayOrderId: args.razorpayOrderId,
      razorpayPaymentId: args.razorpayPaymentId,
      razorpaySignature: args.razorpaySignature,
      walletAfter: availableBalance,
      ledgerId: 0,
      method: (payment as { method?: string }).method
        ? String((payment as { method?: string }).method)
        : null,
    });
    return {
      ok: true as const,
      idempotent: true,
      paidAmount: 0,
      availableBalance,
      duesRemaining: 0,
      ledgerId: null,
      description: LEDGER_DESCRIPTION,
      alreadyCleared: true,
    };
  }

  const creditAmount = round2(Math.min(paidAmount, duesAmount));
  if (creditAmount < 0.01) {
    return { ok: false as const, status: 400, error: "Nothing to credit" };
  }

  const idempotencyKey = duesIdempotencyKey(args.razorpayPaymentId);
  const source = args.source ?? "merchant_app";
  const metadata = {
    source,
    razorpay_order_id: args.razorpayOrderId,
    razorpay_payment_id: args.razorpayPaymentId,
    dues_before: availableBalance,
    dues_amount: duesAmount,
    paid_amount: paidAmount,
    purpose: "outstanding_dues_clear",
    entry_type: "outstanding_dues_cleared",
  };

  const [creditRow] = await sql`
    SELECT merchant_wallet_credit(
      ${walletId},
      ${creditAmount},
      'MANUAL_CREDIT'::wallet_transaction_category,
      'AVAILABLE'::wallet_balance_type,
      'SYSTEM'::wallet_reference_type,
      ${store.id},
      ${idempotencyKey},
      ${LEDGER_DESCRIPTION},
      ${JSON.stringify(metadata)}::jsonb
    ) AS ledger_id
  `;
  const ledgerId = Number((creditRow as { ledger_id: unknown }).ledger_id);

  const after = await getMerchantOutstandingDues(store.id);
  await markDuesPaymentSuccess({
    razorpayOrderId: args.razorpayOrderId,
    razorpayPaymentId: args.razorpayPaymentId,
    razorpaySignature: args.razorpaySignature,
    walletAfter: after.availableBalance,
    ledgerId,
    method: (payment as { method?: string }).method
      ? String((payment as { method?: string }).method)
      : null,
  });

  return {
    ok: true as const,
    idempotent: false,
    paidAmount: creditAmount,
    availableBalance: after.availableBalance,
    duesRemaining: after.duesAmount,
    ledgerId,
    description: LEDGER_DESCRIPTION,
  };
}

/**
 * Settle dues when the client closed checkout after paying via UPI QR/Intent
 * (handler never fired). Confirms capture via Razorpay Orders API, then verifies.
 */
export async function settleMerchantOutstandingDuesFromOrder(args: {
  storeId: number;
  parentId?: number | null;
  razorpayOrderId: string;
  source?: string;
}) {
  const orderId = String(args.razorpayOrderId ?? "").trim();
  if (!orderId) {
    return { ok: false as const, status: 400, error: "order_id_required", captured: false };
  }

  let payments: Awaited<ReturnType<typeof fetchRazorpayOrderPayments>>;
  try {
    payments = await fetchRazorpayOrderPayments(orderId);
  } catch {
    return { ok: false as const, status: 502, error: "Could not fetch order payments", captured: false };
  }

  const captured = payments.find((p) => {
    const s = String(p.status ?? "").toLowerCase();
    return (s === "captured" || s === "authorized") && p.id;
  });
  if (!captured) {
    return { ok: true as const, captured: false, status: "pending" as const };
  }

  const env = getEnv();
  if (!env.RAZORPAY_KEY_SECRET) {
    return { ok: false as const, status: 503, error: "Payment gateway not configured", captured: false };
  }

  const signature = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${captured.id}`)
    .digest("hex");

  const result = await verifyMerchantOutstandingDuesPayment({
    storeId: args.storeId,
    parentId: args.parentId,
    razorpayOrderId: orderId,
    razorpayPaymentId: captured.id,
    razorpaySignature: signature,
    source: args.source,
  });

  if (!result.ok) {
    return { ...result, captured: true as const };
  }
  return { ...result, captured: true as const };
}
