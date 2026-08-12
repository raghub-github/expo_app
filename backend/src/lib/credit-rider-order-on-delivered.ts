import { getSql } from "../db/client.js";
import { isRiderEligibleForDeliveryWalletCredit } from "./rider-delivery-wallet-eligibility.js";
import { resolveOrderRiderPayoutAmount } from "./resolve-order-rider-payout.js";
import type { OrderRiderPayoutService } from "./resolve-order-rider-payout.js";
import { rideTripDistanceFromCheckoutMetadata, rideGeoFromCheckoutMetadata } from "./ride-address-display.js";
import { readRideRiderPayoutSnapshot } from "./ride-rider-payout-snapshot.js";
import { readDynamicRiderIncentiveFromSnapshot } from "./dynamic-pricing.js";
import {
  composeRiderPayout,
  defaultPrePickupFunding,
  normalizePrePickupFunding,
} from "./rider-payout-composition.js";

export type RiderOrderWalletServiceType = "food" | "parcel" | "person_ride";

export type CreditRiderOrderEarningInput = {
  ordersCoreId: number;
  riderId: number;
  orderType: RiderOrderWalletServiceType;
  deliveryFee?: number;
  tipAmount?: number;
  formattedOrderId?: string | null;
  orderIdText?: string | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseBillingAmount(snapshot: unknown, keys: string[]): number {
  if (snapshot == null || typeof snapshot !== "object") return 0;
  const obj = snapshot as Record<string, unknown>;
  for (const key of keys) {
    const n = Number(obj[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** Rider payout is delivery fee — never order grand total. */
export function resolveRiderDeliveryFeeFromCore(row: {
  riderEarning: unknown;
  fareAmount: unknown;
  billingSnapshot?: unknown;
}): number {
  const direct = Number(row.riderEarning);
  if (Number.isFinite(direct) && direct > 0) return round2(direct);

  // Prefer the GROSS/standard delivery fare so rider payout is never reduced by a
  // customer subsidy (free delivery / coupon / membership). Fall back to the net
  // customer-facing fee only for pre-migration orders without a gross field.
  const fromGross = parseBillingAmount(row.billingSnapshot, [
    "delivery_fee_gross",
    "deliveryFeeGross",
    "delivery_fee_original",
    "deliveryFeeOriginal",
  ]);
  if (fromGross > 0) return round2(fromGross);

  const fromBilling = parseBillingAmount(row.billingSnapshot, [
    "delivery_fee",
    "final_delivery_fee",
    "deliveryFee",
    "finalDeliveryFee",
  ]);
  if (fromBilling > 0) return round2(fromBilling);

  const fare = Number(row.fareAmount);
  if (Number.isFinite(fare) && fare > 0) return round2(fare);

  return 0;
}

function deliveryRef(coreId: number): string {
  return `rider_earn:delivery:${coreId}`;
}

async function runReferralEvalAfterDelivery(opts: {
  riderId: number;
  coreId: number;
  orderType?: string;
}): Promise<void> {
  try {
    const sql = getSql();
    const {
      evaluateRiderReferralOnOrderDelivered,
      evaluateCustomerReferralOnOrderDelivered,
    } = await import("../modules/referral/referral.engine.js");
    await evaluateRiderReferralOnOrderDelivered({
      riderId: opts.riderId,
      ordersCoreId: opts.coreId,
      orderType: opts.orderType,
    });
    const [orderRow] = await sql<Array<{ customer_id: string | null }>>`
      SELECT customer_id::text AS customer_id
      FROM orders_core
      WHERE id = ${opts.coreId}
      LIMIT 1
    `;
    const customerPk = Number(orderRow?.customer_id ?? 0);
    if (Number.isFinite(customerPk) && customerPk > 0) {
      await evaluateCustomerReferralOnOrderDelivered({
        customerPk,
        ordersCoreId: opts.coreId,
      });
    }
  } catch (refErr) {
    console.warn(
      "[creditRiderOrderEarningOnDelivered] referral eval failed (tolerated)",
      (refErr as Error).message,
    );
  }
}

function tipRef(coreId: number): string {
  return `rider_earn:tip:${coreId}`;
}

function dynamicIncentiveRef(coreId: number): string {
  return `rider_earn:dyn:${coreId}`;
}

async function ledgerRefExists(riderId: number, ref: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    SELECT 1 AS ok
    FROM wallet_ledger
    WHERE rider_id = ${riderId}
      AND ref = ${ref}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function readWalletBalance(riderId: number): Promise<number> {
  const sql = getSql();
  await sql`
    INSERT INTO rider_wallet (rider_id, total_balance, last_updated_at)
    VALUES (${riderId}, 0, NOW())
    ON CONFLICT (rider_id) DO NOTHING
  `;
  const rows = await sql`
    SELECT COALESCE(total_balance, 0) AS bal
    FROM rider_wallet
    WHERE rider_id = ${riderId}
    LIMIT 1
  `;
  return round2(Number((rows[0] as { bal?: unknown })?.bal ?? 0));
}

async function readLedgerEarningTotal(riderId: number, coreId: number): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    SELECT COALESCE(SUM(amount::numeric), 0) AS total
    FROM wallet_ledger
    WHERE rider_id = ${riderId}
      AND ref IN (${deliveryRef(coreId)}, ${tipRef(coreId)}, ${dynamicIncentiveRef(coreId)})
  `;
  return round2(Number((rows[0] as { total?: unknown })?.total ?? 0));
}

async function syncRiderEarningOnOrderCore(coreId: number, total: number): Promise<void> {
  if (total <= 0) return;
  const sql = getSql();
  await sql`
    UPDATE orders_core
    SET
      rider_earning = ${total.toFixed(2)},
      updated_at = NOW()
    WHERE id = ${coreId}
      AND (rider_earning IS NULL OR rider_earning::numeric = 0)
  `;
}

async function insertEarning(input: {
  riderId: number;
  amount: number;
  balanceAfter: number;
  serviceType: RiderOrderWalletServiceType;
  ref: string;
  description: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const sql = getSql();
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
      ${input.riderId},
      'earning',
      ${input.amount.toFixed(2)},
      ${input.balanceAfter.toFixed(2)},
      ${input.serviceType},
      ${input.ref},
      'order',
      ${input.description},
      ${JSON.stringify(input.metadata)}::jsonb,
      'system'
    )
  `;
}

/**
 * Credit rider wallet when an order is delivered.
 * Writes to wallet_ledger (trigger syncs rider_wallet). Idempotent via ref keys.
 */
export async function creditRiderOrderEarningOnDelivered(
  input: CreditRiderOrderEarningInput
): Promise<{
  credited: boolean;
  deliveryCredited: boolean;
  tipCredited: boolean;
  error?: string;
}> {
  const coreId = Number(input.ordersCoreId);
  const riderId = Number(input.riderId);
  if (!Number.isFinite(coreId) || coreId <= 0 || !Number.isFinite(riderId) || riderId <= 0) {
    return { credited: false, deliveryCredited: false, tipCredited: false, error: "invalid_input" };
  }

  const sql = getSql();
  const eligibility = await isRiderEligibleForDeliveryWalletCredit(coreId, riderId, sql);
  if (!eligibility.eligible) {
    void runReferralEvalAfterDelivery({ riderId, coreId, orderType: input.orderType });
    return {
      credited: false,
      deliveryCredited: false,
      tipCredited: false,
      error: eligibility.error,
    };
  }

  // Settlement engine is the SSOT for person_ride wallet credits. Skip legacy
  // percentage-payout credit when a ride_settlements row already exists.
  if (input.orderType === "person_ride") {
    const settled = await sql<Array<{ settlement_id: string | null }>>`
      SELECT settlement_id FROM orders_ride WHERE order_id = ${coreId} LIMIT 1
    `;
    if (settled[0]?.settlement_id) {
      return {
        credited: false,
        deliveryCredited: false,
        tipCredited: false,
        error: "ride_settlement_ssot",
      };
    }
  }

  let deliveryFee = input.deliveryFee;
  let tipAmount = input.tipAmount;
  let orderIdText = input.orderIdText?.trim() || null;
  let displayId = input.formattedOrderId?.trim() || null;

  const rows = await sql`
    SELECT
      c.order_id,
      c.formatted_order_id,
      c.order_type,
      c.rider_earning,
      c.rider_pre_pickup_allowance,
      c.rider_pre_pickup_funding,
      c.fare_amount,
      c.tip_amount,
      c.billing_snapshot,
      c.pickup_lat,
      c.pickup_lon,
      c.drop_lat,
      c.drop_lon,
      c.distance_km,
      c.checkout_metadata,
      r.ride_type,
      r.pickup_wait_seconds,
      r.estimated_fare,
      r.final_fare
    FROM orders_core c
    LEFT JOIN orders_ride r ON r.order_id = c.id
    WHERE c.id = ${coreId}
    LIMIT 1
  `;
  const row = rows[0] as {
    order_id?: string | null;
    formatted_order_id?: string | null;
    order_type?: string | null;
    rider_earning?: unknown;
    rider_pre_pickup_allowance?: unknown;
    rider_pre_pickup_funding?: unknown;
    fare_amount?: unknown;
    tip_amount?: unknown;
    billing_snapshot?: unknown;
    pickup_lat?: unknown;
    pickup_lon?: unknown;
    drop_lat?: unknown;
    drop_lon?: unknown;
    distance_km?: unknown;
    checkout_metadata?: unknown;
    ride_type?: string | null;
    pickup_wait_seconds?: number | null;
    estimated_fare?: unknown;
    final_fare?: unknown;
  } | undefined;

  if (!row) {
    return { credited: false, deliveryCredited: false, tipCredited: false, error: "order_not_found" };
  }

  orderIdText = orderIdText || row.order_id?.trim() || String(coreId);
  displayId = displayId || row.formatted_order_id?.trim() || orderIdText;

  if (deliveryFee == null) {
    const orderType = String(row.order_type ?? input.orderType);
    const payoutService: OrderRiderPayoutService =
      orderType === "person_ride" ? "ride" : orderType === "parcel" ? "parcel" : "food";

    if (orderType === "person_ride" || orderType === "food") {
      const acceptSnap = readRideRiderPayoutSnapshot(row.billing_snapshot);
      if (acceptSnap != null && acceptSnap.totalEarning > 0) {
        const snapTip = Number(row.tip_amount);
        const tipRounded =
          Number.isFinite(snapTip) && snapTip > 0 ? round2(snapTip) : 0;
        deliveryFee = round2(Math.max(0, acceptSnap.totalEarning - tipRounded));
      }
    }

    if (deliveryFee == null || deliveryFee <= 0) {
      const tripKmFromBooking = rideTripDistanceFromCheckoutMetadata(row.checkout_metadata);
      const tripKmCore = Number(row.distance_km);
      const tripKm =
        tripKmFromBooking ??
        (Number.isFinite(tripKmCore) && tripKmCore > 0 ? tripKmCore : undefined);
      const waitSec = Number(row.pickup_wait_seconds);
      const waitingMinutes =
        Number.isFinite(waitSec) && waitSec > 0 ? Math.max(0, Math.round(waitSec / 60)) : 0;
      const rideGeo =
        payoutService === "ride" ? rideGeoFromCheckoutMetadata(row.checkout_metadata) : {};
      // Ride: fare comes from the ride fare columns. Food/parcel: the Rider Fare
      // Engine base is the GROSS/standard delivery fare (pre-subsidy) so free
      // delivery / coupons / membership never zero the rider payout — never the
      // net customer-charged fare_amount.
      const customerFare =
        payoutService === "ride"
          ? Number(row.final_fare ?? row.estimated_fare ?? row.fare_amount ?? 0)
          : resolveRiderDeliveryFeeFromCore({
              riderEarning: null,
              fareAmount: row.fare_amount,
              billingSnapshot: row.billing_snapshot,
            });
      const geoPayout =
        Number.isFinite(customerFare) && customerFare > 0
          ? await resolveOrderRiderPayoutAmount({
              service: payoutService,
              customerFare,
              pickupLat: Number(row.pickup_lat),
              pickupLng: Number(row.pickup_lon),
              dropLat: Number(row.drop_lat),
              dropLng: Number(row.drop_lon),
              dropKm: tripKm,
              riderId,
              rideCatalogCode: row.ride_type,
              waitingMinutes: payoutService === "ride" ? waitingMinutes : undefined,
              pincode: rideGeo.pickupPincode,
              state: rideGeo.pickupState,
            })
          : null;
      if (geoPayout != null && geoPayout > 0) {
        deliveryFee = geoPayout;
      } else {
        deliveryFee = resolveRiderDeliveryFeeFromCore({
          riderEarning: row.rider_earning,
          fareAmount: row.fare_amount,
          billingSnapshot: row.billing_snapshot,
        });
      }
    }
  }
  if (tipAmount == null) {
    const tip = Number(row.tip_amount);
    tipAmount = Number.isFinite(tip) && tip > 0 ? round2(tip) : 0;
  }

  deliveryFee = round2(Math.max(0, Number(deliveryFee ?? 0)));
  tipAmount = round2(Math.max(0, Number(tipAmount ?? 0)));
  displayId = displayId || orderIdText || String(coreId);

  const serviceType = input.orderType;
  const payoutSnap = readRideRiderPayoutSnapshot(row.billing_snapshot);

  // Geo Delivery Pricing v3.1 — compose the first-mile (pre-pickup) allowance WITH the
  // rider % pool instead of the legacy unconditional "add on top":
  //   • funding "company"  → first-mile is a company top-up on top (default FOOD),
  //   • funding "customer" → first-mile is carved out of the pool, capped at the pool
  //                          (default PARCEL + PERSON RIDE),
  //   • funding "shared"   → carved from the pool, company funds the overflow.
  // The funding source is frozen at accept; historical/in-flight orders (null) fall back
  // to the service default so no in-flight payout is retroactively changed.
  const prePickupRaw = round2(Math.max(0, Number(row.rider_pre_pickup_allowance ?? 0)));
  const settlementService: OrderRiderPayoutService =
    serviceType === "person_ride" ? "ride" : serviceType === "parcel" ? "parcel" : "food";
  const prePickupFunding = normalizePrePickupFunding(
    row.rider_pre_pickup_funding,
    defaultPrePickupFunding(settlementService)
  );
  // Decompose the pool from the accept snapshot when present; otherwise treat the
  // already-resolved deliveryFee (= finalAmount) as the base pool with no separately
  // tracked surge/waiting — the composition total is identical either way.
  const snapSurge = round2(Math.max(0, Number(payoutSnap?.surgeEarning ?? 0)));
  const snapWaiting = round2(Math.max(0, Number(payoutSnap?.waitingEarning ?? 0)));
  const basePool = round2(Math.max(0, deliveryFee - snapSurge - snapWaiting));
  const composition = composeRiderPayout({
    basePool,
    prePickupRaw,
    surge: snapSurge,
    waiting: snapWaiting,
    funding: prePickupFunding,
  });
  // Single wallet delivery credit (tip + dynamic incentive credited separately below).
  deliveryFee = composition.riderDeliveryCredit;

  const baseMeta = {
    ordersCoreId: coreId,
    orderIdText,
    displayId,
    orderPublicId: displayId,
    serviceType,
    source: "order_delivered",
    ...(payoutSnap
      ? {
          baseEarning: payoutSnap.baseEarning,
          waitingEarning: payoutSnap.waitingEarning,
          surgeEarning: payoutSnap.surgeEarning,
        }
      : {}),
    // v3.1 first-mile composition ledger (audit): pre/post split + two funding pools.
    ...(prePickupRaw > 0
      ? {
          prePickupRaw,
          prePickupFunding,
          prePickupFromPool: composition.prePickupFromPool,
          prePickupCompanyFunded: composition.prePickupCompanyFunded,
          postPickup: composition.postPickup,
          deliveryFeeFunded: composition.deliveryFeeFundedTotal,
          companyFunded: composition.companyFundedTotal,
        }
      : {}),
  };

  let deliveryCredited = false;
  let tipCredited = false;

  // Company-funded dynamic incentive (night/rain/peak/festival) from the customer bill.
  const dynamicIncentive = round2(
    Math.max(0, readDynamicRiderIncentiveFromSnapshot(row.billing_snapshot).amount)
  );

  if (deliveryFee <= 0 && tipAmount <= 0 && dynamicIncentive <= 0) {
    return { credited: false, deliveryCredited: false, tipCredited: false, error: "zero_earning" };
  }

  try {
    if (deliveryFee > 0) {
      const ref = deliveryRef(coreId);
      if (!(await ledgerRefExists(riderId, ref))) {
        const balanceAfter = round2((await readWalletBalance(riderId)) + deliveryFee);
        await insertEarning({
          riderId,
          amount: deliveryFee,
          balanceAfter,
          serviceType,
          ref,
          description: `Delivery earning — Order #${displayId}`,
          metadata: { ...baseMeta, component: "delivery" },
        });
      }
      deliveryCredited = true;
    }

    if (tipAmount > 0) {
      const ref = tipRef(coreId);
      if (!(await ledgerRefExists(riderId, ref))) {
        const balanceAfter = round2((await readWalletBalance(riderId)) + tipAmount);
        await insertEarning({
          riderId,
          amount: tipAmount,
          balanceAfter,
          serviceType,
          ref,
          description: `Customer tip — Order #${displayId}`,
          metadata: { ...baseMeta, component: "tip" },
        });
      }
      tipCredited = true;
    }

    // Pay the company-funded dynamic incentive (computed above) as a distinct earning so it
    // shows separately in the rider wallet and matches the dispatch offer. Idempotent;
    // company-funded so the customer's price is unaffected.
    if (dynamicIncentive > 0) {
      const ref = dynamicIncentiveRef(coreId);
      if (!(await ledgerRefExists(riderId, ref))) {
        const balanceAfter = round2((await readWalletBalance(riderId)) + dynamicIncentive);
        await insertEarning({
          riderId,
          amount: dynamicIncentive,
          balanceAfter,
          serviceType,
          ref,
          description: `Dynamic incentive (night/rain/peak) — Order #${displayId}`,
          metadata: { ...baseMeta, component: "dynamic_incentive" },
        });
      }
    }

    const totalRiderEarning = round2(deliveryFee + tipAmount + dynamicIncentive);
    const ledgerTotal = await readLedgerEarningTotal(riderId, coreId);
    const earningToSync = ledgerTotal > 0 ? ledgerTotal : totalRiderEarning;
    if (earningToSync > 0) {
      await syncRiderEarningOnOrderCore(coreId, earningToSync);
    }

    if (deliveryCredited || tipCredited || dynamicIncentive > 0) {
      const {
        touchRiderIncomeTimestamp,
        autoSettleSubscriptionDuesFromEarnings,
      } = await import("./rider-subscription-wallet.js");
      await touchRiderIncomeTimestamp(riderId);
      await autoSettleSubscriptionDuesFromEarnings(riderId);
    }

    // Unified referral engine — rider milestones + customer first-order rewards
    await runReferralEvalAfterDelivery({
      riderId,
      coreId,
      orderType: serviceType,
    });

    return { credited: true, deliveryCredited, tipCredited };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/unique|duplicate/i.test(msg)) {
      return { credited: true, deliveryCredited: true, tipCredited: tipAmount > 0 };
    }
    console.warn("[creditRiderOrderEarningOnDelivered]", coreId, msg);
    return { credited: false, deliveryCredited, tipCredited, error: msg };
  }
}
