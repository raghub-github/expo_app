import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb, getSql } from "../db/client.js";
import { riderWallet } from "../db/schema.js";
import { getEnv } from "../config/env.js";
import {
  createRazorpayOrder,
  verifyRazorpayPaymentDetails,
  verifyRazorpaySignature,
} from "../services/payment/razorpayService.js";
import {
  getRiderSubscriptionDuesSnapshot,
  payRiderSubscriptionDues,
  refreshRiderSubscriptionDispatchBlock,
} from "./rider-subscription-wallet.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function readWalletBalance(riderId: number): Promise<number> {
  const db = getDb();
  const [wallet] = await db
    .select({ totalBalance: riderWallet.totalBalance })
    .from(riderWallet)
    .where(eq(riderWallet.riderId, riderId))
    .limit(1);
  return round2(Number(wallet?.totalBalance ?? 0));
}

async function ensureWalletRow(riderId: number): Promise<void> {
  const db = getDb();
  const [wallet] = await db
    .select({ id: riderWallet.id })
    .from(riderWallet)
    .where(eq(riderWallet.riderId, riderId))
    .limit(1);
  if (wallet) return;
  await db.insert(riderWallet).values({
    riderId,
    totalBalance: "0",
    earningsFood: "0",
    earningsParcel: "0",
    earningsPersonRide: "0",
    penaltiesFood: "0",
    penaltiesParcel: "0",
    penaltiesPersonRide: "0",
    totalWithdrawn: "0",
  });
}

async function hasSubscriptionDuesPaymentLedger(
  riderId: number,
  razorpayPaymentId: string
): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    SELECT id
    FROM wallet_ledger
    WHERE rider_id = ${riderId}
      AND entry_type::text = 'manual_add'
      AND ref_type = 'subscription_dues_payment'
      AND ref = ${razorpayPaymentId}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function creditWalletForSubscriptionDuesPayment(args: {
  riderId: number;
  amount: number;
  razorpayPaymentId: string;
  razorpayOrderId: string;
}): Promise<{ totalBalance: number; idempotent: boolean }> {
  const amount = round2(args.amount);
  if (amount <= 0) throw new Error("invalid_amount");

  if (await hasSubscriptionDuesPaymentLedger(args.riderId, args.razorpayPaymentId)) {
    return { totalBalance: await readWalletBalance(args.riderId), idempotent: true };
  }

  await ensureWalletRow(args.riderId);
  const balanceBefore = await readWalletBalance(args.riderId);
  const balanceAfter = round2(balanceBefore + amount);
  const sql = getSql();

  try {
    await sql`
      INSERT INTO wallet_ledger (
        rider_id,
        entry_type,
        amount,
        balance,
        service_type,
        ref,
        ref_type,
        description,
        metadata,
        performed_by_type
      ) VALUES (
        ${args.riderId},
        'manual_add',
        ${amount.toFixed(2)},
        ${balanceAfter.toFixed(2)},
        NULL,
        ${args.razorpayPaymentId},
        'subscription_dues_payment',
        ${"Subscription dues payment via Razorpay"},
        ${JSON.stringify({
          razorpayOrderId: args.razorpayOrderId,
          razorpayPaymentId: args.razorpayPaymentId,
          source: "rider_app",
        })}::text::jsonb,
        'rider'
      )
    `;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== "42703") throw err;
    await sql`
      INSERT INTO wallet_ledger (
        rider_id,
        entry_type,
        amount,
        balance,
        ref,
        ref_type,
        description,
        metadata
      ) VALUES (
        ${args.riderId},
        'manual_add',
        ${amount.toFixed(2)},
        ${balanceAfter.toFixed(2)},
        ${args.razorpayPaymentId},
        'subscription_dues_payment',
        ${"Subscription dues payment via Razorpay"},
        ${JSON.stringify({
          razorpayOrderId: args.razorpayOrderId,
          razorpayPaymentId: args.razorpayPaymentId,
          source: "rider_app",
        })}::text::jsonb
      )
    `;
  }

  const db = getDb();
  await db
    .update(riderWallet)
    .set({
      totalBalance: balanceAfter.toFixed(2),
      lastUpdatedAt: new Date(),
    })
    .where(eq(riderWallet.riderId, args.riderId));

  return { totalBalance: await readWalletBalance(args.riderId), idempotent: false };
}

export async function createRiderSubscriptionDuesPaymentOrder(riderId: number) {
  const snapshot = await getRiderSubscriptionDuesSnapshot(riderId);
  const totalDue = round2(snapshot.totalDue);
  if (totalDue <= 0) {
    return { ok: false as const, status: 400, error: "no_subscription_dues" };
  }

  const amountPaise = Math.max(100, Math.round(totalDue * 100));
  const env = getEnv();
  const hasRazorpayKeys = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

  if (hasRazorpayKeys) {
    const order = await createRazorpayOrder({
      amount: amountPaise,
      currency: "INR",
      receipt: `rider_sub_dues_${riderId}_${Date.now()}`,
      notes: {
        type: "rider_subscription_dues_payment",
        rider_id: String(riderId),
        amount_rupees: String(round2(amountPaise / 100)),
      },
    });

    return {
      ok: true as const,
      orderId: order.id,
      keyId: env.RAZORPAY_KEY_ID!,
      amount: order.amount,
      amountRupees: round2(order.amount / 100),
      currency: order.currency,
      dummyMode: false,
      totalDue,
    };
  }

  const canUseDummy = env.PAYMENT_DUMMY_MODE || env.NODE_ENV === "development";
  if (!canUseDummy) {
    return { ok: false as const, status: 503, error: "payment_gateway_not_configured" };
  }

  return {
    ok: true as const,
    orderId: `dummy_${ulid()}`,
    keyId: "dummy_key",
    amount: amountPaise,
    amountRupees: round2(amountPaise / 100),
    currency: "INR",
    dummyMode: true,
    totalDue,
  };
}

export async function verifyRiderSubscriptionDuesPayment(args: {
  riderId: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  const env = getEnv();
  const hasRazorpayKeys = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  const allowSimulated =
    !hasRazorpayKeys &&
    (env.PAYMENT_DUMMY_MODE || env.NODE_ENV === "development") &&
    args.razorpaySignature === "simulated_signature";

  if (await hasSubscriptionDuesPaymentLedger(args.riderId, args.razorpayPaymentId)) {
    await refreshRiderSubscriptionDispatchBlock(args.riderId);
    const after = await getRiderSubscriptionDuesSnapshot(args.riderId);
    return {
      ok: true as const,
      success: true,
      paidAmount: 0,
      totalDueBefore: after.totalDue,
      totalDueAfter: after.totalDue,
      totalBalance: after.walletBalance,
      idempotent: true,
    };
  }

  const snapshot = await getRiderSubscriptionDuesSnapshot(args.riderId);
  const totalDueBefore = round2(snapshot.totalDue);
  if (totalDueBefore <= 0 && !allowSimulated) {
    return { ok: false as const, status: 400, error: "no_subscription_dues" };
  }

  const expectedPaise = Math.max(100, Math.round(totalDueBefore * 100));

  if (!allowSimulated) {
    const verified = await verifyRazorpayPaymentDetails(
      args.razorpayOrderId,
      args.razorpayPaymentId,
      args.razorpaySignature,
      expectedPaise
    );
    if (!verified.ok) {
      return { ok: false as const, status: 400, error: verified.code };
    }
  } else if (
    !verifyRazorpaySignature(args.razorpayOrderId, args.razorpayPaymentId, args.razorpaySignature)
  ) {
    return { ok: false as const, status: 400, error: "invalid_signature" };
  }

  const paymentAmount = round2(expectedPaise / 100);
  await creditWalletForSubscriptionDuesPayment({
    riderId: args.riderId,
    amount: paymentAmount,
    razorpayPaymentId: args.razorpayPaymentId,
    razorpayOrderId: args.razorpayOrderId,
  });

  await payRiderSubscriptionDues(args.riderId);
  await refreshRiderSubscriptionDispatchBlock(args.riderId);

  const after = await getRiderSubscriptionDuesSnapshot(args.riderId);

  return {
    ok: true as const,
    success: true,
    paidAmount: paymentAmount,
    totalDueBefore,
    totalDueAfter: after.totalDue,
    totalBalance: after.walletBalance,
    idempotent: false,
  };
}
