import type { TransactionSql } from "postgres";
import { getSql } from "../../../db/client.js";
import {
  computePostpaidSettlement,
  toPaise,
  type PostpaidSettlementResult,
} from "../../../lib/postpaid-settlement.js";
import {
  applySettlementWalletMovement,
  recordSettlementExtensions,
} from "../../../lib/postpaid-settlement-posting.js";
import { syncNegativeWalletBlocks } from "../../../lib/rider-negative-wallet-blocks.js";
import {
  loadEffectiveServicePayoutRule,
  riderHasActiveGmitraMax,
} from "../../rider-payout-pricing/riderPayoutPricing.repository.js";
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

/**
 * Fill in pickup coordinates from orders_core when the caller did not supply
 * usable ones.
 *
 * Two of the three settlement callers read pickupLat/pickupLon off the billing
 * snapshot, which has never carried those keys — so the geo lookup silently
 * failed, no payout rule matched, and the engine fell back to "rider gets 100%,
 * company commission 0". The same ride then paid the rider a different amount
 * depending on whether the customer chose cash (geo resolved, rule applied) or
 * online/QR (geo empty, 100% fallback). Resolving it here means no call site can
 * reintroduce that.
 */
async function withOrderPickupGeo(orderCoreId: number, geo: RideGeoInput): Promise<RideGeoInput> {
  const lat = Number(geo.pickupLat ?? 0);
  const lng = Number(geo.pickupLng ?? 0);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
  if (hasCoords || geo.pickupPincode || geo.pickupState) return geo;
  try {
    const sql = getSql();
    const rows = await sql<Array<{ pickup_lat: unknown; pickup_lon: unknown }>>`
      SELECT pickup_lat, pickup_lon FROM orders_core WHERE id = ${orderCoreId} LIMIT 1
    `;
    const row = rows[0];
    if (!row) return geo;
    const coreLat = Number(row.pickup_lat);
    const coreLng = Number(row.pickup_lon);
    if (!Number.isFinite(coreLat) || !Number.isFinite(coreLng) || coreLat === 0 || coreLng === 0) {
      return geo;
    }
    return { ...geo, pickupLat: coreLat, pickupLng: coreLng };
  } catch (err) {
    console.warn("[rideSettlement] pickup geo backfill failed:", orderCoreId, err);
    return geo;
  }
}

/**
 * Whether the rider receives the waiting charge. Mirrors the food/parcel gate in
 * resolveRiderWaitingEntitlement. Fails OPEN (entitled) so a flaky subscription
 * lookup never silently withholds a rider's pay.
 */
async function resolveRiderWaitingEntitled(riderId: number | null): Promise<boolean> {
  if (riderId == null || !(riderId > 0)) return true;
  try {
    return await riderHasActiveGmitraMax(riderId);
  } catch (err) {
    console.warn("[rideSettlement] Max lookup failed, paying waiting through:", riderId, err);
    return true;
  }
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
      ${JSON.stringify(args.billingSnapshot)}::text::jsonb,
      ${JSON.stringify(c)}::text::jsonb
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
        ${JSON.stringify(line.metadata ?? {})}::text::jsonb
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
  // The money the company injected so the customer's offer did not come out of
  // the rider's earnings. Recorded as its own line so the gap between what the
  // customer paid and what the rider was paid is always explained.
  if (result.promotionSubsidy > 0) {
    lines.push({
      direction: "debit",
      amount: result.promotionSubsidy,
      accountKind: "company_rider_promotion_subsidy",
      reasonCode: "RIDER_PROMO_SUBSIDY",
      description: "Company-funded rider top-up (customer offer)",
      metadata: {
        commissionableBaseGross: result.commissionableBase,
        commissionableBaseNet: result.commissionableBaseNet,
        couponDiscount: c.couponDiscount,
        companyFundedDiscount: c.companyFundedDiscount,
      },
    });
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Wallet settlement. The ride fare engine above decides R (riderEarnings) and C
// (customerBill); the shared post-paid engine decides how the wallet moves and
// produces the balanced journal. Identical for every Person Ride and Parcel.
// ---------------------------------------------------------------------------

function toCommonRideSettlement(
  result: SettlementResult,
  method: "cash" | "online",
  gatiCashApplied: number
): PostpaidSettlementResult {
  const c = result.components;
  return computePostpaidSettlement({
    service: "person_ride",
    method,
    customerPayablePaise: toPaise(result.customerBill),
    riderEntitlementPaise: toPaise(result.riderEarnings),
    collectedPaise: toPaise(method === "cash" ? result.customerBill : result.customerPaid),
    walletPaidPaise: toPaise(gatiCashApplied),
    taxPaise: toPaise(c.taxTotal),
    tipPaise: toPaise(c.tipAmount),
    // Company-funded parts of the rider's earning — paid by us, not the customer.
    incentivePaise: toPaise(c.surgeCompanyShare + c.pickupIncentiveCompanyShare),
    discountPaise: toPaise(c.couponDiscount + c.companyFundedDiscount),
  });
}

/**
 * The ride math and the shared engine must agree on the wallet movement — they
 * are the same identity (cash: R − C, online: R). A disagreement means one of
 * them changed; the shared engine's figure is posted and the row is flagged.
 */
function rideWalletDisagreement(result: SettlementResult, common: PostpaidSettlementResult): string | null {
  const rideDelta = toPaise(result.walletCredit) - toPaise(result.walletDebit);
  if (Math.abs(rideDelta - common.walletDeltaPaise) <= 1) return null;
  return `ride math wallet Δ ${rideDelta} paise ≠ settlement engine ${common.walletDeltaPaise} paise`;
}

function rideWalletRefs(orderCoreId: number) {
  return {
    // Shared with credit-rider-order-on-delivered so a stray legacy credit is a no-op.
    creditRef: `rider_earn:delivery:${orderCoreId}`,
    debitRef: `ride_cash_settle:${orderCoreId}`,
  };
}

async function markRideEarningOnOrder(tx: TransactionSql, orderCoreId: number, riderEarnings: number) {
  if (!(riderEarnings > 0)) return;
  await tx`
    UPDATE orders_core
    SET rider_earning = ${round2(riderEarnings).toFixed(2)},
        updated_at = NOW()
    WHERE id = ${orderCoreId}
      AND (rider_earning IS NULL OR rider_earning::numeric = 0)
  `;
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
  const payout = await resolvePayoutPercentages(
    await withOrderPickupGeo(input.orderCoreId, input.geo)
  );

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
    riderWaitingEntitled: await resolveRiderWaitingEntitled(input.riderId ?? null),
    components: input.billing.components,
  });
  const common = toCommonRideSettlement(result, "online", gatiCashApplied);
  const disagreement = rideWalletDisagreement(result, common);

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

      let walletBalanceBefore: number | null = null;
      if (input.riderId != null && input.riderId > 0) {
        const moved = await applySettlementWalletMovement(tx, {
          riderId: input.riderId,
          service: "person_ride",
          settlement: common,
          ...rideWalletRefs(input.orderCoreId),
          refType: "ride_settlement",
          creditDescription: `Ride earning — ${input.orderIdText}`,
          debitDescription: `Ride settlement — ${input.orderIdText}`,
          metadata: {
            source: "ride_online_settlement",
            orderCoreId: input.orderCoreId,
            orderIdText: input.orderIdText,
            settlementId,
            component: "rider_earnings",
            paymentMethod: "online",
            customerPayable: result.customerBill,
            riderEntitlement: result.riderEarnings,
          },
        });
        walletBalanceBefore = moved.balanceBefore;
        walletBalanceAfter = moved.balanceAfter;
        if (moved.posted === "credit") {
          await markRideEarningOnOrder(tx, input.orderCoreId, result.riderEarnings);
        }
      }

      await recordSettlementExtensions(tx, settlementId, {
        service: "person_ride",
        settlement: common,
        walletBalanceBefore,
        walletBalanceAfter,
        reconciliationReason: disagreement,
      });

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

  // A credit can lift a wallet restriction; re-derive it from the committed balance.
  if (input.riderId != null && input.riderId > 0 && common.walletCreditPaise > 0) {
    try {
      await syncNegativeWalletBlocks(input.riderId);
    } catch (err) {
      console.warn("[postOnlineRideSettlement] wallet block sync failed:", input.riderId, err);
    }
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

  // Transparent offer-vs-settlement breakdown for Rider App (paid ride SSOT).
  try {
    const {
      buildRiderSettlementBreakdown,
      persistRiderSettlementBreakdown,
      resolveAcceptedPayoutSnapshot,
    } = await import("../../../lib/rider-settlement-breakdown.js");
    const { getDb } = await import("../../../db/client.js");
    const { ordersCore, ordersRide } = await import("../../../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    const [row] = await db
      .select({
        billingSnapshot: ordersCore.billingSnapshot,
        acceptPayoutSnapshot: ordersRide.acceptPayoutSnapshot,
      })
      .from(ordersCore)
      .leftJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
      .where(eq(ordersCore.id, input.orderCoreId))
      .limit(1);
    const acceptSnap = resolveAcceptedPayoutSnapshot({
      billingSnapshot: row?.billingSnapshot,
      acceptPayoutSnapshot: row?.acceptPayoutSnapshot,
    });
    const breakdown = buildRiderSettlementBreakdown({
      acceptedSnapshot: acceptSnap,
      finalSnapshot: acceptSnap
        ? {
            ...acceptSnap,
            totalEarning: Math.round(result.riderEarnings),
            baseEarning: Math.round(result.riderEarnings - (acceptSnap.waitingEarning || 0)),
          }
        : {
            baseEarning: Math.round(result.riderEarnings),
            waitingEarning: 0,
            surgeEarning: 0,
            appliedSurges: [],
            totalEarning: Math.round(result.riderEarnings),
            snapshottedAt: new Date().toISOString(),
          },
      walletCreditedAmount: result.walletCredit,
      paidRideSettlementEngine: true,
      settlementId,
      quoteId: `ride:${input.orderCoreId}`,
    });
    await persistRiderSettlementBreakdown(input.orderCoreId, breakdown);
  } catch (err) {
    console.warn(
      "[postOnlineRideSettlement] settlement breakdown failed:",
      input.orderCoreId,
      (err as Error)?.message ?? err
    );
  }

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
  const payout = await resolvePayoutPercentages(
    await withOrderPickupGeo(input.orderCoreId, input.geo)
  );
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
    riderWaitingEntitled: await resolveRiderWaitingEntitled(input.riderId ?? null),
    components: input.billing.components,
  });
  const common = toCommonRideSettlement(result, "cash", 0);
  const disagreement = rideWalletDisagreement(result, common);
  const walletCredit = common.walletCreditPaise / 100;
  const walletDebit = common.walletDebitPaise / 100;

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
      // The rider physically keeps the cash — up to their earning. Under an offer
      // the cash is less than the earning and the wallet makes up the rest.
      const keptInCash = round2(Math.min(result.riderEarnings, customerBill));
      if (keptInCash > 0) {
        lines.push({
          direction: "credit",
          amount: keptInCash,
          accountKind: "rider_earning_kept",
          reasonCode: "RIDE_EARNING_KEPT_IN_CASH",
          description: "Rider retained earnings in cash",
        });
      }
      if (walletDebit > 0) {
        lines.push({
          direction: "debit",
          amount: walletDebit,
          accountKind: "rider_wallet",
          reasonCode: "CASH_COMPANY_RECOVERY",
          description: "Company share recovered from rider wallet",
        });
        lines.push({
          direction: "credit",
          amount: walletDebit,
          accountKind: "company_receivable",
          reasonCode: "CASH_COMPANY_RECOVERY",
          description: "Company recovered its share for the ride",
        });
      }
      if (walletCredit > 0) {
        lines.push({
          direction: "credit",
          amount: walletCredit,
          accountKind: "rider_wallet",
          reasonCode: "CASH_SETTLEMENT_CREDIT",
          description: "Company top-up: customer paid less cash than the rider's earning",
          metadata: { customerPaidCash: customerBill, riderEarnings: result.riderEarnings },
        });
      }

      await insertLedgerLines(tx, {
        settlementId,
        orderCoreId: input.orderCoreId,
        riderId: input.riderId,
        customerId: input.customerId ?? null,
        lines,
      });

      const moved = await applySettlementWalletMovement(tx, {
        riderId: input.riderId,
        service: "person_ride",
        settlement: common,
        ...rideWalletRefs(input.orderCoreId),
        refType: "ride_settlement",
        creditDescription: `Cash ride top-up — ${input.orderIdText}`,
        debitDescription: `Cash ride platform share — ${input.orderIdText}`,
        metadata: {
          source: "ride_cash_settlement",
          orderCoreId: input.orderCoreId,
          orderIdText: input.orderIdText,
          settlementId,
          component: walletCredit > 0 ? "cash_settlement_credit" : "company_receivable_recovery",
          paymentMethod: "cash",
          customerPayable: customerBill,
          cashCollected: customerBill,
          riderEntitlement: result.riderEarnings,
        },
      });
      walletBalanceAfter = moved.balanceAfter;
      // The rider earned R whichever way the wallet moved (cash in hand + Δ).
      await markRideEarningOnOrder(tx, input.orderCoreId, result.riderEarnings);

      await recordSettlementExtensions(tx, settlementId, {
        service: "person_ride",
        settlement: common,
        walletBalanceBefore: moved.balanceBefore,
        walletBalanceAfter: moved.balanceAfter,
        reconciliationReason: disagreement,
      });

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
      walletDebit,
      walletCredit,
      riderEarnings: result.riderEarnings,
    },
  });
  if (walletDebit > 0) {
    await logSettlementActivity({
      orderCoreId: input.orderCoreId,
      riderId: input.riderId,
      eventType: "WALLET_DEBITED",
      amount: walletDebit,
      summary: "Company receivable recovered from rider wallet",
    });
  }
  if (walletCredit > 0) {
    await logSettlementActivity({
      orderCoreId: input.orderCoreId,
      riderId: input.riderId,
      eventType: "WALLET_CREDITED",
      amount: walletCredit,
      summary: "Company top-up: customer paid less cash than the rider's earning",
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
