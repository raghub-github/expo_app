import type { TransactionSql } from "postgres";
import { getSql } from "../db/client.js";
import {
  computePostpaidSettlement,
  toPaise,
  type PostpaidSettlementResult,
} from "./postpaid-settlement.js";
import {
  applySettlementWalletMovement,
  recordSettlementExtensions,
} from "./postpaid-settlement-posting.js";

/**
 * Parcel settlement — the parcel half of the post-paid settlement engine.
 *
 * The parcel rider fare engine (credit-rider-order-on-delivered: legs + promise
 * floor + waiting + dynamic incentive) decides R. The parcel customer fare engine
 * (parcel-fare-payment.service) decides C. lib/postpaid-settlement.ts decides how
 * the wallet moves, exactly as it does for Person Ride.
 *
 * Before this, a CASH parcel credited the rider's full earning to the wallet
 * while the rider also kept the customer's cash, and nothing recovered the
 * platform's share (prod GM10000430: ₹72.55 cash kept + ₹42.30 credited).
 *
 * Tips are not part of a parcel settlement: a parcel books with tip ₹0 and tips
 * arrive later through the live-tracking tip payment, paid to the platform
 * (UPI / GatiCash) — never inside the rider's cash. They keep their own
 * rider_earn:tip:<id> credit.
 */

export type ParcelSettlementMethod = "cash" | "online";

export type ParcelPaymentContext = {
  method: ParcelSettlementMethod;
  /** C — the parcel invoice total. */
  customerPayable: number;
  /** P — cash the rider collected, or the amount paid online. */
  collected: number;
  gatiCashApplied: number;
  customerId: number | null;
  collectedByRiderId: number | null;
  billingSnapshot: Record<string, unknown>;
};

export function buildParcelSettlementId(orderCoreId: number): string {
  return `parcel_settle:v1:${orderCoreId}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function positive(...values: unknown[]): number {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return round2(n);
  }
  return 0;
}

/** Parcel payment method as recorded at collection; null when it never completed. */
export function classifyParcelPaymentMethod(input: {
  parcelPaymentMethod: string | null;
  corePaymentMethod: string | null;
  paymentStatus: string | null;
}): ParcelSettlementMethod | null {
  const status = String(input.paymentStatus ?? "").trim().toLowerCase();
  if (!["completed", "paid", "captured"].includes(status)) return null;
  const method = String(input.parcelPaymentMethod || input.corePaymentMethod || "")
    .trim()
    .toLowerCase();
  if (method === "cash" || method === "cod") return "cash";
  if (method === "online" || method === "wallet" || method === "upi") return "online";
  return null;
}

export async function loadParcelPaymentContext(
  orderCoreId: number
): Promise<ParcelPaymentContext | null> {
  const sql = getSql();
  const rows = await sql<
    Array<{
      customer_id: string | number | null;
      grand_total: string | null;
      billing_snapshot: unknown;
      payment_status: string | null;
      core_method: string | null;
      parcel_method: string | null;
      amount_collected: string | null;
      final_fare: string | null;
      cash_collected_by_rider_id: number | null;
      cash_collected_at: Date | null;
    }>
  >`
    SELECT c.customer_id, c.grand_total, c.billing_snapshot, c.payment_status,
           c.payment_method::text AS core_method,
           p.payment_method::text AS parcel_method,
           p.amount_collected, p.final_fare,
           p.cash_collected_by_rider_id, p.cash_collected_at
    FROM orders_core c
    JOIN orders_parcel p ON p.order_id = c.id
    WHERE c.id = ${orderCoreId} AND c.order_type = 'parcel'
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const method = classifyParcelPaymentMethod({
    parcelPaymentMethod: row.parcel_method,
    corePaymentMethod: row.core_method,
    paymentStatus: row.payment_status,
  });
  if (!method) return null;
  if (method === "cash" && row.cash_collected_at == null) return null;

  const snap =
    row.billing_snapshot != null && typeof row.billing_snapshot === "object"
      ? (row.billing_snapshot as Record<string, unknown>)
      : {};
  const customerPayable = positive(row.amount_collected, row.grand_total, row.final_fare);
  const customerId = row.customer_id != null ? Number(row.customer_id) : null;
  return {
    method,
    customerPayable,
    collected: customerPayable,
    gatiCashApplied: method === "online" ? positive(snap.gatiCashAmount) : 0,
    customerId: Number.isFinite(customerId) ? customerId : null,
    collectedByRiderId:
      row.cash_collected_by_rider_id != null ? Number(row.cash_collected_by_rider_id) : null,
    billingSnapshot: snap,
  };
}

async function readParcelInvoice(
  ctx: ParcelPaymentContext
): Promise<{
  taxTotal: number;
  discountTotal: number;
  platformFee: number;
  convenienceFee: number;
  surgeFee: number;
  smallOrderFee: number;
  waitingCharge: number;
  parcelFare: number;
}> {
  // Same breakdown the customer's invoice is built from, so tax/discount here
  // are exactly the figures the customer was shown.
  const { buildParcelFareBillBreakdown } = await import(
    "../modules/parcel/parcel-fare-payment.service.js"
  );
  const b = buildParcelFareBillBreakdown({
    billingSnapshot: ctx.billingSnapshot,
    finalAmount: ctx.customerPayable,
  });
  return {
    taxTotal: b.taxTotal,
    discountTotal: b.discountTotal,
    platformFee: b.platformFee,
    convenienceFee: b.convenienceFee,
    surgeFee: b.surgeFee,
    smallOrderFee: b.smallOrderFee,
    waitingCharge: b.waitingCharge,
    parcelFare: b.parcelFare,
  };
}

export type ParcelSettlementOutcome = {
  status: "settled" | "already_settled" | "legacy_flagged";
  settlementId: string;
  settlement: PostpaidSettlementResult | null;
  walletBalanceAfter: number | null;
};

type LedgerLine = {
  direction: "debit" | "credit";
  amount: number;
  accountKind: string;
  reasonCode: string;
  description: string;
};

function parcelLedgerLines(
  s: PostpaidSettlementResult,
  gatiCashApplied: number
): LedgerLine[] {
  const rupees = (p: number) => round2(p / 100);
  const lines: LedgerLine[] = [];
  const push = (amountPaise: number, line: Omit<LedgerLine, "amount">) => {
    if (amountPaise > 0) lines.push({ ...line, amount: rupees(amountPaise) });
  };
  if (s.method === "cash") {
    push(s.cashCollectedPaise, {
      direction: "debit",
      accountKind: "customer_cash",
      reasonCode: "CUSTOMER_CASH_PAY",
      description: "Customer paid rider in cash",
    });
    push(Math.min(s.riderEntitlementPaise, s.cashCollectedPaise), {
      direction: "credit",
      accountKind: "rider_earning_kept",
      reasonCode: "PARCEL_EARNING_KEPT_IN_CASH",
      description: "Rider retained earnings in cash",
    });
    push(s.walletDebitPaise, {
      direction: "debit",
      accountKind: "rider_wallet",
      reasonCode: "CASH_COMPANY_RECOVERY",
      description: "Platform share recovered from rider wallet",
    });
    push(s.walletDebitPaise, {
      direction: "credit",
      accountKind: "company_receivable",
      reasonCode: "CASH_COMPANY_RECOVERY",
      description: "Platform recovered its share for the parcel",
    });
    push(s.walletCreditPaise, {
      direction: "credit",
      accountKind: "rider_wallet",
      reasonCode: "CASH_SETTLEMENT_CREDIT",
      description: "Company top-up: customer paid less cash than the rider's earning",
    });
  } else {
    const gc = toPaise(gatiCashApplied);
    push(s.platformCollectedPaise - gc, {
      direction: "debit",
      accountKind: "gateway_online",
      reasonCode: "CUSTOMER_ONLINE_PAY",
      description: "Customer paid online",
    });
    push(gc, {
      direction: "debit",
      accountKind: "gati_cash",
      reasonCode: "CUSTOMER_GATI_CASH_PAY",
      description: "Customer paid via GatiCash wallet",
    });
    push(s.walletCreditPaise, {
      direction: "credit",
      accountKind: "rider_earning_credited",
      reasonCode: "PARCEL_EARNING_CREDIT",
      description: "Rider earning credited to wallet",
    });
  }
  push(s.taxPaise, {
    direction: "credit",
    accountKind: "company_tax",
    reasonCode: "TAX",
    description: "Taxes",
  });
  push(s.platformCommissionPaise, {
    direction: "credit",
    accountKind: "company_commission",
    reasonCode: "COMMISSION",
    description: "Platform share of the parcel fare",
  });
  push(s.promotionalSubsidyPaise, {
    direction: "debit",
    accountKind: "company_rider_promotion_subsidy",
    reasonCode: "RIDER_PROMO_SUBSIDY",
    description: "Platform-funded gap between the customer fare and the rider's earning",
  });
  push(s.incentivePaise, {
    direction: "debit",
    accountKind: "company_rider_incentive",
    reasonCode: "RIDER_INCENTIVE",
    description: "Company-funded rider incentive",
  });
  return lines;
}

async function existingSettlementId(orderCoreId: number): Promise<string | null> {
  const sql = getSql();
  const rows = await sql<Array<{ settlement_id: string }>>`
    SELECT settlement_id FROM ride_settlements WHERE order_core_id = ${orderCoreId} LIMIT 1
  `;
  return rows[0]?.settlement_id ?? null;
}

async function insertParcelSettlementRow(
  tx: TransactionSql,
  args: {
    settlementId: string;
    orderCoreId: number;
    orderIdText: string;
    riderId: number;
    ctx: ParcelPaymentContext;
    s: PostpaidSettlementResult;
    invoice: Awaited<ReturnType<typeof readParcelInvoice>>;
    walletCredit: number;
    walletDebit: number;
    status: "settled" | "pending";
    statusReason: string | null;
  }
): Promise<void> {
  const { s, ctx, invoice } = args;
  const rupees = (p: number) => round2(p / 100);
  const companyReceivable = Math.max(0, rupees(s.customerPayablePaise - s.riderEntitlementPaise));
  const companyReceived = s.method === "online" ? rupees(s.platformCollectedPaise) : 0;
  const paymentMode =
    s.method === "cash"
      ? "cash"
      : ctx.gatiCashApplied > 0 && ctx.gatiCashApplied < ctx.collected
        ? "mixed"
        : ctx.gatiCashApplied > 0
          ? "wallet"
          : "online";
  await tx`
    INSERT INTO ride_settlements (
      settlement_id, order_core_id, order_id_text, rider_id, customer_id,
      payment_mode,
      customer_bill, customer_paid, company_receivable, company_received,
      rider_earnings, wallet_debit, wallet_credit, outstanding_amount,
      base_fare, waiting_charge, platform_fee, convenience_fee, small_order_fee,
      surge_total, surge_customer_share,
      tax_total, discount_total, coupon_discount,
      company_commission, gati_cash_applied, razorpay_amount,
      status, status_reason, billing_snapshot, component_breakdown
    ) VALUES (
      ${args.settlementId}, ${args.orderCoreId}, ${args.orderIdText},
      ${args.riderId}, ${ctx.customerId},
      ${paymentMode},
      ${rupees(s.customerPayablePaise)}, ${rupees(s.method === "cash" ? s.cashCollectedPaise : s.platformCollectedPaise)},
      ${companyReceivable}, ${companyReceived},
      ${rupees(s.riderEntitlementPaise)}, ${args.walletDebit}, ${args.walletCredit},
      ${round2(Math.max(0, companyReceivable - companyReceived))},
      ${invoice.parcelFare}, ${invoice.waitingCharge}, ${invoice.platformFee},
      ${invoice.convenienceFee}, ${invoice.smallOrderFee},
      ${invoice.surgeFee}, ${invoice.surgeFee},
      ${rupees(s.taxPaise)}, ${rupees(s.discountPaise)}, ${rupees(s.discountPaise)},
      ${rupees(s.platformCommissionPaise)},
      ${round2(ctx.gatiCashApplied)},
      ${s.method === "online" ? round2(rupees(s.platformCollectedPaise) - ctx.gatiCashApplied) : 0},
      ${args.status}, ${args.statusReason},
      ${JSON.stringify(ctx.billingSnapshot)}::text::jsonb,
      ${JSON.stringify(invoice)}::text::jsonb
    )
  `;
}

async function insertLedger(
  tx: TransactionSql,
  args: { settlementId: string; orderCoreId: number; riderId: number; customerId: number | null; lines: LedgerLine[] }
): Promise<void> {
  for (const line of args.lines) {
    await tx`
      INSERT INTO ride_settlement_ledger (
        settlement_id, order_core_id, rider_id, customer_id,
        direction, amount, account_kind, reason_code, description, metadata
      ) VALUES (
        ${args.settlementId}, ${args.orderCoreId}, ${args.riderId}, ${args.customerId},
        ${line.direction}, ${line.amount}, ${line.accountKind}, ${line.reasonCode},
        ${line.description}, ${JSON.stringify({ service: "parcel" })}::text::jsonb
      )
    `;
  }
}

/**
 * Settle a delivered parcel. Idempotent per order: replaying it returns the
 * existing settlement without touching the wallet again.
 *
 *   cash   — posts the net wallet movement (R − C) and records the cash collection.
 *   online — records the settlement only. The rider's earning was already
 *            credited line-by-line (delivery / incentive) by the caller.
 */
export async function settleParcelOnDelivery(args: {
  orderCoreId: number;
  orderIdText: string;
  riderId: number;
  /** Delivery earning from the parcel rider fare engine (incl. waiting + promise floor). */
  deliveryEarning: number;
  /** Company-funded dynamic incentive, already part of the rider's entitlement. */
  dynamicIncentive: number;
  ctx: ParcelPaymentContext;
  ledgerMeta?: Record<string, unknown>;
}): Promise<ParcelSettlementOutcome> {
  const settlementId = buildParcelSettlementId(args.orderCoreId);
  const already = await existingSettlementId(args.orderCoreId);
  if (already) {
    return { status: "already_settled", settlementId: already, settlement: null, walletBalanceAfter: null };
  }

  const invoice = await readParcelInvoice(args.ctx);
  const s = computePostpaidSettlement({
    service: "parcel",
    method: args.ctx.method,
    customerPayablePaise: toPaise(args.ctx.customerPayable),
    riderEntitlementPaise: toPaise(args.deliveryEarning + args.dynamicIncentive),
    collectedPaise: toPaise(args.ctx.collected),
    walletPaidPaise: toPaise(args.ctx.gatiCashApplied),
    taxPaise: toPaise(invoice.taxTotal),
    incentivePaise: toPaise(args.dynamicIncentive),
    discountPaise: toPaise(invoice.discountTotal),
  });

  const sql = getSql();
  const deliveryRef = `rider_earn:delivery:${args.orderCoreId}`;

  // Cash parcels delivered before this engine were credited the full earning by
  // the legacy path while the rider also kept the cash. Never re-settle those
  // automatically: record what the settlement should have been and flag it.
  let legacyReason: string | null = null;
  if (s.method === "cash") {
    const legacy = await sql<Array<{ amount: string }>>`
      SELECT amount FROM wallet_ledger
      WHERE rider_id = ${args.riderId} AND ref = ${deliveryRef}
      LIMIT 1
    `;
    if (legacy[0]) {
      legacyReason =
        `legacy cash parcel: rider kept ₹${round2(s.cashCollectedPaise / 100)} cash and was ` +
        `credited ₹${round2(Number(legacy[0].amount))}; correct settlement is a wallet ` +
        `${s.walletDeltaPaise >= 0 ? "credit" : "debit"} of ₹${round2(Math.abs(s.walletDeltaPaise) / 100)}`;
    }
  }

  const postWallet = s.method === "cash" && legacyReason == null;
  let walletBalanceAfter: number | null = null;

  try {
    await sql.begin(async (tx) => {
      await insertParcelSettlementRow(tx, {
        settlementId,
        orderCoreId: args.orderCoreId,
        orderIdText: args.orderIdText,
        riderId: args.riderId,
        ctx: args.ctx,
        s,
        invoice,
        walletCredit: postWallet || s.method === "online" ? round2(s.walletCreditPaise / 100) : 0,
        walletDebit: postWallet ? round2(s.walletDebitPaise / 100) : 0,
        status: legacyReason ? "pending" : "settled",
        statusReason: legacyReason,
      });
      await insertLedger(tx, {
        settlementId,
        orderCoreId: args.orderCoreId,
        riderId: args.riderId,
        customerId: args.ctx.customerId,
        lines: legacyReason ? [] : parcelLedgerLines(s, args.ctx.gatiCashApplied),
      });

      let balanceBefore: number | null = null;
      if (postWallet) {
        const moved = await applySettlementWalletMovement(tx, {
          riderId: args.riderId,
          service: "parcel",
          settlement: s,
          creditRef: deliveryRef,
          debitRef: `parcel_cash_settle:${args.orderCoreId}`,
          refType: "parcel_settlement",
          creditDescription: `Cash parcel top-up — Order #${args.orderIdText}`,
          debitDescription: `Cash parcel platform share — Order #${args.orderIdText}`,
          metadata: {
            ...(args.ledgerMeta ?? {}),
            source: "parcel_cash_settlement",
            orderCoreId: args.orderCoreId,
            orderIdText: args.orderIdText,
            settlementId,
            component: s.walletCreditPaise > 0 ? "cash_settlement_credit" : "company_receivable_recovery",
            paymentMethod: "cash",
            customerPayable: round2(s.customerPayablePaise / 100),
            cashCollected: round2(s.cashCollectedPaise / 100),
            riderEntitlement: round2(s.riderEntitlementPaise / 100),
            dynamicIncentive: round2(s.incentivePaise / 100),
          },
        });
        balanceBefore = moved.balanceBefore;
        walletBalanceAfter = moved.balanceAfter;
      } else {
        const bal = await tx<Array<{ total_balance: string | null }>>`
          SELECT total_balance FROM rider_wallet WHERE rider_id = ${args.riderId}
        `;
        walletBalanceAfter = round2(Number(bal[0]?.total_balance ?? 0));
      }

      await recordSettlementExtensions(tx, settlementId, {
        service: "parcel",
        settlement: s,
        walletBalanceBefore: balanceBefore,
        walletBalanceAfter,
        reconciliationReason: legacyReason,
        extraMetadata: {
          tipCreditedSeparately: true,
          walletPostedBy: postWallet ? "settlement" : s.method === "online" ? "itemized_credits" : "none",
        },
      });

      await tx`
        UPDATE orders_core
        SET rider_earning = ${round2(s.riderEntitlementPaise / 100).toFixed(2)},
            updated_at = NOW()
        WHERE id = ${args.orderCoreId}
          AND (rider_earning IS NULL OR rider_earning::numeric = 0)
      `;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate|unique/i.test(msg)) {
      const again = await existingSettlementId(args.orderCoreId);
      if (again) {
        return { status: "already_settled", settlementId: again, settlement: null, walletBalanceAfter: null };
      }
    }
    throw err;
  }

  if (postWallet) {
    try {
      const { syncNegativeWalletBlocks } = await import("./rider-negative-wallet-blocks.js");
      await syncNegativeWalletBlocks(args.riderId);
    } catch (err) {
      console.warn("[parcel-settlement] wallet block sync failed:", args.riderId, err);
    }
  }

  return {
    status: legacyReason ? "legacy_flagged" : "settled",
    settlementId,
    settlement: s,
    walletBalanceAfter,
  };
}
