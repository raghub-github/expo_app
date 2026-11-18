import { and, eq, or } from "drizzle-orm";
import { getDb } from "../../db/client.js";
import { ordersCore, ordersRide } from "../../db/schema.js";
import { normalizeCustomerOrderStatus } from "../../lib/customer-order-status-resolve.js";
import { isRideFarePaymentPending } from "../../lib/ride-rider-payout-snapshot.js";
import { assertRideCustomerPaymentCollectable } from "../../lib/settle-zero-payable-person-ride.js";
import { insertRideCustomerPaymentSnapshot } from "../../lib/persist-ride-customer-payment-snapshot.js";
import { computeRideBillForCustomerOrder } from "./ride-bill.service.js";
import { rideBillingToSettlementComponents } from "./settlement/billingToComponents.js";
import { postCashRideSettlement } from "./settlement/rideSettlement.engine.js";
import type { SettlementPostingResult } from "./settlement/rideSettlement.engine.js";

/**
 * Ride cash-collection confirmation.
 *
 * Called by the rider app after a cash ride is DELIVERED. Runs the same
 * customer bill computation the online flow uses (single source of truth), then
 * routes the settlement through the Ride Settlement Engine which:
 *   1. records an immutable ride_settlements row,
 *   2. posts paired debit/credit lines to ride_settlement_ledger, including
 *      the informational "rider kept earnings in cash" credit,
 *   3. moves the rider's wallet by riderEarnings − customerBill ONLY (never the
 *      full customer fare), and
 *   4. resyncs negative-wallet blocks so the rider is auto-blocked as soon as
 *      wallet hits the configured threshold.
 *
 * The wallet only ever moves by the difference: the rider keeps the cash, the
 * wallet is debited the platform's share, or — when an offer made the customer
 * pay less than the rider earned — credited the company top-up. The cash itself
 * is never credited to the wallet.
 */

export type ConfirmRideCashCollectionInput = {
  riderId: number;
  orderRef: string;
};

/**
 *   cash_settled    — settled now in cash: wallet moved by R − C
 *   paid_online     — the passenger had already paid the QR / in-app: take NO cash
 *   free_ride       — an offer covered the fare: rider credited, nothing collected
 *   already_settled — a repeat tap after a cash settlement
 */
export type RideCashConfirmOutcome = "cash_settled" | "paid_online" | "free_ride" | "already_settled";

export type ConfirmRideCashCollectionResult = {
  ok: true;
  alreadySettled: boolean;
  outcome: RideCashConfirmOutcome;
  paymentMethod: string | null;
  orderId: string;
  customerBill: number;
  companyReceivable: number;
  /** Rider fare engine output for this ride (what the rider earned in total). */
  riderEntitlement: number;
  walletDebit: number;
  /** Company top-up when the customer paid less cash than the rider earned. */
  walletCredit: number;
  walletBalanceAfter: number | null;
  settlementId: string;
};

function normalizePaymentMethod(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function isCashPaymentMethod(method: string): boolean {
  return method === "cash" || method === "cod";
}

function riderOrderRefWhere(riderId: number, orderRef: string) {
  const trimmed = orderRef.trim();
  const isNumeric = /^\d+$/.test(trimmed);
  if (isNumeric) {
    return and(eq(ordersCore.riderId, riderId), eq(ordersCore.id, Number(trimmed)));
  }
  return and(
    eq(ordersCore.riderId, riderId),
    or(eq(ordersCore.orderId, trimmed), eq(ordersCore.formattedOrderId, trimmed))
  );
}

/** Result for a ride that is already settled / paid — read from the immutable settlement. */
async function settledResult(
  riderId: number,
  orderCoreId: number,
  orderIdText: string,
  fallbackMethod: string | null,
  outcomeHint?: RideCashConfirmOutcome
): Promise<ConfirmRideCashCollectionResult> {
  const { getRiderSettlementSummary } = await import("../../lib/rider-settlement-summary.js");
  const s = await getRiderSettlementSummary(riderId, orderCoreId).catch(() => null);
  const method = s?.paymentMethod ?? (normalizePaymentMethod(fallbackMethod) || null);
  const outcome: RideCashConfirmOutcome =
    outcomeHint ?? (method === "cash" ? "already_settled" : "paid_online");
  return {
    ok: true,
    alreadySettled: true,
    outcome,
    paymentMethod: method,
    orderId: orderIdText,
    customerBill: s?.customerPayable ?? 0,
    companyReceivable: s ? Math.max(0, Math.round((s.customerPayable - s.riderEntitlement) * 100) / 100) : 0,
    riderEntitlement: s?.riderEntitlement ?? 0,
    walletDebit: s?.walletDebit ?? 0,
    walletCredit: s?.walletCredit ?? 0,
    walletBalanceAfter: s?.walletBalanceAfter ?? null,
    settlementId: s?.settlementId ?? "",
  };
}

export async function confirmRideCashCollectionForRider(
  input: ConfirmRideCashCollectionInput
): Promise<ConfirmRideCashCollectionResult> {
  const db = getDb();
  const riderId = Number(input.riderId);
  if (!Number.isFinite(riderId) || riderId <= 0) {
    throw Object.assign(new Error("Invalid rider session"), { statusCode: 403 });
  }

  const readOrder = async () => {
    const [row] = await db
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        customerId: ordersCore.customerId,
        orderType: ordersCore.orderType,
        status: ordersCore.status,
        currentStatus: ordersCore.currentStatus,
        paymentStatus: ordersCore.paymentStatus,
        paymentMethod: ordersCore.paymentMethod,
        billingSnapshot: ordersCore.billingSnapshot,
        pickupLat: ordersCore.pickupLat,
        pickupLon: ordersCore.pickupLon,
        checkoutMetadata: ordersCore.checkoutMetadata,
        riderId: ordersCore.riderId,
        rideSettlementId: ordersRide.settlementId,
        cashCollectedAt: ordersRide.cashCollectedAt,
      })
      .from(ordersCore)
      .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .where(riderOrderRefWhere(riderId, input.orderRef))
      .limit(1);
    return row;
  };

  const orderRow = await readOrder();
  if (!orderRow?.id) {
    throw Object.assign(new Error("Ride order not found"), { statusCode: 404 });
  }
  if (String(orderRow.orderType ?? "") !== "person_ride") {
    throw Object.assign(new Error("Not a ride order"), { statusCode: 400 });
  }
  if (Number(orderRow.riderId) !== riderId) {
    throw Object.assign(new Error("You are not the assigned rider for this order"), {
      statusCode: 403,
    });
  }
  const status = normalizeCustomerOrderStatus(orderRow.currentStatus, orderRow.status);
  if (status !== "DELIVERED") {
    throw Object.assign(new Error("Cash can be collected only after the ride is completed"), {
      statusCode: 409,
    });
  }

  const customerPk = orderRow.customerId != null ? Number(orderRow.customerId) : 0;
  if (!Number.isFinite(customerPk) || customerPk <= 0) {
    throw Object.assign(new Error("Order has no linked customer"), { statusCode: 400 });
  }
  const orderIdText = orderRow.orderId?.trim() || String(orderRow.id);

  // Already settled / already paid (double tap, or paid online meanwhile): report
  // what actually happened instead of an error the rider cannot act on.
  if (orderRow.rideSettlementId || !isRideFarePaymentPending(orderRow.paymentStatus)) {
    return settledResult(riderId, orderRow.id, orderIdText, orderRow.paymentMethod ?? null);
  }

  // A free (offer) ride has nothing to collect — settle it as one.
  let settledPayable: number;
  try {
    settledPayable = await assertRideCustomerPaymentCollectable(orderRow.id);
  } catch (err) {
    if ((err as { code?: string })?.code === "ALREADY_SETTLED") {
      const { settleZeroBillRide } = await import("./ride-zero-bill.service.js");
      const free = await settleZeroBillRide(orderRow.id).catch(() => null);
      if (free) {
        return settledResult(riderId, orderRow.id, orderIdText, "offer", "free_ride");
      }
      return settledResult(riderId, orderRow.id, orderIdText, orderRow.paymentMethod ?? null);
    }
    throw err;
  }

  // The rider may have shown a QR first. If the passenger paid it, the ride is
  // paid online and no cash may be taken; otherwise close every open QR so it
  // cannot be paid after the cash (a capture that still slips through is refunded).
  const { resolveOpenQrBeforeCash } = await import("../../lib/online-qr-capture.js");
  const qr = await resolveOpenQrBeforeCash(orderIdText, "ride_online_qr");
  if (qr.paidOnline) {
    return settledResult(riderId, orderRow.id, orderIdText, "online", "paid_online");
  }

  // Switching from online to cash is allowed while the fare is unpaid — the rider
  // confirming the cash IS the choice (the old "This ride is not a cash payment"
  // dead end left riders with the cash in hand and no way to settle).
  const method = normalizePaymentMethod(orderRow.paymentMethod);
  if (!isCashPaymentMethod(method)) {
    await db
      .update(ordersCore)
      .set({ paymentMethod: "cash" })
      .where(eq(ordersCore.id, orderRow.id));
  }

  const billRes = await computeRideBillForCustomerOrder(db, {
    customerPk,
    orderRef: input.orderRef,
  });
  if (!billRes.ok) {
    throw Object.assign(new Error(billRes.message), {
      statusCode: billRes.statusCode ?? 400,
      code: billRes.code,
    });
  }

  const customerBill = Math.round(Math.min(billRes.billing.final_amount, settledPayable) * 100) / 100;
  if (!(customerBill > 0)) {
    return settledResult(riderId, orderRow.id, orderIdText, orderRow.paymentMethod ?? null);
  }

  // Persist a payment_confirmed snapshot with method=cash so the audit surface
  // (customer app receipt + admin reports) always shows the cash lineage.
  const snapshotId = await insertRideCustomerPaymentSnapshot(db, {
    orderCoreId: orderRow.id,
    orderIdText,
    customerId: customerPk,
    phase: "payment_confirmed",
    billing: billRes.billing,
    billingSnapshot: billRes.snapshot,
    rideContext: {
      rideType:
        (typeof orderRow.billingSnapshot === "object" && orderRow.billingSnapshot
          ? ((orderRow.billingSnapshot as { rideType?: string }).rideType ?? null)
          : null) ?? null,
    },
    paymentContext: {
      paymentMethod: "cash",
      gatiCashApplied: 0,
      razorpayAmount: 0,
      amountPaid: customerBill,
    },
    metadata: { source: "rider_cash_collection_confirm" },
  });

  const meta =
    orderRow.checkoutMetadata != null && typeof orderRow.checkoutMetadata === "object"
      ? (orderRow.checkoutMetadata as Record<string, unknown>)
      : {};

  let posting: SettlementPostingResult;
  try {
    posting = await postCashRideSettlement({
      orderCoreId: orderRow.id,
      orderIdText,
      riderId,
      customerId: customerPk,
      billing: {
        customerBill,
        components: rideBillingToSettlementComponents(billRes.billing, billRes.snapshot),
        billingSnapshotId: snapshotId,
        billingSnapshot: {
          ...(billRes.snapshot ?? {}),
          final_amount: customerBill,
        },
      },
      geo: {
        pickupLat: Number(orderRow.pickupLat ?? 0),
        pickupLng: Number(orderRow.pickupLon ?? 0),
        pickupPincode:
          typeof (meta as { pickupPincode?: unknown }).pickupPincode === "string"
            ? String((meta as { pickupPincode?: unknown }).pickupPincode)
            : null,
        pickupState:
          typeof (meta as { pickupState?: unknown }).pickupState === "string"
            ? String((meta as { pickupState?: unknown }).pickupState)
            : null,
      },
    });
  } catch (err) {
    // The engine re-checks the fare under a row lock: an online capture that won
    // the race means the passenger paid online — report that, take no cash.
    if ((err as { code?: string })?.code === "ALREADY_SETTLED") {
      const after = await readOrder();
      return settledResult(riderId, orderRow.id, orderIdText, after?.paymentMethod ?? null);
    }
    throw err;
  }

  return {
    ok: true,
    alreadySettled: posting.alreadySettled,
    outcome: posting.alreadySettled ? "already_settled" : "cash_settled",
    paymentMethod: "cash",
    orderId: orderIdText,
    customerBill,
    companyReceivable: posting.settlement?.companyReceivable ?? 0,
    riderEntitlement: posting.settlement?.riderEarnings ?? 0,
    walletDebit: posting.settlement?.walletDebit ?? 0,
    walletCredit: posting.settlement?.walletCredit ?? 0,
    walletBalanceAfter: posting.walletBalanceAfter ?? null,
    settlementId: posting.settlementId,
  };
}
