import type { Sql, TransactionSql } from "postgres";
import { getSql } from "../../../db/client.js";
import { syncNegativeWalletBlocks } from "../../../lib/rider-negative-wallet-blocks.js";
import { loadEffectiveServicePayoutRule } from "../../rider-payout-pricing/riderPayoutPricing.repository.js";
import { resolveRidePricingGeoFromPickup } from "../../ride-state-config/rideStateConfig.repository.js";
import {
  computeRideSettlement,
  type PaymentMode,
  type RideBillComponents,
  type SettlementResult,
} from "./rideSettlement.math.js";
import {
  buildSettlementId,
  findExistingSettlement,
  loadRideWalletPolicy,
} from "./rideSettlement.repository.js";

/**
 * Ride Settlement Engine — persists the Hybrid Residual Take-Rate settlement
 * for one ride and posts the paired ledger lines. Never mutates the customer
 * bill; strictly downstream of the existing billing pipeline.
 *
 * The engine has two entry points because the wallet posting differs between
 * modes:
 *   * postOnlineRideSettlement — customer paid via Razorpay + GatiCash. The
 *     engine CREDITS rider_earnings to the rider wallet in the same DB tx
 *     (single source of truth — do not also call credit-rider-order-on-delivered
 *     for person_ride once settlement_id is set).
 *   * postCashRideSettlement — customer paid the rider in cash. The engine
 *     performs the wallet DEBIT of company_receivable in the same DB tx and
 *     resyncs negative-wallet blocks. Rider physically keeps their earnings.
 *
 * Both paths are idempotent per orders_core.id — replaying the same event
 * returns the existing settlement without duplicating ledger rows or wallet
 * mutations.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SettlementBillingInput = {
  customerBill: number;
  components: RideBillComponents;
  billingSnapshotId?: number | null;
  billingSnapshot?: Record<string, unknown> | null;
  couponCode?: string | null;
};

export type RideGeoInput = {
  pickupLat?: number | null;
  pickupLng?: number | null;
  pickupPincode?: string | null;
  pickupState?: string | null;
};

export type OnlineSettlementInput = {
  orderCoreId: number;
  orderIdText: string;
  riderId?: number | null;
  customerId?: number | null;
  billing: SettlementBillingInput;
  geo: RideGeoInput;
  paymentSplit: {
    gatiCashApplied: number;
    razorpayAmount: number;
    razorpayOrderId?: string | null;
    razorpayPaymentId?: string | null;
  };
};

export type CashSettlementInput = {
  orderCoreId: number;
  orderIdText: string;
  riderId: number;
  customerId?: number | null;
  billing: SettlementBillingInput;
  geo: RideGeoInput;
  cashCollectedAt?: Date;
};

export type SettlementPostingResult = {
  settlementId: string;
  paymentMode: PaymentMode;
  alreadySettled: boolean;
  settlement: SettlementResult | null;
  walletBalanceAfter?: number | null;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

async function resolvePayoutPercentages(
  geo: RideGeoInput
): Promise<{ platformPercentage: number; riderPercentage: number; payoutRuleId: number | null }> {
  try {
    const pricing = await resolveRidePricingGeoFromPickup({
      pickupLat: Number(geo.pickupLat ?? 0),
      pickupLng: Number(geo.pickupLng ?? 0),
      pickupPincode: geo.pickupPincode ?? null,
      pickupState: geo.pickupState ?? null,
    });
    if (!pricing.pricingGeo) {
      return { platformPercentage: 0, riderPercentage: 100, payoutRuleId: null };
    }
    const { applied, rule } = await loadEffectiveServicePayoutRule({
      level: pricing.pricingGeo.level,
      refId: pricing.pricingGeo.refId,
      service: "ride",
    });
    if (!applied || !rule) {
      return { platformPercentage: 0, riderPercentage: 100, payoutRuleId: null };
    }
    return {
      platformPercentage: Number(rule.platformPercentage ?? 0),
      riderPercentage: Number(rule.riderPercentage ?? 0),
      payoutRuleId: rule.id ?? null,
    };
  } catch (err) {
    // Never fail settlement because the payout lookup was flaky — degrade
    // gracefully by treating the whole bill as rider earnings and 0 commission.
    console.warn("[rideSettlement] payout rule lookup failed:", err);
    return { platformPercentage: 0, riderPercentage: 100, payoutRuleId: null };
  }
}

async function insertSettlementRow(
  tx: TransactionSql,
  args: {
    settlementId: string;
    orderCoreId: number;
    orderIdText: string;
    riderId: number | null;
    customerId: number | null;
    paymentMode: PaymentMode;
    result: SettlementResult;
    billingSnapshotId: number | null;
    billingSnapshot: Record<string, unknown>;
    razorpayOrderId?: string | null;
    razorpayPaymentId?: string | null;
    gatiCashApplied?: number;
    razorpayAmount?: number;
  }
): Promise<void> {
  const c = args.result.components;
  await tx`
    INSERT INTO ride_settlements (
      settlement_id, order_core_id, order_id_text, rider_id, customer_id,
      payment_mode,
      customer_bill, customer_paid, company_receivable, company_received,
      rider_earnings, wallet_debit, wallet_credit, outstanding_amount,
      base_fare, distance_fare, waiting_charge, toll_charge, night_charge,
      peak_hour_charge, festival_charge, airport_charge, extra_stops_charge,
      platform_fee, convenience_fee, service_charge, gateway_fee, small_order_fee,
      surge_total, surge_customer_share, surge_company_share,
      tax_total, discount_total, coupon_discount, company_funded_discount,
      commissionable_base, company_commission,
      platform_percentage, rider_percentage, payout_rule_id,
      gati_cash_applied, razorpay_amount, razorpay_order_id, razorpay_payment_id,
      status, billing_snapshot_id, billing_snapshot, component_breakdown
    ) VALUES (
      ${args.settlementId}, ${args.orderCoreId}, ${args.orderIdText},
      ${args.riderId}, ${args.customerId},
      ${args.paymentMode},
      ${args.result.customerBill}, ${args.result.customerPaid},
      ${args.result.companyReceivable}, ${args.result.companyReceived},
      ${args.result.riderEarnings}, ${args.result.walletDebit},
      ${args.result.walletCredit}, ${args.result.outstandingAmount},
      ${c.baseFare}, ${c.distanceFare}, ${c.waitingCharge}, ${c.tollCharge},
      ${c.nightCharge}, ${c.peakHourCharge}, ${c.festivalCharge},
      ${c.airportCharge}, ${c.extraStopsCharge},
      ${c.platformFee}, ${c.convenienceFee}, ${c.serviceCharge},
      ${c.gatewayFee}, ${c.smallOrderFee},
      ${c.surgeTotal}, ${c.surgeCustomerShare}, ${c.surgeCompanyShare},
      ${c.taxTotal}, ${round2(c.couponDiscount + c.companyFundedDiscount)},
      ${c.couponDiscount}, ${c.companyFundedDiscount},
      ${args.result.commissionableBase}, ${args.result.companyCommission},
      ${args.result.platformPercentage}, ${args.result.riderPercentage},
      ${args.result.payoutRuleId},
      ${args.gatiCashApplied ?? 0}, ${args.razorpayAmount ?? 0},
      ${args.razorpayOrderId ?? null}, ${args.razorpayPaymentId ?? null},
      'settled', ${args.billingSnapshotId},
      ${JSON.stringify(args.billingSnapshot)}::jsonb,
      ${JSON.stringify(c)}::jsonb
    )
  `;
}

type LedgerLine = {
  direction: "debit" | "credit";
  amount: number;
  accountKind: string;
  reasonCode: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

async function insertLedgerLines(
  tx: TransactionSql,
  args: {
    settlementId: string;
    orderCoreId: number;
    riderId: number | null;
    customerId: number | null;
    lines: LedgerLine[];
  }
): Promise<void> {
  for (const line of args.lines) {
    if (!(line.amount > 0)) continue;
    await tx`
      INSERT INTO ride_settlement_ledger (
        settlement_id, order_core_id, rider_id, customer_id,
        direction, amount, account_kind, reason_code, description, metadata
      ) VALUES (
        ${args.settlementId}, ${args.orderCoreId},
        ${args.riderId}, ${args.customerId},
        ${line.direction}, ${round2(line.amount)},
        ${line.accountKind}, ${line.reasonCode},
        ${line.description ?? null},
        ${JSON.stringify(line.metadata ?? {})}::jsonb
      )
    `;
  }
}

function componentLedgerLines(result: SettlementResult): LedgerLine[] {
  const lines: LedgerLine[] = [];
  const c = result.components;

  const push = (
    amount: number,
    accountKind: string,
    reasonCode: string,
    description: string
  ): void => {
    if (!(amount > 0)) return;
    lines.push({
      direction: "credit",
      amount,
      accountKind,
      reasonCode,
      description,
    });
  };

  push(c.platformFee, "company_platform_fee", "PLATFORM_FEE", "Platform fee");
  push(c.convenienceFee, "company_convenience_fee", "CONVENIENCE_FEE", "Convenience fee");
  push(c.serviceCharge, "company_service_charge", "SERVICE_CHARGE", "Service charge");
  push(c.gatewayFee, "company_gateway_fee", "GATEWAY_FEE", "Payment gateway fee");
  push(c.taxTotal, "company_tax", "TAX", "Taxes");
  push(result.companyCommission, "company_commission", "COMMISSION", "Ride commission");
  push(c.surgeCompanyShare, "company_surge_share", "SURGE_COMPANY", "Company-funded surge");
  push(c.pickupIncentiveCompanyShare, "company_pickup_incentive", "PICKUP_INCENTIVE_COMPANY", "Company-funded pickup incentive");
  // Toll is rider pass-through by default — record for audit, not company income.
  if (c.tollCharge > 0) {
    lines.push({
      direction: "credit",
      amount: c.tollCharge,
      accountKind: "rider_toll_passthrough",
      reasonCode: "TOLL",
      description: "Toll reimbursed to rider (no commission)",
    });
  }
  if (c.companyFundedDiscount > 0) {
    lines.push({
      direction: "debit",
      amount: c.companyFundedDiscount,
      accountKind: "company_discount_subsidy",
      reasonCode: "DISCOUNT",
      description: "Company-funded discount",
    });
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Rider wallet debit (cash mode only). Mirrors the pattern used in
// debitRiderWalletPenalty: FOR UPDATE lock, patch balance + service-level
// negative counter, emit a wallet_ledger row.
// ---------------------------------------------------------------------------

async function debitRiderWalletForCashSettlement(
  tx: TransactionSql,
  args: {
    riderId: number;
    orderCoreId: number;
    orderIdText: string;
    settlementId: string;
    amount: number;
  }
): Promise<{ balanceAfter: number; negativeUsedDelta: number }> {
  const amount = round2(args.amount);
  if (!(amount > 0)) {
    return { balanceAfter: 0, negativeUsedDelta: 0 };
  }

  await tx`
    INSERT INTO rider_wallet (rider_id, total_balance, last_updated_at)
    VALUES (${args.riderId}, 0, NOW())
    ON CONFLICT (rider_id) DO NOTHING
  `;

  const locked = await tx<
    Array<{
      total_balance: string | null;
      negative_used_person_ride: string | null;
    }>
  >`
    SELECT total_balance, negative_used_person_ride
    FROM rider_wallet
    WHERE rider_id = ${args.riderId}
    FOR UPDATE
  `;
  const wallet = locked[0];
  const currentBalance = Number(wallet?.total_balance ?? 0);
  const balanceAfter = round2(currentBalance - amount);
  const negativeUsedDelta =
    balanceAfter < 0
      ? currentBalance >= 0
        ? round2(amount - currentBalance)
        : round2(amount)
      : 0;

  const walletRef = `ride_cash_settle:${args.orderCoreId}`;

  await tx`
    INSERT INTO wallet_ledger (
      rider_id, entry_type, amount, balance,
      service_type, ref, ref_type, description, metadata,
      performed_by_type
    ) VALUES (
      ${args.riderId}, 'adjustment', ${amount.toFixed(2)}, ${balanceAfter.toFixed(2)},
      'person_ride', ${walletRef}, 'ride_settlement',
      ${`Cash ride company recovery — ${args.orderIdText}`},
      ${JSON.stringify({
        source: "ride_cash_settlement",
        orderCoreId: args.orderCoreId,
        orderIdText: args.orderIdText,
        settlementId: args.settlementId,
        component: "company_receivable_recovery",
      })}::jsonb,
      'system'
    )
    ON CONFLICT DO NOTHING
  `;

  const currentNeg = Number(wallet?.negative_used_person_ride ?? 0);
  await tx`
    UPDATE rider_wallet
    SET total_balance = ${balanceAfter.toFixed(2)},
        negative_used_person_ride = ${(currentNeg + negativeUsedDelta).toFixed(2)},
        last_updated_at = NOW()
    WHERE rider_id = ${args.riderId}
  `;

  return { balanceAfter, negativeUsedDelta };
}

/**
 * Credit rider wallet with residual earnings (online / wallet / mixed).
 * Uses the same `rider_earn:delivery:{orderCoreId}` ref as the legacy
 * credit-rider-order-on-delivered path so a stray legacy call is a no-op.
 */
async function creditRiderWalletForOnlineSettlement(
  tx: TransactionSql,
  args: {
    riderId: number;
    orderCoreId: number;
    orderIdText: string;
    settlementId: string;
    amount: number;
  }
): Promise<{ balanceAfter: number }> {
  const amount = round2(args.amount);
  if (!(amount > 0)) {
    return { balanceAfter: 0 };
  }

  await tx`
    INSERT INTO rider_wallet (rider_id, total_balance, last_updated_at)
    VALUES (${args.riderId}, 0, NOW())
    ON CONFLICT (rider_id) DO NOTHING
  `;

  const walletRef = `rider_earn:delivery:${args.orderCoreId}`;
  const already = await tx<Array<{ ok: number }>>`
    SELECT 1 AS ok FROM wallet_ledger
    WHERE rider_id = ${args.riderId} AND ref = ${walletRef}
    LIMIT 1
  `;
  if (already.length > 0) {
    const bal = await tx<Array<{ total_balance: string | null }>>`
      SELECT total_balance FROM rider_wallet WHERE rider_id = ${args.riderId} LIMIT 1
    `;
    return { balanceAfter: round2(Number(bal[0]?.total_balance ?? 0)) };
  }

  const locked = await tx<Array<{ total_balance: string | null }>>`
    SELECT total_balance
    FROM rider_wallet
    WHERE rider_id = ${args.riderId}
    FOR UPDATE
  `;
  const currentBalance = Number(locked[0]?.total_balance ?? 0);
  const balanceAfter = round2(currentBalance + amount);

  await tx`
    INSERT INTO wallet_ledger (
      rider_id, entry_type, amount, balance,
      service_type, ref, ref_type, description, metadata,
      performed_by_type
    ) VALUES (
      ${args.riderId}, 'earning', ${amount.toFixed(2)}, ${balanceAfter.toFixed(2)},
      'person_ride', ${walletRef}, 'ride_settlement',
      ${`Ride earning — ${args.orderIdText}`},
      ${JSON.stringify({
        source: "ride_online_settlement",
        orderCoreId: args.orderCoreId,
        orderIdText: args.orderIdText,
        settlementId: args.settlementId,
        component: "rider_earnings",
      })}::jsonb,
      'system'
    )
    ON CONFLICT DO NOTHING
  `;

  await tx`
    UPDATE rider_wallet
    SET total_balance = ${balanceAfter.toFixed(2)},
        last_updated_at = NOW()
    WHERE rider_id = ${args.riderId}
  `;

  await tx`
    UPDATE orders_core
    SET rider_earning = ${amount.toFixed(2)},
        updated_at = NOW()
    WHERE id = ${args.orderCoreId}
      AND (rider_earning IS NULL OR rider_earning::numeric = 0)
  `;

  return { balanceAfter };
}

// ---------------------------------------------------------------------------
// Public: online settlement
// ---------------------------------------------------------------------------

export async function postOnlineRideSettlement(
  input: OnlineSettlementInput
): Promise<SettlementPostingResult> {
  const sql = getSql();
  const existing = await findExistingSettlement(input.orderCoreId, sql);
  if (existing) {
    return {
      settlementId: existing.settlementId,
      paymentMode: existing.paymentMode as PaymentMode,
      alreadySettled: true,
      settlement: null,
    };
  }

  const settlementId = buildSettlementId(input.orderCoreId);
  const payout = await resolvePayoutPercentages(input.geo);

  const gatiCashApplied = round2(input.paymentSplit.gatiCashApplied ?? 0);
  const razorpayAmount = round2(input.paymentSplit.razorpayAmount ?? 0);
  const customerPaid = round2(gatiCashApplied + razorpayAmount);
  const customerBill = round2(input.billing.customerBill);

  const paymentMode: PaymentMode =
    razorpayAmount > 0 && gatiCashApplied > 0
      ? "mixed"
      : gatiCashApplied > 0 && razorpayAmount <= 0
        ? "wallet"
        : "online";

  const result = computeRideSettlement({
    customerBill,
    customerPaid,
    paymentMode,
    platformPercentage: payout.platformPercentage,
    riderPercentage: payout.riderPercentage,
    payoutRuleId: payout.payoutRuleId,
    commissionOnToll: (await loadRideWalletPolicy(sql)).commissionOnToll,
    components: input.billing.components,
  });

  const billingSnapshot = input.billing.billingSnapshot ?? {};

  let walletBalanceAfter: number | null = null;

  try {
    await sql.begin(async (tx) => {
      await insertSettlementRow(tx, {
        settlementId,
        orderCoreId: input.orderCoreId,
        orderIdText: input.orderIdText,
        riderId: input.riderId ?? null,
        customerId: input.customerId ?? null,
        paymentMode,
        result,
        billingSnapshotId: input.billing.billingSnapshotId ?? null,
        billingSnapshot,
        razorpayOrderId: input.paymentSplit.razorpayOrderId ?? null,
        razorpayPaymentId: input.paymentSplit.razorpayPaymentId ?? null,
        gatiCashApplied,
        razorpayAmount,
      });

      const paidLines: LedgerLine[] = [];
      if (razorpayAmount > 0) {
        paidLines.push({
          direction: "debit",
          amount: razorpayAmount,
          accountKind: "gateway_online",
          reasonCode: "CUSTOMER_ONLINE_PAY",
          description: "Customer paid via Razorpay",
          metadata: {
            razorpayOrderId: input.paymentSplit.razorpayOrderId,
            razorpayPaymentId: input.paymentSplit.razorpayPaymentId,
          },
        });
      }
      if (gatiCashApplied > 0) {
        paidLines.push({
          direction: "debit",
          amount: gatiCashApplied,
          accountKind: "gati_cash",
          reasonCode: "CUSTOMER_GATI_CASH_PAY",
          description: "Customer paid via GatiCash wallet",
        });
      }

      const riderEarningLine: LedgerLine[] = result.riderEarnings > 0
        ? [
            {
              direction: "credit",
              amount: result.riderEarnings,
              accountKind: "rider_earning_credited",
              reasonCode: "RIDE_EARNING_CREDIT",
              description: `Rider earning — ${input.orderIdText}`,
            },
          ]
        : [];

      await insertLedgerLines(tx, {
        settlementId,
        orderCoreId: input.orderCoreId,
        riderId: input.riderId ?? null,
        customerId: input.customerId ?? null,
        lines: [
          ...paidLines,
          ...componentLedgerLines(result),
          ...riderEarningLine,
        ],
      });

      if (input.riderId != null && input.riderId > 0 && result.walletCredit > 0) {
        const credited = await creditRiderWalletForOnlineSettlement(tx, {
          riderId: input.riderId,
          orderCoreId: input.orderCoreId,
          orderIdText: input.orderIdText,
          settlementId,
          amount: result.walletCredit,
        });
        walletBalanceAfter = credited.balanceAfter;
      }

      await tx`
        UPDATE orders_ride
        SET settlement_id = ${settlementId}, updated_at = NOW()
        WHERE order_id = ${input.orderCoreId}
      `;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate|unique/i.test(msg)) {
      const again = await findExistingSettlement(input.orderCoreId, sql);
      if (again) {
        return {
          settlementId: again.settlementId,
          paymentMode: again.paymentMode as PaymentMode,
          alreadySettled: true,
          settlement: null,
        };
      }
    }
    console.warn("[postOnlineRideSettlement] failed:", input.orderCoreId, msg);
    throw err;
  }

  await logSettlementActivity({
    orderCoreId: input.orderCoreId,
    riderId: input.riderId,
    customerId: input.customerId,
    eventType: "ONLINE_PAYMENT_COMPLETED",
    amount: result.customerBill,
    summary: `Online settlement ${settlementId}`,
    payload: {
      settlementId,
      riderEarnings: result.riderEarnings,
      companyReceivable: result.companyReceivable,
      walletCredit: result.walletCredit,
    },
  });
  if (result.walletCredit > 0) {
    await logSettlementActivity({
      orderCoreId: input.orderCoreId,
      riderId: input.riderId,
      eventType: "WALLET_CREDITED",
      amount: result.walletCredit,
      summary: "Rider earnings credited from online settlement",
    });
  }
  await logSettlementActivity({
    orderCoreId: input.orderCoreId,
    riderId: input.riderId,
    eventType: "SETTLEMENT_GENERATED",
    amount: result.companyReceivable,
    summary: `Settlement generated (${paymentMode})`,
    payload: { settlementId, paymentMode },
  });

  return {
    settlementId,
    paymentMode,
    alreadySettled: false,
    settlement: result,
    walletBalanceAfter,
  };
}

async function logSettlementActivity(args: {
  orderCoreId: number;
  riderId?: number | null;
  customerId?: number | null;
  eventType: string;
  amount?: number;
  summary: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { recordRideBillingActivity } = await import("./rideBillingActivity.js");
    await recordRideBillingActivity(args);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Public: cash settlement
// ---------------------------------------------------------------------------

export async function postCashRideSettlement(
  input: CashSettlementInput
): Promise<SettlementPostingResult> {
  const sql = getSql();
  const policy = await loadRideWalletPolicy(sql);
  if (!policy.cashSettlementEnabled) {
    throw Object.assign(new Error("Cash settlement is disabled by admin policy"), {
      statusCode: 403,
      code: "CASH_SETTLEMENT_DISABLED",
    });
  }

  const existing = await findExistingSettlement(input.orderCoreId, sql);
  if (existing) {
    return {
      settlementId: existing.settlementId,
      paymentMode: existing.paymentMode as PaymentMode,
      alreadySettled: true,
      settlement: null,
    };
  }

  const settlementId = buildSettlementId(input.orderCoreId);
  const payout = await resolvePayoutPercentages(input.geo);
  const customerBill = round2(input.billing.customerBill);

  const result = computeRideSettlement({
    customerBill,
    customerPaid: customerBill,
    paymentMode: "cash",
    platformPercentage: payout.platformPercentage,
    riderPercentage: payout.riderPercentage,
    payoutRuleId: payout.payoutRuleId,
    cashCollected: customerBill,
    commissionOnToll: policy.commissionOnToll,
    components: input.billing.components,
  });

  const collectedAt = input.cashCollectedAt ?? new Date();
  const billingSnapshot = input.billing.billingSnapshot ?? {};

  let walletBalanceAfter: number | null = null;

  try {
    await sql.begin(async (tx) => {
      await insertSettlementRow(tx, {
        settlementId,
        orderCoreId: input.orderCoreId,
        orderIdText: input.orderIdText,
        riderId: input.riderId,
        customerId: input.customerId ?? null,
        paymentMode: "cash",
        result,
        billingSnapshotId: input.billing.billingSnapshotId ?? null,
        billingSnapshot,
      });

      const lines: LedgerLine[] = [
        {
          direction: "debit",
          amount: customerBill,
          accountKind: "customer_cash",
          reasonCode: "CUSTOMER_CASH_PAY",
          description: "Customer paid rider in cash",
        },
        ...componentLedgerLines(result),
      ];
      if (result.riderEarnings > 0) {
        lines.push({
          direction: "credit",
          amount: result.riderEarnings,
          accountKind: "rider_earning_kept",
          reasonCode: "RIDE_EARNING_KEPT_IN_CASH",
          description: "Rider retained earnings in cash",
        });
      }
      if (result.walletDebit > 0) {
        lines.push({
          direction: "debit",
          amount: result.walletDebit,
          accountKind: "rider_wallet",
          reasonCode: "CASH_COMPANY_RECOVERY",
          description: "Company share recovered from rider wallet",
        });
        lines.push({
          direction: "credit",
          amount: result.walletDebit,
          accountKind: "company_receivable",
          reasonCode: "CASH_COMPANY_RECOVERY",
          description: "Company recovered its share for the ride",
        });
      }

      await insertLedgerLines(tx, {
        settlementId,
        orderCoreId: input.orderCoreId,
        riderId: input.riderId,
        customerId: input.customerId ?? null,
        lines,
      });

      const debit = await debitRiderWalletForCashSettlement(tx, {
        riderId: input.riderId,
        orderCoreId: input.orderCoreId,
        orderIdText: input.orderIdText,
        settlementId,
        amount: result.walletDebit,
      });
      walletBalanceAfter = debit.balanceAfter;

      await tx`
        UPDATE orders_ride
        SET cash_collected_at = ${collectedAt.toISOString()},
            cash_collected_by_rider_id = ${input.riderId},
            settlement_id = ${settlementId},
            amount_collected = ${customerBill.toFixed(2)},
            final_fare = ${customerBill.toFixed(2)},
            updated_at = NOW()
        WHERE order_id = ${input.orderCoreId}
      `;

      await tx`
        UPDATE orders_core
        SET payment_status = 'completed',
            payment_method = 'cash',
            grand_total = ${customerBill.toFixed(2)},
            updated_at = NOW()
        WHERE id = ${input.orderCoreId}
      `;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate|unique/i.test(msg)) {
      const again = await findExistingSettlement(input.orderCoreId, sql);
      if (again) {
        return {
          settlementId: again.settlementId,
          paymentMode: again.paymentMode as PaymentMode,
          alreadySettled: true,
          settlement: null,
        };
      }
    }
    console.warn("[postCashRideSettlement] failed:", input.orderCoreId, msg);
    throw err;
  }

  // Wallet block sync happens outside the tx so it can safely re-derive from
  // the persisted wallet state.
  try {
    await syncNegativeWalletBlocks(input.riderId);
  } catch (err) {
    console.warn("[postCashRideSettlement] negative-wallet sync failed:", input.riderId, err);
  }

  await logSettlementActivity({
    orderCoreId: input.orderCoreId,
    riderId: input.riderId,
    customerId: input.customerId,
    eventType: "CASH_SETTLEMENT_COMPLETED",
    amount: result.customerBill,
    summary: `Cash settlement ${settlementId}`,
    payload: {
      settlementId,
      companyReceivable: result.companyReceivable,
      walletDebit: result.walletDebit,
      riderEarnings: result.riderEarnings,
    },
  });
  if (result.walletDebit > 0) {
    await logSettlementActivity({
      orderCoreId: input.orderCoreId,
      riderId: input.riderId,
      eventType: "WALLET_DEBITED",
      amount: result.walletDebit,
      summary: "Company receivable recovered from rider wallet",
    });
  }
  await logSettlementActivity({
    orderCoreId: input.orderCoreId,
    riderId: input.riderId,
    eventType: "SETTLEMENT_GENERATED",
    amount: result.companyReceivable,
    summary: "Cash settlement generated",
    payload: { settlementId },
  });

  return {
    settlementId,
    paymentMode: "cash",
    alreadySettled: false,
    settlement: result,
    walletBalanceAfter,
  };
}
