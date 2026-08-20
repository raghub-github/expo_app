import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb } from "../db/client.js";
import {
  riderNegativeWalletBlocks,
  riderServiceBlockHistory,
  riderWallet,
  riderWalletPayments,
  walletLedger,
} from "../db/schema.js";
import { applyFifoAllocation } from "./rider-negative-wallet-blocks.js";
import { syncRiderDutyWithRestrictions } from "./rider-account-restrictions.js";
import { getEnv } from "../config/env.js";
import { logPaymentEvent } from "../modules/orders/order.placement.service.js";
import {
  createRazorpayOrder,
  fetchRazorpayOrderPayments,
  verifyRazorpayPaymentDetails,
  verifyRazorpaySignature,
} from "../services/payment/razorpayService.js";

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

/**
 * Payable = the entire current negative balance (→ wallet becomes exactly ₹0).
 * Returns 0 when the wallet is not negative.
 */
async function getPayableNegativeRupees(riderId: number): Promise<number> {
  const balance = await readWalletBalance(riderId);
  if (balance >= 0) return 0;
  return round2(-balance);
}

/** Latest snapshot of the rider's active negative-wallet (penalty) service blocks. */
async function readNegativeWalletBlocks(
  riderId: number
): Promise<Array<{ serviceType: string; reason: string }>> {
  const db = getDb();
  const rows = await db
    .select({
      serviceType: riderNegativeWalletBlocks.serviceType,
      reason: riderNegativeWalletBlocks.reason,
    })
    .from(riderNegativeWalletBlocks)
    .where(eq(riderNegativeWalletBlocks.riderId, riderId));
  return rows.map((r) => ({ serviceType: String(r.serviceType), reason: String(r.reason) }));
}

/**
 * Was this Razorpay payment already settled? Checks BOTH the payments audit row
 * and the legacy wallet_ledger idempotency marker so old + new records dedupe.
 */
async function findSettledPayment(
  riderId: number,
  razorpayPaymentId: string
): Promise<boolean> {
  const db = getDb();
  const [paid] = await db
    .select({ id: riderWalletPayments.id })
    .from(riderWalletPayments)
    .where(
      and(
        eq(riderWalletPayments.razorpayPaymentId, razorpayPaymentId),
        eq(riderWalletPayments.status, "success")
      )
    )
    .limit(1);
  if (paid) return true;

  const [ledger] = await db
    .select({ id: walletLedger.id })
    .from(walletLedger)
    .where(and(eq(walletLedger.riderId, riderId), eq(walletLedger.ref, razorpayPaymentId)))
    .limit(1);
  return Boolean(ledger);
}

/** Record unblock transitions to rider_service_block_history (penalty blocks only). */
async function recordUnblockHistory(args: {
  riderId: number;
  blocksBefore: Array<{ serviceType: string; reason: string }>;
  walletBefore: number;
  walletAfter: number;
  paymentRef: string;
}): Promise<string[]> {
  const db = getDb();
  const after = await readNegativeWalletBlocks(args.riderId);
  const afterKeys = new Set(after.map((b) => b.serviceType));
  const removed = args.blocksBefore.filter((b) => !afterKeys.has(b.serviceType));
  if (removed.length === 0) return [];

  await db.insert(riderServiceBlockHistory).values(
    removed.map((b) => ({
      riderId: args.riderId,
      serviceType: b.serviceType,
      action: "unblocked" as const,
      previousStatus: "blocked",
      newStatus: "active",
      reason: b.reason, // negative_wallet | global_emergency
      paymentRef: args.paymentRef,
      walletBefore: args.walletBefore.toFixed(2),
      walletAfter: args.walletAfter.toFixed(2),
      performedBy: "system",
      remarks: "Auto-unblocked after negative-wallet recovery payment.",
      metadata: { source: "negative_wallet_recovery" },
    }))
  );

  return removed.map((b) => b.serviceType);
}

/** Best-effort push after a successful recovery. Never blocks the money flow. */
async function notifyRiderWalletRecovered(
  riderId: number,
  reactivatedServices: string[]
): Promise<void> {
  try {
    const db = getDb();
    const { expoPushTokens } = await import("../db/schema.js");
    const { send } = await import("../modules/notifications/notificationService.js");
    const userId = `usr_${riderId}`;
    const rows = await db
      .select({ token: expoPushTokens.expoPushToken })
      .from(expoPushTokens)
      .where(and(eq(expoPushTokens.userId, userId), eq(expoPushTokens.role, "rider")));
    const tokens = rows.map((r) => r.token).filter((t): t is string => Boolean(t));
    if (tokens.length === 0) return;

    const body =
      reactivatedServices.length > 0
        ? `Wallet cleared. Reactivated: ${reactivatedServices
            .map((s) => (s === "person_ride" ? "Ride" : s.charAt(0).toUpperCase() + s.slice(1)))
            .join(", ")}.`
        : "Your wallet has been cleared successfully.";

    await send({
      templateCode: "RIDER_WALLET_RECOVERED",
      variables: { riderId: String(riderId), services: reactivatedServices.join(", ") },
      target: { device_tokens: tokens },
      overrides: { title: "Wallet cleared", body },
      metadata: { gmType: "WALLET_RECOVERED", riderId: String(riderId) },
    });
  } catch {
    // notification failures must never affect the wallet outcome
  }
}

/**
 * Create a Razorpay order for the full negative balance and record an
 * `initiated` audit row. Rider cannot edit the amount — it is the abs(balance).
 */
export async function createRiderPenaltyPaymentOrder(riderId: number) {
  // Self-heal first: if a previous attempt was actually captured at Razorpay but never
  // confirmed (app died / lost network / missing webhook), settle it now so we don't
  // charge the rider a second time and `payable` reflects the true outstanding.
  try {
    await reconcileRiderWalletPayments(riderId);
  } catch {
    // reconciliation is best-effort — never block starting a new payment
  }

  const payable = await getPayableNegativeRupees(riderId);
  if (payable <= 0) {
    return { ok: false as const, status: 400, error: "no_due" };
  }

  const walletBefore = await readWalletBalance(riderId);
  const amountPaise = Math.max(100, Math.round(payable * 100));
  const env = getEnv();
  const dummyModeActive =
    env.PAYMENT_DUMMY_MODE || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET;

  const db = getDb();
  const recordInitiated = async (orderId: string, dummyMode: boolean) => {
    try {
      await db.insert(riderWalletPayments).values({
        riderId,
        purpose: "negative_wallet_recovery",
        amountPaise,
        walletBefore: walletBefore.toFixed(2),
        razorpayOrderId: orderId,
        gateway: dummyMode ? "dummy" : "razorpay",
        status: "initiated",
        createdBy: "rider",
        metadata: { walletBefore, payableRupees: payable, dummyMode },
      });
      await logPaymentEvent(db, {
        eventType: "NEG_WALLET_PAYMENT_INITIATED",
        source: "client",
        razorpayOrderId: orderId,
        payload: { riderId, amountPaise, walletBefore, dummyMode },
      });
    } catch {
      // audit insert must not block order creation
    }
  };

  if (dummyModeActive) {
    if (!env.PAYMENT_DUMMY_MODE && env.NODE_ENV !== "development") {
      return { ok: false as const, status: 503, error: "payment_gateway_not_configured" };
    }
    const orderId = `dummy_${ulid()}`;
    await recordInitiated(orderId, true);
    return {
      ok: true as const,
      orderId,
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
    receipt: `rider_negwallet_${riderId}_${Date.now()}`,
    notes: {
      type: "rider_negative_wallet_recovery",
      rider_id: String(riderId),
      amount_rupees: String(round2(amountPaise / 100)),
    },
  });

  await recordInitiated(order.id, false);

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

/**
 * Record a failed / cancelled attempt (Razorpay sheet dismissed or gateway error).
 * Marks the initiated audit row and appends a lifecycle event. Best-effort.
 */
export async function recordRiderWalletPaymentAttempt(args: {
  riderId: number;
  razorpayOrderId: string;
  status: "failed" | "cancelled";
  reason?: string;
}) {
  const db = getDb();
  try {
    // The client says the sheet was cancelled/failed — but the payment may actually
    // have been captured (a UPI collect that succeeded after the app gave up, a lost
    // success callback). Ask Razorpay before trusting "cancelled": if it was captured
    // we settle the wallet instead of burying a real payment as cancelled.
    const [row] = await db
      .select({
        riderId: riderWalletPayments.riderId,
        razorpayOrderId: riderWalletPayments.razorpayOrderId,
        amountPaise: riderWalletPayments.amountPaise,
        status: riderWalletPayments.status,
        gateway: riderWalletPayments.gateway,
        createdAt: riderWalletPayments.createdAt,
      })
      .from(riderWalletPayments)
      .where(
        and(
          eq(riderWalletPayments.riderId, args.riderId),
          eq(riderWalletPayments.razorpayOrderId, args.razorpayOrderId)
        )
      )
      .orderBy(desc(riderWalletPayments.createdAt))
      .limit(1);

    if (row && row.status !== "success") {
      const outcome = await reconcileOneWalletOrder(row);
      if (outcome.result === "settled" || outcome.result === "already_settled") {
        // Real payment — do not overwrite the now-success row with cancelled/failed.
        return { ok: true as const, settled: true };
      }
    }

    await db
      .update(riderWalletPayments)
      .set({ status: args.status, remarks: args.reason ?? args.status, updatedAt: new Date(), updatedBy: "rider" })
      .where(
        and(
          eq(riderWalletPayments.riderId, args.riderId),
          eq(riderWalletPayments.razorpayOrderId, args.razorpayOrderId),
          inArray(riderWalletPayments.status, ["initiated"])
        )
      );
    await logPaymentEvent(db, {
      eventType: "NEG_WALLET_PAYMENT_ATTEMPT_FAILED",
      source: "client",
      razorpayOrderId: args.razorpayOrderId,
      failureMessage: args.reason ?? args.status,
      payload: { riderId: args.riderId, status: args.status, reason: args.reason ?? null },
    });
  } catch {
    // best-effort
  }
  return { ok: true as const };
}

/**
 * Verify a negative-wallet recovery payment and atomically clear the wallet to
 * exactly ₹0, then remove ONLY penalty-origin service blocks (fraud/manual blocks
 * remain). Idempotent on the Razorpay payment id.
 */
export async function verifyRiderPenaltyPayment(args: {
  riderId: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  const env = getEnv();
  const db = getDb();
  const allowSimulated =
    (env.PAYMENT_DUMMY_MODE || env.NODE_ENV === "development") &&
    args.razorpaySignature === "simulated_signature";

  // Idempotency: already settled → no-op success.
  if (await findSettledPayment(args.riderId, args.razorpayPaymentId)) {
    return {
      ok: true as const,
      success: true,
      creditedAmount: 0,
      totalBalance: await readWalletBalance(args.riderId),
      idempotent: true,
    };
  }

  // Resolve the amount that was charged for this order (from the audit row),
  // falling back to the live payable if the row is missing.
  const [orderRow] = await db
    .select()
    .from(riderWalletPayments)
    .where(
      and(
        eq(riderWalletPayments.riderId, args.riderId),
        eq(riderWalletPayments.razorpayOrderId, args.razorpayOrderId)
      )
    )
    .orderBy(desc(riderWalletPayments.createdAt))
    .limit(1);

  const livePayablePaise = Math.max(100, Math.round((await getPayableNegativeRupees(args.riderId)) * 100));
  const expectedPaise = orderRow?.amountPaise ?? livePayablePaise;

  const markVerificationFailed = async (error: string) => {
    try {
      await db
        .update(riderWalletPayments)
        .set({
          status: "verification_failed",
          razorpayPaymentId: args.razorpayPaymentId,
          razorpaySignature: args.razorpaySignature,
          remarks: error,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(riderWalletPayments.riderId, args.riderId),
            eq(riderWalletPayments.razorpayOrderId, args.razorpayOrderId)
          )
        );
      await logPaymentEvent(db, {
        eventType: "NEG_WALLET_PAYMENT_VERIFICATION_FAILED",
        source: "client",
        razorpayOrderId: args.razorpayOrderId,
        razorpayPaymentId: args.razorpayPaymentId,
        failureMessage: error,
        payload: { riderId: args.riderId },
      });
    } catch {
      /* best-effort */
    }
  };

  // Signature + amount verification (never trust the client).
  if (!allowSimulated) {
    const verified = await verifyRazorpayPaymentDetails(
      args.razorpayOrderId,
      args.razorpayPaymentId,
      args.razorpaySignature,
      expectedPaise
    );
    if (!verified.ok) {
      await markVerificationFailed(verified.code);
      return { ok: false as const, status: 400, error: verified.code };
    }
  } else if (
    !verifyRazorpaySignature(args.razorpayOrderId, args.razorpayPaymentId, args.razorpaySignature)
  ) {
    await markVerificationFailed("invalid_signature");
    return { ok: false as const, status: 400, error: "invalid_signature" };
  }

  return settleRiderWalletPayment({
    riderId: args.riderId,
    razorpayOrderId: args.razorpayOrderId,
    razorpayPaymentId: args.razorpayPaymentId,
    expectedPaise,
    method: allowSimulated ? "simulated" : "razorpay",
    razorpaySignature: args.razorpaySignature,
    source: "client",
  });
}

/**
 * Shared, concurrency-safe money movement for a negative-wallet settlement.
 * Used by BOTH the client verify path and the Razorpay webhook path. A
 * `SELECT … FOR UPDATE` on the rider's wallet row serialises a racing
 * verify + webhook (which fire within seconds of each other), and the
 * wallet_ledger `ref = razorpayPaymentId` is the shared idempotency key so the
 * credit is applied at most once. Safe to call repeatedly.
 */
async function settleRiderWalletPayment(args: {
  riderId: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  expectedPaise: number;
  method: "razorpay" | "simulated";
  razorpaySignature?: string;
  source: "client" | "webhook";
}) {
  const db = getDb();
  await ensureWalletRow(args.riderId);

  // Snapshot penalty blocks BEFORE the credit so we can diff for history.
  const blocksBefore = await readNegativeWalletBlocks(args.riderId);

  // Atomic money update: lock wallet → dedupe → credit (capped so balance never
  // exceeds 0), ledger, audit row → success. Any failure rolls the whole thing back.
  let result: {
    balanceBefore: number;
    balanceAfter: number;
    creditApplied: number;
    idempotent: boolean;
  };
  try {
    result = await db.transaction(async (tx) => {
      // Serialise concurrent verify + webhook on this rider's wallet row so the
      // credit can never be applied twice.
      await tx.execute(sql`SELECT 1 FROM rider_wallet WHERE rider_id = ${args.riderId} FOR UPDATE`);

      const [w] = await tx
        .select({ totalBalance: riderWallet.totalBalance })
        .from(riderWallet)
        .where(eq(riderWallet.riderId, args.riderId))
        .limit(1);
      const balanceBefore = round2(Number(w?.totalBalance ?? 0));

      // Idempotency (inside the lock): this exact payment already credited?
      const [ledgerDup] = await tx
        .select({ id: walletLedger.id })
        .from(walletLedger)
        .where(
          and(eq(walletLedger.riderId, args.riderId), eq(walletLedger.ref, args.razorpayPaymentId))
        )
        .limit(1);
      if (ledgerDup) {
        return { balanceBefore, balanceAfter: balanceBefore, creditApplied: 0, idempotent: true };
      }

      const amountPaid = round2(args.expectedPaise / 100);
      // Never let the wallet go positive — cap the credit to the outstanding.
      const balanceAfter = round2(Math.min(0, balanceBefore + amountPaid));
      const creditApplied = round2(balanceAfter - balanceBefore);

      await tx.insert(walletLedger).values({
        riderId: args.riderId,
        entryType: "manual_add",
        amount: creditApplied.toFixed(2),
        balance: balanceAfter.toFixed(2),
        ref: args.razorpayPaymentId,
        refType: "negative_wallet_recovery",
        description: "Negative wallet settlement via Razorpay",
        metadata: {
          razorpayOrderId: args.razorpayOrderId,
          razorpayPaymentId: args.razorpayPaymentId,
          source: args.source === "webhook" ? "razorpay_webhook" : "rider_app",
        },
      });

      await tx
        .update(riderWallet)
        .set({ totalBalance: balanceAfter.toFixed(2), lastUpdatedAt: new Date() })
        .where(eq(riderWallet.riderId, args.riderId));

      await tx
        .update(riderWalletPayments)
        .set({
          status: "success",
          walletAfter: balanceAfter.toFixed(2),
          razorpayPaymentId: args.razorpayPaymentId,
          ...(args.razorpaySignature ? { razorpaySignature: args.razorpaySignature } : {}),
          method: args.method,
          remarks: "Negative wallet settlement",
          updatedAt: new Date(),
          updatedBy: args.source === "webhook" ? "webhook" : "rider",
        })
        .where(
          and(
            eq(riderWalletPayments.riderId, args.riderId),
            eq(riderWalletPayments.razorpayOrderId, args.razorpayOrderId)
          )
        );

      return { balanceBefore, balanceAfter, creditApplied, idempotent: false };
    });
  } catch (err) {
    try {
      await logPaymentEvent(db, {
        eventType: "NEG_WALLET_PAYMENT_VERIFICATION_FAILED",
        source: args.source,
        razorpayOrderId: args.razorpayOrderId,
        razorpayPaymentId: args.razorpayPaymentId,
        failureMessage: (err as Error)?.message ?? "wallet_update_failed",
        payload: { riderId: args.riderId },
      });
    } catch {
      /* best-effort */
    }
    return { ok: false as const, status: 500, error: "wallet_update_failed" };
  }

  // Already credited by a racing verify/webhook — return the settled balance.
  if (result.idempotent) {
    return {
      ok: true as const,
      success: true,
      creditedAmount: 0,
      totalBalance: result.balanceAfter,
      idempotent: true,
    };
  }

  // Post-commit (money is safe now): recompute penalty blocks + duty, record
  // block history, notify. Idempotent — a retry/re-verify converges. Never throws.
  let reactivated: string[] = [];
  try {
    await applyFifoAllocation(args.riderId, Math.abs(result.creditApplied));
    reactivated = await recordUnblockHistory({
      riderId: args.riderId,
      blocksBefore,
      walletBefore: result.balanceBefore,
      walletAfter: result.balanceAfter,
      paymentRef: args.razorpayPaymentId,
    });
    await syncRiderDutyWithRestrictions(args.riderId);
    await logPaymentEvent(db, {
      eventType: "NEG_WALLET_PAYMENT_SUCCESS",
      source: args.source,
      razorpayOrderId: args.razorpayOrderId,
      razorpayPaymentId: args.razorpayPaymentId,
      payload: {
        riderId: args.riderId,
        walletBefore: result.balanceBefore,
        walletAfter: result.balanceAfter,
        creditApplied: result.creditApplied,
        reactivatedServices: reactivated,
      },
    });
  } catch (err) {
    // Wallet is already correct; block-sync is idempotent and will reconcile.
    try {
      await logPaymentEvent(db, {
        eventType: "NEG_WALLET_POST_COMMIT_WARN",
        source: args.source,
        razorpayOrderId: args.razorpayOrderId,
        razorpayPaymentId: args.razorpayPaymentId,
        failureMessage: (err as Error)?.message ?? "post_commit_failed",
        payload: { riderId: args.riderId },
      });
    } catch {
      /* ignore */
    }
  }

  await notifyRiderWalletRecovered(args.riderId, reactivated);

  return {
    ok: true as const,
    success: true,
    creditedAmount: round2(Math.abs(result.creditApplied)),
    totalBalance: result.balanceAfter,
    reactivatedServices: reactivated,
    idempotent: false,
  };
}

/**
 * Razorpay webhook path for negative-wallet settlements. Fires on
 * payment.captured / order.paid for orders created with
 * notes.type = "rider_negative_wallet_recovery". Safety net for the "app died /
 * lost network between capture and verify-payment" case — the money is captured
 * at Razorpay but the client never confirmed. Shares the concurrency-safe settle
 * path with the client verify, so it is fully idempotent with it.
 */
export async function finalizeRiderWalletPaymentFromWebhook(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amountPaise?: number;
  notes?: Record<string, unknown>;
}) {
  const db = getDb();

  // Source of truth = the `initiated` audit row written at order creation.
  const [row] = await db
    .select()
    .from(riderWalletPayments)
    .where(eq(riderWalletPayments.razorpayOrderId, args.razorpayOrderId))
    .orderBy(desc(riderWalletPayments.createdAt))
    .limit(1);

  if (!row) {
    // No initiated row → not a known rider-wallet order (or amount untrusted).
    return { ok: false as const, status: 404, error: "unknown_rider_wallet_order" };
  }
  const riderId = row.riderId;

  // Idempotency shortcut (the settle tx re-checks under the wallet lock).
  if (await findSettledPayment(riderId, args.razorpayPaymentId)) {
    return {
      ok: true as const,
      success: true,
      creditedAmount: 0,
      totalBalance: await readWalletBalance(riderId),
      idempotent: true,
    };
  }

  const expectedPaise = row.amountPaise ?? args.amountPaise ?? 0;
  if (!(expectedPaise >= 100)) {
    return { ok: false as const, status: 400, error: "invalid_amount" };
  }

  return settleRiderWalletPayment({
    riderId,
    razorpayOrderId: args.razorpayOrderId,
    razorpayPaymentId: args.razorpayPaymentId,
    expectedPaise,
    method: "razorpay",
    source: "webhook",
  });
}

/**
 * How long an `initiated`/`cancelled` order may sit unresolved before, if Razorpay
 * shows no successful payment against it, the reconciler marks it `failed`. Razorpay
 * keeps an order open for payment retries for a while; 20 min is comfortably past a
 * normal checkout so we never fail an order the rider is still paying.
 */
const RECONCILE_ABANDON_AFTER_MS = 20 * 60 * 1000;

type ReconcileOutcome =
  | { orderId: string; result: "settled"; creditedAmount: number; totalBalance: number }
  | { orderId: string; result: "already_settled" }
  | { orderId: string; result: "pending" }
  | { orderId: string; result: "failed_marked" }
  | { orderId: string; result: "skipped"; reason: string };

type ReconcileAction =
  | { action: "settle"; paymentId: string }
  | { action: "pending" }
  | { action: "fail" };

/**
 * Pure decision for what to do with a rider-wallet order given Razorpay's payments
 * for it. Extracted so the reconcile policy is unit-testable without DB/network:
 *   - a captured payment            → settle (money is real; idempotent downstream)
 *   - any authorized/created attempt OR order still young → pending (rider may pay)
 *   - otherwise (old, nothing live) → fail (abandoned)
 */
export function classifyReconcileAction(input: {
  payments: Array<{ id: string; status: string }>;
  ageMs: number;
  abandonAfterMs?: number;
}): ReconcileAction {
  const abandonAfterMs = input.abandonAfterMs ?? RECONCILE_ABANDON_AFTER_MS;
  const captured = input.payments.find((p) => p.status === "captured");
  if (captured) return { action: "settle", paymentId: captured.id };
  const hasLivePending = input.payments.some(
    (p) => p.status === "authorized" || p.status === "created"
  );
  if (hasLivePending || input.ageMs < abandonAfterMs) return { action: "pending" };
  return { action: "fail" };
}

/**
 * Reconcile ONE rider-wallet payment order against Razorpay's authoritative record.
 *
 * This is the safety net for "the money left the rider but nothing updated": the
 * client verify never ran (app died / lost network) AND no webhook arrived (or it
 * was lost). We ask Razorpay what actually happened to the order and converge:
 *   - a captured payment  → settle the wallet (idempotent with verify + webhook)
 *   - only created/failed AND the order is old → mark our row `failed`
 *   - still authorized / too new → leave `pending` for the next sweep
 * Never throws — a transient Razorpay/DB error just yields `skipped`.
 */
async function reconcileOneWalletOrder(row: {
  riderId: number;
  razorpayOrderId: string | null;
  amountPaise: number;
  status: string;
  gateway: string | null;
  createdAt: Date | string;
}): Promise<ReconcileOutcome> {
  const orderId = row.razorpayOrderId ?? "";
  if (!orderId) return { orderId, result: "skipped", reason: "no_order_id" };
  if (row.gateway === "dummy") return { orderId, result: "skipped", reason: "dummy" };

  let payments;
  try {
    payments = await fetchRazorpayOrderPayments(orderId);
  } catch (err) {
    // Transient gateway/network error, or an order id from rotated keys — leave it
    // for the next sweep rather than wrongly failing a possibly-good order.
    return { orderId, result: "skipped", reason: (err as Error)?.message ?? "fetch_failed" };
  }

  const ageMs = Date.now() - new Date(row.createdAt).getTime();
  const decision = classifyReconcileAction({ payments, ageMs });

  if (decision.action === "settle") {
    const settle = await settleRiderWalletPayment({
      riderId: row.riderId,
      razorpayOrderId: orderId,
      razorpayPaymentId: decision.paymentId,
      expectedPaise: row.amountPaise,
      method: "razorpay",
      source: "webhook", // reconciler is a server-authoritative path, like the webhook
    });
    if (!settle.ok) return { orderId, result: "skipped", reason: settle.error };
    return settle.idempotent
      ? { orderId, result: "already_settled" }
      : {
          orderId,
          result: "settled",
          creditedAmount: settle.creditedAmount,
          totalBalance: settle.totalBalance,
        };
  }

  if (decision.action === "pending") {
    return { orderId, result: "pending" };
  }

  // decision.action === "fail": old order, nothing captured/authorized → genuinely
  // abandoned/failed. Only move
  // rows the rider can no longer complete; never touch a settled/verification_failed row.
  const db = getDb();
  await db
    .update(riderWalletPayments)
    .set({ status: "failed", remarks: "reconciled: no successful payment at gateway", updatedAt: new Date(), updatedBy: "system" })
    .where(
      and(
        eq(riderWalletPayments.riderId, row.riderId),
        eq(riderWalletPayments.razorpayOrderId, orderId),
        inArray(riderWalletPayments.status, ["initiated", "cancelled"])
      )
    );
  await logPaymentEvent(db, {
    eventType: "NEG_WALLET_PAYMENT_RECONCILED_FAILED",
    source: "system",
    razorpayOrderId: orderId,
    payload: { riderId: row.riderId, ageMs },
  });
  return { orderId, result: "failed_marked" };
}

/**
 * Sweep a rider's non-terminal wallet-payment orders and reconcile each against
 * Razorpay. Call this cheaply on read paths (opening the pay card, creating a new
 * order, fetching history) so a captured-but-unconfirmed payment self-heals the
 * next time the rider's app talks to us — no cron required. Idempotent + safe.
 */
export async function reconcileRiderWalletPayments(
  riderId: number
): Promise<ReconcileOutcome[]> {
  const db = getDb();
  const rows = await db
    .select({
      riderId: riderWalletPayments.riderId,
      razorpayOrderId: riderWalletPayments.razorpayOrderId,
      amountPaise: riderWalletPayments.amountPaise,
      status: riderWalletPayments.status,
      gateway: riderWalletPayments.gateway,
      createdAt: riderWalletPayments.createdAt,
    })
    .from(riderWalletPayments)
    .where(
      and(
        eq(riderWalletPayments.riderId, riderId),
        inArray(riderWalletPayments.status, ["initiated", "cancelled"])
      )
    )
    .orderBy(desc(riderWalletPayments.createdAt))
    .limit(20);

  const outcomes: ReconcileOutcome[] = [];
  for (const row of rows) {
    try {
      outcomes.push(await reconcileOneWalletOrder(row));
    } catch (err) {
      outcomes.push({
        orderId: row.razorpayOrderId ?? "",
        result: "skipped",
        reason: (err as Error)?.message ?? "reconcile_failed",
      });
    }
  }
  return outcomes;
}

/** Rider's own negative-wallet payment history (latest first). */
export async function getRiderWalletPaymentHistory(riderId: number, limit = 30) {
  const db = getDb();
  const rows = await db
    .select()
    .from(riderWalletPayments)
    .where(eq(riderWalletPayments.riderId, riderId))
    .orderBy(desc(riderWalletPayments.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    purpose: r.purpose,
    amountPaise: r.amountPaise,
    walletBefore: r.walletBefore != null ? Number(r.walletBefore) : null,
    walletAfter: r.walletAfter != null ? Number(r.walletAfter) : null,
    status: r.status,
    gateway: r.gateway,
    method: r.method ?? null,
    razorpayOrderId: r.razorpayOrderId ?? null,
    razorpayPaymentId: r.razorpayPaymentId ?? null,
    refundStatus: r.refundStatus ?? null,
    refundAmountPaise: r.refundAmountPaise ?? null,
    remarks: r.remarks ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
  }));
}
