import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb, getSql } from "../db/client.js";
import { riderWallet } from "../db/schema.js";
import { getRiderAccountRestrictions } from "./rider-account-restrictions.js";
import { applyFifoAllocation } from "./rider-negative-wallet-blocks.js";
import { getEnv } from "../config/env.js";
import {
  createRazorpayOrder,
  verifyRazorpayPaymentDetails,
  verifyRazorpaySignature,
} from "../services/payment/razorpayService.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function resolvePenaltyDueRupees(riderId: number): Promise<number> {
  const restrictions = await getRiderAccountRestrictions(riderId);
  const walletBalance = await readWalletBalance(riderId);
  if (walletBalance >= 0) return 0;
  return round2(Math.max(0, restrictions.penaltyDue));
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

async function hasPenaltyPaymentLedger(riderId: number, razorpayPaymentId: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    SELECT id
    FROM wallet_ledger
    WHERE rider_id = ${riderId}
      AND entry_type::text = 'manual_add'
      AND ref_type = 'penalty_payment'
      AND ref = ${razorpayPaymentId}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function creditWalletForPenaltyPayment(args: {
  riderId: number;
  amount: number;
  razorpayPaymentId: string;
  razorpayOrderId: string;
}): Promise<{ totalBalance: number; idempotent: boolean }> {
  const amount = round2(args.amount);
  if (amount <= 0) throw new Error("invalid_amount");

  if (await hasPenaltyPaymentLedger(args.riderId, args.razorpayPaymentId)) {
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
        'penalty_payment',
        ${"Penalty payment via Razorpay"},
        ${JSON.stringify({
          razorpayOrderId: args.razorpayOrderId,
          razorpayPaymentId: args.razorpayPaymentId,
          source: "rider_app",
        })}::jsonb,
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
        'penalty_payment',
        ${"Penalty payment via Razorpay"},
        ${JSON.stringify({
          razorpayOrderId: args.razorpayOrderId,
          razorpayPaymentId: args.razorpayPaymentId,
          source: "rider_app",
        })}::jsonb
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

  await applyFifoAllocation(args.riderId, amount);

  return { totalBalance: await readWalletBalance(args.riderId), idempotent: false };
}

export async function createRiderPenaltyPaymentOrder(riderId: number) {
  const penaltyDue = await resolvePenaltyDueRupees(riderId);
  if (penaltyDue <= 0) {
    return { ok: false as const, status: 400, error: "no_penalty_due" };
  }

  const amountPaise = Math.max(100, Math.round(penaltyDue * 100));
  const env = getEnv();
  const dummyModeActive =
    env.PAYMENT_DUMMY_MODE || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET;

  if (dummyModeActive) {
    if (!env.PAYMENT_DUMMY_MODE && env.NODE_ENV !== "development") {
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
    };
  }

  const order = await createRazorpayOrder({
    amount: amountPaise,
    currency: "INR",
    receipt: `rider_penalty_${riderId}_${Date.now()}`,
    notes: {
      type: "rider_penalty_payment",
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
  };
}

export async function verifyRiderPenaltyPayment(args: {
  riderId: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  const env = getEnv();
  const allowSimulated =
    (env.PAYMENT_DUMMY_MODE || env.NODE_ENV === "development") &&
    args.razorpaySignature === "simulated_signature";

  if (await hasPenaltyPaymentLedger(args.riderId, args.razorpayPaymentId)) {
    return {
      ok: true as const,
      success: true,
      creditedAmount: 0,
      totalBalance: await readWalletBalance(args.riderId),
      idempotent: true,
    };
  }

  const penaltyDue = await resolvePenaltyDueRupees(args.riderId);
  if (penaltyDue <= 0 && !allowSimulated) {
    return { ok: false as const, status: 400, error: "no_penalty_due" };
  }

  const expectedPaise = Math.max(100, Math.round(penaltyDue * 100));

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
  } else if (!verifyRazorpaySignature(args.razorpayOrderId, args.razorpayPaymentId, args.razorpaySignature)) {
    return { ok: false as const, status: 400, error: "invalid_signature" };
  }

  const credited = await creditWalletForPenaltyPayment({
    riderId: args.riderId,
    amount: round2(expectedPaise / 100),
    razorpayPaymentId: args.razorpayPaymentId,
    razorpayOrderId: args.razorpayOrderId,
  });

  return {
    ok: true as const,
    success: true,
    creditedAmount: round2(expectedPaise / 100),
    totalBalance: credited.totalBalance,
    idempotent: credited.idempotent,
  };
}
